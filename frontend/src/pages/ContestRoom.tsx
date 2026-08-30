import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import type { Contest, Question } from '../lib/types'
import ContestInstructions, { type SectionRow } from '../components/ContestInstructions'
import { getPreferredLanguage, setPreferredLanguage, LANGUAGES, type Language } from '../lib/language'
import ExamShell, { type SectionTab } from '../components/ExamShell'
import { rollNumber } from '../lib/rollNumber'
import Calculator from '../components/Calculator'
import SubmitModal, { type SectionSummary } from '../components/SubmitModal'
import SectionCompleteModal from '../components/SectionCompleteModal'
import { useConfirm } from '../components/ConfirmDialog'
import { QuestionContent } from '../components/QuestionContent'
import { RichText } from '../components/RichText'
import ReportModal from '../components/ReportModal'
import { unlockAudio, playLowTimeAlert, playTick } from '../lib/sound'

const OPTIONS = ['A', 'B', 'C', 'D'] as const
type Option = typeof OPTIONS[number]
type Phase = 'loading' | 'waiting' | 'active' | 'ended'

const SECTIONS = ['QUANT', 'REASONING', 'ENGLISH', 'GK'] as const
const SECTION_LABELS: Record<string, string> = {
  QUANT: 'Quant', REASONING: 'Reasoning', ENGLISH: 'English', GK: 'GK',
}
// The instructions table has room for the names the exam itself uses; the
// tabs and buttons in the room do not.
const SECTION_LABELS_FULL: Record<string, string> = {
  QUANT: 'Quantitative Aptitude', REASONING: 'General Intelligence',
  ENGLISH: 'English Comprehension', GK: 'General Awareness',
}

type QState = 'not-visited' | 'not-answered' | 'answered' | 'marked' | 'answered-marked'

function getQState(qId: string, answers: Record<string, Option>, marked: Set<string>, visited: Set<string>): QState {
  const isAnswered = !!answers[qId]
  const isMarked = marked.has(qId)
  if (!visited.has(qId)) return 'not-visited'
  if (isAnswered && isMarked) return 'answered-marked'
  if (isAnswered) return 'answered'
  if (isMarked) return 'marked'
  return 'not-answered'
}

function optionText(q: Question, opt: Option) {
  return { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD }[opt]
}

function formatTime(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ContestRoom() {
  const { id: contestId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // ── Core exam state ───────────────────────────────────────────────────
  const [contest, setContest] = useState<Contest | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, Option>>({})
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set())
  const [visited, setVisited] = useState<Set<string>>(new Set())
  const [submittedSections, setSubmittedSections] = useState<Set<string>>(new Set())
  // Set when a section locks, to raise the between-sections checkpoint.
  const [sectionDone, setSectionDone] = useState<{ section: string; timedOut: boolean } | null>(null)
  const [currentSection, setCurrentSection] = useState<string>('QUANT')
  const [currentQId, setCurrentQId] = useState<string>('')
  const confirm = useConfirm()
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}')
  const isAdmin = storedUser.role === 'ADMIN'
  const userId: string = storedUser.id ?? ''
  const [phase, setPhase] = useState<Phase>('loading')
  const [timeLeft, setTimeLeft] = useState(0)
  const [muted, setMuted] = useState(() => localStorage.getItem('mockMuted') === '1')
  const [submitting, setSubmitting] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  // ── Feature 1: Instructions modal ─────────────────────────────────────
  const [showInstructions, setShowInstructions] = useState(false)
  // Chosen on the instructions screen and fixed on the attempt when the paper
  // starts, so a reload cannot switch it mid-exam.
  const [language, setLanguage] = useState<Language>(getPreferredLanguage())
  const [examStarted, setExamStarted] = useState(false)

  // ── Feature 2: Section timers ─────────────────────────────────────────
  const [sectionEnteredAt, setSectionEnteredAt] = useState<Record<string, number>>({})

  // ── Feature 3: Calculator ─────────────────────────────────────────────
  const [showCalc, setShowCalc] = useState(false)

  // ── Feature 4: Submit modal ───────────────────────────────────────────
  const [showSubmitModal, setShowSubmitModal] = useState(false)

  // ── Report a question ─────────────────────────────────────────────────
  const [reportQId, setReportQId] = useState<string | null>(null)

  // ── Feature 5: Tab-switch warning ────────────────────────────────────
  const [tabSwitches, setTabSwitches] = useState(0)

  // ── Feature 6: Fullscreen ─────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFsWarning, setShowFsWarning] = useState(false)

  // ── Feature 7: Question time tracking ────────────────────────────────
  const [timeSpent, setTimeSpent] = useState<Record<string, number>>({})
  const qEnteredAtRef = useRef<number>(Date.now())

  // ── Refs for use inside intervals/effects ─────────────────────────────
  const answersRef = useRef(answers)
  answersRef.current = answers
  const submittingRef = useRef(submitting)
  submittingRef.current = submitting
  const submittedSectionsRef = useRef(submittedSections)
  submittedSectionsRef.current = submittedSections
  const sectionEnteredAtRef = useRef(sectionEnteredAt)
  sectionEnteredAtRef.current = sectionEnteredAt
  const examStartedRef = useRef(examStarted)
  examStartedRef.current = examStarted
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const timeSpentRef = useRef(timeSpent)
  timeSpentRef.current = timeSpent
  const markedForReviewRef = useRef(markedForReview)
  markedForReviewRef.current = markedForReview

  // ── Derived: group questions by section ───────────────────────────────
  const sectionQuestions: Record<string, Question[]> = {}
  for (const s of SECTIONS) sectionQuestions[s] = questions.filter(q => q.subject === s)
  const availableSections = SECTIONS.filter(s => sectionQuestions[s].length > 0)

  // Per-section time: use explicit sectionLimits from contest if set, else equal split
  function getSectionTimeSecs(section: string): number {
    if (!contest) return 0
    if (contest.sectionLimits?.[section]) return contest.sectionLimits[section] * 60
    return availableSections.length > 0
      ? Math.floor((contest.durationMinutes * 60) / availableSections.length)
      : 0
  }

  function getSectionTimeLeft(section: string): number {
    const enteredAt = sectionEnteredAtRef.current[section]
    const allotted = getSectionTimeSecs(section)
    if (!enteredAt) return allotted
    return Math.max(0, allotted - Math.floor((Date.now() - enteredAt) / 1000))
  }

  // ── Load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        // If user already submitted, bounce straight to results
        const resultCheck = await api.get(`/contests/${contestId}/result`).catch(() => null)
        if (resultCheck?.status === 200) {
          navigate(`/contests/${contestId}/result`, { replace: true })
          return
        }

        const [contestRes, questionsRes, draftRes] = await Promise.all([
          api.get(`/contests/${contestId}`),
          api.get(`/contests/${contestId}/questions`),
          api.get(`/contests/${contestId}/draft`).catch(() => null),
        ])
        setContest(contestRes.data)
        const qs: Question[] = questionsRes.data
        setQuestions(qs)

        const backendDraft = draftRes?.data?.answers
        let initialAnswers: Record<string, Option> = {}
        if (backendDraft && Object.keys(backendDraft).length > 0) {
          initialAnswers = backendDraft
          localStorage.setItem(`draft-${contestId}`, JSON.stringify(backendDraft))
        } else {
          try {
            const local = localStorage.getItem(`draft-${contestId}`)
            if (local) initialAnswers = JSON.parse(local)
          } catch { /* corrupted localStorage — start fresh */ }
        }
        setAnswers(initialAnswers)

        try {
          const savedSections = localStorage.getItem(`submitted-sections-${contestId}`)
          if (savedSections) setSubmittedSections(new Set(JSON.parse(savedSections)))
        } catch { /* corrupted localStorage — start fresh */ }

        const firstSec = (SECTIONS.find(s => qs.some(q => q.subject === s)) ?? 'QUANT') as string
        const firstQ = qs.find(q => q.subject === firstSec)
        if (firstQ) {
          setCurrentSection(firstSec)
          setCurrentQId(firstQ.id)
          setVisited(new Set([firstQ.id]))
        }
      } catch (err: any) {
        const msg = err?.response?.status === 403
          ? 'You have not joined this contest.'
          : 'Failed to load contest. Please refresh the page.'
        setInitError(msg)
      }
    }
    init()
  }, [contestId])

  // ── Main timer (overall + phase transitions) ──────────────────────────
  useEffect(() => {
    if (!contest) return
    const startMs = new Date(contest.startTime).getTime()
    const endMs = startMs + contest.durationMinutes * 60 * 1000

    // An admin testing a paper can't wait for the scheduled start, so they get
    // the room immediately with the contest's full duration on the clock. Their
    // attempt is a test run either way — it never reaches a leaderboard or a
    // rating — so starting early changes nothing for anyone else.
    const adminPreview = isAdmin && Date.now() < startMs
    const previewEndMs = Date.now() + contest.durationMinutes * 60 * 1000

    const tick = () => {
      const now = Date.now()
      if (adminPreview) { setPhase('active'); setTimeLeft(Math.max(0, Math.floor((previewEndMs - now) / 1000))) }
      else if (now < startMs) { setPhase('waiting'); setTimeLeft(Math.floor((startMs - now) / 1000)) }
      else if (now < endMs) { setPhase('active'); setTimeLeft(Math.floor((endMs - now) / 1000)) }
      else { setPhase('ended'); setTimeLeft(0) }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [contest, isAdmin])

  // Unlock audio on first interaction; low-time cues (chess.com style).
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [])

  useEffect(() => {
    if (phase !== 'active' || muted) return
    if (timeLeft === 60) playLowTimeAlert()
    else if (timeLeft <= 10 && timeLeft > 0) playTick()
  }, [timeLeft, phase, muted])

  // ── Show instructions when exam goes active for the first time ────────
  useEffect(() => {
    if (phase === 'active' && !examStartedRef.current) setShowInstructions(true)
  }, [phase])

  // ── Auto-submit on exam end ───────────────────────────────────────────
  useEffect(() => {
    if (phase === 'ended' && !submittingRef.current) doSubmit()
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Section timer: auto-submit expired sections every second ─────────
  useEffect(() => {
    if (phase !== 'active' || availableSections.length === 0) return
    const interval = setInterval(() => {
      const now = Date.now()
      for (const section of availableSections) {
        if (submittedSectionsRef.current.has(section)) continue
        const enteredAt = sectionEnteredAtRef.current[section]
        if (!enteredAt) continue
        const allotted = getSectionTimeSecs(section)
        if (allotted > 0 && Math.floor((now - enteredAt) / 1000) >= allotted) autoSubmitSection(section)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [phase, availableSections.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autosave every 30s ────────────────────────────────────────────────
  useEffect(() => {
    if (!contestId) return
    const interval = setInterval(() => {
      if (phaseRef.current === 'active') {
        api.patch(`/contests/${contestId}/draft`, { answers: answersRef.current }).catch(() => {})
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [contestId])

  // ── Feature 5: Tab-switch detection ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return
    const handler = () => { if (document.hidden) setTabSwitches(n => n + 1) }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [phase])

  // ── Pause the per-question clock while the tab is in the background ───
  // The clock is wall time between entering a question and leaving it, so a
  // tab left open behind another window used to bank every one of those
  // minutes against whichever question happened to be on screen. One abandoned
  // tab produced a 170-minute reading in a 60-minute paper, which then owned
  // the whole time analysis. Away-time now stops counting.
  useEffect(() => {
    const handler = () => {
      const now = Date.now()
      if (document.hidden) {
        if (currentQId) {
          const spent = Math.floor((now - qEnteredAtRef.current) / 1000)
          if (spent > 0) setTimeSpent(prev => ({ ...prev, [currentQId]: (prev[currentQId] ?? 0) + spent }))
        }
      } else {
        qEnteredAtRef.current = now
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [currentQId])

  // ── Feature 6: Fullscreen change detection ────────────────────────────
  useEffect(() => {
    const handler = () => {
      const isFull = !!document.fullscreenElement
      setIsFullscreen(isFull)
      if (!isFull && examStartedRef.current && phaseRef.current === 'active') setShowFsWarning(true)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // ── Navigate to a question (tracks time + section entry) ──────────────
  function goToQuestion(qId: string, section: string) {
    const now = Date.now()

    // Accumulate time spent on previous question (feature 7)
    if (currentQId) {
      const spent = Math.floor((now - qEnteredAtRef.current) / 1000)
      setTimeSpent(prev => ({ ...prev, [currentQId]: (prev[currentQId] ?? 0) + spent }))
    }
    qEnteredAtRef.current = now

    // Record first entry into a section (feature 2)
    if (!sectionEnteredAtRef.current[section]) {
      setSectionEnteredAt(prev => ({ ...prev, [section]: now }))
    }

    setCurrentQId(qId)
    setCurrentSection(section)
    setVisited(prev => new Set([...prev, qId]))
  }

  const [langBusy, setLangBusy] = useState(false)

  /**
   * Switch the paper's language mid-exam.
   *
   * Answers, marks, visited flags and the clock are all keyed by question id
   * or held separately, so re-reading the paper in another language keeps
   * every one of them. The server order is seeded per user and stable, so the
   * question on screen stays the question on screen.
   */
  async function switchLanguage(l: Language) {
    if (l === language || langBusy) return
    setLangBusy(true)
    try {
      await api.post(`/contests/${contestId}/language`, { language: l })
      const res = await api.get(`/contests/${contestId}/questions`)
      setQuestions(res.data)
      setLanguage(l)
      setPreferredLanguage(l)
    } catch {
      // Leave the paper as it is; the toggle simply does not move.
    } finally { setLangBusy(false) }
  }

  // ── Start exam ("I'm Ready" clicked) ─────────────────────────────────
  async function startExam() {
    // Fix the language on the attempt and re-read the paper in it before the
    // clock starts — after this point the choice cannot change.
    try {
      await api.post(`/contests/${contestId}/language`, { language })
      const res = await api.get(`/contests/${contestId}/questions`)
      setQuestions(res.data)
    } catch {
      // A failure here is not worth blocking the exam over; the paper simply
      // stays in whatever language it was already fetched in.
    }
    setShowInstructions(false)
    setExamStarted(true)

    // Enter fullscreen (feature 6)
    document.documentElement.requestFullscreen().catch(() => {})

    // Record entry for the first section (feature 2)
    const now = Date.now()
    if (!sectionEnteredAtRef.current[currentSection]) {
      setSectionEnteredAt(prev => ({ ...prev, [currentSection]: now }))
    }
    qEnteredAtRef.current = now
  }

  // ── Answer, mark, clear ───────────────────────────────────────────────
  function selectAnswer(questionId: string, opt: Option) {
    const q = questions.find(q => q.id === questionId)
    if (!q || submittedSections.has(q.subject)) return
    setAnswers(prev => {
      const next = { ...prev, [questionId]: opt }
      localStorage.setItem(`draft-${contestId}`, JSON.stringify(next))
      return next
    })
  }

  function clearAnswer(questionId: string) {
    setAnswers(prev => {
      const next = { ...prev }
      delete next[questionId]
      localStorage.setItem(`draft-${contestId}`, JSON.stringify(next))
      return next
    })
  }

  // ── Section access control ────────────────────────────────────────────
  // A section is accessible only if it is already submitted (read-only review)
  // OR it is the first unsubmitted section in sequential order.
  function canAccessSection(sec: string): boolean {
    if (submittedSections.has(sec)) return true
    const firstUnsubmitted = availableSections.find(s => !submittedSections.has(s))
    return sec === firstUnsubmitted
  }

  // ── Section submit (manual + auto) ───────────────────────────────────
  function persistSectionSubmit(section: string) {
    const next = new Set([...submittedSectionsRef.current, section])
    setSubmittedSections(next)
    localStorage.setItem(`submitted-sections-${contestId}`, JSON.stringify([...next]))
  }

  async function submitSection(section: string) {
    const qs = sectionQuestions[section] ?? []
    const unanswered = qs.filter(q => !answers[q.id]).length
    const label = SECTION_LABELS[section] ?? section
    const ok = await confirm({
      title: `Submit ${label}?`,
      message: 'Once submitted you cannot change your answers in this section.',
      detail: unanswered > 0
        ? `${unanswered} of ${qs.length} question${qs.length === 1 ? '' : 's'} still unanswered.`
        : undefined,
      confirmLabel: `Submit ${label}`,
      cancelLabel: 'Keep working',
      danger: unanswered > 0,
    })
    if (!ok) return
    persistSectionSubmit(section)
    setSectionDone({ section, timedOut: false })
  }

  function autoSubmitSection(section: string) {
    if (submittedSectionsRef.current.has(section)) return
    persistSectionSubmit(section)
    // Raised on expiry too — that's the case a candidate is least likely to
    // notice, since nothing else on screen changes.
    setSectionDone({ section, timedOut: true })
  }

  /** First section still unattempted, in paper order. */
  function nextUnsubmittedSection(after: Set<string>): string | null {
    return availableSections.find(s => !after.has(s)) ?? null
  }

  /**
   * Move into the next section. Navigating to its first question is what
   * stamps sectionEnteredAt, so the section's clock starts here — on the
   * candidate's click — rather than while the checkpoint was on screen.
   */
  function startNextSection() {
    const next = nextUnsubmittedSection(submittedSectionsRef.current)
    setSectionDone(null)
    if (!next) return
    const first = (sectionQuestions[next] ?? [])[0]
    if (first) goToQuestion(first.id, next)
  }

  // ── Final submit ──────────────────────────────────────────────────────
  const doSubmit = useCallback(async () => {
    if (submittingRef.current) return
    setSubmitting(true)
    submittingRef.current = true
    setShowSubmitModal(false)
    try {
      await api.post(`/contests/${contestId}/submit`, { answers: answersRef.current, timeSpent: timeSpentRef.current, markedForReview: Array.from(markedForReviewRef.current) })
      localStorage.setItem(`time-spent-${contestId}`, JSON.stringify(timeSpentRef.current))
      localStorage.removeItem(`draft-${contestId}`)
      localStorage.removeItem(`submitted-sections-${contestId}`)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      navigate(`/contests/${contestId}/result`)
    } catch (err: any) {
      if (err.response?.status === 400) {
        navigate(`/contests/${contestId}/result`)
      } else {
        setSubmitting(false)
        submittingRef.current = false
      }
    }
  }, [contestId, navigate])

  // ── Sidebar summary for submit modal ─────────────────────────────────
  function getSectionSummaries(): SectionSummary[] {
    return availableSections.map(s => ({
      section: s,
      answered: (sectionQuestions[s] ?? []).filter(q => answers[q.id]).length,
      marked: (sectionQuestions[s] ?? []).filter(q => markedForReview.has(q.id)).length,
      total: (sectionQuestions[s] ?? []).length,
    }))
  }

  // ── Waiting room ──────────────────────────────────────────────────────
  if (phase === 'waiting') {
    return (
      <div className="room-waiting">
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Contest starts in
        </div>
        <div className="waiting-timer">{formatTime(timeLeft)}</div>
        <h2 style={{ margin: '8px 0 4px' }}>{contest?.title}</h2>
        <p className="waiting-subtitle">
          {contest?.durationMinutes} min &nbsp;·&nbsp; {questions.length} questions &nbsp;·&nbsp;
          The exam will begin automatically when the timer reaches zero.
        </p>
        <div style={{ marginTop: 32, padding: '12px 20px', background: 'var(--primary-light)', borderRadius: 8, fontSize: 14, color: 'var(--primary)' }}>
          You are registered. Stay on this page.
        </div>
      </div>
    )
  }

  if (initError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: 'var(--danger)', fontWeight: 600 }}>{initError}</p>
        <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  if (phase === 'loading' || !contest) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><p style={{ color: 'var(--text-muted)' }}>Loading contest...</p></div>
  }

  if (questions.length === 0) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><p style={{ color: 'var(--text-muted)' }}>No questions found for this contest.</p></div>
  }

  // ── Derived render values ─────────────────────────────────────────────
  const currentQ = questions.find(q => q.id === currentQId) ?? questions[0]
  const sectionQs = sectionQuestions[currentSection] ?? []
  const idxInSection = sectionQs.findIndex(q => q.id === currentQ.id)
  const isSectionLocked = submittedSections.has(currentSection)
  // The section on screen is the only one still open, so submitting it is the
  // same act as submitting the paper. Also true of a single-section contest,
  // where "Submit Quant" was never the right label for finishing.
  const openSections = availableSections.filter(s => !submittedSections.has(s))
  const isFinalSection = openSections.length === 1 && openSections[0] === currentSection
  const isWarn = timeLeft > 0 && timeLeft < 300
  const currentSectionTimeSecs = getSectionTimeSecs(currentSection)
  const secTimeLeft = getSectionTimeLeft(currentSection)
  const secTimeWarn = secTimeLeft > 0 && secTimeLeft < 120

  // The analysis panel's four counts are disjoint, one per palette colour, so
  // they add up to the visited questions rather than double-counting anything
  // that is both answered and marked.
  const sectionStates = sectionQs.map(q => getQState(q.id, answers, markedForReview, visited))
  const analysisStats = {
    answered: sectionStates.filter(s => s === 'answered').length,
    notAnswered: sectionStates.filter(s => s === 'not-answered').length,
    marked: sectionStates.filter(s => s === 'marked').length,
    answeredMarked: sectionStates.filter(s => s === 'answered-marked').length,
  }

  // A section offers a language only when every question in it has that
  // language. One untranslated question is enough to make "English & Hindi"
  // a promise the paper cannot keep, and a candidate who picked Hindi on the
  // strength of this table would meet it mid-section.
  const sectionRows: SectionRow[] = availableSections.map(s => {
    const qs = sectionQuestions[s] ?? []
    return {
      key: s,
      label: SECTION_LABELS_FULL[s] ?? s,
      questions: qs.length,
      maxScore: qs.reduce((sum, q) => sum + Number(q.marks), 0),
      minutes: Math.round(getSectionTimeSecs(s) / 60),
      languages: LANGUAGES
        .filter(l => qs.length > 0 && qs.every(q => (q.availableLanguages ?? ['EN']).includes(l.code)))
        .map(l => l.code),
    }
  })

  // A section is reachable once every earlier one is closed; already-submitted
  // sections stay reachable, read-only, so a candidate can look back.
  const sectionTabs: SectionTab[] = availableSections.map(s => ({
    key: s,
    label: SECTION_LABELS[s] ?? s,
    state: submittedSections.has(s) ? 'submitted' : canAccessSection(s) ? 'open' : 'locked',
  }))

  // Avg time tracking (feature 7)
  const visitedWithTime = Object.keys(timeSpent)
  const avgTimeSecs = visitedWithTime.length > 0
    ? Math.round(Object.values(timeSpent).reduce((a, b) => a + b, 0) / visitedWithTime.length)
    : 0

  // ── Exam-bar navigation (within the current section) ──────────────────
  const isLastInSection = idxInSection === sectionQs.length - 1
  function saveAndNext() {
    const next = sectionQs[idxInSection + 1]
    if (next) goToQuestion(next.id, currentSection)
  }
  function markReviewNext() {
    if (!isSectionLocked) setMarkedForReview(prev => new Set(prev).add(currentQ.id))
    const next = sectionQs[idxInSection + 1]
    if (next) goToQuestion(next.id, currentSection)
  }

  return (
    <>
      <ExamShell
        title={contest.title}
        rollNumber={rollNumber(userId, contestId ?? '')}
        timeLeft={phase === 'ended' ? 'Time Up' : formatTime(timeLeft)}
        timeWarn={isWarn}
        partLabel={SECTION_LABELS[currentSection] ?? currentSection}
        sectionTimeLeft={!isSectionLocked && currentSectionTimeSecs > 0 ? formatTime(secTimeLeft) : undefined}
        sectionTimeWarn={secTimeWarn}
        sections={sectionTabs}
        currentSection={currentSection}
        onSectionSelect={sec => {
          const firstQ = sectionQuestions[sec]?.[0]
          if (firstQ) goToQuestion(firstQ.id, sec)
        }}
        language={language}
        onLanguageChange={switchLanguage}
        langBusy={langBusy}
        onInstructions={() => setShowInstructions(true)}
        onReport={() => setReportQId(currentQ.id)}
        onSubmit={() => setShowSubmitModal(true)}
        submitLabel={submitting ? 'Submitting…' : 'Submit Test'}
        answeredCount={Object.keys(answers).length}
        stats={analysisStats}
        extraStats={avgTimeSecs > 0 ? [{ label: 'Avg / Question', value: `${avgTimeSecs}s` }] : undefined}
        analysisLabel={SECTION_LABELS[currentSection] ?? currentSection}
        palette={sectionQs.map((q, i) => ({ id: q.id, label: i + 1, state: sectionStates[i] }))}
        currentId={currentQ.id}
        onSelect={qid => goToQuestion(qid, currentSection)}
        questionNo={idxInSection + 1}
        questionMeta={<>of {sectionQs.length} · +{currentQ.marks} / −{currentQ.negativeMarks}</>}
        topRightExtra={
          <div className="xr-tools">
            <button className="xr-iconbtn" onClick={() => setShowCalc(c => !c)} title="Calculator">🧮</button>
            <button className="xr-iconbtn" title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              onClick={() => {
                if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
                else document.documentElement.requestFullscreen().catch(() => {})
              }}>
              {isFullscreen ? '⊡' : '⛶'}
            </button>
            <button className="xr-iconbtn" title={muted ? 'Unmute timer sounds' : 'Mute timer sounds'}
              onClick={() => { const n = !muted; setMuted(n); localStorage.setItem('mockMuted', n ? '1' : '0'); if (!n) unlockAudio() }}>
              {muted ? '🔇' : '🔊'}
            </button>
          </div>
        }
        banner={
          <>
            {/* Both anti-cheat signals stay visible rather than living in a
                toast: a candidate who has drifted out of fullscreen needs to
                see that fact for as long as it is true. */}
            {showFsWarning && (
              <div className="xr-banner xr-banner-warn">
                <span>You have left fullscreen. The exam is meant to be taken in fullscreen.</span>
                <button onClick={() => { document.documentElement.requestFullscreen().catch(() => {}); setShowFsWarning(false) }}>
                  Return to fullscreen
                </button>
              </div>
            )}
            {tabSwitches > 0 && (
              <div className="xr-banner">
                ⚠️ {tabSwitches} tab switch{tabSwitches > 1 ? 'es' : ''} recorded.
              </div>
            )}
            {isSectionLocked && (() => {
              const nextSec = availableSections.find(s => !submittedSections.has(s))
              return (
                <div className="xr-banner">
                  <span>✓ {SECTION_LABELS[currentSection]} submitted — answers are locked.</span>
                  {nextSec && (
                    <button onClick={() => {
                      const firstQ = sectionQuestions[nextSec]?.[0]
                      if (firstQ) goToQuestion(firstQ.id, nextSec)
                    }}>
                      Go to {SECTION_LABELS[nextSec]}
                    </button>
                  )}
                </div>
              )
            })()}
          </>
        }
        actions={
          <>
            <button className="xr-btn xr-btn-plain" disabled={idxInSection === 0}
              onClick={() => { const prev = sectionQs[idxInSection - 1]; if (prev) goToQuestion(prev.id, currentSection) }}>
              Previous
            </button>
            {!isSectionLocked && phase === 'active' && (
              <>
                <button className="xr-btn xr-btn-plain" onClick={markReviewNext}
                  title="Mark this question for review and move to the next">
                  Mark for Review
                </button>
                <button className="xr-btn xr-btn-plain" disabled={!answers[currentQ.id]}
                  onClick={() => clearAnswer(currentQ.id)}>
                  Clear Response
                </button>
              </>
            )}
            <button className="xr-btn" disabled={isLastInSection} onClick={saveAndNext}>
              Save &amp; Next
            </button>
            {/* On the last open section there is nothing to move on to, so the
                shell's Submit Test is the only button that ends the paper —
                locking one more section would drop the candidate on a
                checkpoint with only one way out. */}
            {!isSectionLocked && phase === 'active' && !isFinalSection && (
              <button className="xr-btn xr-btn-plain" onClick={() => submitSection(currentSection)}>
                Submit {SECTION_LABELS[currentSection]} ✓
              </button>
            )}
          </>
        }
      >
        <div className="xr-qtext">
          <QuestionContent q={currentQ} />
        </div>

        <div className="xr-opts">
          {OPTIONS.map(opt => (
            <label key={opt} className={`xr-opt ${answers[currentQ.id] === opt ? 'sel' : ''} ${isSectionLocked ? 'locked' : ''}`}>
              <input
                type="radio"
                name={`q-${currentQ.id}`}
                checked={answers[currentQ.id] === opt}
                disabled={isSectionLocked || phase !== 'active'}
                onChange={() => selectAnswer(currentQ.id, opt)}
              />
              <span>{opt}.</span>
              <span><RichText html={optionText(currentQ, opt)} /></span>
            </label>
          ))}
        </div>
      </ExamShell>

      {/* ── Instructions sheet (feature 1) ───────────────────────── */}
      {/* Also reachable from the INSTRUCTIONS link mid-exam, where it has no
          Start button and only closes. */}
      {showInstructions && (
        <ContestInstructions
          contest={contest}
          sections={sectionRows}
          totalQuestions={questions.length}
          language={language}
          onLanguageChange={l => { setLanguage(l); setPreferredLanguage(l) }}
          onStart={examStarted ? undefined : startExam}
          onClose={() => setShowInstructions(false)}
        />
      )}

      {/* Between-sections checkpoint. Sits above the room but below the final
          submit modal, which supersedes it once the candidate is finishing. */}
      {sectionDone && !showSubmitModal && (() => {
        const done = sectionDone.section
        const qs = sectionQuestions[done] ?? []
        const answeredCount = qs.filter(q => answers[q.id]).length
        const next = nextUnsubmittedSection(submittedSections)
        return (
          <SectionCompleteModal
            sectionLabel={SECTION_LABELS[done] ?? done}
            answered={answeredCount}
            total={qs.length}
            timedOut={sectionDone.timedOut}
            nextSectionLabel={next ? (SECTION_LABELS[next] ?? next) : null}
            nextCount={next ? (sectionQuestions[next] ?? []).length : 0}
            nextMinutes={next ? Math.round(getSectionTimeSecs(next) / 60) : 0}
            onStartNext={startNextSection}
            onReviewAndSubmit={() => { setSectionDone(null); setShowSubmitModal(true) }}
          />
        )
      })()}

      {/* ── Submit confirmation modal (feature 4) ────────────────── */}
      {showSubmitModal && (
        <SubmitModal
          sections={getSectionSummaries()}
          submitting={submitting}
          onConfirm={doSubmit}
          onCancel={() => setShowSubmitModal(false)}
        />
      )}

      {/* ── Calculator (feature 3) ────────────────────────────────── */}
      {showCalc && <Calculator onClose={() => setShowCalc(false)} />}

      {/* ── Report a question ─────────────────────────────────────── */}
      {reportQId && (
        <ReportModal
          questionId={reportQId}
          source={`contest:${contestId}`}
          questionLabel={`Question ${questions.findIndex(q => q.id === reportQId) + 1}`}
          onClose={() => setReportQId(null)}
        />
      )}
    </>
  )
}
