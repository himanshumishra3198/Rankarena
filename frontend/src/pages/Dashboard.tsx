import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import type { Contest } from '../lib/types'
import { getTier } from '../lib/tiers'

interface RatingPoint {
  contestId: string
  contestTitle: string
  date: string
  oldRating: number
  newRating: number
  rank: number
  totalParticipants: number
}

interface LeaderboardEntry {
  rank: number
  id: string
  name: string
  rating: number
}

function effectivePhase(c: Contest): 'scheduled' | 'live' | 'ended' {
  const now = Date.now()
  const startMs = new Date(c.startTime).getTime()
  const endMs = startMs + c.durationMinutes * 60_000
  if (now >= endMs) return 'ended'
  if (now >= startMs) return 'live'
  return 'scheduled'
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s'
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [active, setActive] = useState<Contest[]>([])
  const [past, setPast] = useState<Contest[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [ratingHistory, setRatingHistory] = useState<RatingPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [, setTick] = useState(0)

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const rating: number = user.rating ?? 1500
  const tier = getTier(rating)

  useEffect(() => {
    Promise.all([
      api.get('/contests'),
      api.get('/ratings/leaderboard'),
      api.get('/profile').catch(() => ({ data: { ratingHistory: [] } })),
    ]).then(([contestsRes, lbRes, profileRes]) => {
      setActive(contestsRes.data.active ?? [])
      setPast(contestsRes.data.past ?? [])
      setLeaderboard((lbRes.data ?? []).slice(0, 5))
      setRatingHistory(profileRes.data.ratingHistory ?? [])
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  async function joinAndEnter(contest: Contest) {
    setJoiningId(contest.id)
    try {
      await api.post(`/contests/${contest.id}/join`)
    } catch (err: any) {
      if (err.response?.status !== 409 && err.response?.status !== 400) {
        setJoiningId(null)
        return
      }
    }
    if (effectivePhase(contest) === 'live') {
      navigate(`/contests/${contest.id}`)
    } else {
      setActive(prev => prev.map(c => c.id === contest.id ? { ...c, hasJoined: true } : c))
      setJoiningId(null)
    }
  }

  const liveContests = active.filter(c => effectivePhase(c) === 'live')
  const upcomingContests = active.filter(c => effectivePhase(c) === 'scheduled')
  const recentHistory = [...ratingHistory].reverse().slice(0, 5)
  const joinedPast = past.filter(c => c.hasJoined)

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 1080 }}>

        {/* ── Live Contest Banner ───────────────────────── */}
        {liveContests.map(c => {
          const endMs = new Date(c.startTime).getTime() + c.durationMinutes * 60_000
          const remaining = Math.max(0, endMs - Date.now())
          const isJoining = joiningId === c.id
          return (
            <div key={c.id} className="live-contest-card">
              <div className="live-badge">● LIVE</div>
              <div className="live-contest-info">
                <div className="live-contest-title">{c.title}</div>
                <div className="live-contest-meta">
                  {c.durationMinutes} min &nbsp;·&nbsp; {c._count?.participations ?? 0} participants
                </div>
              </div>
              <div className="live-contest-right">
                <div>
                  <div className="live-timer-label">Ends in</div>
                  <div className="live-timer">{formatCountdown(remaining)}</div>
                </div>
                {c.hasSubmitted ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/contests/${c.id}/result`)}>
                    View Results
                  </button>
                ) : (
                  <button className="btn btn-danger" onClick={() => joinAndEnter(c)} disabled={isJoining}>
                    {isJoining ? 'Joining…' : c.hasJoined ? '▶ Continue Exam' : '▶ Enter Now'}
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {/* ── 2-Column Grid ─────────────────────────────── */}
        <div className="home-layout">

          {/* Left: Upcoming + Recent Results */}
          <div className="home-main">

            {/* Upcoming Contests */}
            {upcomingContests.length > 0 && (
              <div className="card" style={{ padding: 0, marginBottom: 20 }}>
                <div className="contest-table-header">
                  Upcoming Contests
                  <span className="section-count-badge section-count-active">{upcomingContests.length}</span>
                </div>
                <div className="upcoming-list">
                  {upcomingContests.map(c => {
                    const startMs = new Date(c.startTime).getTime()
                    const until = Math.max(0, startMs - Date.now())
                    const isJoining = joiningId === c.id
                    return (
                      <div key={c.id} className="upcoming-item">
                        <div className="upcoming-item-left">
                          <div className="upcoming-title">{c.title}</div>
                          <div className="upcoming-meta">
                            {c.durationMinutes} min &nbsp;·&nbsp; {c._count?.participations ?? 0} joined
                          </div>
                        </div>
                        <div className="upcoming-item-right">
                          <div className="upcoming-countdown">Starts in {formatCountdown(until)}</div>
                          {c.hasJoined ? (
                            <span className="registered-tag">✓ Registered</span>
                          ) : (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => joinAndEnter(c)}
                              disabled={isJoining}
                            >
                              {isJoining ? '…' : 'Register'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Recent Results */}
            <div className="card" style={{ padding: 0 }}>
              <div className="contest-table-header">Recent Results</div>

              {loading ? (
                <div style={{ padding: 32, color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>
              ) : recentHistory.length > 0 ? (
                <div className="recent-results-list">
                  {recentHistory.map(r => {
                    const delta = r.newRating - r.oldRating
                    const t = getTier(r.newRating)
                    return (
                      <div
                        key={r.contestId}
                        className="recent-result-row"
                        onClick={() => navigate(`/contests/${r.contestId}/result`)}
                      >
                        <div className="recent-result-left">
                          <div className="recent-result-title">{r.contestTitle}</div>
                          <div className="recent-result-meta">
                            {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            &nbsp;·&nbsp; Rank #{r.rank} / {r.totalParticipants}
                          </div>
                        </div>
                        <div className="recent-result-right">
                          <span style={{ fontSize: 17, fontWeight: 700, color: t.fg }}>{r.newRating}</span>
                          <span className={`recent-delta ${delta >= 0 ? 'pos' : 'neg'}`}>
                            {delta >= 0 ? '+' : ''}{delta}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : joinedPast.length > 0 ? (
                <div className="recent-results-list">
                  {joinedPast.slice(0, 5).map(c => (
                    <div
                      key={c.id}
                      className="recent-result-row"
                      onClick={() => c.hasSubmitted && navigate(`/contests/${c.id}/result`)}
                      style={{ cursor: c.hasSubmitted ? 'pointer' : 'default' }}
                    >
                      <div className="recent-result-left">
                        <div className="recent-result-title">{c.title}</div>
                        <div className="recent-result-meta">
                          {new Date(c.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <div className="recent-result-right">
                        {c.hasSubmitted
                          ? <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>View Results →</span>
                          : <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Not submitted</span>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    {liveContests.length > 0
                      ? 'There is a live contest right now. Enter to start competing!'
                      : upcomingContests.length > 0
                        ? 'Register for an upcoming contest to see your results here.'
                        : 'No contests yet. Check back soon.'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Rating Widget + Leaderboard */}
          <div className="home-sidebar">

            {/* Rating card */}
            <div className="card rating-widget-card">
              <div className="rating-widget-tier" style={{ color: tier.fg }}>{tier.label}</div>
              <div className="rating-widget-value" style={{ color: tier.fg }}>{rating}</div>
              <div className="rating-widget-label">Contest Rating</div>
              <div className="rating-widget-divider" />
              <button
                className="btn btn-ghost btn-sm btn-full"
                style={{ justifyContent: 'center' }}
                onClick={() => navigate('/profile')}
              >
                View Full Profile →
              </button>
            </div>

            {/* Global leaderboard snippet */}
            <div className="card" style={{ padding: 0, marginTop: 16 }}>
              <div className="contest-table-header" style={{ fontSize: 13, borderRadius: 'var(--radius) var(--radius) 0 0' }}>
                Top Players
              </div>
              {leaderboard.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>No data yet</div>
              ) : (
                <>
                  {leaderboard.map(entry => {
                    const t = getTier(entry.rating)
                    const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null
                    const isMe = entry.id === user.id
                    return (
                      <div
                        key={entry.id}
                        className={`home-lb-row ${isMe ? 'home-lb-me' : ''}`}
                        onClick={() => navigate(isMe ? '/profile' : `/profile/${entry.id}`)}
                      >
                        <span className="home-lb-rank">{medal ?? `#${entry.rank}`}</span>
                        <span className="home-lb-name" style={{ color: t.fg }}>{entry.name}</span>
                        <span className="home-lb-rating">{entry.rating}</span>
                      </div>
                    )
                  })}
                  <div style={{ padding: '8px 16px 12px' }}>
                    <button
                      className="btn btn-ghost btn-sm btn-full"
                      style={{ justifyContent: 'center' }}
                      onClick={() => navigate('/leaderboard')}
                    >
                      Full Leaderboard →
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
