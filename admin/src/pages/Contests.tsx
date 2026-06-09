import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import type { Contest, Section } from '../lib/types'
import { SECTIONS, SECTION_LABELS } from '../lib/types'

type EffectivePhase = 'scheduled' | 'live' | 'ended'

function effectivePhase(c: Contest): EffectivePhase {
  if (c.status === 'ENDED') return 'ended'
  const now = Date.now()
  const startMs = new Date(c.startTime).getTime()
  const endMs = startMs + c.durationMinutes * 60_000
  if (now >= endMs) return 'ended'
  if (now >= startMs) return 'live'
  return 'scheduled'
}

function phaseBadge(phase: EffectivePhase) {
  if (phase === 'live')      return { cls: 'badge-live',      label: '🔴 Live'   }
  if (phase === 'ended')     return { cls: 'badge-ended',     label: 'Ended'     }
  return                            { cls: 'badge-scheduled', label: 'Upcoming'  }
}

function ContestCountdown({ contest }: { contest: Contest }) {
  const phase = effectivePhase(contest)
  if (phase === 'ended') return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>

  const now = Date.now()
  const startMs = new Date(contest.startTime).getTime()
  const endMs = startMs + contest.durationMinutes * 60_000
  const diff = phase === 'live' ? Math.max(0, endMs - now) : Math.max(0, startMs - now)

  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff % 86_400_000) / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  const s = Math.floor((diff % 60_000) / 1_000)

  const label = phase === 'live'
    ? (h > 0 ? `Ends in ${h}h ${m}m ${s}s` : m > 0 ? `Ends in ${m}m ${s}s` : `Ends in ${s}s`)
    : (d > 0 ? `Starts in ${d}d ${h}h ${m}m` : h > 0 ? `Starts in ${h}h ${m}m ${s}s` : m > 0 ? `Starts in ${m}m ${s}s` : `Starts in ${s}s`)

  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: phase === 'live' ? '#dc2626' : 'var(--text-muted)' }}>
      {label}
    </span>
  )
}

// Format datetime to the value expected by <input type="datetime-local">
function toDatetimeLocal(isoOrEmpty?: string): string {
  if (!isoOrEmpty) return ''
  const d = new Date(isoOrEmpty)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultSectionLimits(totalMinutes: number): Record<Section, number> {
  const perSection = Math.floor(totalMinutes / SECTIONS.length)
  return { QUANT: perSection, REASONING: perSection, ENGLISH: perSection, GK: perSection }
}

export default function Contests() {
  const navigate = useNavigate()
  const [contests, setContests] = useState<Contest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Countdown ticker — only runs while there are active/upcoming contests
  const [, setTick] = useState(0)
  useEffect(() => {
    const hasActive = contests.some(c => effectivePhase(c) !== 'ended')
    if (!hasActive) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [contests])

  // Restart state
  const [restartId, setRestartId] = useState<string | null>(null)
  const [restartTime, setRestartTime] = useState('')
  const [restartSaving, setRestartSaving] = useState(false)
  const [restartError, setRestartError] = useState('')

  // Form fields
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('')
  const [duration, setDuration] = useState(90)
  const [negMarks, setNegMarks] = useState(0.5)
  const [sectionLimits, setSectionLimits] = useState<Record<Section, number>>(defaultSectionLimits(90))

  async function load() {
    try {
      const res = await api.get('/admin/contests')
      setContests(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Auto-distribute total duration across sections when duration changes
  function handleDurationChange(mins: number) {
    setDuration(mins)
    setSectionLimits(defaultSectionLimits(mins))
  }

  function setSectionLimit(sec: Section, val: number) {
    setSectionLimits(prev => ({ ...prev, [sec]: val }))
  }

  const sectionTotal = Object.values(sectionLimits).reduce((a, b) => a + b, 0)
  const timeMismatch = sectionTotal !== duration

  async function createContest(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/admin/contests', {
        title,
        startTime: new Date(startTime).toISOString(),
        durationMinutes: Number(duration),
        negativeMarks: Number(negMarks),
        sectionLimits,
      })
      setShowForm(false)
      setTitle(''); setStartTime(''); setDuration(90); setNegMarks(0.5)
      setSectionLimits(defaultSectionLimits(90))
      load()
    } catch (err: any) {
      setError('Failed to create contest')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(id: string, status: Contest['status']) {
    await api.post(`/admin/contests/${id}/status`, { status })
    load()
  }

  async function deleteContest(id: string) {
    if (!window.confirm('Delete this contest and all its questions?')) return
    await api.delete(`/admin/contests/${id}`)
    load()
  }

  function openRestart(c: Contest) {
    // Pre-fill with same time tomorrow as a sensible default
    const tomorrow = new Date(Date.now() + 86_400_000)
    setRestartTime(toDatetimeLocal(tomorrow.toISOString()))
    setRestartError('')
    setRestartId(c.id)
  }

  async function confirmRestart(e: FormEvent) {
    e.preventDefault()
    if (!restartId) return
    setRestartError('')
    setRestartSaving(true)
    try {
      await api.post(`/admin/contests/${restartId}/restart`, {
        startTime: new Date(restartTime).toISOString(),
      })
      setRestartId(null)
      load()
    } catch (err: any) {
      setRestartError(err.response?.data?.error ?? 'Failed to restart contest')
    } finally {
      setRestartSaving(false)
    }
  }

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="page-header">
          <h1>Contests</h1>
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : '+ New Contest'}
          </button>
        </div>

        {showForm && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 16 }}>Create Contest</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={createContest}>

              <div className="form-group">
                <label>Title</label>
                <input className="input" value={title} onChange={e => setTitle(e.target.value)} required placeholder="SSC CGL Mock Test 1" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Time</label>
                  <input className="input" type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Total Duration (minutes)</label>
                  <input className="input" type="number" value={duration} onChange={e => handleDurationChange(Number(e.target.value))} min={1} required />
                </div>
                <div className="form-group">
                  <label>Negative Marks (per wrong answer)</label>
                  <input className="input" type="number" value={negMarks} onChange={e => setNegMarks(Number(e.target.value))} step={0.25} min={0} required />
                </div>
              </div>

              {/* Section time limits */}
              <div className="form-group">
                <label style={{ marginBottom: 8, display: 'block' }}>
                  Section Time Limits (minutes)
                  {timeMismatch && (
                    <span style={{ marginLeft: 10, color: 'var(--danger)', fontSize: 12, fontWeight: 400 }}>
                      ⚠ Total {sectionTotal} min ≠ {duration} min
                    </span>
                  )}
                  {!timeMismatch && (
                    <span style={{ marginLeft: 10, color: 'var(--success)', fontSize: 12, fontWeight: 400 }}>
                      ✓ Total matches {duration} min
                    </span>
                  )}
                </label>
                <div className="section-limits-grid">
                  {SECTIONS.map(sec => (
                    <div key={sec} className="section-limit-item">
                      <div className="section-limit-label">{SECTION_LABELS[sec]}</div>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        value={sectionLimits[sec]}
                        onChange={e => setSectionLimit(sec, Number(e.target.value))}
                        required
                      />
                      <div className="section-limit-unit">min</div>
                    </div>
                  ))}
                </div>
              </div>

              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create Contest'}
              </button>
            </form>
          </div>
        )}

        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
        {!loading && contests.length === 0 && (
          <div className="card"><p className="empty">No contests yet. Create one above.</p></div>
        )}

        {/* ── Ongoing & Upcoming ─────────────────────────────── */}
        {!loading && (() => {
          const list = contests.filter(c => effectivePhase(c) !== 'ended')
          return (
            <div className="card" style={{ padding: 0, marginBottom: 20 }}>
              <div className="contests-section-header">
                <span>Ongoing &amp; Upcoming</span>
                <span className="contests-section-count">{list.length}</span>
              </div>
              {list.length === 0
                ? <p className="empty" style={{ padding: '24px 20px' }}>No active or scheduled contests.</p>
                : (
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th><th>Start Time</th><th>Countdown</th>
                        <th>Duration</th><th>Neg. Marks</th><th>Status</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(c => {
                        const phase = effectivePhase(c)
                        const badge = phaseBadge(phase)
                        return (
                          <tr key={c.id}>
                            <td>
                              <button style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 14 }}
                                onClick={() => navigate(`/contests/${c.id}`)}>
                                {c.title}
                              </button>
                            </td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                              {new Date(c.startTime).toLocaleString('en-IN')}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}><ContestCountdown contest={c} /></td>
                            <td style={{ fontSize: 13 }}>{c.durationMinutes} min</td>
                            <td style={{ fontSize: 13 }}>−{Number(c.negativeMarks)}</td>
                            <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {phase === 'scheduled' && (
                                  <button className="btn btn-sm btn-ghost" onClick={() => setStatus(c.id, 'LIVE')}>Go Live</button>
                                )}
                                {phase === 'live' && (
                                  <button className="btn btn-sm btn-ghost" onClick={() => setStatus(c.id, 'ENDED')}>End</button>
                                )}
                                <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/contests/${c.id}`)}>Manage</button>
                                <button className="btn btn-sm btn-danger" onClick={() => deleteContest(c.id)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
            </div>
          )
        })()}

        {/* ── Past Contests ──────────────────────────────────── */}
        {!loading && (() => {
          const list = contests.filter(c => effectivePhase(c) === 'ended')
          return (
            <div className="card" style={{ padding: 0 }}>
              <div className="contests-section-header contests-section-header-muted">
                <span>Past Contests</span>
                <span className="contests-section-count">{list.length}</span>
              </div>
              {list.length === 0
                ? <p className="empty" style={{ padding: '24px 20px' }}>No past contests yet.</p>
                : (
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th><th>Start Time</th><th>Duration</th>
                        <th>Neg. Marks</th><th>Status</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(c => {
                        const badge = phaseBadge('ended')
                        return (
                        <>
                          <tr key={c.id}>
                            <td>
                              <button style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 14 }}
                                onClick={() => navigate(`/contests/${c.id}`)}>
                                {c.title}
                              </button>
                            </td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                              {new Date(c.startTime).toLocaleString('en-IN')}
                            </td>
                            <td style={{ fontSize: 13 }}>{c.durationMinutes} min</td>
                            <td style={{ fontSize: 13 }}>−{Number(c.negativeMarks)}</td>
                            <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button className="btn btn-sm btn-ghost" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }} onClick={() => openRestart(c)}>
                                  ↺ Restart
                                </button>
                                <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/contests/${c.id}`)}>Manage</button>
                                <button className="btn btn-sm btn-danger" onClick={() => deleteContest(c.id)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                          {restartId === c.id && (
                            <tr key={`${c.id}-restart`}>
                              <td colSpan={6} style={{ background: 'var(--primary-light)', padding: '16px 20px' }}>
                                <form onSubmit={confirmRestart} style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--heading)' }}>
                                      New start time for <strong>{c.title}</strong>
                                    </label>
                                    <input className="input" type="datetime-local" value={restartTime}
                                      onChange={e => setRestartTime(e.target.value)} required style={{ width: 230 }} />
                                  </div>
                                  {restartError && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{restartError}</span>}
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-primary btn-sm" type="submit" disabled={restartSaving}>
                                      {restartSaving ? 'Restarting...' : '↺ Confirm Restart'}
                                    </button>
                                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => setRestartId(null)}>Cancel</button>
                                  </div>
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    ⚠ All previous submissions and ratings for this contest will be cleared.
                                  </span>
                                </form>
                              </td>
                            </tr>
                          )}
                        </>
                        )
                      })}
                    </tbody>
                  </table>
                )}
            </div>
          )
        })()}
      </div>
    </>
  )
}
