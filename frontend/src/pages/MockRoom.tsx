import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import LanguagePicker from '../components/LanguagePicker'
import { getPreferredLanguage, setPreferredLanguage, type Language } from '../lib/language'
import { useConfirm, useNotify } from '../components/ConfirmDialog'
import type { MockTestData, Question } from '../lib/types'
import { QuestionContent } from '../components/QuestionContent'
import { RichText } from '../components/RichText'
import ReportModal from '../components/ReportModal'
import ExamShellSSC from '../components/ExamShellSSC'
import type { PaletteCell } from '../components/ExamShell'
import { unlockAudio, playLowTimeAlert, playTick, playTimeUp } from '../lib/sound'

const OPTIONS = ['A', 'B', 'C', 'D'] as const
type Option = typeof OPTIONS[number]
type Phase = 'loading' | 'instructions' | 'active' | 'submitting'

const SUBJECT_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude', REASONING: 'General Intelligence & Reasoning',
  ENGLISH: 'English Language', GK: 'General Awareness',
}

const ZOOM_MIN = 80
const ZOOM_MAX = 150
const ZOOM_STEP = 10
const ZOOM_KEY = 'examZoom'

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

/**
 * The instructions sheet.
 *
 * Shown as a gate before the clock starts, and again from the INSTRUCTIONS
 * link during the paper — the same screen either way, so nothing a candidate
 * read at the start is unavailable once they are mid-test. `onStart` is what
 * distinguishes the two: with it the sheet begins the paper, without it it
 * simply closes.
 */
function MockInstructions({
  mock, questionCount, totalMarks, language, onLanguageChange, onStart, onClose,
}: {
  mock: MockTestData
  questionCount: number
  totalMarks: number
  language: Language
  onLanguageChange: (l: Language) => void
  onStart?: () => void
  onClose?: () => void
}) {
  return (
    <div className="modal-overlay">
      <div className="modal-box instructions-modal">
        <div className="instructions-header">
          <h2>{mock.title}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            {SUBJECT_LABELS[mock.subject] ?? mock.subject} · Read the instructions before you begin
          </p>
        </div>

        <div className="instructions-meta-grid">
          <div className="instructions-meta-item">
            <span className="meta-label">Duration</span>
            <span className="meta-value">{mock.durationMinutes} minutes</span>
          </div>
          <div className="instructions-meta-item">
            <span className="meta-label">Questions</span>
            <span className="meta-value">{questionCount}</span>
          </div>
          <div className="instructions-meta-item">
            <span className="meta-label">Total Marks</span>
            <span className="meta-value">{totalMarks}</span>
          </div>
          <div className="instructions-meta-item">
            <span className="meta-label">Negative Marking</span>
            <span className="meta-value" style={{ color: 'var(--danger)' }}>−{mock.negativeMarks} per wrong</span>
          </div>
        </div>

        <div className="instructions-rules">
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Rules &amp; Marking Scheme</h3>
          <ol className="rules-list">
            <li>You have <strong>{mock.durationMinutes} minutes</strong> to attempt <strong>{questionCount} questions</strong>. The test <strong>auto-submits</strong> when the timer hits zero.</li>
            <li>Each correct answer earns its marks; every wrong answer deducts <strong>−{mock.negativeMarks}</strong>. Unanswered questions score <strong>0</strong>.</li>
            <li>Use <strong>Mark for Review</strong> to flag tricky questions — they'll be highlighted in your result so you can revisit them.</li>
            <li>You can navigate freely between questions and change answers any time before submitting.</li>
            <li>Use <strong>Pause Test</strong> to stop the clock and hide the paper — this is practice, so take a break whenever you need one.</li>
            <li><strong>Zoom (+)</strong> and <strong>Zoom (−)</strong> resize the question if the text is hard to read.</li>
            <li>Spotted a mistake in a question? Use <strong>⚑ Report</strong> to flag it for our team.</li>
            <li>This is a practice mock — your score is <strong>not rated</strong> and you can retake it anytime.</li>
          </ol>
        </div>

        <div className="instructions-legend">
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Question Status Colors</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 13 }}>
            {[
              { cls: 'qs-not-visited',     label: 'Not Visited' },
              { cls: 'qs-not-answered',    label: 'Not Answered' },
              { cls: 'qs-answered',        label: 'Answered' },
              { cls: 'qs-marked',          label: 'Marked for Review' },
              { cls: 'qs-answered-marked', label: 'Answered + Marked' },
            ].map(({ cls, label }) => (
              <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`legend-dot ${cls}`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {onStart ? (
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <LanguagePicker value={language} onChange={onLanguageChange} />
            <button className="btn btn-primary btn-full" onClick={onStart}>
              I'm Ready — Start Test →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-primary btn-full" onClick={onClose}>Back to the test</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MockRoom() {
  const { id } = useParams<{ id: string }>()
  const confirm = useConfirm()
  const notify = useNotify()
  const navigate = useNavigate()

  const [mock, setMock] = useState<MockTestData | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  // Chosen before the clock starts and changeable mid-paper; submitted with the
  // attempt so the review afterwards reads in the same language.
  const [language, setLanguage] = useState<Language>(getPreferredLanguage())
  const [phase, setPhase] = useState<Phase>('loading')
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Option>>({})
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [visited, setVisited] = useState<Set<string>>(new Set())
  const [timeLeft, setTimeLeft] = useState(0)
  const [showSubmit, setShowSubmit] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [reportQId, setReportQId] = useState<string | null>(null)
  const [muted, setMuted] = useState(() => localStorage.getItem('mockMuted') === '1')
  const [isFull, setIsFull] = useState(false)
  const [qSeconds, setQSeconds] = useState(0) // live seconds on the current question
  const [paused, setPaused] = useState(false)
  const [zoomPct, setZoomPct] = useState(() => {
    const saved = Number(localStorage.getItem(ZOOM_KEY))
    return saved >= ZOOM_MIN && saved <= ZOOM_MAX ? saved : 100
  })

  const draftKey = `mockDraft:${id}`
  const timeSpent = useRef<Record<string, number>>({})
  const lastTickQ = useRef<string>('')
  const lastTickTime = useRef<number>(Date.now())
  const submittedRef = useRef(false)

  // ── Load (restore an in-progress draft if one exists) ───────────────
  useEffect(() => {
    api.get(`/mocks/${id}`)
      .then(r => {
        const data: MockTestData = r.data
        setMock(data)
        setQuestions(data.questions)

        let restored = false
        try {
          const raw = localStorage.getItem(draftKey)
          if (raw) {
            const d = JSON.parse(raw)
            if (d && d.answers && Array.isArray(data.questions) && data.questions.length) {
              const idx = Math.min(d.currentIdx ?? 0, data.questions.length - 1)
              setAnswers(d.answers)
              setMarked(new Set(d.marked ?? []))
              setVisited(new Set(d.visited ?? [data.questions[idx]?.id].filter(Boolean)))
              timeSpent.current = d.timeSpent ?? {}
              setCurrentIdx(idx)
              // Strict timer: subtract real time elapsed while the tab was
              // closed — unless the test was paused when they left, in which
              // case the clock was already stopped and stays stopped.
              const wasPaused = !!d.paused
              const elapsedAway = !wasPaused && d.savedAt ? Math.floor((Date.now() - d.savedAt) / 1000) : 0
              setTimeLeft(Math.max(0, (d.timeLeft ?? data.durationMinutes * 60) - elapsedAway))
              setPaused(wasPaused)
              if (d.language === 'EN' || d.language === 'HI') setLanguage(d.language)
              lastTickQ.current = data.questions[idx]?.id ?? ''
              lastTickTime.current = Date.now()
              setPhase('active')
              restored = true
            }
          }
        } catch { /* ignore corrupt draft */ }

        if (!restored) {
          setTimeLeft(data.durationMinutes * 60)
          setVisited(new Set(data.questions[0] ? [data.questions[0].id] : []))
          setPhase('instructions')
        }
      })
      .catch(() => navigate('/mocks'))
  }, [id, navigate])

  // A restored draft carries its own language, so re-read the paper in it.
  const restoredLangRef = useRef(false)
  useEffect(() => {
    if (phase !== 'active' || restoredLangRef.current) return
    restoredLangRef.current = true
    if (language === 'EN') return
    api.get(`/mocks/${id}`, { params: { language } })
      .then(res => { if (res.data?.questions) setQuestions(res.data.questions) })
      .catch(() => { /* keep the English paper already loaded */ })
  }, [phase, language, id])

  // ── Accumulate time on the current question ─────────────────────────
  const flushTime = useCallback(() => {
    const now = Date.now()
    const qId = lastTickQ.current
    if (qId) {
      const spent = Math.round((now - lastTickTime.current) / 1000)
      timeSpent.current[qId] = (timeSpent.current[qId] ?? 0) + spent
    }
    lastTickTime.current = now
  }, [])

  const currentQ = questions[currentIdx]
  useEffect(() => {
    if (!currentQ || phase !== 'active') return
    flushTime()
    lastTickQ.current = currentQ.id
    lastTickTime.current = Date.now()
  }, [currentQ, phase, flushTime])

  // Time on a question is wall time between arriving and leaving it, so a tab
  // left open in the background would bank all of that against whichever
  // question was on screen. Banking what was already earned and restarting the
  // clock on return keeps away-time out of the count.
  useEffect(() => {
    const handler = () => {
      if (document.hidden) flushTime()
      else lastTickTime.current = Date.now()
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [flushTime])

  // ── Start the test once instructions are acknowledged ───────────────
  async function startTest() {
    // Re-read the paper in the chosen language before the clock starts.
    try {
      const res = await api.get(`/mocks/${id}`, { params: { language } })
      if (res.data?.questions) setQuestions(res.data.questions)
    } catch { /* keep whatever was already loaded */ }
    restoredLangRef.current = true
    lastTickQ.current = currentQ?.id ?? ''
    lastTickTime.current = Date.now()
    unlockAudio()
    setPhase('active')
  }

  const [langBusy, setLangBusy] = useState(false)

  /**
   * Switch language mid-test. A mock has no server-side attempt until submit,
   * so this only re-reads the paper; the chosen language travels with the
   * submission. Answers and marks are keyed by question id and the order is
   * displayOrder, so currentIdx still points at the same question.
   */
  async function switchLanguage(l: Language) {
    if (l === language || langBusy) return
    setLangBusy(true)
    try {
      const res = await api.get(`/mocks/${id}`, { params: { language: l } })
      if (res.data?.questions) setQuestions(res.data.questions)
      setLanguage(l)
      setPreferredLanguage(l)
    } catch { /* keep the paper as it is */ }
    finally { setLangBusy(false) }
  }

  // ── Submit ──────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (submittedRef.current) return
    submittedRef.current = true
    flushTime()
    setPhase('submitting')
    try {
      await api.post(`/mocks/${id}/submit`, { answers, timeSpent: timeSpent.current, markedForReview: Array.from(marked), language })
      try { localStorage.removeItem(draftKey) } catch { /* noop */ }
      navigate(`/mocks/${id}/result`, { replace: true })
    } catch {
      submittedRef.current = false
      setPhase('active')
      notify('Submission failed', 'Something went wrong sending your answers. Please try again.')
    }
  }, [answers, marked, language, id, navigate, flushTime])

  // ── Countdown ───────────────────────────────────────────────────────
  // Read through a ref rather than depending on `submit` directly. `submit`
  // changes identity whenever an answer or a mark does, and depending on it
  // tore the interval down and started a fresh second on every click — a
  // candidate answering faster than once a second never lost any time at all.
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    if (phase !== 'active' || paused) return
    const iv = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(iv); submitRef.current(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [phase, paused])

  // Unlock audio on the first user interaction in the room.
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [])

  // ── Low-time audio cues (chess.com style) ──────────────────────────
  useEffect(() => {
    if (phase !== 'active' || muted) return
    if (timeLeft === 60) playLowTimeAlert()       // alert at the 1-minute mark
    else if (timeLeft <= 10 && timeLeft > 0) playTick() // tick the final 10s
    else if (timeLeft === 0) playTimeUp()
  }, [timeLeft, phase, muted])

  // ── Keyboard shortcuts: A–D / 1–4 answer, ←/→ navigate, M mark, C clear ──
  useEffect(() => {
    if (phase !== 'active' || paused) return
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || showSubmit || showInstructions || reportQId) return
      const q = questions[currentIdx]
      if (!q) return
      const k = e.key.toLowerCase()
      const move = (delta: number) => {
        const ni = currentIdx + delta
        const nq = questions[ni]
        if (nq) { setCurrentIdx(ni); setVisited(v => new Set(v).add(nq.id)) }
      }
      if (k === 'arrowright' || k === 'n') { move(1); e.preventDefault() }
      else if (k === 'arrowleft' || k === 'p') { move(-1); e.preventDefault() }
      else if (k === 'm') { setMarked(m => { const n = new Set(m); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n }) }
      else if (k === 'c') { setAnswers(a => { const n = { ...a }; delete n[q.id]; return n }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, paused, currentIdx, questions, showSubmit, showInstructions, reportQId])

  // ── Auto-save draft to localStorage (survives refresh / disconnect) ──
  useEffect(() => {
    if (phase !== 'active') return
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        answers, marked: Array.from(marked), visited: Array.from(visited),
        timeSpent: timeSpent.current, currentIdx, timeLeft, language, paused, savedAt: Date.now(),
      }))
    } catch { /* storage full / disabled — ignore */ }
  }, [answers, marked, visited, currentIdx, timeLeft, language, paused, phase, draftKey])

  // ── Warn before leaving (refresh / close) mid-test ──────────────────
  useEffect(() => {
    if (phase !== 'active') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase])

  // ── Block browser Back/Forward while the test is active ─────────────
  // The only way out of the room is submitting. Pressing Back re-traps the
  // history entry so the student can't navigate away mid-test.
  useEffect(() => {
    if (phase !== 'active') return
    window.history.pushState(null, '', window.location.href)
    const onPop = () => {
      window.history.pushState(null, '', window.location.href)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [phase])

  // ── Per-question live timer ─────────────────────────────────────────
  useEffect(() => { setQSeconds(0) }, [currentIdx])
  useEffect(() => {
    if (phase !== 'active' || paused) return
    const iv = setInterval(() => setQSeconds(s => s + 1), 1000)
    return () => clearInterval(iv)
  }, [phase, paused, currentIdx])

  // ── Sync fullscreen state ───────────────────────────────────────────
  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  if (phase === 'loading') return <div className="mock-room-loading">Loading mock test...</div>
  if (!mock || !currentQ) return null

  const totalMarks = questions.reduce((s, q) => s + q.marks, 0)

  // ── Instructions gate (shown before the timer starts) ────────────────
  if (phase === 'instructions') {
    return (
      <MockInstructions
        mock={mock}
        questionCount={questions.length}
        totalMarks={totalMarks}
        language={language}
        onLanguageChange={l => { setLanguage(l); setPreferredLanguage(l) }}
        onStart={startTest}
        onClose={() => navigate('/mocks')}
      />
    )
  }

  function goTo(idx: number) {
    const q = questions[idx]
    if (!q) return
    setCurrentIdx(idx)
    setVisited(v => new Set(v).add(q.id))
  }
  function selectAnswer(opt: Option) {
    setAnswers(a => ({ ...a, [currentQ.id]: opt }))
  }
  function clearAnswer() {
    setAnswers(a => { const n = { ...a }; delete n[currentQ.id]; return n })
  }
  // Exam-style: advance to the next question (the answer is already saved on selection).
  function saveAndNext() {
    if (currentIdx < questions.length - 1) goTo(currentIdx + 1)
  }
  // Exam-style: flag the current question for review and move on.
  function markReviewNext() {
    setMarked(m => new Set(m).add(currentQ.id))
    if (currentIdx < questions.length - 1) goTo(currentIdx + 1)
  }
  async function clearAll() {
    if (Object.keys(answers).length === 0) return
    if (!(await confirm({
      title: 'Clear all answers?',
      message: 'Every answer you have given in this test will be removed. This cannot be undone.',
      confirmLabel: 'Clear all',
      danger: true,
    }))) return
    setAnswers({})
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen().catch(() => {})
  }
  function setZoom(next: number) {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
    setZoomPct(clamped)
    try { localStorage.setItem(ZOOM_KEY, String(clamped)) } catch { /* storage disabled */ }
  }
  // Pausing banks the time already spent on this question; resuming restarts
  // the clock from now, so the break never lands on a question's total.
  function togglePause() {
    if (paused) { lastTickTime.current = Date.now(); setPaused(false) }
    else { flushTime(); setPaused(true) }
  }

  const answeredCount = Object.keys(answers).length
  const lowTime = timeLeft <= 60

  // The four analytics counts are disjoint, one per palette colour — which is
  // why "Answered" here is smaller than the header's total whenever something
  // is both answered and marked.
  const states = questions.map(q => getQState(q.id, answers, marked, visited))
  const stats = {
    answered: states.filter(s => s === 'answered').length,
    notAnswered: states.filter(s => s === 'not-answered').length,
    marked: states.filter(s => s === 'marked').length,
    answeredMarked: states.filter(s => s === 'answered-marked').length,
  }

  const palette: PaletteCell[] = questions.map((q, i) => ({
    id: q.id, label: i + 1, state: states[i],
  }))

  return (
    <>
      <ExamShellSSC
        title={mock.title}
        timeLeft={formatTime(timeLeft)}
        timeWarn={lowTime}
        zoomPct={zoomPct}
        onZoomIn={() => setZoom(zoomPct + ZOOM_STEP)}
        onZoomOut={() => setZoom(zoomPct - ZOOM_STEP)}
        isFullscreen={isFull}
        onToggleFullscreen={toggleFullscreen}
        paused={paused}
        onTogglePause={togglePause}
        onInstructions={() => setShowInstructions(true)}
        sectionLabel={SUBJECT_LABELS[mock.subject] ?? mock.subject}
        answeredCount={answeredCount}
        toolbarExtra={
          <button className="xs-tool xs-tool-wide" title={muted ? 'Unmute timer sounds' : 'Mute timer sounds'}
            onClick={() => { const n = !muted; setMuted(n); localStorage.setItem('mockMuted', n ? '1' : '0'); if (!n) unlockAudio() }}>
            {muted ? '🔇' : '🔊'}
          </button>
        }
        actions={
          <>
            <button className="xs-btn" disabled={currentIdx === 0} onClick={() => goTo(currentIdx - 1)}>
              Previous
            </button>
            <button className="xs-btn" onClick={markReviewNext}
              title="Mark this question for review and move to the next">
              Mark for Review
            </button>
            <button className="xs-btn" disabled={!answers[currentQ.id]} onClick={clearAnswer}>
              Clear Response
            </button>
            <button className="xs-btn" disabled={currentIdx === questions.length - 1} onClick={saveAndNext}>
              Save &amp; Next
            </button>
            <button className="xs-btn xs-btn-danger" onClick={() => setShowSubmit(true)}>
              Submit Test
            </button>
          </>
        }
        questionNo={currentIdx + 1}
        questionMeta={
          <>
            ⏱ {formatTime((timeSpent.current[currentQ.id] ?? 0) + qSeconds)}
            {' · '}+{currentQ.marks} / −{currentQ.negativeMarks}
          </>
        }
        language={language}
        onLanguageChange={switchLanguage}
        langBusy={langBusy}
        onReport={() => setReportQId(currentQ.id)}
        palette={palette}
        currentId={currentQ.id}
        onSelect={qid => goTo(questions.findIndex(q => q.id === qid))}
        paletteHeading={SUBJECT_LABELS[mock.subject] ?? mock.subject}
        stats={stats}
        sideFooter={
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 14, width: '100%', color: 'var(--danger)' }}
            disabled={answeredCount === 0} onClick={clearAll}>
            Clear all answers
          </button>
        }
        footer={
          <div className="xs-hint">
            <span><kbd>←</kbd><kbd>→</kbd> navigate</span>
            <span><kbd>M</kbd> mark for review</span>
            <span><kbd>C</kbd> clear response</span>
          </div>
        }
      >
        <QuestionContent q={currentQ} />

        <div className="xs-opts">
          {OPTIONS.map((opt, i) => (
            <label key={opt} className={`xs-opt ${answers[currentQ.id] === opt ? 'sel' : ''}`}>
              <input
                type="radio"
                name={`q-${currentQ.id}`}
                checked={answers[currentQ.id] === opt}
                onChange={() => selectAnswer(opt)}
              />
              <span className="xs-opt-letter">{'abcd'[i]})</span>
              <span><RichText html={optionText(currentQ, opt)} /></span>
            </label>
          ))}
        </div>
      </ExamShellSSC>

      {/* Instructions, re-openable mid-test */}
      {showInstructions && (
        <MockInstructions
          mock={mock}
          questionCount={questions.length}
          totalMarks={totalMarks}
          language={language}
          onLanguageChange={l => { setLanguage(l); setPreferredLanguage(l) }}
          onClose={() => setShowInstructions(false)}
        />
      )}

      {/* Report question modal */}
      {reportQId && (
        <ReportModal
          questionId={reportQId}
          source={`mock:${id}`}
          questionLabel={`Question ${questions.findIndex(q => q.id === reportQId) + 1}`}
          onClose={() => setReportQId(null)}
        />
      )}

      {/* Submit confirmation */}
      {showSubmit && (
        <div className="follow-modal-overlay" onClick={() => setShowSubmit(false)}>
          <div className="follow-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="follow-modal-header">
              <h3 style={{ margin: 0 }}>Submit Test?</h3>
              <button className="follow-modal-close" onClick={() => setShowSubmit(false)}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div className="mock-submit-stat"><strong style={{ color: 'var(--success)' }}>{answeredCount}</strong><span>Answered</span></div>
                <div className="mock-submit-stat"><strong>{questions.length - answeredCount}</strong><span>Unanswered</span></div>
                <div className="mock-submit-stat"><strong style={{ color: '#d97706' }}>{marked.size}</strong><span>Marked</span></div>
              </div>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
                You can retake this mock anytime. Submit your answers now?
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost btn-full" onClick={() => setShowSubmit(false)}>Keep Solving</button>
                <button className="btn btn-primary btn-full" disabled={phase === 'submitting'} onClick={submit}>
                  {phase === 'submitting' ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
