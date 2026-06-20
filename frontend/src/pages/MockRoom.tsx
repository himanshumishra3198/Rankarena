import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import type { MockTestData, Question } from '../lib/types'
import { QuestionContent } from '../components/QuestionContent'
import { RichText } from '../components/RichText'
import { unlockAudio, playLowTimeAlert, playTick, playTimeUp } from '../lib/sound'

const OPTIONS = ['A', 'B', 'C', 'D'] as const
type Option = typeof OPTIONS[number]
type Phase = 'loading' | 'active' | 'submitting'

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
  const [muted, setMuted] = useState(() => localStorage.getItem('mockMuted') === '1')

  const timeSpent = useRef<Record<string, number>>({})
  const lastTickQ = useRef<string>('')
  const lastTickTime = useRef<number>(Date.now())
  const submittedRef = useRef(false)

  // ── Load ────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get(`/mocks/${id}`)
      .then(r => {
        const data: MockTestData = r.data
        setMock(data)
        setQuestions(data.questions)
        setTimeLeft(data.durationMinutes * 60)
        setVisited(new Set(data.questions[0] ? [data.questions[0].id] : []))
        setPhase('active')
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
    if (!currentQ) return
    flushTime()
    lastTickQ.current = currentQ.id
    lastTickTime.current = Date.now()
  }, [currentQ, flushTime])

  // ── Submit ──────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (submittedRef.current) return
    submittedRef.current = true
    flushTime()
    setPhase('submitting')
    try {
      await api.post(`/mocks/${id}/submit`, { answers, timeSpent: timeSpent.current })
      navigate(`/mocks/${id}/result`)
    } catch {
      submittedRef.current = false
      setPhase('active')
      alert('Submission failed. Please try again.')
    }
  }, [answers, id, navigate, flushTime])

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

  if (phase === 'loading') return <div className="mock-room-loading">Loading mock test...</div>
  if (!mock || !currentQ) return null

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
  function toggleMark() {
    setMarked(m => { const n = new Set(m); n.has(currentQ.id) ? n.delete(currentQ.id) : n.add(currentQ.id); return n })
  }

  const answeredCount = Object.keys(answers).length
  const markedCount = marked.size
  const lowTime = timeLeft <= 60

  return (
    <div className="mock-room">
      {/* Header */}
      <div className="mock-room-header">
        <div className="mock-room-title">{mock.title}</div>
        <button className="mock-mute-btn" title={muted ? 'Unmute timer sounds' : 'Mute timer sounds'}
          onClick={() => { const n = !muted; setMuted(n); localStorage.setItem('mockMuted', n ? '1' : '0'); if (!n) unlockAudio() }}>
          {muted ? '🔇' : '🔊'}
        </button>
        <div className={`mock-room-timer ${lowTime ? 'low' : ''}`}>⏱ {formatTime(timeLeft)}</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowSubmit(true)}>Submit Test</button>
      </div>

      <div className="mock-room-body">
        {/* Question area */}
        <div className="mock-room-main">
          <div className="mock-q-header">
            <span className="question-num">Question {currentIdx + 1} of {questions.length}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{currentQ.marks} / −{currentQ.negativeMarks}</span>
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

          <div className="room-actions">
            <button className={`btn btn-ghost mark-btn ${marked.has(currentQ.id) ? 'mark-active' : ''}`} onClick={toggleMark}>
              🔖 {marked.has(currentQ.id) ? 'Marked' : 'Mark for Review'}
            </button>
            {answers[currentQ.id] && (
              <button className="btn btn-ghost" style={{ color: 'var(--danger)', fontSize: 13 }} onClick={clearAnswer}>
                Clear answer
              </button>
            )}
          </div>

          <div className="room-nav">
            <button className="btn btn-ghost" disabled={currentIdx === 0} onClick={() => goTo(currentIdx - 1)}>← Prev</button>
            {currentIdx < questions.length - 1
              ? <button className="btn btn-primary" onClick={() => goTo(currentIdx + 1)}>Next →</button>
              : <button className="btn btn-primary" onClick={() => setShowSubmit(true)}>Finish</button>}
          </div>
        </div>

        {/* Palette */}
        <div className="mock-room-palette">
          <div className="palette-summary">
            <span><strong style={{ color: 'var(--success)' }}>{answeredCount}</strong> answered</span>
            <span><strong style={{ color: '#d97706' }}>{markedCount}</strong> marked</span>
            <span><strong>{questions.length - answeredCount}</strong> left</span>
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
          <button className="btn btn-primary btn-full" style={{ marginTop: 16 }} onClick={() => setShowSubmit(true)}>
            Submit Test
          </button>
        </div>
      </div>

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
