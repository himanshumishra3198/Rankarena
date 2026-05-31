import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { TIERS, getTier } from '../lib/tiers'
import { RatingChart } from '../components/RatingChart'
import type { RatingPoint } from '../components/RatingChart'
import { ActivityHeatmap } from '../components/ActivityHeatmap'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubjectStat { correct: number; wrong: number; skipped: number }

interface ProfileData {
  user: { id: string; name: string; email: string; role: string; rating: number; createdAt: string; followerCount: number; followingCount: number }
  ratingHistory: RatingPoint[]
  heatmap: Record<string, number>
  stats: { totalContests: number; bestRank: number | null; maxRating: number; maxStreak: number; currentStreak: number }
  subjectStats: Record<string, SubjectStat>
  verdictTotals: { correct: number; wrong: number; skipped: number; total: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sinceLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const years = Math.floor(ms / (365.25 * 86_400_000))
  const months = Math.floor(ms / (30.44 * 86_400_000))
  if (years >= 1) return `${years} year${years > 1 ? 's' : ''} ago`
  if (months >= 1) return `${months} month${months > 1 ? 's' : ''} ago`
  return 'recently'
}

function countInPeriod(heatmap: Record<string, number>, days: number): number {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return Object.entries(heatmap)
    .filter(([d]) => new Date(d) >= cutoff)
    .reduce((s, [, v]) => s + v, 0)
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%'
  return `${((n / total) * 100).toFixed(1)}%`
}

// ── Achievements ──────────────────────────────────────────────────────────────

const SUBJECT_LABELS: Record<string, string> = {
  QUANT: 'Quantitative', REASONING: 'Reasoning', ENGLISH: 'English', GK: 'General Knowledge',
}
const SUBJECT_COLORS: Record<string, string> = {
  QUANT: '#3b82f6', REASONING: '#8b5cf6', ENGLISH: '#10b981', GK: '#f59e0b',
}

interface Achievement { icon: string; label: string; desc: string; earned: boolean }

function computeAchievements(
  stats: ProfileData['stats'],
  ratingHistory: RatingPoint[],
  v: ProfileData['verdictTotals'],
): Achievement[] {
  const answered = v.correct + v.wrong
  const accuracy = answered > 0 ? v.correct / answered : 0
  return [
    { icon: '🎯', label: 'First Steps',     desc: 'Completed first contest',     earned: stats.totalContests >= 1 },
    { icon: '🏅', label: 'Getting Started', desc: '5 contests completed',         earned: stats.totalContests >= 5 },
    { icon: '🏆', label: 'Competitor',      desc: '10 contests completed',        earned: stats.totalContests >= 10 },
    { icon: '🎖️', label: 'Veteran',         desc: '25 contests completed',        earned: stats.totalContests >= 25 },
    { icon: '🔥', label: 'On Fire',         desc: '3-day streak achieved',        earned: stats.maxStreak >= 3 },
    { icon: '⚡', label: 'Streak Master',   desc: '7-day streak achieved',        earned: stats.maxStreak >= 7 },
    { icon: '🥇', label: 'Top Scorer',      desc: 'Ranked #1 in a contest',       earned: ratingHistory.some(r => r.rank === 1) },
    { icon: '📈', label: 'Rising Star',     desc: 'Reached rating 1400',          earned: stats.maxRating >= 1400 },
    { icon: '💎', label: 'Expert',          desc: 'Reached rating 1600',          earned: stats.maxRating >= 1600 },
    { icon: '🎯', label: 'Sharpshooter',   desc: '75%+ accuracy (20+ answered)', earned: answered >= 20 && accuracy >= 0.75 },
  ]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VerdictCard({ icon, label, count, total, color }: {
  icon: string; label: string; count: number; total: number; color: string
}) {
  return (
    <div className="verdict-card">
      <div className="verdict-icon" style={{ color }}>{icon}</div>
      <div className="verdict-count" style={{ color }}>{count.toLocaleString()}</div>
      <div className="verdict-label">{label}</div>
      <div className="verdict-pct">{pct(count, total)}</div>
    </div>
  )
}

function SubjectBar({ subject, stat }: { subject: string; stat: SubjectStat }) {
  const answered = stat.correct + stat.wrong
  const total = answered + stat.skipped
  const accuracy = answered > 0 ? (stat.correct / answered) * 100 : 0
  const fillPct = total > 0 ? (stat.correct / total) * 100 : 0
  const color = SUBJECT_COLORS[subject] ?? '#64748b'

  return (
    <div className="subject-bar-row">
      <div className="subject-bar-name">{SUBJECT_LABELS[subject] ?? subject}</div>
      <div className="subject-bar-track">
        <div className="subject-bar-fill" style={{ width: `${fillPct}%`, background: color }} />
      </div>
      <div className="subject-bar-pct" style={{ color }}>{accuracy.toFixed(0)}%</div>
      <div className="subject-bar-counts">
        <span style={{ color: '#16a34a' }}>{stat.correct}✓</span>
        <span style={{ color: '#dc2626' }}>{stat.wrong}✗</span>
        <span style={{ color: 'var(--text-muted)' }}>{stat.skipped}—</span>
      </div>
    </div>
  )
}

function AchievementBadge({ a }: { a: Achievement }) {
  return (
    <div className={`achievement-badge ${a.earned ? 'achievement-earned' : 'achievement-locked'}`}
      title={a.desc}>
      <span className="achievement-icon">{a.earned ? a.icon : '🔒'}</span>
      <span className="achievement-label">{a.label}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate()
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/profile')
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <><Navbar /><div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading profile...</p></div></>
  if (error)   return <><Navbar /><div className="page"><div className="alert alert-error">{error}</div></div></>
  if (!data)   return null

  const { user, ratingHistory, heatmap, stats, subjectStats, verdictTotals } = data
  const tier    = getTier(user.rating)
  const maxTier = getTier(stats.maxRating)

  const contestsLastYear  = countInPeriod(heatmap, 365)
  const contestsLastMonth = countInPeriod(heatmap, 30)
  const achievements      = computeAchievements(stats, ratingHistory, verdictTotals)
  const earnedCount       = achievements.filter(a => a.earned).length

  const subjectOrder = ['QUANT', 'REASONING', 'ENGLISH', 'GK']
  const subjectsWithData = subjectOrder.filter(s => subjectStats[s])

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 1000 }}>

        {/* ── Profile header ────────────────────────────────────── */}
        <div className="card profile-header-card">
          <div className="profile-header-left">
            <div className="profile-avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div>
              <div className="profile-tier-label" style={{ color: tier.fg }}>{tier.label}</div>
              <h1 className="profile-username" style={{ color: tier.fg }}>{user.name}</h1>
              <div className="profile-meta-row">
                <span>Contest rating: <strong style={{ color: tier.fg }}>{user.rating}</strong></span>
                {stats.maxRating > user.rating && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    &nbsp;(max. <span style={{ color: maxTier.fg }}>{maxTier.label}</span>, {stats.maxRating})
                  </span>
                )}
              </div>
              <div className="profile-meta-row" style={{ marginTop: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Registered {sinceLabel(user.createdAt)}
                  &nbsp;·&nbsp; {stats.totalContests} contest{stats.totalContests !== 1 ? 's' : ''}
                  {stats.bestRank !== null && <>&nbsp;·&nbsp; Best rank #{stats.bestRank}</>}
                </span>
              </div>
            </div>
          </div>
          <div className="tier-legend">
            {TIERS.map(t => (
              <span key={t.label} className="tier-chip"
                style={{ background: t.bg, color: t.fg,
                  fontWeight: user.rating >= t.min && user.rating < t.max ? 800 : 400,
                  border: user.rating >= t.min && user.rating < t.max ? `2px solid ${t.fg}` : '2px solid transparent' }}>
                {t.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Rating chart ──────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Rating History</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Contests</button>
          </div>
          <RatingChart history={ratingHistory} />
        </div>

        {/* ── Activity ──────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginBottom: 20 }}>Activity</h2>

          {/* Verdict summary */}
          {verdictTotals.total > 0 ? (
            <div className="verdict-row">
              <VerdictCard icon="✓" label="Correct"  count={verdictTotals.correct} total={verdictTotals.total} color="#16a34a" />
              <VerdictCard icon="✗" label="Wrong"    count={verdictTotals.wrong}   total={verdictTotals.total} color="#dc2626" />
              <VerdictCard icon="—" label="Skipped"  count={verdictTotals.skipped} total={verdictTotals.total} color="var(--text-muted)" />
              <div className="verdict-total-card">
                <div className="verdict-total-num">{verdictTotals.total.toLocaleString()}</div>
                <div className="verdict-total-label">Total questions</div>
                <div className="verdict-accuracy-bar">
                  <div style={{ width: pct(verdictTotals.correct, verdictTotals.total), background: '#16a34a', height: '100%', borderRadius: '99px 0 0 99px' }} />
                  <div style={{ width: pct(verdictTotals.wrong,   verdictTotals.total), background: '#dc2626', height: '100%' }} />
                  <div style={{ flex: 1, background: 'var(--border)', height: '100%', borderRadius: '0 99px 99px 0' }} />
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>No contest submissions yet.</p>
          )}

          {/* Subject performance */}
          {subjectsWithData.length > 0 && (
            <div className="subject-perf-section">
              <div className="activity-section-title">Subject Performance</div>
              <div className="subject-bars">
                {subjectsWithData.map(s => (
                  <SubjectBar key={s} subject={s} stat={subjectStats[s]} />
                ))}
              </div>
            </div>
          )}

          {/* Heatmap */}
          <div className="activity-section-title" style={{ marginTop: 24 }}>
            Contest Activity
            <span className="activity-section-sub">· last 52 weeks</span>
          </div>
          <ActivityHeatmap heatmap={heatmap} />
          <div className="heatmap-legend" style={{ marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Less</span>
            <span className="heatmap-legend-cell" style={{ background: 'var(--heatmap-empty)' }} />
            {['#c6e48b', '#7bc96f', '#239a3b', '#196127'].map(c => (
              <span key={c} className="heatmap-legend-cell" style={{ background: c }} />
            ))}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>More</span>
          </div>

          {/* Stats + streak */}
          <div className="activity-summary-row">
            <div className="activity-summary-group">
              <div className="activity-summary-label">Contests</div>
              <div className="activity-summary-stats">
                <span><strong>{stats.totalContests}</strong> all time</span>
                <span><strong>{contestsLastYear}</strong> this year</span>
                <span><strong>{contestsLastMonth}</strong> this month</span>
              </div>
            </div>
            <div className="activity-summary-group">
              <div className="activity-summary-label">Streaks</div>
              <div className="activity-summary-stats">
                <span><strong>{stats.maxStreak}</strong> day best</span>
                <span><strong>{stats.currentStreak}</strong> current</span>
              </div>
            </div>
            {stats.currentStreak >= 1 && (
              <div className="streak-badge">
                <span className="streak-fire">🔥</span>
                <span className="streak-num">{stats.currentStreak}</span>
                <span className="streak-sub">day streak</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Achievements ──────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>Achievements</h2>
            <span className="achievements-count">{earnedCount} / {achievements.length} earned</span>
          </div>
          <div className="achievements-grid">
            {achievements.map(a => <AchievementBadge key={a.label} a={a} />)}
          </div>
        </div>

        {/* ── Contest history table ─────────────────────────────── */}
        {ratingHistory.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginBottom: 14 }}>Contest History</h2>
            <table className="result-section-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Contest</th>
                  <th>Date</th>
                  <th>Rank</th>
                  <th>Old Rating</th>
                  <th>New Rating</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {[...ratingHistory].reverse().map((p, i) => {
                  const delta = p.newRating - p.oldRating
                  return (
                    <tr key={p.contestId}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{ratingHistory.length - i}</td>
                      <td>
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 13, textAlign: 'left' }}
                          onClick={() => navigate(`/contests/${p.contestId}/result`)}
                        >
                          {p.contestTitle}
                        </button>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ fontSize: 13 }}>#{p.rank} / {p.totalParticipants}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{p.oldRating}</td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: getTier(p.newRating).fg }}>{p.newRating}</td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: delta >= 0 ? '#16a34a' : '#dc2626' }}>
                        {delta >= 0 ? '+' : ''}{delta}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </>
  )
}
