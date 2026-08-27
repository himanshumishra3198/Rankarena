import { useEffect, useState } from 'react'
import { useConfirm } from '../components/ConfirmDialog'
import type { FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import QuestionContentTabs, { translationsPayload } from '../components/QuestionContentTabs'
import { RichText, stripHtml } from '../components/RichText'
import { SegmentedRadio } from '../components/SegmentedRadio'
import { TOPICS_BY_SUBJECT } from '../lib/topics'
import type { Contest, Question, ContestQuestion, Section, Passage, QuestionType } from '../lib/types'
import { SECTIONS, SECTION_LABELS } from '../lib/types'

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const
const TYPE_LABELS: Record<string, string> = {
  STANDARD: 'Standard', SYLLOGISM: 'Syllogism', PASSAGE: 'Passage', TABLE: 'Table',
}

const emptyQ = {
  questionType: 'STANDARD' as QuestionType,
  text: '', imageUrl: '',
  optionA: '', optionB: '', optionC: '', optionD: '',
  correctOption: '', subject: 'QUANT', topic: '', difficulty: 'MEDIUM',
  solution: '', passageId: '',
  hi: { text: '', optionA: '', optionB: '', optionC: '', optionD: '', solution: '' },
  statements: ['', '', ''] as string[],
  conclusions: ['', '', ''] as string[],
}

// An option/text counts as filled if it has visible text OR an image.
function hasContent(html: string): boolean {
  return stripHtml(html).length > 0 || /<img/i.test(html || '')
}

function errStr(err: any, fallback: string): string {
  const e = err?.response?.data?.error
  if (typeof e === 'string') return e
  if (Array.isArray(e)) return e.map((i: any) => i?.message).filter(Boolean).join(', ') || fallback
  return fallback
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
  const confirm = useConfirm()
  const navigate = useNavigate()

  const [contest, setContest] = useState<Contest | null>(null)
  const [cqs, setCqs] = useState<ContestQuestion[]>([])
  const [bank, setBank] = useState<Question[]>([])
  const [passages, setPassages] = useState<Passage[]>([])
  const [loading, setLoading] = useState(true)

  // Contest details editing (title / start time / duration)
  const [editingDetails, setEditingDetails] = useState(false)
  const [detailsForm, setDetailsForm] = useState({ title: '', startTime: '', durationMinutes: 60 })
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState('')

  // Section config editing
  const [editingConfig, setEditingConfig] = useState(false)
  const [draftLimits, setDraftLimits] = useState<Record<Section, number>>({ QUANT: 0, REASONING: 0, ENGLISH: 0, GK: 0 })
  const [draftNegMarks, setDraftNegMarks] = useState(0.5)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configError, setConfigError] = useState('')

  // Add question state
  const [tab, setTab] = useState<AddTab>('bank')
  // Subject filter for reviewing the paper section by section.
  const [reviewSubject, setReviewSubject] = useState<string>('')
  const [selectedQId, setSelectedQId] = useState('')
  const [marks, setMarks] = useState(2)
  const [negMarks, setNegMarks] = useState(0.5)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const [newQ, setNewQ] = useState(emptyQ)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [editingQid, setEditingQid] = useState<string | null>(null)
  const [similar, setSimilar] = useState<{ id: string; text: string; subject: string; score: number }[]>([])

  // Bulk import state
  const [bulkJson, setBulkJson] = useState('')
  const [bulkError, setBulkError] = useState('')
  const [bulkSuccess, setBulkSuccess] = useState('')
  const [importing, setImporting] = useState(false)

  async function load() {
    const [contestRes, cqsRes, bankRes, pRes] = await Promise.all([
      api.get(`/contests/${id}`),
      api.get(`/admin/contests/${id}/questions`).catch(() => ({ data: [] })),
      api.get('/admin/questions'),
      api.get('/admin/passages'),
    ])
    const c: Contest = contestRes.data
    setContest(c)
    setCqs(cqsRes.data)
    setBank(bankRes.data.questions)
    setPassages(pRes.data)
    // seed draft config from current values
    const limits = c.sectionLimits ?? Object.fromEntries(
      SECTIONS.map(s => [s, Math.floor(c.durationMinutes / SECTIONS.length)])
    ) as Record<Section, number>
    setDraftLimits(limits as Record<Section, number>)
    setDraftNegMarks(Number(c.negativeMarks))
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  // Debounced near-duplicate check while creating (not editing).
  useEffect(() => {
    if (tab !== 'create') { setSimilar([]); return }
    const t = stripHtml(newQ.text).trim()
    if (t.length < 8) { setSimilar([]); return }
    const h = setTimeout(async () => {
      try {
        const res = await api.get('/admin/questions/similar', { params: { text: t, subject: newQ.subject } })
        setSimilar((res.data as any[]).filter(s => s.id !== editingQid))
      } catch { setSimilar([]) }
    }, 500)
    return () => clearTimeout(h)
  }, [newQ.text, newQ.subject, tab, editingQid])

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

  // ── Contest details (title / start time / duration) ───────────────────
  // Convert a stored ISO timestamp to the value a <input type="datetime-local"> wants (local time).
  function toLocalInput(iso: string): string {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  function openEditDetails() {
    if (!contest) return
    setDetailsForm({
      title: contest.title,
      startTime: toLocalInput(contest.startTime),
      durationMinutes: contest.durationMinutes,
    })
    setDetailsError('')
    setEditingDetails(true)
  }
  async function saveDetails(e: FormEvent) {
    e.preventDefault()
    if (!detailsForm.title.trim()) { setDetailsError('Title is required.'); return }
    if (!detailsForm.startTime) { setDetailsError('Start time is required.'); return }
    setSavingDetails(true); setDetailsError('')
    try {
      await api.put(`/admin/contests/${id}`, {
        title: detailsForm.title.trim(),
        startTime: new Date(detailsForm.startTime).toISOString(),
        durationMinutes: Number(detailsForm.durationMinutes),
      })
      setEditingDetails(false)
      load()
    } catch (err: any) {
      const msg = err?.response?.data?.error
      setDetailsError(typeof msg === 'string' ? msg : 'Failed to update contest — check the values and try again.')
    } finally {
      setSavingDetails(false)
    }
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

  function resetForm() { setNewQ(emptyQ); setEditingQid(null); setSimilar([]); setCreateError('') }

  // Load an existing (linked) question into the form for editing.
  function editQuestion(q: Question) {
    setNewQ({
      questionType: q.questionType,
      text: q.text, imageUrl: q.imageUrl ?? '',
      optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
      correctOption: q.correctOption,
      subject: q.subject,
      topic: q.topic ?? '',
      difficulty: q.difficulty,
      solution: q.solution ?? '',
      hi: (() => {
        const t = q.translations?.find(x => x.language === 'HI')
        return {
          text: t?.text ?? '', optionA: t?.optionA ?? '', optionB: t?.optionB ?? '',
          optionC: t?.optionC ?? '', optionD: t?.optionD ?? '', solution: t?.solution ?? '',
        }
      })(),
      passageId: q.passageId ?? '',
      statements: q.structuredData?.statements?.length ? q.structuredData.statements : ['', '', ''],
      conclusions: q.structuredData?.conclusions?.length ? q.structuredData.conclusions : ['', '', ''],
    })
    setEditingQid(q.id); setCreateError(''); setSimilar([])
    setTab('create')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Create-or-update a question (all types). On create, also link it to the contest.
  async function createAndAdd(e: FormEvent) {
    e.preventDefault()
    const isSyll = newQ.questionType === 'SYLLOGISM'
    const needsPassage = newQ.questionType === 'PASSAGE' || newQ.questionType === 'TABLE'
    if (!isSyll && !hasContent(newQ.text)) { setCreateError('Question text is required.'); return }
    if ((['A', 'B', 'C', 'D'] as const).some(o => !hasContent(newQ[`option${o}` as keyof typeof emptyQ] as string))) {
      setCreateError('All four options are required (text or image).'); return
    }
    if (!newQ.correctOption) { setCreateError('Select the correct option.'); return }
    if (needsPassage && !newQ.passageId) { setCreateError('Select a passage/table for this question (create it in the Questions tab first).'); return }

    setCreating(true); setCreateError('')
    const payload: any = {
      questionType: newQ.questionType,
      text: newQ.text,
      imageUrl: newQ.imageUrl || null,
      optionA: newQ.optionA, optionB: newQ.optionB, optionC: newQ.optionC, optionD: newQ.optionD,
      correctOption: newQ.correctOption,
      subject: newQ.subject,
      topic: newQ.topic || null,
      difficulty: newQ.difficulty,
      solution: hasContent(newQ.solution) ? newQ.solution : null,
      translations: translationsPayload(newQ.hi),
      passageId: needsPassage ? newQ.passageId : null,
      structuredData: isSyll
        ? { statements: newQ.statements.filter(s => stripHtml(s)), conclusions: newQ.conclusions.filter(c => stripHtml(c)) }
        : null,
    }
    try {
      if (editingQid) {
        await api.put(`/admin/questions/${editingQid}`, payload)
      } else {
        const qRes = await api.post('/admin/questions', payload)
        await api.post(`/admin/contests/${id}/questions`, {
          questionId: qRes.data.id,
          displayOrder: cqs.length + 1,
          marks: Number(marks),
          negativeMarks: Number(negMarks),
        })
      }
      resetForm(); load()
    } catch (err: any) {
      const dup = err?.response?.data?.duplicate
      if (err?.response?.status === 409 && dup) {
        setCreateError(`This question already exists in the bank — not added again. ("${stripHtml(dup.text).slice(0, 70)}…")`)
      } else {
        setCreateError(errStr(err, 'Failed to save question'))
      }
    } finally {
      setCreating(false)
    }
  }

  async function uploadImage(file: File) {
    setUploading(true); setCreateError('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post('/admin/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setNewQ(f => ({ ...f, imageUrl: res.data.url }))
    } catch (err: any) {
      setCreateError(errStr(err, 'Image upload failed'))
    } finally { setUploading(false) }
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
      const skipped = res.data.skipped ?? 0
      setBulkSuccess(
        `Imported ${res.data.created} question${res.data.created !== 1 ? 's' : ''} successfully!` +
        (skipped > 0 ? ` (${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped)` : '')
      )
      setBulkJson('')
      load()
    } catch (err: any) {
      const msg = err.response?.data?.error
      setBulkError(typeof msg === 'string' ? msg : 'Import failed — check your JSON matches the template.')
    } finally {
      setImporting(false)
    }
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
    if (!(await confirm({
      title: 'Remove this question?',
      message: 'It is taken out of this contest but stays in the question bank.',
      confirmLabel: 'Remove',
      danger: true,
    }))) return
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

  const visibleCqs = reviewSubject
    ? cqs.filter(cq => cq.question.subject === reviewSubject)
    : cqs

  return (
    <>
      <Navbar />
      <div className="page">
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Back to Contests</button>
        </div>

        {/* ── Contest details (title / start / duration) ───────────────── */}
        {contest && !editingDetails && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ marginBottom: 4 }}>{contest.title}</h1>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {new Date(contest.startTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                &nbsp;·&nbsp; {contest.durationMinutes} min &nbsp;·&nbsp; −{Number(contest.negativeMarks)} negative
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={openEditDetails} style={{ flexShrink: 0 }}>✎ Edit details</button>
          </div>
        )}

        {contest && editingDetails && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginBottom: 14 }}>Edit Contest</h2>
            {detailsError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{detailsError}</div>}
            <form onSubmit={saveDetails}>
              <div className="form-group">
                <label>Title</label>
                <input className="input" value={detailsForm.title} required
                  onChange={e => setDetailsForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Start Time</label>
                  <input className="input" type="datetime-local" value={detailsForm.startTime} required
                    onChange={e => setDetailsForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Duration (minutes)</label>
                  <input className="input" type="number" min={1} value={detailsForm.durationMinutes}
                    onChange={e => setDetailsForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))} />
                </div>
              </div>
              {contest.status !== 'SCHEDULED' && (
                <p style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 12 }}>
                  ⚠ This contest is {contest.status.toLowerCase()} — changing the time or duration affects participants mid-flight.
                </p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" type="submit" disabled={savingDetails}>
                  {savingDetails ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => { setEditingDetails(false); setDetailsError('') }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* ── Live contest timer ───────────────────────────────────────── */}
        {contest && !editingDetails && <ContestTimer contest={contest} />}

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
            <button className={`tab-btn ${tab === 'create' ? 'active' : ''}`} onClick={() => { setTab('create'); resetForm(); setAddError(''); setBulkError(''); setBulkSuccess('') }}>
              {editingQid ? '✎ Editing question' : 'Create question'}
            </button>
            <button className={`tab-btn ${tab === 'bulk' ? 'active' : ''}`} onClick={() => { setTab('bulk'); setAddError(''); setCreateError(''); setBulkError(''); setBulkSuccess('') }}>
              Bulk Import JSON
            </button>
          </div>

          {/* Shared marks row — applies when adding a question (not when editing an existing one) */}
          {!(tab === 'create' && editingQid) && tab !== 'bulk' && (
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
          )}

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
                      {availableBank.map(q => {
                        const label = stripHtml(q.text) || q.passage?.title || 'question'
                        return (
                          <option key={q.id} value={q.id}>
                            [{TYPE_LABELS[q.questionType] ?? SECTION_LABELS[q.subject] ?? q.subject}] {label.slice(0, 90)}{label.length > 90 ? '...' : ''}
                          </option>
                        )
                      })}
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
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                  {editingQid
                    ? 'Editing this question updates it everywhere it is used.'
                    : 'Creates a question in the bank and adds it to this contest.'}
                </p>

                {/* Question type selector */}
                <div className="form-group">
                  <label>Question Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 4 }}>
                    {(['STANDARD', 'SYLLOGISM', 'PASSAGE', 'TABLE'] as QuestionType[]).map(t => (
                      <label key={t} style={{
                        border: `2px solid ${newQ.questionType === t ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 8, padding: '8px 10px', cursor: 'pointer', textAlign: 'center',
                        background: newQ.questionType === t ? 'var(--primary-light)' : 'var(--surface)',
                        fontSize: 13, fontWeight: 600,
                        color: newQ.questionType === t ? 'var(--primary)' : 'var(--heading)',
                      }}>
                        <input type="radio" style={{ display: 'none' }} checked={newQ.questionType === t}
                          onChange={() => setNewQ(f => ({ ...f, questionType: t }))} />
                        {TYPE_LABELS[t]}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Passage/Table selector */}
                {(newQ.questionType === 'PASSAGE' || newQ.questionType === 'TABLE') && (
                  <div className="form-group">
                    <label>Link to Passage / Table</label>
                    {passages.filter(p => newQ.questionType === 'TABLE' ? p.type === 'TABLE' : p.type === 'TEXT').length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        No {newQ.questionType === 'TABLE' ? 'tables' : 'passages'} yet — create one in the Questions tab first.
                      </p>
                    ) : (
                      <select className="input" value={newQ.passageId}
                        onChange={e => setNewQ(f => ({ ...f, passageId: e.target.value }))} required>
                        <option value="">-- Select --</option>
                        {passages.filter(p => newQ.questionType === 'TABLE' ? p.type === 'TABLE' : p.type === 'TEXT').map(p => (
                          <option key={p.id} value={p.id}>{p.type === 'TABLE' ? '📊' : '📄'} {p.title || stripHtml(p.content).slice(0, 60)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Syllogism statements / conclusions */}
                {newQ.questionType === 'SYLLOGISM' && (
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Statements</div>
                    {newQ.statements.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, minWidth: 18 }}>{i + 1}.</span>
                        <input className="input" style={{ flex: 1 }} value={s} placeholder={`Statement ${i + 1}`}
                          onChange={e => setNewQ(f => { const st = [...f.statements]; st[i] = e.target.value; return { ...f, statements: st } })} />
                        {newQ.statements.length > 1 && (
                          <button type="button" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
                            onClick={() => setNewQ(f => ({ ...f, statements: f.statements.filter((_, j) => j !== i) }))}>×</button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNewQ(f => ({ ...f, statements: [...f.statements, ''] }))}>+ Statement</button>

                    <div style={{ fontWeight: 600, margin: '14px 0 10px', fontSize: 14 }}>Conclusions</div>
                    {newQ.conclusions.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, minWidth: 22 }}>{['I.', 'II.', 'III.', 'IV.'][i] ?? `${i + 1}.`}</span>
                        <input className="input" style={{ flex: 1 }} value={c} placeholder={`Conclusion ${i + 1}`}
                          onChange={e => setNewQ(f => { const cs = [...f.conclusions]; cs[i] = e.target.value; return { ...f, conclusions: cs } })} />
                        {newQ.conclusions.length > 1 && (
                          <button type="button" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
                            onClick={() => setNewQ(f => ({ ...f, conclusions: f.conclusions.filter((_, j) => j !== i) }))}>×</button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNewQ(f => ({ ...f, conclusions: [...f.conclusions, ''] }))}>+ Conclusion</button>
                  </div>
                )}

                {/* Shared with the question bank and the mock form, so a
                    question can be written in Hindi from anywhere it can be
                    written at all. */}
                <QuestionContentTabs
                  value={newQ}
                  onChange={patch => setNewQ(f => ({ ...f, ...patch }))}
                  textLabel={newQ.questionType === 'SYLLOGISM' ? 'Question / Direction Text' : 'Question Text'}
                />

                {/* Near-duplicate warning */}
                {!editingQid && similar.length > 0 && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                      ⚠ {similar.length} similar question{similar.length !== 1 ? 's' : ''} already exist — avoid duplicates
                    </div>
                    {similar.map(s => (
                      <div key={s.id} style={{ fontSize: 12, color: '#78350f', display: 'flex', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 11, background: '#fde68a', color: '#92400e', padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>{s.score}%</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Optional image */}
                <div className="form-group">
                  <label>Question Image <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label className="btn btn-ghost btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer', margin: 0 }}>
                      {uploading ? 'Uploading…' : newQ.imageUrl ? '🖼 Replace Image' : '📷 Upload Image'}
                      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{ display: 'none' }}
                        disabled={uploading}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }} />
                    </label>
                    {newQ.imageUrl && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img src={newQ.imageUrl} alt="Question" style={{ height: 48, borderRadius: 6, border: '1px solid var(--border)' }} />
                        <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                          onClick={() => setNewQ(f => ({ ...f, imageUrl: '' }))}>Remove</button>
                      </div>
                    )}
                  </div>
                </div>


                <div className="form-group">
                  <label>Correct Option <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <SegmentedRadio value={newQ.correctOption}
                    options={['A', 'B', 'C', 'D'].map(o => ({ value: o, label: o }))}
                    onChange={v => setNewQ(f => ({ ...f, correctOption: v }))} />
                </div>
                <div className="form-group">
                  <label>Subject</label>
                  <SegmentedRadio value={newQ.subject}
                    options={SECTIONS.map(s => ({ value: s as string, label: SECTION_LABELS[s] }))}
                    onChange={v => setNewQ(f => ({
                      ...f,
                      subject: v,
                      // Topics are subject-scoped, so a subject change drops a
                      // tag that no longer applies.
                      topic: TOPICS_BY_SUBJECT[v as keyof typeof TOPICS_BY_SUBJECT]?.includes(f.topic) ? f.topic : '',
                    }))} />
                </div>
                <div className="form-group">
                  <label>Difficulty</label>
                  <SegmentedRadio value={newQ.difficulty}
                    options={DIFFICULTIES.map(d => ({ value: d as string, label: d }))}
                    onChange={v => setNewQ(f => ({ ...f, difficulty: v }))} />
                </div>
                <div className="form-group">
                  <label>Topic <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                  <select className="input" value={newQ.topic}
                    onChange={e => setNewQ(f => ({ ...f, topic: e.target.value }))}>
                    <option value="">— No topic —</option>
                    {(TOPICS_BY_SUBJECT[newQ.subject as keyof typeof TOPICS_BY_SUBJECT] ?? []).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>


                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" type="submit" disabled={creating}>
                    {creating ? 'Saving…' : editingQid ? 'Update Question' : 'Create & Add to Contest'}
                  </button>
                  {editingQid && (
                    <button type="button" className="btn btn-ghost" onClick={resetForm}>Cancel edit</button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>

        {/* ── Questions in contest ─────────────────────────────────────── */}
        <div className="card">
          <div className="cq-head">
            <h2 style={{ margin: 0 }}>
              Questions in Contest ({reviewSubject ? `${visibleCqs.length} of ${cqs.length}` : cqs.length})
            </h2>
            {cqs.length > 0 && (
              <div className="cq-filters">
                <button className={`cq-chip ${reviewSubject === '' ? 'active' : ''}`}
                  onClick={() => setReviewSubject('')}>
                  All ({cqs.length})
                </button>
                {SECTIONS.map(sec => {
                  const n = cqs.filter(c => c.question.subject === sec).length
                  return (
                    <button key={sec} disabled={n === 0}
                      className={`cq-chip ${reviewSubject === sec ? 'active' : ''}`}
                      onClick={() => setReviewSubject(sec)}>
                      {SECTION_LABELS[sec]} ({n})
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {cqs.length === 0
            ? <p className="empty">No questions added yet. Use the form above to add some.</p>
            : visibleCqs.length === 0
            ? <p className="empty">No {SECTION_LABELS[reviewSubject as keyof typeof SECTION_LABELS] ?? ''} questions in this contest.</p>
            : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Question</th>
                    <th>Type</th>
                    <th>Subject</th>
                    <th>Difficulty</th>
                    <th>Marks</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCqs.map((cq) => (
                    <tr key={cq.questionId}>
                      <td style={{ color: 'var(--text-muted)', width: 36 }}>
                        {cqs.findIndex(c => c.questionId === cq.questionId) + 1}
                      </td>
                      <td style={{ maxWidth: 360 }}>
                        {cq.question.passage && (
                          <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginBottom: 2 }}>
                            {cq.question.passage.type === 'TABLE' ? '📊' : '📄'} {cq.question.passage.title || 'Passage'}
                          </div>
                        )}
                        <div style={{ fontWeight: 500 }}>
                          {(stripHtml(cq.question.text) || /<img/i.test(cq.question.text))
                            ? <RichText html={cq.question.text} />
                            : <em style={{ color: 'var(--text-muted)' }}>(syllogism)</em>}
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>{TYPE_LABELS[cq.question.questionType] ?? 'Standard'}</td>
                      <td style={{ fontSize: 13 }}>{SECTION_LABELS[cq.question.subject] ?? cq.question.subject}</td>
                      <td><span className={`badge badge-${cq.question.difficulty.toLowerCase()}`}>{cq.question.difficulty}</span></td>
                      <td style={{ fontSize: 13 }}>+{cq.marks} / −{cq.negativeMarks}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => editQuestion(cq.question)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => removeQuestion(cq.questionId)}>Remove</button>
                        </div>
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
