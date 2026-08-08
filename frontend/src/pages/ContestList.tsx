import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { usePageMeta } from '../lib/seo'
import type { Contest } from '../lib/types'

function formatStart(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZoneName: 'short',
  })
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

type EffectivePhase = 'scheduled' | 'live' | 'ended'

function effectivePhase(c: Contest): EffectivePhase {
  const now = Date.now()
  const startMs = new Date(c.startTime).getTime()
  const endMs = startMs + c.durationMinutes * 60_000
  if (now >= endMs) return 'ended'
  if (now >= startMs) return 'live'
  return 'scheduled'
}

function endMsOf(c: Contest) {
  return new Date(c.startTime).getTime() + c.durationMinutes * 60_000
}

/** Split a duration into the four units the clock displays. */
function splitMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

/**
 * Segmented countdown. Days are dropped once there are none left, so the
 * final hour reads as three large segments rather than a leading "00".
 */
function CountdownClock({ ms, size = 'hero', tone = 'primary' }: {
  ms: number
  size?: 'hero' | 'row'
  tone?: 'primary' | 'danger'
}) {
  const { days, hours, minutes, seconds } = splitMs(ms)
  const pad = (n: number) => String(n).padStart(2, '0')

  const segments = [
    ...(days > 0 ? [{ value: pad(days), label: days === 1 ? 'day' : 'days' }] : []),
    { value: pad(hours), label: 'hrs' },
    { value: pad(minutes), label: 'min' },
    { value: pad(seconds), label: 'sec' },
  ]

  return (
    <div className={`cd-clock cd-${size} cd-tone-${tone}`} role="timer" aria-live="off">
      {segments.map((seg, i) => (
        <div key={seg.label} className="cd-seg-wrap">
          <div className="cd-seg">
            <span className="cd-value">{seg.value}</span>
            <span className="cd-label">{seg.label}</span>
          </div>
          {i < segments.length - 1 && <span className="cd-colon">:</span>}
        </div>
      ))}
    </div>
  )
}

/** The one contest that deserves the big treatment: live first, else next up. */
function FeaturedContest({ contest, joining, onJoin }: {
  contest: Contest
  joining: boolean
  onJoin: (c: Contest) => void
}) {
  const navigate = useNavigate()
  const phase = effectivePhase(contest)
  const isLive = phase === 'live'
  const ms = isLive ? endMsOf(contest) - Date.now() : new Date(contest.startTime).getTime() - Date.now()
  const count = contest._count?.participations ?? 0

  return (
    <section className={`contest-hero ${isLive ? 'is-live' : ''}`}>
      {/* Two columns: identity on the left, the clock and its action on the
          right. Stacking these made the card tall and mostly empty. */}
      <div className="contest-hero-left">
        <div className="contest-hero-eyebrow">
          {isLive
            ? <><span className="live-dot" aria-hidden="true" /> Live now</>
            : 'Next contest'}
        </div>

        <h1 className="contest-hero-title">{contest.title}</h1>

        <div className="contest-hero-meta">
          <span>🗓 {formatStart(contest.startTime)}</span>
          <span className="cd-dot">·</span>
          <span>⏱ {formatDuration(contest.durationMinutes)}</span>
          <span className="cd-dot">·</span>
          <span>👥 {count} registered</span>
          {Number(contest.negativeMarks) > 0 && (
            <>
              <span className="cd-dot">·</span>
              <span>−{Number(contest.negativeMarks)} per wrong</span>
            </>
          )}
        </div>
      </div>

      <div className="contest-hero-right">
      <div className="contest-hero-clock">
        <div className="contest-hero-clocklabel">{isLive ? 'Ends in' : 'Starts in'}</div>
        <CountdownClock ms={ms} size="hero" tone={isLive ? 'danger' : 'primary'} />
      </div>

      <div className="contest-hero-actions">
        {isLive ? (
          contest.hasSubmitted ? (
            <button className="btn btn-ghost" onClick={() => navigate(`/contests/${contest.id}/result`)}>
              View your result
            </button>
          ) : (
            <button className="btn btn-danger btn-lg" onClick={() => onJoin(contest)} disabled={joining}>
              {joining ? 'Entering…' : contest.hasJoined ? '▶ Continue exam' : '▶ Enter contest'}
            </button>
          )
        ) : contest.hasJoined ? (
          <span className="contest-registered">✓ You're registered — good luck</span>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={() => onJoin(contest)} disabled={joining}>
            {joining ? 'Registering…' : 'Register now »'}
          </button>
        )}
      </div>
      </div>
    </section>
  )
}

/** Compact row for the upcoming contests behind the featured one. */
function UpcomingRow({ contest, joining, onJoin }: {
  contest: Contest
  joining: boolean
  onJoin: (c: Contest) => void
}) {
  const navigate = useNavigate()
  const phase = effectivePhase(contest)
  const isLive = phase === 'live'
  const ms = isLive ? endMsOf(contest) - Date.now() : new Date(contest.startTime).getTime() - Date.now()
  const count = contest._count?.participations ?? 0

  return (
    <div className={`contest-row ${isLive ? 'is-live' : ''}`}>
      <div className="contest-row-main">
        <div className="contest-row-title">
          {isLive && <span className="contest-live-tag"><span className="live-dot" /> Live</span>}
          {contest.title}
        </div>
        <div className="contest-row-meta">
          {formatStart(contest.startTime)} · {formatDuration(contest.durationMinutes)} · 👥 {count}
        </div>
      </div>

      <div className="contest-row-clock">
        <span className="contest-row-clocklabel">{isLive ? 'Ends in' : 'Starts in'}</span>
        <CountdownClock ms={ms} size="row" tone={isLive ? 'danger' : 'primary'} />
      </div>

      <div className="contest-row-action">
        {isLive ? (
          contest.hasSubmitted
            ? <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/contests/${contest.id}/result`)}>Result</button>
            : <button className="btn btn-danger btn-sm" onClick={() => onJoin(contest)} disabled={joining}>
                {joining ? '…' : contest.hasJoined ? 'Continue' : 'Enter'}
              </button>
        ) : contest.hasJoined ? (
          <span className="contest-registered-sm">✓ Registered</span>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => onJoin(contest)} disabled={joining}>
            {joining ? '…' : 'Register'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function ContestList() {
  usePageMeta('Contests — RankArenas', 'Upcoming and past rated SSC contests on RankArenas.')
  const navigate = useNavigate()
  const [active, setActive] = useState<Contest[]>([])
  const [past, setPast] = useState<Contest[]>([])
  const [loading, setLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    api.get('/contests')
      .then(r => { setActive(r.data.active ?? []); setPast(r.data.past ?? []) })
      .finally(() => setLoading(false))
  }, [])

  // One shared tick drives every clock on the page.
  useEffect(() => {
    if (!active.some(c => effectivePhase(c) !== 'ended')) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [active])

  async function joinAndEnter(contest: Contest) {
    setJoiningId(contest.id)
    try {
      await api.post(`/contests/${contest.id}/join`)
    } catch (err: any) {
      // 409/400 mean "already joined", which is fine to continue past.
      if (err.response?.status !== 409 && err.response?.status !== 400) {
        setJoiningId(null)
        return
      }
    }
    if (effectivePhase(contest) === 'live') {
      navigate(`/contests/${contest.id}`)
    } else {
      setActive(prev => prev.map(c => (c.id === contest.id ? { ...c, hasJoined: true } : c)))
      setJoiningId(null)
    }
  }

  // Live contests outrank scheduled ones; scheduled sort by how soon they start.
  const upcoming = [...active]
    .filter(c => effectivePhase(c) !== 'ended')
    .sort((a, b) => {
      const la = effectivePhase(a) === 'live' ? 0 : 1
      const lb = effectivePhase(b) === 'live' ? 0 : 1
      return la - lb || +new Date(a.startTime) - +new Date(b.startTime)
    })
  const featured = upcoming[0] ?? null
  const rest = upcoming.slice(1)

  return (
    <>
      <Navbar />
      <div className="page">
        {loading && <p className="empty">Loading contests…</p>}

        {!loading && featured && (
          <FeaturedContest
            contest={featured}
            joining={joiningId === featured.id}
            onJoin={joinAndEnter}
          />
        )}

        {!loading && rest.length > 0 && (
          <>
            <h2 className="contest-section-heading">Also scheduled</h2>
            <div className="contest-rows">
              {rest.map(c => (
                <UpcomingRow key={c.id} contest={c} joining={joiningId === c.id} onJoin={joinAndEnter} />
              ))}
            </div>
          </>
        )}

        {!loading && past.length > 0 && (
          <>
            <h2 className="contest-section-heading">Past contests</h2>
            <div className="card" style={{ padding: 0 }}>
              <table className="contest-table">
                <thead>
                  <tr><th>Name</th><th>Start</th><th>Length</th><th></th></tr>
                </thead>
                <tbody>
                  {past.map(c => (
                    <tr key={c.id}>
                      <td className="contest-table-name">{c.title}</td>
                      <td className="contest-past-cell">{formatStart(c.startTime)}</td>
                      <td className="contest-past-cell">{formatDuration(c.durationMinutes)}</td>
                      <td>
                        {c.hasJoined
                          ? <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/contests/${c.id}/result`)}>View result</button>
                          : <span className="contest-past-cell">Ended</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && !featured && past.length === 0 && (
          <div className="card community-notice">
            <span className="community-empty-icon">🏁</span>
            <p className="community-empty-title">No contests scheduled yet</p>
            <p className="community-empty-sub">
              New rated contests are announced in the community — check back soon.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
