import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { QuestionContext } from '../components/QuestionContent'
import { RichText } from '../components/RichText'
import ReportModal from '../components/ReportModal'

// ── Types ─────────────────────────────────────────────────────────────────────
interface RichQuestion {
  id: string; text: string; imageUrl?: string
  optionA: string; optionB: string; optionC: string; optionD: string
  correctOption: string; subject: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  marks: number; negativeMarks: number
  questionType?: 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  structuredData?: { statements: string[]; conclusions: string[] } | null
  passage?: { id: string; title: string; content: string; type: 'TEXT' | 'TABLE'; tableData?: { headers: string[]; rows: string[][] } | null } | null
  solution?: string | null
}

interface ResultData {
  score: number; rank: number | null; totalParticipants: number
  submittedAt: string; answers: Record<string, string>
  markedForReview: string[]
  questions: RichQuestion[]; totalMaxMarks: number
  contestTitle: string; durationMinutes: number
  sectionLimits: Record<string, number> | null
  ratingChange: { oldRating: number; newRating: number; delta: number } | null
  avgTimePerQuestion: Record<string, number>
}

interface LeaderboardEntry {
  rank: number; userId: string; name: string
  score: number; rating: number; isCurrentUser: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SECTIONS = ['QUANT', 'REASONING', 'ENGLISH', 'GK'] as const
const SECTION_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude', REASONING: 'General Intelligence & Reasoning',
  ENGLISH: 'English Comprehension', GK: 'General Awareness',
}
const SECTION_SHORT: Record<string, string> = {
  QUANT: 'Quant', REASONING: 'Reasoning', ENGLISH: 'English', GK: 'GK',
}
const SECTION_COLORS: Record<string, string> = {
  QUANT: '#7c3aed', REASONING: '#0ea5e9', ENGLISH: '#16a34a', GK: '#f59e0b',
}
const DIFF_COLORS = { EASY: '#16a34a', MEDIUM: '#d97706', HARD: '#dc2626' }

type ReviewFilter = 'all' | 'correct' | 'wrong' | 'skipped' | 'marked'

// ── Small helpers ─────────────────────────────────────────────────────────────
function optText(q: RichQuestion, opt: string) {
  return ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as any)[opt] ?? ''
}

function fmtSecs(s: number) {
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60); const r = Math.round(s % 60)
  return r === 0 ? `${m}m` : `${m}m ${r}s`
}

function timeEmoji(userSecs: number, avgSecs: number): { emoji: string; label: string; color: string } {
  if (avgSecs === 0) return { emoji: '⏱', label: 'No avg data', color: 'var(--text-muted)' }
  const ratio = userSecs / avgSecs
  if (ratio < 0.5)  return { emoji: '🚀', label: 'Much faster than avg', color: '#16a34a' }
  if (ratio < 0.8)  return { emoji: '⚡', label: 'Faster than avg',      color: '#0ea5e9' }
  if (ratio < 1.2)  return { emoji: '😊', label: 'About avg time',        color: '#6366f1' }
  if (ratio < 2.0)  return { emoji: '🐢', label: 'Slower than avg',       color: '#d97706' }
  return              { emoji: '😰', label: 'Much slower than avg',  color: '#dc2626' }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatBubble({ color, icon, value, sub }: { color: string; icon: string; value: string; sub: string }) {
  return (
    <div className="stat-bubble">
      <div className="stat-bubble-icon" style={{ background: color }}>{icon}</div>
      <div className="stat-bubble-val">{value}</div>
      <div className="stat-bubble-sub">{sub}</div>
    </div>
  )
}

function DonutRing({ correct, wrong, skipped }: { correct: number; wrong: number; skipped: number }) {
  const [hovered, setHovered] = useState<'correct' | 'wrong' | 'skipped' | null>(null)
  const total = correct + wrong + skipped || 1

  const segments = [
    { key: 'correct' as const, count: correct, color: '#16a34a', label: 'Correct' },
    { key: 'wrong'   as const, count: wrong,   color: '#dc2626', label: 'Wrong'   },
    { key: 'skipped' as const, count: skipped, color: '#94a3b8', label: 'Skipped' },
  ]

  const cx = 80, cy = 80, OR = 70, IR = 44, GAP = 0.04

  function polarXY(r: number, a: number): [number, number] {
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }

  function sectorPath(sa: number, ea: number): string {
    if (ea - sa >= 2 * Math.PI - 0.01) {
      return `M ${cx + OR} ${cy} A ${OR} ${OR} 0 1 1 ${cx - OR} ${cy} A ${OR} ${OR} 0 1 1 ${cx + OR} ${cy} ` +
             `M ${cx + IR} ${cy} A ${IR} ${IR} 0 1 0 ${cx - IR} ${cy} A ${IR} ${IR} 0 1 0 ${cx + IR} ${cy} Z`
    }
    const large = ea - sa > Math.PI ? 1 : 0
    const [ox1, oy1] = polarXY(OR, sa); const [ox2, oy2] = polarXY(OR, ea)
    const [ix2, iy2] = polarXY(IR, ea); const [ix1, iy1] = polarXY(IR, sa)
    return `M ${ox1} ${oy1} A ${OR} ${OR} 0 ${large} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${IR} ${IR} 0 ${large} 0 ${ix1} ${iy1} Z`
  }

  const visible = segments.filter(s => s.count > 0)
  const gapHalf = visible.length > 1 ? GAP / 2 : 0
  let angle = -Math.PI / 2
  const arcs = visible.map(s => {
    const sweep = (s.count / total) * 2 * Math.PI
    const sa = angle + gapHalf, ea = angle + sweep - gapHalf
    angle += sweep
    return { ...s, path: sectorPath(sa, ea), pct: Math.round((s.count / total) * 100) }
  })

  const hSeg = arcs.find(a => a.key === hovered)
  const centerPct = hSeg ? hSeg.pct : Math.round((correct / total) * 100)
  const centerLabel = hSeg ? hSeg.label : 'Accuracy'

  return (
    <div className="donut-wrap">
      <svg width={160} height={160} style={{ overflow: 'visible', display: 'block' }}>
        {arcs.map(seg => (
          <path
            key={seg.key}
            d={seg.path}
            fill={seg.color}
            opacity={hovered && hovered !== seg.key ? 0.35 : 1}
            style={{
              cursor: 'pointer',
              transition: 'opacity 0.15s, transform 0.15s',
              transformOrigin: `${cx}px ${cy}px`,
              transform: hovered === seg.key ? 'scale(1.06)' : 'scale(1)',
            }}
            onMouseEnter={() => setHovered(seg.key)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text x={cx} y={cy - 7} textAnchor="middle" fontSize={22} fontWeight={700}
          style={{ fill: 'var(--heading)', pointerEvents: 'none' }}>
          {centerPct}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11}
          style={{ fill: 'var(--text-muted)', pointerEvents: 'none' }}>
          {centerLabel}
        </text>
      </svg>
      <div className="donut-legend">
        <div className="donut-legend-item"><span style={{ background: '#16a34a' }} /><b>{correct}</b> Correct</div>
        <div className="donut-legend-item"><span style={{ background: '#dc2626' }} /><b>{wrong}</b> Wrong</div>
        <div className="donut-legend-item"><span style={{ background: '#94a3b8' }} /><b>{skipped}</b> Skipped</div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Result() {
  const { id: contestId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [result, setResult] = useState<ResultData | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [lbFilter, setLbFilter] = useState<'all' | 'friends'>('all')
  const [lbLoading, setLbLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')
  const [expandedQ, setExpandedQ] = useState<string | null>(null)
  const [solOpenQ, setSolOpenQ] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>('all')
  const [copied, setCopied] = useState(false)
  const [reportQId, setReportQId] = useState<string | null>(null)
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [practiceOn, setPracticeOn] = useState<Set<string>>(new Set())
  const [practiceAns, setPracticeAns] = useState<Record<string, string>>({})

  // timeSpent per questionId saved by ContestRoom on submit
  const [timeSpent, setTimeSpent] = useState<Record<string, number>>({})

  useEffect(() => {
    Promise.all([
      api.get(`/contests/${contestId}/result`),
      api.get(`/contests/${contestId}/leaderboard`).catch(() => ({ data: [] })),
    ])
      .then(([rRes, lRes]) => {
        setResult(rRes.data)
        setLeaderboard(lRes.data)
        const saved = localStorage.getItem(`time-spent-${contestId}`)
        if (saved) setTimeSpent(JSON.parse(saved))
      })
      .catch(() => setError('Result not available yet.'))
      .finally(() => setLoading(false))
    api.get('/bookmarks/ids').then(r => setBookmarks(new Set(r.data))).catch(() => {})
  }, [contestId])

  async function toggleBookmark(qid: string) {
    setBookmarks(b => { const n = new Set(b); n.has(qid) ? n.delete(qid) : n.add(qid); return n })
    try { await api.post(`/bookmarks/${qid}`) }
    catch { setBookmarks(b => { const n = new Set(b); n.has(qid) ? n.delete(qid) : n.add(qid); return n }) }
  }

  function jumpToQuestion(qid: string) {
    setActiveSection('all'); setReviewFilter('all'); setExpandedQ(qid)
    setTimeout(() => document.getElementById(`cq-${qid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40)
  }

  useEffect(() => {
    if (!result) return
    setLbLoading(true)
    const url = lbFilter === 'friends'
      ? `/contests/${contestId}/leaderboard?filter=friends`
      : `/contests/${contestId}/leaderboard`
    api.get(url)
      .then(r => setLeaderboard(r.data))
      .catch(() => setLeaderboard([]))
      .finally(() => setLbLoading(false))
  }, [lbFilter, result])

  if (loading) return <><Navbar /><div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading result...</p></div></>
  if (error)   return <><Navbar /><div className="page"><div className="alert alert-error">{error}</div></div></>
  if (!result) return null

  const { answers, questions, totalMaxMarks, score, rank, totalParticipants, ratingChange, avgTimePerQuestion } = result
  const numScore = Number(score)

  // ── Overall derived stats ────────────────────────────────────────────────
  const correct  = questions.filter(q => answers[q.id] === q.correctOption).length
  const wrong    = questions.filter(q => answers[q.id] && answers[q.id] !== q.correctOption).length
  const skipped  = questions.filter(q => !answers[q.id]).length
  const attempted = correct + wrong
  const accuracy  = attempted > 0 ? (correct / attempted) * 100 : 0
  const percentile = rank && totalParticipants
    ? ((totalParticipants - rank) / totalParticipants) * 100 : null

  // ── Per-section stats ────────────────────────────────────────────────────
  const sectionStats = SECTIONS.map(sec => {
    const qs  = questions.filter(q => q.subject === sec)
    const cor = qs.filter(q => answers[q.id] === q.correctOption)
    const wrg = qs.filter(q => answers[q.id] && answers[q.id] !== q.correctOption)
    const skp = qs.filter(q => !answers[q.id])
    const maxM  = qs.reduce((s, q) => s + q.marks, 0)
    const earned = Math.max(0,
      cor.reduce((s, q) => s + q.marks, 0) - wrg.reduce((s, q) => s + q.negativeMarks, 0))
    const totalSecs = qs.reduce((s, q) => s + (timeSpent[q.id] ?? 0), 0)
    const avgSecs   = qs.length > 0 ? totalSecs / qs.length : 0
    const sectionTime = result.sectionLimits?.[sec] ?? Math.floor(result.durationMinutes / 4)
    return { sec, qs, cor: cor.length, wrg: wrg.length, skp: skp.length,
             att: cor.length + wrg.length, maxM, earned, totalSecs, avgSecs, sectionTime }
  })

  // ── Difficulty breakdown ─────────────────────────────────────────────────
  const diffStats = (['EASY','MEDIUM','HARD'] as const).map(d => {
    const qs  = questions.filter(q => q.difficulty === d)
    const cor = qs.filter(q => answers[q.id] === q.correctOption).length
    const wrg = qs.filter(q => answers[q.id] && answers[q.id] !== q.correctOption).length
    const skp = qs.filter(q => !answers[q.id]).length
    return { d, total: qs.length, cor, wrg, skp }
  })

  // ── Time analysis ────────────────────────────────────────────────────────
  const hasTimeData = Object.keys(timeSpent).length > 0
  const sortedByTime = hasTimeData
    ? [...questions].filter(q => timeSpent[q.id]).sort((a, b) => (timeSpent[b.id] ?? 0) - (timeSpent[a.id] ?? 0))
    : []
  const slowest = sortedByTime.slice(0, 3)
  const fastest = [...sortedByTime].reverse().slice(0, 3)

  // ── Marked-for-review (flagged in the exam room) ─────────────────────────
  const markedSet = new Set(result.markedForReview ?? [])

  // ── Question review filtering ────────────────────────────────────────────
  const reviewQs = questions.filter(q => {
    if (activeSection !== 'all' && q.subject !== activeSection) return false
    if (reviewFilter === 'correct') return answers[q.id] === q.correctOption
    if (reviewFilter === 'wrong')   return answers[q.id] && answers[q.id] !== q.correctOption
    if (reviewFilter === 'skipped') return !answers[q.id]
    if (reviewFilter === 'marked')  return markedSet.has(q.id)
    return true
  })

  // ── Share ────────────────────────────────────────────────────────────────
  function copyResult() {
    const lines = [
      `📊 ${result!.contestTitle}`,
      `Score: ${numScore.toFixed(2)} / ${totalMaxMarks}`,
      `Rank: ${rank ? `#${rank} / ${totalParticipants}` : 'Pending'}`,
      `Accuracy: ${accuracy.toFixed(1)}%  |  Percentile: ${percentile !== null ? percentile.toFixed(1) + '%' : '—'}`,
      `Attempted: ${attempted} / ${questions.length}  ✓${correct}  ✗${wrong}  —${skipped}`,
      '',
      ...sectionStats.map(s => `${SECTION_SHORT[s.sec]}: ${s.earned.toFixed(1)}/${s.maxM}  (${s.cor}✓ ${s.wrg}✗)`),
      '',
      `🔗 RankArena`,
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 1100 }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 6 }} onClick={() => navigate('/')}>← Back</button>
            <h1 style={{ marginBottom: 2 }}>{result.contestTitle}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Submitted {new Date(result.submittedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={copyResult} style={{ flexShrink: 0 }}>
            {copied ? '✓ Copied!' : '📋 Share Result'}
          </button>
        </div>

        {/* ── Overall Performance Summary ──────────────────────────────── */}
        <div className="card result-summary-card">
          <div className="result-summary-title">Overall Performance Summary</div>
          <div className="stat-bubbles-row">
            <StatBubble color="#ef4444" icon="🏆" value={rank ? `${rank} / ${totalParticipants}` : '—'} sub="Rank" />
            <StatBubble color="#7c3aed" icon="📊" value={`${numScore.toFixed(2)} / ${totalMaxMarks}`} sub="Score" />
            <StatBubble color="#0ea5e9" icon="📝" value={`${attempted} / ${questions.length}`} sub="Attempted" />
            <StatBubble color="#16a34a" icon="🎯" value={`${accuracy.toFixed(2)}%`} sub="Accuracy" />
            <StatBubble color="#6366f1" icon="📈" value={percentile !== null ? `${percentile.toFixed(2)}%` : '—'} sub="Percentile" />
          </div>
        </div>

        {/* ── Rating change card ───────────────────────────────────────── */}
        {ratingChange && (
          <div className={`card rating-change-card ${ratingChange.delta >= 0 ? 'rating-up' : 'rating-down'}`}>
            <div className="rating-change-label">Rating Change</div>
            <div className="rating-change-row">
              <span className="rating-old">{ratingChange.oldRating}</span>
              <span className="rating-arrow">→</span>
              <span className="rating-new">{ratingChange.newRating}</span>
              <span className={`rating-delta ${ratingChange.delta >= 0 ? 'pos' : 'neg'}`}>
                {ratingChange.delta >= 0 ? '+' : ''}{ratingChange.delta}
              </span>
            </div>
          </div>
        )}

        {/* ── Donut + Subject Cards ────────────────────────────────────── */}
        <div className="result-two-col">
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <DonutRing correct={correct} wrong={wrong} skipped={skipped} />
          </div>
          <div className="result-subject-grid">
            {sectionStats.map(({ sec, cor, wrg, skp, maxM, earned }) => (
              <div key={sec} className="result-subject-card" style={{ borderLeft: `4px solid ${SECTION_COLORS[sec]}` }}>
                <div className="result-subject-name" style={{ color: SECTION_COLORS[sec] }}>{SECTION_SHORT[sec]}</div>
                <div className="result-subject-score">{earned.toFixed(1)}<span>/{maxM}</span></div>
                <div className="result-subject-bar-track">
                  <div className="result-subject-bar-fill" style={{ width: `${maxM > 0 ? (earned / maxM) * 100 : 0}%`, background: SECTION_COLORS[sec] }} />
                </div>
                <div className="result-subject-pills">
                  <span className="result-pill correct">{cor} ✓</span>
                  <span className="result-pill wrong">{wrg} ✗</span>
                  <span className="result-pill skipped">{skp} —</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sectional Summary table ──────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginBottom: 16 }}>Sectional Summary</h2>
          <div className="table-scroll">
          <table className="result-section-table">
            <thead>
              <tr>
                <th>Section</th><th>Score</th><th>Attempted</th><th>Accuracy</th>
                {hasTimeData && <th>Avg Time / Q</th>}
                <th>Allotted</th>
              </tr>
            </thead>
            <tbody>
              {sectionStats.map(({ sec, cor, att, maxM, earned, avgSecs, sectionTime, qs }) => {
                const secAcc = att > 0 ? (cor / att) * 100 : 0
                return (
                  <tr key={sec}>
                    <td style={{ fontWeight: 500 }}>{SECTION_LABELS[sec]}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="section-score-bar-track">
                          <div className="section-score-bar-fill" style={{ width: `${maxM > 0 ? (earned / maxM) * 100 : 0}%`, background: SECTION_COLORS[sec] }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{earned.toFixed(1)}/{maxM}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="section-score-bar-track">
                          <div className="section-score-bar-fill" style={{ width: `${qs.length > 0 ? (att / qs.length) * 100 : 0}%`, background: SECTION_COLORS[sec] }} />
                        </div>
                        <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{att}/{qs.length}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: secAcc >= 75 ? 'var(--success)' : secAcc >= 50 ? '#d97706' : att > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {att > 0 ? `${secAcc.toFixed(1)}%` : '—'}
                    </td>
                    {hasTimeData && <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{avgSecs > 0 ? fmtSecs(avgSecs) : '—'}</td>}
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{sectionTime} min</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>

        {/* ── Difficulty Breakdown ─────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginBottom: 16 }}>Difficulty Breakdown</h2>
          <div className="diff-grid">
            {diffStats.map(({ d, total, cor, wrg, skp }) => {
              const acc = cor + wrg > 0 ? Math.round((cor / (cor + wrg)) * 100) : null
              return (
                <div key={d} className="diff-card" style={{ borderTop: `3px solid ${DIFF_COLORS[d]}` }}>
                  <div className="diff-label" style={{ color: DIFF_COLORS[d] }}>{d}</div>
                  <div className="diff-total">{total} Qs</div>
                  <div className="diff-bar-stack">
                    <div title={`Correct: ${cor}`} style={{ flex: cor, background: '#16a34a' }} />
                    <div title={`Wrong: ${wrg}`}   style={{ flex: wrg, background: '#dc2626' }} />
                    <div title={`Skipped: ${skp}`} style={{ flex: skp, background: '#e2e8f0' }} />
                  </div>
                  <div className="diff-stats">
                    <span style={{ color: '#16a34a' }}>{cor}✓</span>
                    <span style={{ color: '#dc2626' }}>{wrg}✗</span>
                    <span style={{ color: '#94a3b8' }}>{skp}—</span>
                  </div>
                  {acc !== null && <div className="diff-acc">{acc}% accuracy</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Time Analysis ────────────────────────────────────────────── */}
        {hasTimeData && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 20 }}>Time Analysis</h2>
            <div className="time-analysis-grid">
              {[
                { label: 'Most time spent — review these', items: slowest },
                { label: 'Least time spent', items: fastest },
              ].map(({ label, items }) => (
                <div key={label}>
                  <div className="time-analysis-sub">{label}</div>
                  <div className="time-q-list">
                    {items.map(q => {
                      const isCorr = answers[q.id] === q.correctOption
                      const isWrng = answers[q.id] && answers[q.id] !== q.correctOption
                      const qNum = questions.indexOf(q) + 1
                      const verdict = isCorr ? 'cor' : isWrng ? 'wrg' : 'skp'
                      const verdictIcon = isCorr ? '✓' : isWrng ? '✗' : '—'
                      return (
                        <div key={q.id} className={`time-q-card tq-${verdict}`}>
                          <div className="time-q-meta">
                            <span className="time-q-num">Q{qNum}</span>
                            <span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
                            <span className={`time-q-verdict tqv-${verdict}`}>{verdictIcon}</span>
                            <span className="time-q-dur">{fmtSecs(timeSpent[q.id] ?? 0)}</span>
                          </div>
                          <RichText as="div" className="time-q-text" html={q.text} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Leaderboard ──────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ margin: 0 }}>Leaderboard</h2>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['all', 'friends'] as const).map(f => (
                <button key={f} className={`review-filter-btn${lbFilter === f ? ' active filter-all' : ''}`} onClick={() => setLbFilter(f)}>
                  {f === 'all' ? 'All' : 'Friends'}
                </button>
              ))}
            </div>
          </div>
          {lbLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : leaderboard.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              {lbFilter === 'friends' ? 'None of your friends participated in this contest.' : 'No submissions yet.'}
            </div>
          ) : (
            <div className="leaderboard-list">
              {leaderboard.map((entry, idx) => {
                const isMe = entry.isCurrentUser
                const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null
                const showDivider = idx > 0 && entry.rank > leaderboard[idx - 1].rank + 1
                return (
                  <div key={entry.userId}>
                    {showDivider && <div className="lb-divider">· · ·</div>}
                    <div
                      className={`lb-row ${isMe ? 'lb-me' : ''}`}
                      style={{ cursor: isMe ? 'default' : 'pointer' }}
                      onClick={() => !isMe && navigate(`/profile/${entry.userId}`)}
                    >
                      <span className="lb-rank">{medal ?? `#${entry.rank}`}</span>
                      <span className="lb-name">{entry.name}{isMe && <span className="lb-you">You</span>}</span>
                      <span className="lb-rating" title="Rating">{entry.rating}</span>
                      <span className="lb-score">{entry.score}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Question Map ─────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginBottom: 12 }}>Question Map</h2>
          <div className="palette-legend">
            <span><span className="pl-dot" style={{ background: '#16a34a' }} /> Correct</span>
            <span><span className="pl-dot" style={{ background: '#dc2626' }} /> Incorrect</span>
            <span><span className="pl-dot" style={{ background: '#fff', border: '1.5px solid var(--border)' }} /> Unattempted</span>
            {markedSet.size > 0 && <span><span className="pl-dot" style={{ background: '#fff' }}>🔖</span> Marked for review</span>}
          </div>
          <div className="result-palette">
            {questions.map((q, i) => {
              const given = answers[q.id]
              const isCorr = given === q.correctOption
              const isWrng = given && given !== q.correctOption
              const filled = isCorr || isWrng
              const bg = isCorr ? '#16a34a' : isWrng ? '#dc2626' : 'var(--surface)'
              return (
                <button key={q.id} className={`rp-cell ${markedSet.has(q.id) ? 'rp-marked' : ''}`}
                  style={{
                    background: bg,
                    color: filled ? '#fff' : 'var(--text)',
                    borderColor: filled ? bg : 'var(--border)',
                  }}
                  title={markedSet.has(q.id) ? 'Marked for review' : undefined}
                  onClick={() => jumpToQuestion(q.id)}>
                  {i + 1}
                  {markedSet.has(q.id) && <span className="rp-flag">🔖</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Question Review ──────────────────────────────────────────── */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>Question Review</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select className="input" style={{ width: 'auto', fontSize: 13, padding: '4px 10px' }} value={activeSection} onChange={e => setActiveSection(e.target.value)}>
                <option value="all">All Sections</option>
                {SECTIONS.map(s => <option key={s} value={s}>{SECTION_SHORT[s]}</option>)}
              </select>
              {(['all','correct','wrong','skipped', ...(markedSet.size > 0 ? ['marked' as ReviewFilter] : [])] as ReviewFilter[]).map(f => (
                <button key={f} className={`review-filter-btn ${reviewFilter === f ? 'active' : ''} filter-${f}`} onClick={() => setReviewFilter(f)}>
                  {f === 'all' ? `All (${questions.length})` : f === 'correct' ? `✓ Correct (${correct})` : f === 'wrong' ? `✗ Wrong (${wrong})` : f === 'skipped' ? `— Skipped (${skipped})` : `🔖 Marked (${markedSet.size})`}
                </button>
              ))}
            </div>
          </div>

          <div className="review-list">
            {reviewQs.length === 0 && <p className="empty">No questions match this filter.</p>}
            {reviewQs.map(q => {
              const given     = answers[q.id]
              const isCorrect = given === q.correctOption
              const isWrong   = given && given !== q.correctOption
              const marksEarned = isCorrect ? q.marks : isWrong ? -q.negativeMarks : 0
              const isOpen    = expandedQ === q.id
              const qNum      = questions.indexOf(q) + 1
              const tSpent    = timeSpent[q.id]
              const avgTime   = avgTimePerQuestion[q.id]
              const emojiInfo = tSpent !== undefined && avgTime !== undefined
                ? timeEmoji(tSpent, avgTime) : null

              return (
                <div key={q.id} id={`cq-${q.id}`} className={`review-item ${isCorrect ? 'review-correct' : isWrong ? 'review-wrong' : 'review-skipped'}`}>
                  <div className="review-item-header" onClick={() => setExpandedQ(isOpen ? null : q.id)}>
                    <div className="review-item-left">
                      <span className="review-qnum">Q{qNum}</span>
                      <span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
                      <span style={{ fontSize: 12, color: SECTION_COLORS[q.subject], fontWeight: 600 }}>{SECTION_SHORT[q.subject]}</span>
                      {markedSet.has(q.id) && <span className="badge" style={{ background: '#fef3c7', color: '#b45309' }}>🔖 Marked</span>}
                      {tSpent !== undefined && (
                        <span className="review-time-chip" title={emojiInfo?.label}>
                          {emojiInfo && <span style={{ marginRight: 2 }}>{emojiInfo.emoji}</span>}
                          {fmtSecs(tSpent)}
                          {avgTime !== undefined && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>/ avg {fmtSecs(avgTime)}</span>}
                        </span>
                      )}
                    </div>
                    <div className="review-item-right">
                      <span className={`review-verdict ${isCorrect ? 'correct' : isWrong ? 'wrong' : 'skipped'}`}>
                        {isCorrect ? '✓ Correct' : isWrong ? '✗ Wrong' : '— Skipped'}
                      </span>
                      <span className={`review-marks ${marksEarned > 0 ? 'pos' : marksEarned < 0 ? 'neg' : ''}`}>
                        {marksEarned > 0 ? '+' : ''}{marksEarned.toFixed(2)}
                      </span>
                      <button className="bookmark-btn" title={bookmarks.has(q.id) ? 'Remove bookmark' : 'Bookmark for revision'}
                        onClick={e => { e.stopPropagation(); toggleBookmark(q.id) }}>
                        {bookmarks.has(q.id) ? '⭐' : '☆'}
                      </button>
                      <span className="review-chevron">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="review-item-body">
                      <QuestionContext q={q} />
                      {q.imageUrl && (
                        <div style={{ marginBottom: 12 }}>
                          <img src={q.imageUrl} alt="Question diagram" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 6, border: '1px solid var(--border)' }} />
                        </div>
                      )}
                      <RichText as="p" className="review-qtext" html={q.text} />
                      {tSpent !== undefined && (
                        <div className="review-time-row">
                          <span className="review-time-stat">
                            <span className="review-time-label">Your time</span>
                            <span className="review-time-val" style={{ color: emojiInfo?.color }}>{emojiInfo?.emoji} {fmtSecs(tSpent)}</span>
                          </span>
                          {avgTime !== undefined && (
                            <span className="review-time-stat">
                              <span className="review-time-label">Avg across all users</span>
                              <span className="review-time-val">{fmtSecs(avgTime)}</span>
                            </span>
                          )}
                          {emojiInfo && (
                            <span className="review-time-verdict" style={{ color: emojiInfo.color }}>{emojiInfo.label}</span>
                          )}
                        </div>
                      )}
                      {practiceOn.has(q.id) ? (
                        // ── Re-attempt / practice mode (won't change your score) ──
                        (() => {
                          const picked = practiceAns[q.id]
                          const answered = !!picked
                          return (
                            <>
                              <div className="practice-banner">🔄 Re-attempt mode — pick an answer (won't change your score)</div>
                              <div className="review-options" style={{ marginTop: 10 }}>
                                {(['A','B','C','D'] as const).map(opt => {
                                  const isCorrectOpt = opt === q.correctOption
                                  const isPicked = opt === picked
                                  const cls = answered && isCorrectOpt ? 'correct-opt' : answered && isPicked ? 'wrong-opt' : ''
                                  return (
                                    <div key={opt} className={`review-option ${cls}`} style={{ cursor: answered ? 'default' : 'pointer' }}
                                      onClick={() => { if (!answered) setPracticeAns(a => ({ ...a, [q.id]: opt })) }}>
                                      <span className="option-label">{opt}</span>
                                      <span><RichText html={optText(q, opt)} /></span>
                                      {answered && isCorrectOpt && <span className="opt-tag correct-tag">✓ Correct</span>}
                                      {answered && isPicked && !isCorrectOpt && <span className="opt-tag wrong-tag">Your pick</span>}
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
                        <>
                          <div className="review-options">
                            {(['A','B','C','D'] as const).map(opt => {
                              const isCorrectOpt = opt === q.correctOption
                              const isGivenOpt   = opt === given
                              return (
                                <div key={opt} className={`review-option ${isCorrectOpt ? 'correct-opt' : isGivenOpt ? 'wrong-opt' : ''}`}>
                                  <span className="option-label">{opt}</span>
                                  <span><RichText html={optText(q, opt)} /></span>
                                  {isCorrectOpt && <span className="opt-tag correct-tag">✓ Correct answer</span>}
                                  {isGivenOpt && !isCorrectOpt && <span className="opt-tag wrong-tag">Your answer</span>}
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
                          <button className="sol-explain-toggle" onClick={() => setSolOpenQ(solOpenQ === q.id ? null : q.id)}>
                            <span style={{ fontSize: 16 }}>👁</span> {solOpenQ === q.id ? 'Hide Solution' : 'View Solution'}
                          </button>
                          {solOpenQ === q.id && (
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
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>← Back to Contests</button>
        </div>
      </div>

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
