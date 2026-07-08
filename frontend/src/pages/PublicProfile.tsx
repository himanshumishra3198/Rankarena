import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { TIERS, getTier } from '../lib/tiers'
import { RatingChart } from '../components/RatingChart'
import type { RatingPoint } from '../components/RatingChart'
import { ActivityHeatmap } from '../components/ActivityHeatmap'

interface PublicProfileData {
  user: {
    id: string; name: string; role: string; rating: number; createdAt: string
    followerCount: number; followingCount: number
  }
  ratingHistory: RatingPoint[]
  heatmap: Record<string, number>
  stats: {
    totalContests: number; totalMocks: number; totalSolved: number; activeDays: number
    bestRank: number | null; maxRating: number; maxStreak: number; currentStreak: number
  }
  isFollowing: boolean
  isOwnProfile: boolean
}

function sinceLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const years  = Math.floor(ms / (365.25 * 86_400_000))
  const months = Math.floor(ms / (30.44  * 86_400_000))
  if (years  >= 1) return `${years} year${years > 1 ? 's' : ''} ago`
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

export default function PublicProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const me = JSON.parse(localStorage.getItem('user') || '{}')

  const [data, setData] = useState<PublicProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [followLoading, setFollowLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    // Redirect to own profile if viewing self
    if (id === me.id) { navigate('/profile', { replace: true }); return }

    setLoading(true)
    api.get(`/profile/${id}`)
      .then(r => setData(r.data))
      .catch(() => setError('Profile not found.'))
      .finally(() => setLoading(false))
  }, [id])

  async function toggleFollow() {
    if (!data) return
    setFollowLoading(true)
    try {
      if (data.isFollowing) {
        await api.delete(`/follows/${id}`)
        setData(d => d && {
          ...d,
          isFollowing: false,
          user: { ...d.user, followerCount: d.user.followerCount - 1 },
        })
      } else {
        await api.post(`/follows/${id}`)
        setData(d => d && {
          ...d,
          isFollowing: true,
          user: { ...d.user, followerCount: d.user.followerCount + 1 },
        })
      }
    } finally {
      setFollowLoading(false)
    }
  }

  if (loading) return <><Navbar /><div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading profile...</p></div></>
  if (error)   return <><Navbar /><div className="page"><div className="alert alert-error">{error}</div></div></>
  if (!data)   return null

  const { user, ratingHistory, heatmap, stats } = data
  const tier    = getTier(user.rating)
  const maxTier = getTier(stats.maxRating)

  const solvedThisYear  = countInPeriod(heatmap, 365)
  const solvedThisMonth = countInPeriod(heatmap, 30)

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
                  Registered: {sinceLabel(user.createdAt)}
                  &nbsp;·&nbsp; {stats.totalContests} contest{stats.totalContests !== 1 ? 's' : ''}
                  {stats.bestRank !== null && <>&nbsp;·&nbsp; Best rank: #{stats.bestRank}</>}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--heading)' }}>{user.followerCount}</strong> followers
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--heading)' }}>{user.followingCount}</strong> following
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
            <button
              className={`btn ${data.isFollowing ? 'btn-ghost' : 'btn-primary'}`}
              onClick={toggleFollow}
              disabled={followLoading}
            >
              {data.isFollowing ? 'Unfollow' : '+ Follow'}
            </button>
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
        </div>

        {/* ── Rating chart ──────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginBottom: 12 }}>Rating History</h2>
          <RatingChart history={ratingHistory} />
        </div>

        {/* ── Activity heatmap + stats ──────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="activity-section-title" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span>
              Problem-Solving Activity
              <span className="activity-section-sub">· last 52 weeks</span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
              <strong style={{ color: 'var(--heading)' }}>{stats.totalSolved ?? 0}</strong> problems solved across{' '}
              <strong style={{ color: 'var(--heading)' }}>{stats.activeDays ?? 0}</strong> active day{stats.activeDays === 1 ? '' : 's'}
            </span>
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

          <div className="activity-summary-row">
            <div className="activity-summary-group">
              <div className="activity-summary-label">Tests taken</div>
              <div className="activity-summary-stats">
                <span><strong>{stats.totalContests}</strong> contests</span>
                <span><strong>{stats.totalMocks ?? 0}</strong> mocks</span>
              </div>
            </div>
            <div className="activity-summary-group">
              <div className="activity-summary-label">Problems solved</div>
              <div className="activity-summary-stats">
                <span><strong>{stats.totalSolved ?? 0}</strong> all time</span>
                <span><strong>{solvedThisYear}</strong> this year</span>
                <span><strong>{solvedThisMonth}</strong> this month</span>
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

      </div>
    </>
  )
}
