import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { QuestionContext } from '../components/QuestionContent'
import { RichText } from '../components/RichText'
import ReportModal from '../components/ReportModal'

interface ResultQuestion {
  id: string; text: string; imageUrl?: string
  optionA: string; optionB: string; optionC: string; optionD: string
  correctOption: string; subject: string; difficulty: string
  marks: number; negativeMarks: number
  questionType?: 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  structuredData?: { statements: string[]; conclusions: string[] } | null
  passage?: { id: string; title: string; content: string; type: 'TEXT' | 'TABLE'; tableData?: { headers: string[]; rows: string[][] } | null } | null
  solution?: string | null
}

interface MockResultData {
  mockTitle: string; subject: string; durationMinutes: number
  score: number; totalMarks: number
  correct: number; wrong: number; skipped: number
  answers: Record<string, string>
  timeSpent: Record<string, number>
  markedForReview: string[]
  submittedAt: string
  rank: number; totalTakers: number; percentile: number
  topScorers: { rank: number; name: string; score: number; isCurrentUser: boolean }[]
  questionStats: Record<string, { correctPct: number; avgTime: number }>
  questions: ResultQuestion[]
}

const SECTION_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude', REASONING: 'General Intelligence & Reasoning',
  ENGLISH: 'English Language', GK: 'General Awareness',
}

type Verdict = 'correct' | 'wrong' | 'skipped'
type Filter = 'all' | Verdict | 'marked'


function optText(q: ResultQuestion, opt: string) {
  return ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as any)[opt] ?? ''
}
function fmtTime(s: number) {
  if (!s || s <= 0) return '0:00'
  const m = Math.floor(s / 60), r = Math.round(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

// ── Summary stat card ─────────────────────────────────────────────────────────
function StatCard({ icon, color, value, sub, label }: {
  icon: string; color: string; value: string; sub?: string; label: string
}) {
  return (
    <div className="perf-card">
      <div className="perf-icon" style={{ background: color }}>{icon}</div>
      <div>
        <div className="perf-value">{value}{sub && <span className="perf-sub"> {sub}</span>}</div>
        <div className="perf-label">{label}</div>
      </div>
    </div>
  )
}

export default function MockResult() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<MockResultData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [solOpen, setSolOpen] = useState<Set<string>>(new Set())
  const [reportQId, setReportQId] = useState<string | null>(null)
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [practiceOn, setPracticeOn] = useState<Set<string>>(new Set())
  const [practiceAns, setPracticeAns] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<'overview' | 'solutions' | 'leaderboard'>('overview')

  useEffect(() => {
    api.get(`/mocks/${id}/result`)
      .then(r => setData(r.data))
      .catch(() => navigate('/mocks'))
      .finally(() => setLoading(false))
    api.get('/bookmarks/ids').then(r => setBookmarks(new Set(r.data))).catch(() => {})
  }, [id, navigate])

  async function toggleBookmark(qid: string) {
    // optimistic
    setBookmarks(b => { const n = new Set(b); n.has(qid) ? n.delete(qid) : n.add(qid); return n })
    try { await api.post(`/bookmarks/${qid}`) }
    catch { setBookmarks(b => { const n = new Set(b); n.has(qid) ? n.delete(qid) : n.add(qid); return n }) }
  }

  if (loading) return <><Navbar /><div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading result...</p></div></>
  if (!data) return null

  const answered = data.correct + data.wrong
  const accuracy = answered > 0 ? (data.correct / answered) * 100 : 0

  function verdict(q: ResultQuestion): Verdict {
    const given = data!.answers[q.id]
    if (!given) return 'skipped'
    return given === q.correctOption ? 'correct' : 'wrong'
  }

  const verdicts = new Map(data.questions.map(q => [q.id, verdict(q)]))
  const marked = new Set(data.markedForReview ?? [])
  const filtered = data.questions.filter(q =>
    filter === 'all' ? true : filter === 'marked' ? marked.has(q.id) : verdicts.get(q.id) === filter)

  function jumpTo(idx: number) {
    const q = data!.questions[idx]
    setOpen(o => new Set(o).add(q.id))
    setTimeout(() => document.getElementById(`mq-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30)
  }
  function toggle(qid: string) {
    setOpen(o => { const n = new Set(o); n.has(qid) ? n.delete(qid) : n.add(qid); return n })
  }

  const VC: Record<Verdict, string> = { correct: '#16a34a', wrong: '#dc2626', skipped: '#94a3b8' }

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 1000 }}>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => navigate('/mocks')}>← Mock Tests</button>

        {/* ── Hero: score ring + headline stats ────────────────────── */}
        <div className="result-hero">
          {(() => {
            const scorePct = data.totalMarks > 0 ? Math.round((data.score / data.totalMarks) * 100) : 0
            const ringColor = scorePct >= 60 ? '#4ade80' : scorePct >= 35 ? '#fbbf24' : '#f87171'
            const deg = Math.max(scorePct, scorePct > 0 ? 4 : 0) * 3.6 // tiny min arc so low scores still read as a ring
            return (
              <div className="result-hero-ring"
                title={`Score ${data.score}/${data.totalMarks} (${scorePct}%) · ${data.correct} correct · ${data.wrong} wrong · ${data.skipped} skipped`}
                style={{ background: `conic-gradient(${ringColor} 0deg ${deg}deg, rgba(255,255,255,.18) ${deg}deg 360deg)` }}>
                <div className="result-hero-ring-inner">
                  <div className="result-hero-score">{data.score}</div>
                  <div className="result-hero-total">/ {data.totalMarks}</div>
                  <div className="result-hero-pct" style={{ color: ringColor }}>{scorePct}%</div>
                </div>
              </div>
            )
          })()}
          <div className="result-hero-info">
            <div className="result-hero-sub">{SECTION_LABELS[data.subject] ?? data.subject}</div>
            <h1 className="result-hero-title">{data.mockTitle}</h1>
            <div className="result-hero-chips">
              <span className="hero-chip">🏅 Rank <b>#{data.rank}</b>/{data.totalTakers}</span>
              <span className="hero-chip">📊 <b>{data.percentile}%</b> percentile</span>
              <span className="hero-chip">🎯 <b>{accuracy.toFixed(1)}%</b> accuracy</span>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => navigate(`/mocks/${id}`)}>↻ Retake Test</button>
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────── */}
        <div className="result-tabs">
          {([['overview', '📈 Overview'], ['solutions', '📝 Solutions'], ['leaderboard', '🏆 Leaderboard']] as const).map(([t, label]) => (
            <button key={t} className={`result-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────── */}
        {tab === 'overview' && (
          <>
            <div className="perf-row">
              <StatCard icon="🏅" color="#ef4444" value={`#${data.rank}`} sub={`/ ${data.totalTakers}`} label="Rank" />
              <StatCard icon="🏆" color="#7c3aed" value={`${data.score}`} sub={`/ ${data.totalMarks}`} label="Score" />
              <StatCard icon="📝" color="#0ea5e9" value={`${answered}`} sub={`/ ${data.questions.length}`} label="Attempted" />
              <StatCard icon="🎯" color="#16a34a" value={`${accuracy.toFixed(1)}%`} label="Accuracy" />
              <StatCard icon="📊" color="#6366f1" value={`${data.percentile}%`} label="Percentile" />
            </div>

            {/* Answer distribution bar */}
            <div className="card" style={{ marginTop: 16 }}>
              <div className="section-head" style={{ marginBottom: 12 }}>Answer Breakdown</div>
              <div className="answer-bar">
                {data.correct > 0 && <div style={{ flex: data.correct, background: '#16a34a' }} title={`${data.correct} correct`} />}
                {data.wrong > 0 && <div style={{ flex: data.wrong, background: '#dc2626' }} title={`${data.wrong} wrong`} />}
                {data.skipped > 0 && <div style={{ flex: data.skipped, background: '#cbd5e1' }} title={`${data.skipped} skipped`} />}
              </div>
              <div className="result-breakdown" style={{ marginTop: 14 }}>
                <span className="bd-pill" style={{ background: '#dcfce7', color: '#16a34a' }}>● {data.correct} Correct</span>
                <span className="bd-pill" style={{ background: '#fee2e2', color: '#dc2626' }}>● {data.wrong} Wrong</span>
                <span className="bd-pill" style={{ background: '#f1f5f9', color: '#64748b' }}>● {data.skipped} Skipped</span>
                <span className="bd-pill" style={{ background: '#eff6ff', color: '#2563eb' }}>⏱ {data.durationMinutes} min</span>
              </div>
            </div>
          </>
        )}

        {/* ── LEADERBOARD TAB ──────────────────────────────────────── */}
        {tab === 'leaderboard' && (
          <div className="card">
            <div className="section-head" style={{ marginBottom: 12 }}>Top Scorers</div>
            {data.topScorers && data.topScorers.length > 0 ? (
              <>
                <div className="topscore-list">
                  {data.topScorers.map(t => (
                    <div key={t.rank} className={`topscore-row ${t.isCurrentUser ? 'me' : ''}`}>
                      <span className="topscore-rank">{t.rank <= 3 ? ['🥇', '🥈', '🥉'][t.rank - 1] : `#${t.rank}`}</span>
                      <span className="topscore-name">{t.name}{t.isCurrentUser && <span className="topscore-you">You</span>}</span>
                      <span className="topscore-score">{t.score}</span>
                    </div>
                  ))}
                </div>
                {data.totalTakers > data.topScorers.length && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, textAlign: 'center' }}>
                    You ranked <strong>#{data.rank}</strong> of {data.totalTakers} test-takers
                  </div>
                )}
              </>
            ) : <p className="empty">No scores yet.</p>}
          </div>
        )}

        {/* ── SOLUTIONS TAB ────────────────────────────────────────── */}
        {tab === 'solutions' && (<>
        {/* ── Question palette ─────────────────────────────────────── */}
        <div className="section-head">Question Map</div>
        <div className="card">
          <div className="palette-legend">
            <span><span className="pl-dot" style={{ background: VC.correct }} /> Correct</span>
            <span><span className="pl-dot" style={{ background: VC.wrong }} /> Incorrect</span>
            <span><span className="pl-dot" style={{ background: '#fff', border: '1.5px solid var(--border)' }} /> Unattempted</span>
            {marked.size > 0 && <span><span className="pl-dot" style={{ background: '#fff' }}>🔖</span> Marked for review</span>}
          </div>
          <div className="result-palette">
            {data.questions.map((q, i) => {
              const v = verdicts.get(q.id)!
              const filled = v !== 'skipped'
              return (
                <button key={q.id} className={`rp-cell ${marked.has(q.id) ? 'rp-marked' : ''}`}
                  style={{
                    background: filled ? VC[v] : 'var(--surface)',
                    color: filled ? '#fff' : 'var(--text)',
                    borderColor: filled ? VC[v] : 'var(--border)',
                  }}
                  title={marked.has(q.id) ? 'Marked for review' : undefined}
                  onClick={() => jumpTo(i)}>
                  {i + 1}
                  {marked.has(q.id) && <span className="rp-flag">🔖</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Question-by-question review ──────────────────────────── */}
        <div className="section-head" style={{ marginTop: 28 }}>Solutions</div>
        <div className="card">
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['all', 'correct', 'wrong', 'skipped', ...(marked.size > 0 ? ['marked' as Filter] : [])] as Filter[]).map(f => (
              <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                style={{ textTransform: 'capitalize' }} onClick={() => setFilter(f)}>
                {f === 'marked' ? '🔖 Marked' : f} {f === 'all' ? `(${data.questions.length})` : f === 'correct' ? `(${data.correct})` : f === 'wrong' ? `(${data.wrong})` : f === 'skipped' ? `(${data.skipped})` : `(${marked.size})`}
              </button>
            ))}
          </div>

          {filtered.map((q) => {
            const idx = data.questions.findIndex(x => x.id === q.id)
            const given = data.answers[q.id]
            const v = verdicts.get(q.id)!
            const isOpen = open.has(q.id)
            const yourTime = data.timeSpent[q.id] ?? 0
            const stats = data.questionStats[q.id] ?? { correctPct: 0, avgTime: 0 }
            const label = v === 'correct' ? 'Correct' : v === 'wrong' ? 'Incorrect' : 'Skipped'

            return (
              <div key={q.id} id={`mq-${q.id}`} className="sol-item">
                <div className="sol-head" onClick={() => toggle(q.id)}>
                  <span className="sol-qno">Q{idx + 1}</span>
                  <span className="sol-badge" style={{ background: VC[v], color: '#fff' }}>{label}</span>
                  {marked.has(q.id) && <span className="sol-badge" style={{ background: '#fef3c7', color: '#b45309' }}>🔖 Marked</span>}
                  <span className="sol-meta">⏱ You {fmtTime(yourTime)}{stats.avgTime > 0 && <> · Avg {fmtTime(stats.avgTime)}</>}</span>
                  {stats.correctPct > 0 && <span className="sol-meta sol-meta-pct">{stats.correctPct}% got it right</span>}
                  <span className="sol-marks" style={{ color: v === 'correct' ? '#16a34a' : v === 'wrong' ? '#dc2626' : 'var(--text-muted)' }}>
                    {v === 'correct' ? `+${q.marks}` : v === 'wrong' ? `−${q.negativeMarks}` : '0'}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button className="bookmark-btn" title={bookmarks.has(q.id) ? 'Remove bookmark' : 'Bookmark for revision'}
                      onClick={e => { e.stopPropagation(); toggleBookmark(q.id) }}>
                      {bookmarks.has(q.id) ? '⭐' : '☆'}
                    </button>
                    <span style={{ color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                  </span>
                </div>

                {isOpen && (
                  <div className="sol-body">
                    <QuestionContext q={q} />
                    {q.imageUrl && (
                      <div style={{ marginBottom: 12 }}>
                        <img src={q.imageUrl} alt="Question" style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 6, border: '1px solid var(--border)' }} />
                      </div>
                    )}
                    {q.text && <RichText as="p" className="review-qtext" html={q.text} />}

                    {practiceOn.has(q.id) ? (
                      // ── Re-attempt / practice mode ──────────────────────
                      (() => {
                        const picked = practiceAns[q.id]
                        const answered = !!picked
                        return (
                          <>
                            <div className="practice-banner">🔄 Re-attempt mode — pick an answer (won't change your score)</div>
                            <div className="options" style={{ marginTop: 10 }}>
                              {(['A', 'B', 'C', 'D'] as const).map(opt => {
                                const isCorrect = opt === q.correctOption
                                const isPicked = opt === picked
                                let bc = 'var(--border)', bg = 'transparent'
                                if (answered && isCorrect) { bc = '#16a34a'; bg = 'rgba(22,163,74,.08)' }
                                else if (answered && isPicked) { bc = '#dc2626'; bg = 'rgba(220,38,38,.06)' }
                                return (
                                  <div key={opt} className="option" style={{ cursor: answered ? 'default' : 'pointer', borderColor: bc, background: bg }}
                                    onClick={() => { if (!answered) setPracticeAns(a => ({ ...a, [q.id]: opt })) }}>
                                    <span className="option-label">{opt}</span>
                                    <span className="option-text"><RichText html={optText(q, opt)} /></span>
                                    {answered && isCorrect && <span style={{ marginLeft: 'auto', color: '#16a34a', fontWeight: 700, fontSize: 13 }}>✓ Correct</span>}
                                    {answered && isPicked && !isCorrect && <span style={{ marginLeft: 'auto', color: '#dc2626', fontWeight: 700, fontSize: 13 }}>Your pick</span>}
                                  </div>
                                )
                              })}
                            </div>
                            {answered && (
                              <div style={{ marginTop: 10, fontWeight: 700, color: picked === q.correctOption ? '#16a34a' : '#dc2626' }}>
                                {picked === q.correctOption ? '✓ Correct!' : '✗ Not quite — the correct answer is highlighted.'}
                              </div>
                            )}
                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                              {answered && (
                                <button className="btn btn-ghost btn-sm" onClick={() => setPracticeAns(a => { const n = { ...a }; delete n[q.id]; return n })}>Try again</button>
                              )}
                              <button className="btn btn-ghost btn-sm" onClick={() => {
                                setPracticeOn(s => { const n = new Set(s); n.delete(q.id); return n })
                                setPracticeAns(a => { const n = { ...a }; delete n[q.id]; return n })
                              }}>Exit practice</button>
                            </div>
                          </>
                        )
                      })()
                    ) : (
                      // ── Normal review (your answer vs correct) ──────────
                      <>
                        <div className="options" style={{ marginTop: 10 }}>
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
                                {isCorrect && <span style={{ marginLeft: 'auto', color: '#16a34a', fontWeight: 700, fontSize: 13 }}>✓ Correct answer</span>}
                                {isGiven && !isCorrect && <span style={{ marginLeft: 'auto', color: '#dc2626', fontWeight: 700, fontSize: 13 }}>Your answer</span>}
                              </div>
                            )
                          })}
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--primary)' }}
                            onClick={() => setPracticeOn(s => new Set(s).add(q.id))}>🔄 Re-attempt this question</button>
                        </div>
                      </>
                    )}

                    {/* Detailed solution */}
                    {q.solution && (
                      <div className="sol-explain">
                        <button className="sol-explain-toggle"
                          onClick={() => setSolOpen(s => { const n = new Set(s); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n })}>
                          <span style={{ fontSize: 16 }}>👁</span> {solOpen.has(q.id) ? 'Hide Solution' : 'View Solution'}
                        </button>
                        {solOpen.has(q.id) && (
                          <div className="sol-explain-body">
                            <div className="sol-explain-title">Solution</div>
                            <RichText as="div" className="sol-explain-text" html={q.solution} />
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-muted)' }}
                        onClick={() => setReportQId(q.id)} title="Report a problem with this question">
                        ⚑ Report a problem
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </>)}
      </div>

      {reportQId && (
        <ReportModal
          questionId={reportQId}
          source={`mock:${id}`}
          questionLabel={`Question ${data.questions.findIndex(q => q.id === reportQId) + 1}`}
          onClose={() => setReportQId(null)}
        />
      )}
    </>
  )
}
