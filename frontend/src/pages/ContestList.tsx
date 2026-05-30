import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
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
  return m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, '0')}`
}

type EffectivePhase = 'scheduled' | 'live' | 'ended'

function effectivePhase(c: Contest): EffectivePhase {
  const now = Date.now()
  const startMs = new Date(c.startTime).getTime()
  const endMs = startMs + c.durationMinutes * 60 * 1000
  if (now >= endMs) return 'ended'
  if (now >= startMs) return 'live'
  return 'scheduled'
}

function Countdown({ contest }: { contest: Contest }) {
  const phase = effectivePhase(contest)
  if (phase === 'ended') return <span style={{ color: 'var(--text-muted)' }}>Ended</span>
  if (phase === 'live') {
    const endMs = new Date(contest.startTime).getTime() + contest.durationMinutes * 60 * 1000
    const diff = Math.max(0, endMs - Date.now())
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    const s = Math.floor((diff % 60_000) / 1_000)
    const time = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`
    return <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Ends in {time}</span>
  }
  const diff = Math.max(0, new Date(contest.startTime).getTime() - Date.now())
  if (diff === 0) return <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Starting now...</span>
  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff % 86_400_000) / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  const s = Math.floor((diff % 60_000) / 1_000)
  const label = d > 0
    ? `Before start ${d}d ${h}h ${m}m`
    : h > 0 ? `Before start ${h}h ${m}m ${s}s`
    : m > 0 ? `Before start ${m}m ${s}s`
    : `Before start ${s}s`
  return <span style={{ color: 'var(--text-muted)' }}>{label}</span>
}

function ActionCell({
  contest, joiningId, onJoin,
}: {
  contest: Contest; joiningId: string | null; onJoin: (c: Contest) => void
}) {
  const navigate = useNavigate()
  const phase = effectivePhase(contest)
  const joining = joiningId === contest.id
  const count = contest._count?.participations ?? 0

  if (phase === 'ended') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {contest.hasJoined
          ? <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/contests/${contest.id}/result`)}>View Results</button>
          : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Ended</span>}
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>👥 {count}</span>
      </div>
    )
  }

  if (phase === 'live') {
    if (contest.hasSubmitted) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/contests/${contest.id}/result`)}>
            View Results
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>👥 {count}</span>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-danger btn-sm" onClick={() => onJoin(contest)} disabled={joining}>
          {joining ? 'Joining...' : contest.hasJoined ? '▶ Continue Exam' : '▶ Enter Now'}
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>👥 {count}</span>
      </div>
    )
  }

  // scheduled
  if (contest.hasJoined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>✓ Registered</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>👥 {count}</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button className="btn btn-primary btn-sm" onClick={() => onJoin(contest)} disabled={joining}>
        {joining ? 'Registering...' : 'Register »'}
      </button>
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>👥 {count}</span>
    </div>
  )
}

function ContestTable({
  contests, joiningId, onJoin, showPhaseColumn,
}: {
  contests: Contest[]; joiningId: string | null; onJoin: (c: Contest) => void; showPhaseColumn: boolean
}) {
  return (
    <table className="contest-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Start</th>
          <th>Length</th>
          {showPhaseColumn && <th></th>}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {contests.map(c => (
          <tr key={c.id}>
            <td className="contest-table-name">{c.title}</td>
            <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 13 }}>{formatStart(c.startTime)}</td>
            <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatDuration(c.durationMinutes)}</td>
            {showPhaseColumn && <td style={{ whiteSpace: 'nowrap' }}><Countdown contest={c} /></td>}
            <td><ActionCell contest={c} joiningId={joiningId} onJoin={onJoin} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ContestList() {
  const navigate = useNavigate()
  const [active, setActive] = useState<Contest[]>([])
  const [past, setPast] = useState<Contest[]>([])
  const [loading, setLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    api.get('/contests')
      .then(r => { setActive(r.data.active); setPast(r.data.past) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const hasLive = active.some(c => effectivePhase(c) !== 'ended')
    if (!hasLive) return
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [active])

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

  return (
    <>
      <Navbar />
      <div className="page">
        {loading && <p style={{ color: 'var(--text-muted)', padding: '40px 0' }}>Loading contests...</p>}

        {!loading && active.length > 0 && (
          <div className="card" style={{ padding: 0, marginBottom: 24 }}>
            <div className="contest-table-header">
              <span>Ongoing &amp; Upcoming</span>
              <span className="section-count-badge section-count-active">{active.length}</span>
            </div>
            <ContestTable contests={active} joiningId={joiningId} onJoin={joinAndEnter} showPhaseColumn />
          </div>
        )}

        {!loading && past.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            <div className="contest-table-header">
              <span>Past Contests</span>
              <span className="section-count-badge">{past.length}</span>
            </div>
            <ContestTable contests={past} joiningId={joiningId} onJoin={joinAndEnter} showPhaseColumn={false} />
          </div>
        )}

        {!loading && active.length === 0 && past.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <p style={{ color: 'var(--text-muted)' }}>No contests right now. Check back soon.</p>
          </div>
        )}
      </div>
    </>
  )
}
