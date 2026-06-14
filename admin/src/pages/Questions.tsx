import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import type { Question, Passage, QuestionType } from '../lib/types'

const SUBJECTS = ['QUANT', 'REASONING', 'ENGLISH', 'GK'] as const
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const
const SUBJECT_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude', REASONING: 'Logical Reasoning',
  ENGLISH: 'English Language', GK: 'General Knowledge',
}
const TYPE_LABELS: Record<QuestionType, string> = {
  STANDARD: 'Standard MCQ',
  SYLLOGISM: 'Syllogism / Logic',
  PASSAGE: 'Passage-based',
  TABLE: 'Table-based',
}
const TYPE_DESCRIPTIONS: Record<QuestionType, string> = {
  STANDARD: 'Regular question with text and 4 options',
  SYLLOGISM: 'Statements + Conclusions in bold format',
  PASSAGE: 'Question linked to a reading passage',
  TABLE: 'Question linked to a data table',
}

const emptyForm = {
  questionType: 'STANDARD' as QuestionType,
  text: '',
  imageUrl: '',
  optionA: '', optionB: '', optionC: '', optionD: '',
  correctOption: 'A' as Question['correctOption'],
  subject: 'REASONING' as Question['subject'],
  difficulty: 'MEDIUM' as Question['difficulty'],
  passageId: '',
  // Syllogism fields
  statements: ['', '', ''],
  conclusions: ['', '', ''],
}

const emptyPassageForm = {
  title: '',
  content: '',
  type: 'TEXT' as Passage['type'],
  headers: [''],
  rows: [['']],
}

// ── Table builder helpers ─────────────────────────────────────────────────────
function TableBuilder({ headers, rows, onChange }: {
  headers: string[]; rows: string[][]
  onChange: (h: string[], r: string[][]) => void
}) {
  function setHeader(i: number, v: string) {
    const h = [...headers]; h[i] = v; onChange(h, rows)
  }
  function addCol() {
    onChange([...headers, ''], rows.map(r => [...r, '']))
  }
  function removeCol(i: number) {
    if (headers.length <= 1) return
    onChange(headers.filter((_, j) => j !== i), rows.map(r => r.filter((_, j) => j !== i)))
  }
  function setCell(ri: number, ci: number, v: string) {
    const r = rows.map(row => [...row]); r[ri][ci] = v; onChange(headers, r)
  }
  function addRow() {
    onChange(headers, [...rows, headers.map(() => '')])
  }
  function removeRow(i: number) {
    if (rows.length <= 1) return
    onChange(headers, rows.filter((_, j) => j !== i))
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ border: '1px solid var(--border)', padding: '4px 8px', background: 'var(--bg)' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input className="input" value={h} onChange={e => setHeader(i, e.target.value)}
                    placeholder={`Col ${i + 1}`} style={{ fontSize: 12, padding: '2px 6px' }} />
                  <button type="button" onClick={() => removeCol(i)}
                    style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              </th>
            ))}
            <th style={{ border: '1px solid var(--border)', padding: 4 }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={addCol}>+ Col</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ border: '1px solid var(--border)', padding: 4 }}>
                  <input className="input" value={cell} onChange={e => setCell(ri, ci, e.target.value)}
                    style={{ fontSize: 12, padding: '2px 6px' }} />
                </td>
              ))}
              <td style={{ border: '1px solid var(--border)', padding: 4 }}>
                <button type="button" onClick={() => removeRow(ri)}
                  style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={addRow}>+ Row</button>
    </div>
  )
}

// ── Preview components ────────────────────────────────────────────────────────
function PassagePreview({ passage }: { passage: Passage }) {
  if (passage.type === 'TABLE' && passage.tableData) {
    const { headers, rows } = passage.tableData
    return (
      <div style={{ background: 'var(--bg)', borderRadius: 6, padding: 12, fontSize: 13 }}>
        {passage.title && <div style={{ fontWeight: 600, marginBottom: 8 }}>{passage.title}</div>}
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>{headers.map((h, i) => (
              <th key={i} style={{ border: '1px solid var(--border)', padding: '4px 10px', background: 'var(--surface-raised)', fontWeight: 600 }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => (
                <td key={j} style={{ border: '1px solid var(--border)', padding: '4px 10px', textAlign: 'center' }}>{cell}</td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 6, padding: 12, fontSize: 13, lineHeight: 1.7 }}>
      {passage.title && <div style={{ fontWeight: 600, marginBottom: 8 }}>{passage.title}</div>}
      <div style={{ whiteSpace: 'pre-wrap' }}>{passage.content}</div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Questions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [passages, setPassages] = useState<Passage[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'questions' | 'passages'>('questions')
  const [showForm, setShowForm] = useState(false)
  const [showPassageForm, setShowPassageForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [passageForm, setPassageForm] = useState(emptyPassageForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [filterSubject, setFilterSubject] = useState('')
  const [filterType, setFilterType] = useState('')

  async function handleImageUpload(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post('/admin/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setForm(f => ({ ...f, imageUrl: res.data.url }))
    } catch (err: any) {
      setError(errMsg(err, 'Image upload failed'))
    } finally { setUploading(false) }
  }

  // Backend may return `error` as a string OR a Zod issues array — normalise to a string.
  function errMsg(err: any, fallback: string): string {
    const e = err?.response?.data?.error
    if (typeof e === 'string') return e
    if (Array.isArray(e)) return e.map((i: any) => i?.message).filter(Boolean).join(', ') || fallback
    return fallback
  }

  function set<K extends keyof typeof emptyForm>(field: K, value: typeof emptyForm[K]) {
    setForm(f => ({ ...f, [field]: value }))
  }
  function setStatement(i: number, v: string) {
    const s = [...form.statements]; s[i] = v; set('statements', s as any)
  }
  function setConclusion(i: number, v: string) {
    const c = [...form.conclusions]; c[i] = v; set('conclusions', c as any)
  }
  function addStatement() { set('statements', [...form.statements, ''] as any) }
  function addConclusion() { set('conclusions', [...form.conclusions, ''] as any) }
  function removeStatement(i: number) {
    set('statements', form.statements.filter((_, j) => j !== i) as any)
  }
  function removeConclusion(i: number) {
    set('conclusions', form.conclusions.filter((_, j) => j !== i) as any)
  }

  async function load() {
    const [qRes, pRes] = await Promise.all([
      api.get('/admin/questions', {
        params: {
          ...(filterSubject ? { subject: filterSubject } : {}),
          ...(filterType ? { questionType: filterType } : {}),
        }
      }),
      api.get('/admin/passages'),
    ])
    setQuestions(qRes.data)
    setPassages(pRes.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterSubject, filterType])

  async function saveQuestion(e: FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload: any = {
        questionType: form.questionType,
        text: form.text,
        imageUrl: form.imageUrl || null,
        optionA: form.optionA, optionB: form.optionB,
        optionC: form.optionC, optionD: form.optionD,
        correctOption: form.correctOption,
        subject: form.subject,
        difficulty: form.difficulty,
        passageId: (form.questionType === 'PASSAGE' || form.questionType === 'TABLE') && form.passageId
          ? form.passageId : null,
        structuredData: form.questionType === 'SYLLOGISM'
          ? { statements: form.statements.filter(Boolean), conclusions: form.conclusions.filter(Boolean) }
          : null,
      }
      await api.post('/admin/questions', payload)
      setForm(emptyForm); setShowForm(false); load()
    } catch (err: any) {
      setError(errMsg(err, 'Failed to save question'))
    } finally { setSaving(false) }
  }

  async function savePassage(e: FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload: any = {
        title: passageForm.title,
        content: passageForm.content,
        type: passageForm.type,
        tableData: passageForm.type === 'TABLE'
          ? { headers: passageForm.headers, rows: passageForm.rows }
          : null,
      }
      await api.post('/admin/passages', payload)
      setPassageForm(emptyPassageForm); setShowPassageForm(false); load()
    } catch (err: any) {
      setError(errMsg(err, 'Failed to save passage'))
    } finally { setSaving(false) }
  }

  async function deleteQuestion(id: string) {
    if (!window.confirm('Delete this question?')) return
    await api.delete(`/admin/questions/${id}`); load()
  }
  async function deletePassage(id: string) {
    if (!window.confirm('Delete this passage? All linked questions will be unlinked.')) return
    await api.delete(`/admin/passages/${id}`); load()
  }

  const passageMap = Object.fromEntries(passages.map(p => [p.id, p]))

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="page-header">
          <h1>Question Bank</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setShowPassageForm(v => !v); setShowForm(false) }}>
              {showPassageForm ? 'Cancel' : '+ Passage / Table'}
            </button>
            <button className="btn btn-primary" onClick={() => { setShowForm(v => !v); setShowPassageForm(false) }}>
              {showForm ? 'Cancel' : '+ Add Question'}
            </button>
          </div>
        </div>

        {/* ── Passage form ───────────────────────────────────────────────── */}
        {showPassageForm && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 16 }}>Add Passage / Table</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={savePassage}>
              <div className="form-row">
                <div className="form-group">
                  <label>Type</label>
                  <select className="input" value={passageForm.type}
                    onChange={e => setPassageForm(f => ({ ...f, type: e.target.value as any }))}>
                    <option value="TEXT">Reading Passage</option>
                    <option value="TABLE">Data Table</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Title / Description (shown above the passage)</label>
                  <input className="input" value={passageForm.title} placeholder="e.g. Q 66-70 refer to the following table..."
                    onChange={e => setPassageForm(f => ({ ...f, title: e.target.value }))} />
                </div>
              </div>
              {passageForm.type === 'TEXT' ? (
                <div className="form-group">
                  <label>Passage Text</label>
                  <textarea className="input" rows={6} value={passageForm.content}
                    onChange={e => setPassageForm(f => ({ ...f, content: e.target.value }))}
                    required style={{ resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              ) : (
                <div className="form-group">
                  <label>Table Data</label>
                  <div className="form-group">
                    <label style={{ fontSize: 12 }}>Short description (optional)</label>
                    <input className="input" value={passageForm.content}
                      onChange={e => setPassageForm(f => ({ ...f, content: e.target.value }))}
                      placeholder="e.g. The following table shows total candidates and present candidates..." />
                  </div>
                  <TableBuilder
                    headers={passageForm.headers}
                    rows={passageForm.rows}
                    onChange={(h, r) => setPassageForm(f => ({ ...f, headers: h, rows: r }))}
                  />
                </div>
              )}
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Passage'}
              </button>
            </form>
          </div>
        )}

        {/* ── Question form ──────────────────────────────────────────────── */}
        {showForm && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 16 }}>Add Question</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={saveQuestion}>

              {/* Question type selector */}
              <div className="form-group">
                <label>Question Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 4 }}>
                  {(['STANDARD', 'SYLLOGISM', 'PASSAGE', 'TABLE'] as QuestionType[]).map(t => (
                    <label key={t} style={{
                      border: `2px solid ${form.questionType === t ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                      background: form.questionType === t ? 'var(--primary-light)' : 'var(--surface)',
                      transition: 'all .15s',
                    }}>
                      <input type="radio" style={{ display: 'none' }} value={t}
                        checked={form.questionType === t} onChange={() => set('questionType', t)} />
                      <div style={{ fontWeight: 600, fontSize: 13, color: form.questionType === t ? 'var(--primary)' : 'var(--heading)' }}>
                        {TYPE_LABELS[t]}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{TYPE_DESCRIPTIONS[t]}</div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Passage/Table selector */}
              {(form.questionType === 'PASSAGE' || form.questionType === 'TABLE') && (
                <div className="form-group">
                  <label>Link to Passage / Table</label>
                  {passages.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      No passages yet. Create one first using "+ Passage / Table" above.
                    </p>
                  ) : (
                    <select className="input" value={form.passageId}
                      onChange={e => set('passageId', e.target.value)} required>
                      <option value="">-- Select a passage --</option>
                      {passages
                        .filter(p => form.questionType === 'TABLE' ? p.type === 'TABLE' : p.type === 'TEXT')
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.type === 'TABLE' ? '📊' : '📄'} {p.title || p.content.slice(0, 60)}
                          </option>
                        ))}
                    </select>
                  )}
                  {form.passageId && passageMap[form.passageId] && (
                    <div style={{ marginTop: 8 }}>
                      <PassagePreview passage={passageMap[form.passageId]} />
                    </div>
                  )}
                </div>
              )}

              {/* Syllogism structured input */}
              {form.questionType === 'SYLLOGISM' && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Statements (bold in exam)</div>
                  {form.statements.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, minWidth: 20 }}>{i + 1}.</span>
                      <input className="input" style={{ flex: 1 }} value={s}
                        placeholder={`Statement ${i + 1}`}
                        onChange={e => setStatement(i, e.target.value)} />
                      {form.statements.length > 1 && (
                        <button type="button" onClick={() => removeStatement(i)}
                          style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={addStatement}>+ Statement</button>

                  <div style={{ fontWeight: 600, margin: '16px 0 12px', fontSize: 14 }}>Conclusions (bold in exam)</div>
                  {form.conclusions.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, minWidth: 20 }}>
                        {['I.', 'II.', 'III.', 'IV.'][i] ?? `${i + 1}.`}
                      </span>
                      <input className="input" style={{ flex: 1 }} value={c}
                        placeholder={`Conclusion ${i + 1}`}
                        onChange={e => setConclusion(i, e.target.value)} />
                      {form.conclusions.length > 1 && (
                        <button type="button" onClick={() => removeConclusion(i)}
                          style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={addConclusion}>+ Conclusion</button>
                </div>
              )}

              {/* Question text */}
              <div className="form-group">
                <label>
                  {form.questionType === 'SYLLOGISM'
                    ? 'Question / Direction Text (appears after statements & conclusions)'
                    : 'Question Text'}
                </label>
                <textarea className="input" rows={form.questionType === 'SYLLOGISM' ? 2 : 3}
                  value={form.text} onChange={e => set('text', e.target.value)}
                  required={form.questionType !== 'SYLLOGISM'}
                  placeholder={form.questionType === 'SYLLOGISM' ? 'Which conclusion(s) follow? (or leave blank)' : ''}
                  style={{ resize: 'vertical' }} />
              </div>

              {/* Question image (optional) */}
              <div className="form-group">
                <label>Question Image <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional — diagrams, figures)</span></label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer', margin: 0 }}>
                    {uploading ? 'Uploading…' : form.imageUrl ? '🖼 Replace Image' : '📷 Upload Image'}
                    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp"
                      style={{ display: 'none' }} disabled={uploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }} />
                  </label>
                  {form.imageUrl && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img src={form.imageUrl} alt="Question"
                        style={{ height: 56, borderRadius: 6, border: '1px solid var(--border)' }} />
                      <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                        onClick={() => set('imageUrl', '')}>Remove</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Options */}
              <div className="form-row">
                {(['A', 'B', 'C', 'D'] as const).map(opt => (
                  <div className="form-group" key={opt}>
                    <label>Option {opt}</label>
                    <input className="input"
                      value={form[`option${opt}` as keyof typeof emptyForm] as string}
                      onChange={e => set(`option${opt}` as any, e.target.value)} required />
                  </div>
                ))}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Correct Option</label>
                  <select className="input" value={form.correctOption}
                    onChange={e => set('correctOption', e.target.value as any)}>
                    {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Subject</label>
                  <select className="input" value={form.subject}
                    onChange={e => set('subject', e.target.value as any)}>
                    {SUBJECTS.map(s => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Difficulty</label>
                  <select className="input" value={form.difficulty}
                    onChange={e => set('difficulty', e.target.value as any)}>
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Question'}
              </button>
            </form>
          </div>
        )}

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {(['questions', 'passages'] as const).map(t => (
            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
              {t} {t === 'questions' ? `(${questions.length})` : `(${passages.length})`}
            </button>
          ))}
        </div>

        {/* ── Questions list ─────────────────────────────────────────────── */}
        {tab === 'questions' && (
          <div className="card">
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="input" style={{ width: 'auto' }} value={filterSubject}
                onChange={e => setFilterSubject(e.target.value)}>
                <option value="">All subjects</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
              </select>
              <select className="input" style={{ width: 'auto' }} value={filterType}
                onChange={e => setFilterType(e.target.value)}>
                <option value="">All types</option>
                {(['STANDARD', 'SYLLOGISM', 'PASSAGE', 'TABLE'] as QuestionType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{questions.length} questions</span>
            </div>

            {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
            {!loading && questions.length === 0 && <p className="empty">No questions yet.</p>}
            {questions.length > 0 && (
              <table>
                <thead>
                  <tr><th>#</th><th>Question</th><th>Type</th><th>Subject</th><th>Diff</th><th>Ans</th><th></th></tr>
                </thead>
                <tbody>
                  {questions.map((q, i) => (
                    <tr key={q.id}>
                      <td style={{ color: 'var(--text-muted)', width: 36 }}>{i + 1}</td>
                      <td style={{ maxWidth: 380 }}>
                        {q.passage && (
                          <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginBottom: 4 }}>
                            {q.passage.type === 'TABLE' ? '📊' : '📄'} {q.passage.title || 'Passage'}
                          </div>
                        )}
                        {q.questionType === 'SYLLOGISM' && q.structuredData && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                            <strong>Statements:</strong> {q.structuredData.statements.slice(0, 2).join(' / ')}
                          </div>
                        )}
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>
                          {q.text || <em style={{ color: 'var(--text-muted)' }}>(syllogism question)</em>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          A: {q.optionA} · B: {q.optionB} · C: {q.optionC} · D: {q.optionD}
                        </div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                          background: q.questionType === 'STANDARD' ? 'var(--bg)' :
                            q.questionType === 'SYLLOGISM' ? '#ede9fe' :
                            q.questionType === 'PASSAGE' ? '#dbeafe' : '#dcfce7',
                          color: q.questionType === 'STANDARD' ? 'var(--text-muted)' :
                            q.questionType === 'SYLLOGISM' ? '#7c3aed' :
                            q.questionType === 'PASSAGE' ? '#2563eb' : '#16a34a',
                        }}>{TYPE_LABELS[q.questionType]}</span>
                      </td>
                      <td style={{ fontSize: 13 }}>{SUBJECT_LABELS[q.subject]}</td>
                      <td><span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span></td>
                      <td style={{ fontWeight: 700, color: 'var(--success)' }}>{q.correctOption}</td>
                      <td>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteQuestion(q.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Passages list ─────────────────────────────────────────────── */}
        {tab === 'passages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
            {!loading && passages.length === 0 && (
              <div className="card"><p className="empty">No passages yet. Click "+ Passage / Table" to add one.</p></div>
            )}
            {passages.map(p => (
              <div key={p.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, marginRight: 8,
                      background: p.type === 'TABLE' ? '#dcfce7' : '#dbeafe',
                      color: p.type === 'TABLE' ? '#16a34a' : '#2563eb',
                    }}>{p.type === 'TABLE' ? '📊 Table' : '📄 Passage'}</span>
                    <span style={{ fontWeight: 600 }}>{p.title || '(untitled)'}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                      {questions.filter(q => q.passageId === p.id).length} questions linked
                    </span>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => deletePassage(p.id)}>Delete</button>
                </div>
                <PassagePreview passage={p} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
