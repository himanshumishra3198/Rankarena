import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { QuestionContext } from '../components/QuestionContent'
import { RichText } from '../components/RichText'

interface ResultQuestion {
  id: string; text: string; imageUrl?: string
  optionA: string; optionB: string; optionC: string; optionD: string
  correctOption: string; subject: string; difficulty: string
  marks: number; negativeMarks: number
  questionType?: 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  structuredData?: { statements: string[]; conclusions: string[] } | null
  passage?: { id: string; title: string; content: string; type: 'TEXT' | 'TABLE'; tableData?: { headers: string[]; rows: string[][] } | null } | null
}

interface MockResultData {
  mockTitle: string; subject: string; durationMinutes: number
  score: number; totalMarks: number
  correct: number; wrong: number; skipped: number
  answers: Record<string, string>
  timeSpent: Record<string, number>
  submittedAt: string
  questions: ResultQuestion[]
}

const SECTION_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude', REASONING: 'General Intelligence & Reasoning',
  ENGLISH: 'English Language', GK: 'General Awareness',
}

type Filter = 'all' | 'correct' | 'wrong' | 'skipped'

function optText(q: ResultQuestion, opt: string) {
  return ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as any)[opt] ?? ''
}

export default function MockResult() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<MockResultData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.get(`/mocks/${id}/result`)
      .then(r => setData(r.data))
      .catch(() => navigate('/mocks'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  if (loading) return <><Navbar /><div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading result...</p></div></>
  if (!data) return null

  const answered = data.correct + data.wrong
  const accuracy = answered > 0 ? (data.correct / answered) * 100 : 0
  const pct = data.totalMarks > 0 ? (data.score / data.totalMarks) * 100 : 0

  function verdict(q: ResultQuestion): Filter {
    const given = data!.answers[q.id]
    if (!given) return 'skipped'
    return given === q.correctOption ? 'correct' : 'wrong'
  }

  const filtered = data.questions.filter(q => filter === 'all' || verdict(q) === filter)

  function toggle(qid: string) {
    setOpen(o => { const n = new Set(o); n.has(qid) ? n.delete(qid) : n.add(qid); return n })
  }

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 900 }}>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => navigate('/mocks')}>← Mock Tests</button>

        {/* Score summary */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{SECTION_LABELS[data.subject] ?? data.subject}</div>
          <h1 style={{ marginBottom: 16 }}>{data.mockTitle}</h1>
          <div className="mock-result-score">
            <div className="mock-score-ring" style={{
              background: `conic-gradient(${pct >= 60 ? '#16a34a' : pct >= 35 ? '#d97706' : '#dc2626'} ${pct * 3.6}deg, var(--border) 0deg)`,
            }}>
              <div className="mock-score-inner">
                <div className="mock-score-num">{data.score}</div>
                <div className="mock-score-total">/ {data.totalMarks}</div>
              </div>
            </div>
            <div className="mock-result-breakdown">
              <div className="mock-bd-row"><span className="mock-bd-dot" style={{ background: '#16a34a' }} /> Correct <strong>{data.correct}</strong></div>
              <div className="mock-bd-row"><span className="mock-bd-dot" style={{ background: '#dc2626' }} /> Wrong <strong>{data.wrong}</strong></div>
              <div className="mock-bd-row"><span className="mock-bd-dot" style={{ background: 'var(--text-muted)' }} /> Skipped <strong>{data.skipped}</strong></div>
              <div className="mock-bd-row" style={{ marginTop: 6 }}>Accuracy <strong>{accuracy.toFixed(1)}%</strong></div>
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate(`/mocks/${id}`)}>↻ Retake Test</button>
        </div>

        {/* Review */}
        <div className="card">
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['all', 'correct', 'wrong', 'skipped'] as Filter[]).map(f => (
              <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                style={{ textTransform: 'capitalize' }} onClick={() => setFilter(f)}>
                {f} {f === 'all' ? `(${data.questions.length})` : f === 'correct' ? `(${data.correct})` : f === 'wrong' ? `(${data.wrong})` : `(${data.skipped})`}
              </button>
            ))}
          </div>

          {filtered.map((q, i) => {
            const given = data.answers[q.id]
            const v = verdict(q)
            const isOpen = open.has(q.id)
            const color = v === 'correct' ? '#16a34a' : v === 'wrong' ? '#dc2626' : 'var(--text-muted)'
            return (
              <div key={q.id} className="review-item">
                <div className="review-item-head" onClick={() => toggle(q.id)} style={{ cursor: 'pointer' }}>
                  <span className="review-qnum">Q{i + 1}</span>
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>
                    {q.text ? (q.text.length > 80 ? q.text.slice(0, 80) + '...' : q.text)
                      : (q.passage?.title || 'View question')}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: 'capitalize' }}>{v}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
                {isOpen && (
                  <div className="review-item-body">
                    <QuestionContext q={q} />
                    {q.imageUrl && (
                      <div style={{ marginBottom: 12 }}>
                        <img src={q.imageUrl} alt="Question" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 6, border: '1px solid var(--border)' }} />
                      </div>
                    )}
                    {q.text && <RichText as="p" className="review-qtext" html={q.text} />}
                    <div className="options" style={{ marginTop: 8 }}>
                      {(['A', 'B', 'C', 'D'] as const).map(opt => {
                        const isCorrect = opt === q.correctOption
                        const isGiven = opt === given
                        return (
                          <div key={opt} className="option" style={{
                            cursor: 'default',
                            borderColor: isCorrect ? '#16a34a' : isGiven ? '#dc2626' : 'var(--border)',
                            background: isCorrect ? 'rgba(22,163,74,.08)' : isGiven ? 'rgba(220,38,38,.06)' : 'transparent',
                          }}>
                            <span className="option-label">{opt}</span>
                            <span className="option-text"><RichText html={optText(q, opt)} /></span>
                            {isCorrect && <span style={{ marginLeft: 'auto', color: '#16a34a', fontWeight: 700 }}>✓ Correct</span>}
                            {isGiven && !isCorrect && <span style={{ marginLeft: 'auto', color: '#dc2626', fontWeight: 700 }}>Your answer</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
