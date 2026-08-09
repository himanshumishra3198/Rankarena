import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { useConfirm, useNotify } from '../components/ConfirmDialog'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import ReportModal from '../components/ReportModal'
import QuestionDetail from '../components/QuestionDetail'
import { fmtSecs } from '../lib/time'

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
  score: number; rank: number | null; totalParticipants: number; isTest?: boolean
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
// Strips the sanitized rich text down to a plain excerpt for the compact
// cards. -webkit-line-clamp counts line boxes, so an inline diagram counts as
// one whole "line" and squeezes the text out; and a half-rendered figure in a
// two-line preview is just noise.
function excerpt(html: string): string {
  // ALLOWED_TAGS: [] returns the text content with every tag removed, without
  // ever building a live subtree that could fetch or fire anything.
  const text = DOMPurify.sanitize(html ?? '', { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  const clean = text.replace(/\s+/g, ' ').trim()
  return /<img/i.test(html ?? '') ? `${clean} 🖼` : clean
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
  const confirm = useConfirm()
  const notify = useNotify()
  const navigate = useNavigate()

  const [result, setResult] = useState<ResultData | null>(null)
  const [tab, setTab] = useState<'overview' | 'solutions' | 'leaderboard'>('overview')
  const [retaking, setRetaking] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [lbFilter, setLbFilter] = useState<'all' | 'friends'>('all')
  const [lbLoading, setLbLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')
  // Which question the panel below the map is showing. Null means "the first
  // one in whatever the map is currently showing".
  const [selectedQId, setSelectedQId] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>('all')
  const [copied, setCopied] = useState(false)
  const [reportQId, setReportQId] = useState<string | null>(null)
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())

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
        if (saved) {
          // No single question can have taken longer than the whole paper.
          // Older attempts kept counting while the tab sat in the background,
          // which produced readings like "170m" in a 60-minute contest and
          // pushed every genuine result out of the time analysis.
          const cap = (rRes.data.durationMinutes ?? 0) * 60
          const raw: Record<string, number> = JSON.parse(saved)
          setTimeSpent(cap > 0
            ? Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.min(v, cap)]))
            : raw)
        }
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

  // Show a question in the panel under the map. Paging calls this too, so the
  // panel stays in view when the one before it was tall enough to scroll past.
  function selectQuestion(qid: string) {
    setSelectedQId(qid)
    // Always bring the panel up. On a phone the map is tall enough that the
    // panel sits below the fold, so without this a tap looks like it did
    // nothing; and when paging, the next question wants to start at the top.
    setTimeout(() => document.getElementById('question-detail')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  // From the overview: switch tabs, then show it.
  function openInSolutions(qid: string) {
    setActiveSection('all'); setReviewFilter('all'); setTab('solutions'); setSelectedQId(qid)
    setTimeout(() => document.getElementById('question-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
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

  async function retakeAsTest() {
    if (retaking) return
    if (!(await confirm({
      title: 'Retake this contest?',
      message: 'Your previous attempt is cleared so you can take it again. Only your own test attempt is reset — nobody else is affected.',
      confirmLabel: 'Clear and retake',
      danger: true,
    }))) return
    setRetaking(true)
    try {
      await api.post(`/contests/${contestId}/retake`)
      // The room restores drafts and section locks from localStorage, so the
      // previous run has to be cleared here or it would come straight back.
      localStorage.removeItem(`draft-${contestId}`)
      localStorage.removeItem(`submitted-sections-${contestId}`)
      localStorage.removeItem(`time-spent-${contestId}`)
      navigate(`/contests/${contestId}`)
    } catch {
      setRetaking(false)
      notify('Could not reset the attempt', 'Please try again in a moment.')
    }
  }

  if (loading) return <><Navbar /><div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading result...</p></div></>
  if (error)   return <><Navbar /><div className="page"><div className="alert alert-error">{error}</div></div></>
  if (!result) return null

  const { answers, questions, totalMaxMarks, score, rank, totalParticipants, ratingChange, avgTimePerQuestion, isTest } = result
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
  // On a short paper the same question can be both slowest and fastest;
  // listing it twice makes the comparison meaningless.
  const slowestIds = new Set(slowest.map(q => q.id))
  const fastest = [...sortedByTime].reverse().filter(q => !slowestIds.has(q.id)).slice(0, 3)

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

  // Falling back to the first match covers both "nothing picked yet" and "the
  // filter just changed and the previous pick is no longer on the map".
  const selectedIdx = Math.max(0, reviewQs.findIndex(q => q.id === selectedQId))
  const selectedQ = reviewQs[selectedIdx] ?? null

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
      `🔗 RankArenas`,
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 1100 }}>
      {isTest && (
        <div className="test-attempt-banner">
          <span aria-hidden="true">🧪</span>
          <div>
            <strong>Test attempt — not counted.</strong> You took this as an admin,
            so it stays out of the leaderboard, the ratings and the public stats.
            Your answers and analysis below are complete.
          </div>
        </div>
      )}

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
          {isTest && (
            <button className="btn btn-ghost btn-sm" onClick={retakeAsTest} disabled={retaking}>
              {retaking ? 'Resetting…' : '↻ Retake as test'}
            </button>
          )}
        </div>


        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="result-tabs">
          {([['overview', '📈 Overview'], ['solutions', '📝 Solutions'], ['leaderboard', '🏆 Leaderboard']] as const).map(([t, label]) => (
            <button key={t} className={`result-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>

        {tab === 'overview' && (<>
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
            <p className="time-analysis-hint">Tap any question to open it in Solutions, with the options and solution.</p>
            <div className="time-analysis-grid">
              {[
                { label: 'Most time spent — review these', items: slowest },
                { label: 'Least time spent', items: fastest },
              ].map(({ label, items }) => (
                <div key={label}>
                  <div className="time-analysis-sub">{label}</div>
                  <div className="time-q-list">
                    {items.length === 0 && <p className="time-q-empty">Not enough questions to compare.</p>}
                    {items.map(q => {
                      const isCorr = answers[q.id] === q.correctOption
                      const isWrng = answers[q.id] && answers[q.id] !== q.correctOption
                      const qNum = questions.indexOf(q) + 1
                      const verdict = isCorr ? 'cor' : isWrng ? 'wrg' : 'skp'
                      const verdictIcon = isCorr ? '✓' : isWrng ? '✗' : '—'
                      return (
                        <button
                          key={q.id}
                          type="button"
                          className={`time-q-card tq-${verdict}`}
                          onClick={() => openInSolutions(q.id)}
                          aria-label={`Open question ${qNum}`}
                        >
                          <div className="time-q-meta">
                            <span className="time-q-num">Q{qNum}</span>
                            <span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
                            <span className={`time-q-verdict tqv-${verdict}`}>{verdictIcon}</span>
                            <span className="time-q-dur">{fmtSecs(timeSpent[q.id] ?? 0)}</span>
                          </div>
                          <div className="time-q-body">
                            <span className="time-q-text">{excerpt(q.text)}</span>
                          </div>
                          <span className="time-q-open">View question →</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        </>)}

        {tab === 'leaderboard' && (<>
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

        </>)}

        {tab === 'solutions' && (<>
        {/* ── Question Map ─────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="qmap-head">
            <h2 style={{ margin: 0 }}>Question Map</h2>
            <div className="qmap-filters">
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
          <div className="palette-legend">
            <span><span className="pl-dot" style={{ background: '#16a34a' }} /> Correct</span>
            <span><span className="pl-dot" style={{ background: '#dc2626' }} /> Incorrect</span>
            <span><span className="pl-dot" style={{ background: '#fff', border: '1.5px solid var(--border)' }} /> Unattempted</span>
            {markedSet.size > 0 && <span><span className="pl-dot" style={{ background: '#fff' }}>🔖</span> Marked for review</span>}
          </div>
          {reviewQs.length === 0 ? (
            <p className="empty">No questions match this filter.</p>
          ) : (
            <div className="result-palette">
              {reviewQs.map(q => {
                const given = answers[q.id]
                const isCorr = given === q.correctOption
                const isWrng = given && given !== q.correctOption
                const filled = isCorr || isWrng
                const bg = isCorr ? '#16a34a' : isWrng ? '#dc2626' : 'var(--surface)'
                return (
                  <button key={q.id}
                    className={`rp-cell ${markedSet.has(q.id) ? 'rp-marked' : ''} ${selectedQ?.id === q.id ? 'rp-current' : ''}`}
                    style={{
                      background: bg,
                      color: filled ? '#fff' : 'var(--text)',
                      borderColor: filled ? bg : 'var(--border)',
                    }}
                    title={markedSet.has(q.id) ? 'Marked for review' : undefined}
                    onClick={() => selectQuestion(q.id)}>
                    {questions.indexOf(q) + 1}
                    {markedSet.has(q.id) && <span className="rp-flag">🔖</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── The selected question, on its own ────────────────────────── */}
        {selectedQ && (
          <div className="card" id="question-detail">
            <QuestionDetail
              q={selectedQ}
              qNum={questions.indexOf(selectedQ) + 1}
              position={{ index: selectedIdx + 1, total: reviewQs.length }}
              given={answers[selectedQ.id]}
              marked={markedSet.has(selectedQ.id)}
              timeSpent={timeSpent[selectedQ.id]}
              avgTime={avgTimePerQuestion[selectedQ.id]}
              subjectLabel={SECTION_SHORT[selectedQ.subject]}
              subjectColor={SECTION_COLORS[selectedQ.subject]}
              bookmarked={bookmarks.has(selectedQ.id)}
              onToggleBookmark={() => toggleBookmark(selectedQ.id)}
              onReport={() => setReportQId(selectedQ.id)}
              onPrev={selectedIdx > 0 ? () => selectQuestion(reviewQs[selectedIdx - 1].id) : undefined}
              onNext={selectedIdx < reviewQs.length - 1 ? () => selectQuestion(reviewQs[selectedIdx + 1].id) : undefined}
            />
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>← Back to Contests</button>
        </div>
        </>)}
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
