import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import type { Contest, Question } from '../lib/types'
import InstructionsModal from '../components/InstructionsModal'
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
  const isAdmin = JSON.parse(localStorage.getItem('user') || '{}').role === 'ADMIN'
  const [phase, setPhase] = useState<Phase>('loading')
  const [timeLeft, setTimeLeft] = useState(0)
  const [muted, setMuted] = useState(() => localStorage.getItem('mockMuted') === '1')
  const [submitting, setSubmitting] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  // ── Feature 1: Instructions modal ─────────────────────────────────────
  const [showInstructions, setShowInstructions] = useState(false)
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

  // ── Start exam ("I'm Ready" clicked) ─────────────────────────────────
  function startExam() {
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
  const isWarn = timeLeft > 0 && timeLeft < 300
  const currentSectionTimeSecs = getSectionTimeSecs(currentSection)
  const secTimeLeft = getSectionTimeLeft(currentSection)
  const secTimeWarn = secTimeLeft > 0 && secTimeLeft < 120

  const sectionStats = {
    answered: sectionQs.filter(q => answers[q.id]).length,
    marked: sectionQs.filter(q => markedForReview.has(q.id)).length,
  }

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
    <div className="room-layout">
      {/* ── Instructions modal (feature 1) ───────────────────────── */}
      {showInstructions && (
        <InstructionsModal
          contest={contest}
          sections={availableSections}
          sectionTimeMinutes={Math.floor(getSectionTimeSecs(availableSections[0] ?? 'QUANT') / 60)}
          onStart={startExam}
        />
      )}

      {/* ── Submit confirmation modal (feature 4) ────────────────── */}
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

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="room-header">
        <span className="room-title">{contest.title}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Tab-switch count (feature 5) */}
          {tabSwitches > 0 && (
            <span className="tab-switch-badge" title="Number of times you left this tab">
              ⚠️ {tabSwitches} tab switch{tabSwitches > 1 ? 'es' : ''}
            </span>
          )}

          {/* Fullscreen warning (feature 6) */}
          {showFsWarning && (
            <span className="fs-warning">
              Exited fullscreen —{' '}
              <button onClick={() => { document.documentElement.requestFullscreen().catch(() => {}); setShowFsWarning(false) }}>
                Return
              </button>
            </span>
          )}

          {/* Calculator toggle */}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowCalc(c => !c)} title="Calculator">
            🧮
          </button>

          {/* Fullscreen toggle (feature 6) */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen()
              else document.documentElement.requestFullscreen().catch(() => {})
            }}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? '⊡' : '⛶'}
          </button>
        </div>

        <button className="mock-mute-btn" title={muted ? 'Unmute timer sounds' : 'Mute timer sounds'}
          onClick={() => { const n = !muted; setMuted(n); localStorage.setItem('mockMuted', n ? '1' : '0'); if (!n) unlockAudio() }}>
          {muted ? '🔇' : '🔊'}
        </button>

        <span className={`timer ${isWarn ? 'timer-warn' : 'timer-ok'}`}>
          {phase === 'ended' ? 'Time Up' : formatTime(timeLeft)}
        </span>

        <button className="btn btn-danger btn-sm" onClick={() => setShowSubmitModal(true)} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Test'}
        </button>
      </div>

      <div className="room-body">
        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <div className="room-sidebar">
          {/* Section tabs */}
          <div className="sidebar-sections">
            {availableSections.map(sec => {
              const accessible = canAccessSection(sec)
              const isSubmitted = submittedSections.has(sec)
              return (
                <button
                  key={sec}
                  className={`sidebar-sec-btn ${currentSection === sec ? 'active' : ''} ${isSubmitted ? 'submitted' : ''}`}
                  disabled={!accessible}
                  title={!accessible ? 'Submit the current section to unlock this one' : undefined}
                  onClick={() => {
                    const firstQ = sectionQuestions[sec]?.[0]
                    if (firstQ) goToQuestion(firstQ.id, sec)
                  }}
                >
                  {SECTION_LABELS[sec]}
                  {isSubmitted && <span className="sec-tick">✓</span>}
                  {!accessible && <span className="sec-lock">🔒</span>}
                </button>
              )
            })}
          </div>

          {/* Section timer (feature 2) */}
          {!isSectionLocked && currentSectionTimeSecs > 0 && (
            <div className={`section-timer ${secTimeWarn ? 'section-timer-warn' : ''}`}>
              <span>Section time</span>
              <span className="section-timer-val">{formatTime(secTimeLeft)}</span>
            </div>
          )}

          {/* Stats chips */}
          <div className="sidebar-stats">
            <span className="stat-chip chip-answered">{sectionStats.answered}/{sectionQs.length} answered</span>
            {sectionStats.marked > 0 && <span className="stat-chip chip-marked">{sectionStats.marked} marked</span>}
          </div>

          {/* Question grid */}
          <div className="q-grid">
            {sectionQs.map((q, i) => {
              const state = getQState(q.id, answers, markedForReview, visited)
              return (
                <button
                  key={q.id}
                  className={`q-btn qs-${state} ${q.id === currentQ.id ? 'current' : ''}`}
                  onClick={() => goToQuestion(q.id, currentSection)}
                  title={state.replace(/-/g, ' ')}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="sidebar-legend">
            <div className="legend-item"><span className="legend-dot qs-answered" /> Answered</div>
            <div className="legend-item"><span className="legend-dot qs-not-answered" /> Not answered</div>
            <div className="legend-item"><span className="legend-dot qs-marked" /> Marked for review</div>
            <div className="legend-item"><span className="legend-dot qs-answered-marked" /> Answered + Marked</div>
            <div className="legend-item"><span className="legend-dot qs-not-visited" /> Not visited</div>
          </div>

          {/* Avg time per question (feature 7) */}
          {avgTimeSecs > 0 && (
            <div className="avg-time">
              ⏱ Avg {avgTimeSecs}s / question
            </div>
          )}
        </div>

        {/* ── Question content ─────────────────────────────────────── */}
        <div className="room-content">
          {isSectionLocked && (() => {
            const nextSec = availableSections.find(s => !submittedSections.has(s))
            return (
              <div className="section-locked-banner">
                <span>✓ {SECTION_LABELS[currentSection]} submitted — answers locked</span>
                {nextSec && (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => {
                      const firstQ = sectionQuestions[nextSec]?.[0]
                      if (firstQ) goToQuestion(firstQ.id, nextSec)
                    }}
                  >
                    Next: {SECTION_LABELS[nextSec]} →
                  </button>
                )}
              </div>
            )
          })()}

          <p className="question-num">
            Question {idxInSection + 1} of {sectionQs.length}
            &nbsp;·&nbsp; {currentSection}
            &nbsp;·&nbsp; +{currentQ.marks} / −{currentQ.negativeMarks}
          </p>

          {/* Exam-style action bar (above the question, like the mock room) */}
          <div className="room-exam-bar room-exam-bar-top">
            <div className="room-exam-left">
              {!isSectionLocked && phase === 'active' && (
                <>
                  <button className={`btn btn-ghost mark-btn ${markedForReview.has(currentQ.id) ? 'mark-active' : ''}`}
                    onClick={markReviewNext}>
                    🔖 Mark for Review &amp; Next
                  </button>
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)' }}
                    disabled={!answers[currentQ.id]} onClick={() => clearAnswer(currentQ.id)}>
                    Clear Response
                  </button>
                </>
              )}
              <button className="btn btn-ghost" style={{ fontSize: 13, color: 'var(--text-muted)' }}
                onClick={() => setReportQId(currentQ.id)} title="Report a problem with this question">
                ⚑ Report
              </button>
            </div>
            <div className="room-exam-right">
              <button className="btn btn-ghost" disabled={idxInSection === 0}
                onClick={() => { const prev = sectionQs[idxInSection - 1]; if (prev) goToQuestion(prev.id, currentSection) }}>
                ← Previous
              </button>
              {!isSectionLocked && phase === 'active' && (
                <button className="btn room-submit-section-btn" onClick={() => submitSection(currentSection)}>
                  Submit {SECTION_LABELS[currentSection]} ✓
                </button>
              )}
              <button className="btn btn-primary" disabled={isLastInSection} onClick={saveAndNext}>
                Save &amp; Next →
              </button>
            </div>
          </div>

          <QuestionContent q={currentQ} />

          <div className="options">
            {OPTIONS.map(opt => (
              <div
                key={opt}
                className={`option ${answers[currentQ.id] === opt ? 'selected' : ''} ${isSectionLocked ? 'locked' : ''}`}
                onClick={() => !isSectionLocked && phase === 'active' && selectAnswer(currentQ.id, opt)}
              >
                <span className="option-label">{opt}</span>
                <span className="option-text"><RichText html={optionText(currentQ, opt)} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
