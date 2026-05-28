import { useEffect, useState, FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import type { Contest, Question, ContestQuestion, Section } from '../lib/types'
import { SECTIONS, SECTION_LABELS } from '../lib/types'

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const

const emptyQ = {
  text: '', imageUrl: '', optionA: '', optionB: '', optionC: '', optionD: '',
  correctOption: 'A', subject: 'QUANT', difficulty: 'MEDIUM',
}

const BULK_TEMPLATE = JSON.stringify([
  {
    text: 'Question text here',
    imageUrl: '',
    optionA: 'Option A',
    optionB: 'Option B',
    optionC: 'Option C',
    optionD: 'Option D',
    correctOption: 'A',
    subject: 'QUANT',
    difficulty: 'MEDIUM',
    marks: 2,
    negativeMarks: 0.5,
  },
], null, 2)

type AddTab = 'bank' | 'create' | 'bulk'
type Phase = 'scheduled' | 'live' | 'ended'

function getPhase(contest: Contest): Phase {
  const now = Date.now()
  const startMs = new Date(contest.startTime).getTime()
  const endMs = startMs + contest.durationMinutes * 60_000
  if (now >= endMs) return 'ended'
  if (now >= startMs) return 'live'
  return 'scheduled'
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function ContestTimer({ contest }: { contest: Contest }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(iv)
  }, [])

  const phase = getPhase(contest)
  const startMs = new Date(contest.startTime).getTime()
  const endMs = startMs + contest.durationMinutes * 60_000
  const now = Date.now()

  if (phase === 'scheduled') {
    const diff = startMs - now
    return (
      <div className="admin-timer-banner admin-timer-scheduled">
        <div>
          <div className="admin-timer-label">Starts in</div>
          <div className="admin-timer-value">{formatCountdown(diff)}</div>
        </div>
        <div className="admin-timer-meta">
          <div>{new Date(contest.startTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          <div style={{ fontSize: 12, opacity: .8 }}>{contest.durationMinutes} min total · −{Number(contest.negativeMarks)} negative marking</div>
        </div>
        <span className="badge badge-scheduled">Upcoming</span>
      </div>
    )
  }

  if (phase === 'live') {
    const diff = endMs - now
    const pct = Math.max(0, Math.min(100, (diff / (contest.durationMinutes * 60_000)) * 100))
    return (
      <div className="admin-timer-banner admin-timer-live">
        <div>
          <div className="admin-timer-label">Time remaining</div>
          <div className="admin-timer-value">{formatCountdown(diff)}</div>
        </div>
        <div style={{ flex: 1, padding: '0 24px' }}>
          <div className="admin-progress-track">
            <div className="admin-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {Math.round(pct)}% time remaining
          </div>
        </div>
        <span className="badge badge-live">🔴 Live</span>
      </div>
    )
  }

  // ended
  return (
    <div className="admin-timer-banner admin-timer-ended">
      <div>
        <div className="admin-timer-label">Contest ended</div>
        <div className="admin-timer-value" style={{ fontSize: 20 }}>
          {new Date(endMs).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <span className="badge badge-ended">Ended</span>
    </div>
  )
}

export default function ContestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [contest, setContest] = useState<Contest | null>(null)
  const [cqs, setCqs] = useState<ContestQuestion[]>([])
  const [bank, setBank] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  // Section config editing
  const [editingConfig, setEditingConfig] = useState(false)
  const [draftLimits, setDraftLimits] = useState<Record<Section, number>>({ QUANT: 0, REASONING: 0, ENGLISH: 0, GK: 0 })
  const [draftNegMarks, setDraftNegMarks] = useState(0.5)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configError, setConfigError] = useState('')

  // Add question state
  const [tab, setTab] = useState<AddTab>('bank')
  const [selectedQId, setSelectedQId] = useState('')
  const [marks, setMarks] = useState(2)
  const [negMarks, setNegMarks] = useState(0.5)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const [newQ, setNewQ] = useState(emptyQ)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Bulk import state
  const [bulkJson, setBulkJson] = useState('')
  const [bulkError, setBulkError] = useState('')
  const [bulkSuccess, setBulkSuccess] = useState('')
  const [importing, setImporting] = useState(false)

  async function load() {
    const [contestRes, cqsRes, bankRes] = await Promise.all([
      api.get(`/contests/${id}`),
      api.get(`/admin/contests/${id}/questions`).catch(() => ({ data: [] })),
      api.get('/admin/questions'),
    ])
    const c: Contest = contestRes.data
    setContest(c)
    setCqs(cqsRes.data)
    setBank(bankRes.data)
    // seed draft config from current values
    const limits = c.sectionLimits ?? Object.fromEntries(
      SECTIONS.map(s => [s, Math.floor(c.durationMinutes / SECTIONS.length)])
    ) as Record<Section, number>
    setDraftLimits(limits as Record<Section, number>)
    setDraftNegMarks(Number(c.negativeMarks))
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  // ── Section config save ───────────────────────────────────────────────
  async function saveConfig() {
    setSavingConfig(true); setConfigError('')
    try {
      await api.put(`/admin/contests/${id}`, {
        negativeMarks: Number(draftNegMarks),
        sectionLimits: draftLimits,
      })
      setEditingConfig(false)
      load()
    } catch {
      setConfigError('Failed to save — check values and try again.')
    } finally {
      setSavingConfig(false)
    }
  }

  // ── Status change ─────────────────────────────────────────────────────
  async function setStatus(status: Contest['status']) {
    await api.post(`/admin/contests/${id}/status`, { status })
    load()
  }

  // ── Add from bank ─────────────────────────────────────────────────────
  async function addFromBank(e: FormEvent) {
    e.preventDefault()
    if (!selectedQId) return
    setAdding(true); setAddError('')
    try {
      await api.post(`/admin/contests/${id}/questions`, {
        questionId: selectedQId,
        displayOrder: cqs.length + 1,
        marks: Number(marks),
        negativeMarks: Number(negMarks),
      })
      setSelectedQId(''); load()
    } catch (err: any) {
      setAddError(err.response?.data?.error || 'Failed to add question')
    } finally {
      setAdding(false)
    }
  }

  // ── Create & add ──────────────────────────────────────────────────────
  async function createAndAdd(e: FormEvent) {
    e.preventDefault()
    setCreating(true); setCreateError('')
    try {
      const payload = { ...newQ, imageUrl: newQ.imageUrl || undefined }
      const qRes = await api.post('/admin/questions', payload)
      await api.post(`/admin/contests/${id}/questions`, {
        questionId: qRes.data.id,
        displayOrder: cqs.length + 1,
        marks: Number(marks),
        negativeMarks: Number(negMarks),
      })
      setNewQ(emptyQ); load()
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Failed to create question')
    } finally {
      setCreating(false)
    }
  }

  async function bulkImport() {
    setBulkError(''); setBulkSuccess('')
    let parsed: any[]
    try {
      parsed = JSON.parse(bulkJson)
      if (!Array.isArray(parsed)) throw new Error()
    } catch {
      setBulkError('Invalid JSON — paste a valid JSON array of questions.')
      return
    }
    setImporting(true)
    try {
      const res = await api.post(`/admin/contests/${id}/questions/bulk`, parsed)
      setBulkSuccess(`Imported ${res.data.created} question${res.data.created !== 1 ? 's' : ''} successfully!`)
      setBulkJson('')
      load()
    } catch (err: any) {
      const msg = err.response?.data?.error
      setBulkError(typeof msg === 'string' ? msg : 'Import failed — check your JSON matches the template.')
    } finally {
      setImporting(false)
    }
  }

  function handleImageFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => setNewQ(q => ({ ...q, imageUrl: reader.result as string }))
    reader.readAsDataURL(file)
  }

  function downloadTemplate() {
    const blob = new Blob([BULK_TEMPLATE], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'questions-template.json'; a.click()
    URL.revokeObjectURL(url)
  }

  function handleBulkFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => setBulkJson(reader.result as string)
    reader.readAsText(file)
  }

  async function removeQuestion(qid: string) {
    if (!window.confirm('Remove this question from the contest?')) return
    await api.delete(`/admin/contests/${id}/questions/${qid}`)
    load()
  }

  const addedIds = new Set(cqs.map(cq => cq.questionId))
  const availableBank = bank.filter(q => !addedIds.has(q.id))

  // Section breakdown from current questions
  const sectionCounts = Object.fromEntries(
    SECTIONS.map(s => [s, cqs.filter(cq => cq.question.subject === s).length])
  ) as Record<Section, number>

  const draftTotal = Object.values(draftLimits).reduce((a, b) => a + b, 0)

  if (loading) return <><Navbar /><div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading...</p></div></>

  return (
    <>
      <Navbar />
      <div className="page">
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Back to Contests</button>
        </div>

        {/* ── Live contest timer ───────────────────────────────────────── */}
        {contest && <ContestTimer contest={contest} />}

        {/* ── Status controls ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Contest controls:</span>
          {contest?.status === 'SCHEDULED' && (
            <button className="btn btn-sm btn-primary" onClick={() => setStatus('LIVE')}>▶ Go Live Now</button>
          )}
          {contest?.status === 'LIVE' && (
            <button className="btn btn-sm btn-danger" onClick={() => setStatus('ENDED')}>⏹ End Contest</button>
          )}
          {contest?.status === 'ENDED' && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>This contest has ended.</span>
          )}
        </div>

        {/* ── Section configuration card ───────────────────────────────── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editingConfig ? 16 : 0 }}>
            <h2 style={{ margin: 0 }}>Section Configuration</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {editingConfig ? (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditingConfig(false); setConfigError('') }}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={saveConfig} disabled={savingConfig}>
                    {savingConfig ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingConfig(true)}>✎ Edit</button>
              )}
            </div>
          </div>

          {configError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{configError}</div>}

          {editingConfig ? (
            <div>
              {/* Negative marks */}
              <div className="form-group" style={{ maxWidth: 220, marginBottom: 20 }}>
                <label>Negative marks per wrong answer</label>
                <input
                  className="input"
                  type="number"
                  step={0.25}
                  min={0}
                  value={draftNegMarks}
                  onChange={e => setDraftNegMarks(Number(e.target.value))}
                />
              </div>

              {/* Per-section time */}
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                  <label style={{ fontSize: 13, fontWeight: 500 }}>Time per section (minutes)</label>
                  {draftTotal !== contest!.durationMinutes ? (
                    <span style={{ fontSize: 12, color: 'var(--danger)' }}>
                      ⚠ Section total {draftTotal} min ≠ contest duration {contest!.durationMinutes} min
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ Matches total duration</span>
                  )}
                </div>
                <div className="section-limits-grid">
                  {SECTIONS.map(sec => (
                    <div key={sec} className="section-limit-item">
                      <div className="section-limit-label">{SECTION_LABELS[sec]}</div>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        value={draftLimits[sec] ?? ''}
                        onChange={e => setDraftLimits(prev => ({ ...prev, [sec]: Number(e.target.value) }))}
                      />
                      <div className="section-limit-unit">min</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Read-only view */
            <div className="section-config-grid">
              {SECTIONS.map(sec => {
                const limitMins = contest?.sectionLimits?.[sec] ?? Math.floor((contest?.durationMinutes ?? 0) / SECTIONS.length)
                return (
                  <div key={sec} className="section-config-card">
                    <div className="section-config-name">{SECTION_LABELS[sec]}</div>
                    <div className="section-config-stats">
                      <div className="section-stat">
                        <span className="section-stat-val">{limitMins}</span>
                        <span className="section-stat-label">min</span>
                      </div>
                      <div className="section-stat">
                        <span className="section-stat-val">{sectionCounts[sec]}</span>
                        <span className="section-stat-label">questions</span>
                      </div>
                      <div className="section-stat">
                        <span className="section-stat-val" style={{ color: 'var(--danger)' }}>−{Number(contest?.negativeMarks)}</span>
                        <span className="section-stat-label">neg marks</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Add question card ────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
            <button className={`tab-btn ${tab === 'bank' ? 'active' : ''}`} onClick={() => { setTab('bank'); setAddError(''); setCreateError(''); setBulkError(''); setBulkSuccess('') }}>
              Pick from bank {availableBank.length > 0 && `(${availableBank.length})`}
            </button>
            <button className={`tab-btn ${tab === 'create' ? 'active' : ''}`} onClick={() => { setTab('create'); setAddError(''); setCreateError(''); setBulkError(''); setBulkSuccess('') }}>
              Create question
            </button>
            <button className={`tab-btn ${tab === 'bulk' ? 'active' : ''}`} onClick={() => { setTab('bulk'); setAddError(''); setCreateError(''); setBulkError(''); setBulkSuccess('') }}>
              Bulk Import JSON
            </button>
          </div>

          {/* Shared marks row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, width: 120 }}>
              <label>Marks (+)</label>
              <input className="input" type="number" value={marks} onChange={e => setMarks(Number(e.target.value))} step={0.5} min={0} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, width: 160 }}>
              <label>Negative marks (−)</label>
              <input className="input" type="number" value={negMarks} onChange={e => setNegMarks(Number(e.target.value))} step={0.25} min={0} />
            </div>
          </div>

          {tab === 'bank' && (
            <>
              {addError && <div className="alert alert-error">{addError}</div>}
              {availableBank.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                  All bank questions are already added. Switch to <strong>Create new question</strong> to add directly.
                </p>
              ) : (
                <form onSubmit={addFromBank} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Question</label>
                    <select className="input" value={selectedQId} onChange={e => setSelectedQId(e.target.value)} required>
                      <option value="">Select a question...</option>
                      {availableBank.map(q => (
                        <option key={q.id} value={q.id}>
                          [{SECTION_LABELS[q.subject] ?? q.subject}] {q.text.slice(0, 90)}{q.text.length > 90 ? '...' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={adding || !selectedQId} style={{ flexShrink: 0 }}>
                    {adding ? 'Adding...' : 'Add to Contest'}
                  </button>
                </form>
              )}
            </>
          )}

          {tab === 'bulk' && (
            <>
              {bulkError && <div className="alert alert-error">{bulkError}</div>}
              {bulkSuccess && <div className="alert alert-success">{bulkSuccess}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
                  ⬇ Download JSON template
                </button>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                  📂 Load JSON file
                  <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleBulkFile(f) }} />
                </label>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>or paste JSON below</span>
              </div>
              <div className="form-group">
                <label>JSON array of questions</label>
                <textarea
                  className="input"
                  rows={14}
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                  placeholder={BULK_TEMPLATE}
                  value={bulkJson}
                  onChange={e => setBulkJson(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-primary" type="button" disabled={importing || !bulkJson.trim()} onClick={bulkImport}>
                  {importing ? 'Importing...' : 'Import Questions'}
                </button>
                {bulkJson.trim() && (() => {
                  try { const a = JSON.parse(bulkJson); return Array.isArray(a) ? <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{a.length} question{a.length !== 1 ? 's' : ''} detected</span> : null }
                  catch { return <span style={{ fontSize: 13, color: 'var(--danger)' }}>Invalid JSON</span> }
                })()}
              </div>
            </>
          )}

          {tab === 'create' && (
            <>
              {createError && <div className="alert alert-error">{createError}</div>}
              <form onSubmit={createAndAdd}>
                <div className="form-group">
                  <label>Question text</label>
                  <textarea
                    className="input" rows={3}
                    value={newQ.text}
                    onChange={e => setNewQ(q => ({ ...q, text: e.target.value }))}
                    required style={{ resize: 'vertical' }}
                    placeholder="Type the question here..."
                  />
                </div>
                <div className="form-group">
                  <label>Diagram / Image (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="input"
                    style={{ padding: '6px 12px' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f) }}
                  />
                  {newQ.imageUrl && (
                    <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                      <img src={newQ.imageUrl} alt="preview" style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 6, border: '1px solid var(--border)' }} />
                      <button
                        type="button"
                        onClick={() => setNewQ(q => ({ ...q, imageUrl: '' }))}
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 12 }}
                      >✕</button>
                    </div>
                  )}
                </div>
                <div className="form-row">
                  {(['A', 'B', 'C', 'D'] as const).map(opt => (
                    <div className="form-group" key={opt}>
                      <label>Option {opt}</label>
                      <input
                        className="input"
                        value={(newQ as any)[`option${opt}`]}
                        onChange={e => setNewQ(q => ({ ...q, [`option${opt}`]: e.target.value }))}
                        required
                      />
                    </div>
                  ))}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Correct option</label>
                    <select className="input" value={newQ.correctOption} onChange={e => setNewQ(q => ({ ...q, correctOption: e.target.value }))}>
                      {['A', 'B', 'C', 'D'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Subject</label>
                    <select className="input" value={newQ.subject} onChange={e => setNewQ(q => ({ ...q, subject: e.target.value }))}>
                      {SECTIONS.map(s => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Difficulty</label>
                    <select className="input" value={newQ.difficulty} onChange={e => setNewQ(q => ({ ...q, difficulty: e.target.value }))}>
                      {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" type="submit" disabled={creating}>
                  {creating ? 'Creating & adding...' : 'Create & Add to Contest'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* ── Questions in contest ─────────────────────────────────────── */}
        <div className="card">
          <h2 style={{ marginBottom: 14 }}>Questions in Contest ({cqs.length})</h2>
          {cqs.length === 0
            ? <p className="empty">No questions added yet. Use the form above to add some.</p>
            : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Question</th>
                    <th>Subject</th>
                    <th>Difficulty</th>
                    <th>Marks</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cqs.map((cq, i) => (
                    <tr key={cq.questionId}>
                      <td style={{ color: 'var(--text-muted)', width: 36 }}>{i + 1}</td>
                      <td style={{ maxWidth: 360 }}>{cq.question.text}</td>
                      <td style={{ fontSize: 13 }}>{SECTION_LABELS[cq.question.subject] ?? cq.question.subject}</td>
                      <td><span className={`badge badge-${cq.question.difficulty.toLowerCase()}`}>{cq.question.difficulty}</span></td>
                      <td style={{ fontSize: 13 }}>+{cq.marks} / −{cq.negativeMarks}</td>
                      <td>
                        <button className="btn btn-sm btn-danger" onClick={() => removeQuestion(cq.questionId)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </>
  )
}
