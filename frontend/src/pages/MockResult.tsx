import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import ReportModal from '../components/ReportModal'
import QuestionDetail from '../components/QuestionDetail'

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
  rank: number | null; totalTakers: number; percentile: number | null; isTest?: boolean
  topScorers: { rank: number; name: string; score: number; isCurrentUser: boolean }[]
  questionStats: Record<string, { correctPct: number; avgTime: number }>
  questions: ResultQuestion[]
}

const SECTION_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude', REASONING: 'General Intelligence & Reasoning',
  ENGLISH: 'English Language', GK: 'General Awareness',
}
// The full names are too long for the single-question header, where they push
// the badges onto extra rows on a phone.
const SECTION_SHORT: Record<string, string> = {
  QUANT: 'Quant', REASONING: 'Reasoning', ENGLISH: 'English', GK: 'GK',
}

type Verdict = 'correct' | 'wrong' | 'skipped'
type Filter = 'all' | Verdict | 'marked'



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

// ── Segmented score donut (correct / wrong / skipped) with hoverable arcs ──────
function ScoreDonut({ score, total, correct, wrong, skipped }: {
  score: number; total: number; correct: number; wrong: number; skipped: number
}) {
  const [hover, setHover] = useState<'correct' | 'wrong' | 'skipped' | null>(null)
  const R = 50, SW = 14, C = 2 * Math.PI * R
  const totalQ = correct + wrong + skipped || 1
  const scorePct = total > 0 ? Math.round((score / total) * 100) : 0
  const segs = [
    { key: 'correct' as const, label: 'Correct', value: correct, color: '#ffffff' },
    { key: 'wrong' as const, label: 'Wrong', value: wrong, color: '#94a3b8' },
    { key: 'skipped' as const, label: 'Skipped', value: skipped, color: 'rgba(2,6,23,.55)' },
  ]
  const hs = segs.find(s => s.key === hover)
  let acc = 0
  return (
    <div className="score-donut">
      <svg viewBox="0 0 120 120" width="118" height="118">
        {/* dark center disc for the white/black look */}
        <circle cx="60" cy="60" r={R - SW / 2 - 1} fill="rgba(2,6,23,.5)" />
        <g transform="rotate(-90 60 60)">
          <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={SW} />
          {segs.map(s => {
            if (s.value <= 0) return null
            const dash = (s.value / totalQ) * C
            const node = (
              <circle key={s.key} cx="60" cy="60" r={R} fill="none" stroke={s.color}
                strokeWidth={hover === s.key ? SW + 4 : SW}
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc}
                style={{ transition: 'stroke-width .15s', cursor: 'pointer' }}
                onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
                <title>{s.label}: {s.value} ({Math.round((s.value / totalQ) * 100)}%)</title>
              </circle>
            )
            acc += dash
            return node
          })}
        </g>
      </svg>
      <div className="score-donut-center">
        {hs ? (
          <>
            <div className="sd-score">{hs.value}</div>
            <div className="sd-total">{hs.label}</div>
            <div className="sd-pct">{Math.round((hs.value / totalQ) * 100)}%</div>
          </>
        ) : (
          <>
            <div className="sd-score">{score}</div>
            <div className="sd-total">/ {total}</div>
            <div className="sd-pct">{scorePct}%</div>
          </>
        )}
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
  // Which question the panel below the map is showing. Null means "the first
  // one in whatever the map is currently showing".
  const [selectedQId, setSelectedQId] = useState<string | null>(null)
  const [reportQId, setReportQId] = useState<string | null>(null)
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
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

  // Falling back to the first match covers both "nothing picked yet" and "the
  // filter just changed and the previous pick is no longer on the map".
  const selectedIdx = Math.max(0, filtered.findIndex(q => q.id === selectedQId))
  const selectedQ = filtered[selectedIdx] ?? null

  function selectQuestion(qid: string) {
    setSelectedQId(qid)
    // Always bring the panel up. On a phone the map is tall enough that the
    // panel sits below the fold, so without this a tap looks like it did
    // nothing; and when paging, the next question wants to start at the top.
    setTimeout(() => document.getElementById('question-detail')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  const VC: Record<Verdict, string> = { correct: '#16a34a', wrong: '#dc2626', skipped: '#94a3b8' }

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 1000 }}>
      {data.isTest && (
        <div className="test-attempt-banner">
          <span aria-hidden="true">🧪</span>
          <div>
            <strong>Test attempt — not counted.</strong> You took this as an admin,
            so it stays out of the leaderboard, the ratings and the public stats.
            Your answers and analysis below are complete.
          </div>
        </div>
      )}
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => navigate('/mocks')}>← Mock Tests</button>

        {/* ── Hero: score donut + headline stats ───────────────────── */}
        <div className="result-hero">
          <ScoreDonut score={data.score} total={data.totalMarks}
            correct={data.correct} wrong={data.wrong} skipped={data.skipped} />
          <div className="result-hero-info">
            <div className="result-hero-sub">{SECTION_LABELS[data.subject] ?? data.subject}</div>
            <h1 className="result-hero-title">{data.mockTitle}</h1>
            <div className="result-hero-chips">
              {data.rank !== null && (
                <span className="hero-chip">🏅 Rank <b>#{data.rank}</b>/{data.totalTakers}</span>
              )}
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
              <StatCard icon="🏅" color="#ef4444"
                value={data.rank !== null ? `#${data.rank}` : '—'}
                sub={data.rank !== null ? `/ ${data.totalTakers}` : 'not ranked'} label="Rank" />
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
          <div className="qmap-head">
            <div className="qmap-filters">
              {(['all', 'correct', 'wrong', 'skipped', ...(marked.size > 0 ? ['marked' as Filter] : [])] as Filter[]).map(f => (
                <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ textTransform: 'capitalize' }} onClick={() => setFilter(f)}>
                  {f === 'marked' ? '🔖 Marked' : f} {f === 'all' ? `(${data.questions.length})` : f === 'correct' ? `(${data.correct})` : f === 'wrong' ? `(${data.wrong})` : f === 'skipped' ? `(${data.skipped})` : `(${marked.size})`}
                </button>
              ))}
            </div>
          </div>
          <div className="palette-legend">
            <span><span className="pl-dot" style={{ background: VC.correct }} /> Correct</span>
            <span><span className="pl-dot" style={{ background: VC.wrong }} /> Incorrect</span>
            <span><span className="pl-dot" style={{ background: '#fff', border: '1.5px solid var(--border)' }} /> Unattempted</span>
            {marked.size > 0 && <span><span className="pl-dot" style={{ background: '#fff' }}>🔖</span> Marked for review</span>}
          </div>
          {filtered.length === 0 ? (
            <p className="empty">No questions match this filter.</p>
          ) : (
            <div className="result-palette">
              {filtered.map(q => {
                const v = verdicts.get(q.id)!
                const filled = v !== 'skipped'
                return (
                  <button key={q.id}
                    className={`rp-cell ${marked.has(q.id) ? 'rp-marked' : ''} ${selectedQ?.id === q.id ? 'rp-current' : ''}`}
                    style={{
                      background: filled ? VC[v] : 'var(--surface)',
                      color: filled ? '#fff' : 'var(--text)',
                      borderColor: filled ? VC[v] : 'var(--border)',
                    }}
                    title={marked.has(q.id) ? 'Marked for review' : undefined}
                    onClick={() => selectQuestion(q.id)}>
                    {data.questions.indexOf(q) + 1}
                    {marked.has(q.id) && <span className="rp-flag">🔖</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── The selected question, on its own ────────────────────────── */}
        <div className="section-head" style={{ marginTop: 28 }}>Solutions</div>
        {selectedQ ? (
          <div className="card" id="question-detail">
            <QuestionDetail
              q={selectedQ}
              qNum={data.questions.indexOf(selectedQ) + 1}
              position={{ index: selectedIdx + 1, total: filtered.length }}
              given={data.answers[selectedQ.id]}
              marked={marked.has(selectedQ.id)}
              timeSpent={data.timeSpent[selectedQ.id]}
              avgTime={data.questionStats[selectedQ.id]?.avgTime}
              correctPct={data.questionStats[selectedQ.id]?.correctPct}
              subjectLabel={SECTION_SHORT[selectedQ.subject] ?? selectedQ.subject}
              bookmarked={bookmarks.has(selectedQ.id)}
              onToggleBookmark={() => toggleBookmark(selectedQ.id)}
              onReport={() => setReportQId(selectedQ.id)}
              onPrev={selectedIdx > 0 ? () => selectQuestion(filtered[selectedIdx - 1].id) : undefined}
              onNext={selectedIdx < filtered.length - 1 ? () => selectQuestion(filtered[selectedIdx + 1].id) : undefined}
            />
          </div>
        ) : (
          <div className="card"><p className="empty">No questions match this filter.</p></div>
        )}
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
