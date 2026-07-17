import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import type { MockTestData, Question } from '../lib/types'
import { QuestionContent } from '../components/QuestionContent'
import { RichText } from '../components/RichText'
import ReportModal from '../components/ReportModal'
import { unlockAudio, playLowTimeAlert, playTick, playTimeUp } from '../lib/sound'
import { getTheme, toggleTheme } from '../lib/theme'

const OPTIONS = ['A', 'B', 'C', 'D'] as const
type Option = typeof OPTIONS[number]
type Phase = 'loading' | 'instructions' | 'active' | 'submitting'

const SUBJECT_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude', REASONING: 'General Intelligence & Reasoning',
  ENGLISH: 'English Language', GK: 'General Awareness',
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

export default function MockRoom() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [mock, setMock] = useState<MockTestData | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Option>>({})
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [visited, setVisited] = useState<Set<string>>(new Set())
  const [timeLeft, setTimeLeft] = useState(0)
  const [showSubmit, setShowSubmit] = useState(false)
  const [reportQId, setReportQId] = useState<string | null>(null)
  const [muted, setMuted] = useState(() => localStorage.getItem('mockMuted') === '1')
  const [isFull, setIsFull] = useState(false)
  const [qSeconds, setQSeconds] = useState(0) // live seconds on the current question
  const [dark, setDark] = useState(() => getTheme() === 'dark')

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
              // Strict timer: subtract real time elapsed while the tab was closed.
              const elapsedAway = d.savedAt ? Math.floor((Date.now() - d.savedAt) / 1000) : 0
              setTimeLeft(Math.max(0, (d.timeLeft ?? data.durationMinutes * 60) - elapsedAway))
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

  // ── Start the test once instructions are acknowledged ───────────────
  function startTest() {
    lastTickQ.current = currentQ?.id ?? ''
    lastTickTime.current = Date.now()
    unlockAudio()
    setPhase('active')
  }

  // ── Submit ──────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (submittedRef.current) return
    submittedRef.current = true
    flushTime()
    setPhase('submitting')
    try {
      await api.post(`/mocks/${id}/submit`, { answers, timeSpent: timeSpent.current, markedForReview: Array.from(marked) })
      try { localStorage.removeItem(draftKey) } catch { /* noop */ }
      navigate(`/mocks/${id}/result`, { replace: true })
    } catch {
      submittedRef.current = false
      setPhase('active')
      alert('Submission failed. Please try again.')
    }
  }, [answers, marked, id, navigate, flushTime])

  // ── Countdown ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return
    const iv = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(iv); submit(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [phase, submit])

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
    if (phase !== 'active') return
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || showSubmit || reportQId) return
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
  }, [phase, currentIdx, questions, showSubmit, reportQId])

  // ── Auto-save draft to localStorage (survives refresh / disconnect) ──
  useEffect(() => {
    if (phase !== 'active') return
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        answers, marked: Array.from(marked), visited: Array.from(visited),
        timeSpent: timeSpent.current, currentIdx, timeLeft, savedAt: Date.now(),
      }))
    } catch { /* storage full / disabled — ignore */ }
  }, [answers, marked, visited, currentIdx, timeLeft, phase, draftKey])

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
    if (phase !== 'active') return
    const iv = setInterval(() => setQSeconds(s => s + 1), 1000)
    return () => clearInterval(iv)
  }, [phase, currentIdx])

  // ── Sync fullscreen state ───────────────────────────────────────────
  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  if (phase === 'loading') return <div className="mock-room-loading">Loading mock test...</div>
  if (!mock || !currentQ) return null

  // ── Instructions gate (shown before the timer starts) ────────────────
  if (phase === 'instructions') {
    const totalMarks = questions.reduce((s, q) => s + q.marks, 0)
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
              <span className="meta-value">{questions.length}</span>
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
              <li>You have <strong>{mock.durationMinutes} minutes</strong> to attempt <strong>{questions.length} questions</strong>. The test <strong>auto-submits</strong> when the timer hits zero.</li>
              <li>Each correct answer earns its marks; every wrong answer deducts <strong>−{mock.negativeMarks}</strong>. Unanswered questions score <strong>0</strong>.</li>
              <li>Use <strong>🔖 Mark for Review</strong> to flag tricky questions — they'll be highlighted in your result so you can revisit them.</li>
              <li>You can navigate freely between questions and change answers any time before submitting.</li>
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

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => navigate('/mocks')}>Cancel</button>
            <button className="btn btn-primary btn-full" onClick={startTest}>
              I'm Ready — Start Test →
            </button>
          </div>
        </div>
      </div>
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
  function clearAll() {
    if (Object.keys(answers).length === 0) return
    if (!window.confirm('Clear ALL your answers? This cannot be undone.')) return
    setAnswers({})
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen().catch(() => {})
  }

  const answeredCount = Object.keys(answers).length
  const markedCount = marked.size
  const lowTime = timeLeft <= 60

  return (
    <div className="mock-room">
      {/* Header */}
      <div className="mock-room-header">
        <div className="mock-room-title">{mock.title}</div>
        <button className="mock-mute-btn" title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setDark(toggleTheme() === 'dark')}>
          {dark ? '☀️' : '🌙'}
        </button>
        <button className="mock-mute-btn" title={isFull ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={toggleFullscreen}>
          {isFull ? '🡼' : '⛶'}
        </button>
        <button className="mock-mute-btn" title={muted ? 'Unmute timer sounds' : 'Mute timer sounds'}
          onClick={() => { const n = !muted; setMuted(n); localStorage.setItem('mockMuted', n ? '1' : '0'); if (!n) unlockAudio() }}>
          {muted ? '🔇' : '🔊'}
        </button>
        <div className={`mock-room-timer ${lowTime ? 'low' : ''}`}>⏱ {formatTime(timeLeft)}</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowSubmit(true)}>Submit Test</button>
      </div>

      {/* Progress bar */}
      <div className="mock-progress">
        <div className="mock-progress-fill" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
      </div>

      <div className="mock-room-body">
        {/* Question area */}
        <div className="mock-room-main">
          <div className="mock-q-header">
            <span className="question-num">Question {currentIdx + 1} of {questions.length}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="q-timer" title="Time spent on this question">
                ⏱ {formatTime((timeSpent.current[currentQ.id] ?? 0) + qSeconds)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{currentQ.marks} / −{currentQ.negativeMarks}</span>
            </div>
          </div>

          {/* Exam-style action bar: review / clear on the left, navigation + Save & Next on the right */}
          <div className="room-exam-bar room-exam-bar-top">
            <div className="room-exam-left">
              <button className={`btn btn-ghost mark-btn ${marked.has(currentQ.id) ? 'mark-active' : ''}`} onClick={markReviewNext}>
                🔖 Mark for Review &amp; Next
              </button>
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }}
                disabled={!answers[currentQ.id]} onClick={clearAnswer}>
                Clear Response
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 13, color: 'var(--text-muted)' }}
                onClick={() => setReportQId(currentQ.id)} title="Report a problem with this question">
                ⚑ Report
              </button>
            </div>
            <div className="room-exam-right">
              <button className="btn btn-ghost" disabled={currentIdx === 0} onClick={() => goTo(currentIdx - 1)}>← Previous</button>
              {currentIdx < questions.length - 1
                ? <button className="btn btn-primary" onClick={saveAndNext}>Save &amp; Next →</button>
                : <button className="btn btn-primary" onClick={() => setShowSubmit(true)}>Submit Test</button>}
            </div>
          </div>

          <QuestionContent q={currentQ} />

          <div className="options">
            {OPTIONS.map(opt => (
              <div key={opt}
                className={`option ${answers[currentQ.id] === opt ? 'selected' : ''}`}
                onClick={() => selectAnswer(opt)}>
                <span className="option-label">{opt}</span>
                <span className="option-text"><RichText html={optionText(currentQ, opt)} /></span>
              </div>
            ))}
          </div>

          <div className="kbd-hint">
            <span><kbd>←</kbd><kbd>→</kbd> navigate</span>
            <span><kbd>M</kbd> mark for review</span>
            <span><kbd>C</kbd> clear response</span>
          </div>
        </div>

        {/* Palette */}
        <div className="mock-room-palette">
          <div className="palette-stats">
            <div className="pstat"><strong style={{ color: 'var(--success)' }}>{answeredCount}</strong><span>Answered</span></div>
            <div className="pstat"><strong style={{ color: '#d97706' }}>{markedCount}</strong><span>Marked</span></div>
            <div className="pstat"><strong>{questions.length - answeredCount}</strong><span>Left</span></div>
          </div>
          <div className="palette-legend-room">
            <span><i className="ld qs-answered" /> Answered</span>
            <span><i className="ld qs-not-answered" /> Not answered</span>
            <span><i className="ld qs-marked" /> Marked</span>
            <span><i className="ld qs-not-visited" /> Not visited</span>
          </div>
          <div className="q-grid">
            {questions.map((q, i) => {
              const state = getQState(q.id, answers, marked, visited)
              return (
                <button key={q.id}
                  className={`q-btn qs-${state} ${i === currentIdx ? 'current' : ''}`}
                  onClick={() => goTo(i)}>
                  {i + 1}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--danger)' }}
              disabled={answeredCount === 0} onClick={clearAll}>
              Clear all
            </button>
            <button className="btn btn-primary btn-sm" style={{ flex: 2 }} onClick={() => setShowSubmit(true)}>
              Submit Test
            </button>
          </div>
        </div>
      </div>

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
                <div className="mock-submit-stat"><strong style={{ color: '#d97706' }}>{markedCount}</strong><span>Marked</span></div>
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
    </div>
  )
}
