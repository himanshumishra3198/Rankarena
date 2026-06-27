import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { RichEditor } from '../components/RichEditor'
import { RichText, stripHtml } from '../components/RichText'
import type { MockTest, MockTestQuestion, Question, Passage, QuestionType } from '../lib/types'
import { SECTION_LABELS } from '../lib/types'

const TYPE_LABELS: Record<string, string> = {
  STANDARD: 'Standard', SYLLOGISM: 'Syllogism', PASSAGE: 'Passage', TABLE: 'Table',
}
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const

const emptyCreate = {
  questionType: 'STANDARD' as QuestionType,
  text: '', imageUrl: '',
  optionA: '', optionB: '', optionC: '', optionD: '',
  correctOption: 'A',
  difficulty: 'MEDIUM',
  solution: '',
  passageId: '',
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

export default function MockTestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [mock, setMock] = useState<MockTest | null>(null)
  const [mtqs, setMtqs] = useState<MockTestQuestion[]>([])
  const [bank, setBank] = useState<Question[]>([])
  const [passages, setPassages] = useState<Passage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedQId, setSelectedQId] = useState('')
  const [marks, setMarks] = useState(2)
  const [negMarks, setNegMarks] = useState(0.5)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'bank' | 'create'>('bank')
  const [cForm, setCForm] = useState(emptyCreate)
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editingQid, setEditingQid] = useState<string | null>(null)
  const [similar, setSimilar] = useState<{ id: string; text: string; subject: string; score: number }[]>([])

  async function load() {
    const [mockRes, mtqRes, bankRes, pRes] = await Promise.all([
      api.get('/admin/mocks'),
      api.get(`/admin/mocks/${id}/questions`),
      api.get('/admin/questions'),
      api.get('/admin/passages'),
    ])
    const m = (mockRes.data as MockTest[]).find(x => x.id === id) ?? null
    setMock(m)
    setMtqs(mtqRes.data)
    setBank(bankRes.data)
    setPassages(pRes.data)
    if (m) setNegMarks(m.negativeMarks)
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  // Debounced near-duplicate check while creating (not editing).
  useEffect(() => {
    if (tab !== 'create' || !mock) { setSimilar([]); return }
    const t = stripHtml(cForm.text).trim()
    if (t.length < 8) { setSimilar([]); return }
    const h = setTimeout(async () => {
      try {
        const res = await api.get('/admin/questions/similar', { params: { text: t, subject: mock.subject } })
        setSimilar((res.data as any[]).filter(s => s.id !== editingQid))
      } catch { setSimilar([]) }
    }, 500)
    return () => clearTimeout(h)
  }, [cForm.text, tab, mock, editingQid])

  async function addFromBank(e: FormEvent) {
    e.preventDefault()
    if (!selectedQId) return
    setAdding(true); setError('')
    try {
      await api.post(`/admin/mocks/${id}/questions`, {
        questionId: selectedQId,
        marks: Number(marks),
        negativeMarks: Number(negMarks),
      })
      setSelectedQId(''); load()
    } catch (err: any) {
      const e = err?.response?.data?.error
      setError(typeof e === 'string' ? e : 'Failed to add question')
    } finally { setAdding(false) }
  }

  function resetForm() { setCForm(emptyCreate); setEditingQid(null); setSimilar([]); setError('') }

  // Load an existing (linked) question into the form for editing.
  function editQuestion(q: Question) {
    setCForm({
      questionType: q.questionType,
      text: q.text, imageUrl: q.imageUrl ?? '',
      optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
      correctOption: q.correctOption,
      difficulty: q.difficulty,
      solution: q.solution ?? '',
      passageId: q.passageId ?? '',
      statements: q.structuredData?.statements?.length ? q.structuredData.statements : ['', '', ''],
      conclusions: q.structuredData?.conclusions?.length ? q.structuredData.conclusions : ['', '', ''],
    })
    setEditingQid(q.id); setError(''); setSimilar([])
    setTab('create')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Create-or-update a question (all types). On create, also link it to the mock.
  async function saveQuestion(e: FormEvent) {
    e.preventDefault()
    if (!mock) return
    const isSyll = cForm.questionType === 'SYLLOGISM'
    const needsPassage = cForm.questionType === 'PASSAGE' || cForm.questionType === 'TABLE'
    if (!isSyll && !hasContent(cForm.text)) { setError('Question text is required.'); return }
    if ((['A', 'B', 'C', 'D'] as const).some(o => !hasContent(cForm[`option${o}` as keyof typeof emptyCreate] as string))) {
      setError('All four options are required (text or image).'); return
    }
    if (needsPassage && !cForm.passageId) { setError('Select a passage/table for this question (create it in the Questions tab first).'); return }

    setCreating(true); setError('')
    const payload: any = {
      questionType: cForm.questionType,
      text: cForm.text,
      imageUrl: cForm.imageUrl || null,
      optionA: cForm.optionA, optionB: cForm.optionB, optionC: cForm.optionC, optionD: cForm.optionD,
      correctOption: cForm.correctOption,
      subject: mock.subject,
      difficulty: cForm.difficulty,
      solution: hasContent(cForm.solution) ? cForm.solution : null,
      passageId: needsPassage ? cForm.passageId : null,
      structuredData: isSyll
        ? { statements: cForm.statements.filter(s => stripHtml(s)), conclusions: cForm.conclusions.filter(c => stripHtml(c)) }
        : null,
    }
    try {
      if (editingQid) {
        await api.put(`/admin/questions/${editingQid}`, payload)
      } else {
        const qRes = await api.post('/admin/questions', payload)
        await api.post(`/admin/mocks/${id}/questions`, {
          questionId: qRes.data.id, marks: Number(marks), negativeMarks: Number(negMarks),
        })
      }
      resetForm(); load()
    } catch (err: any) {
      // Surface exact-duplicate acknowledgment clearly.
      const dup = err?.response?.data?.duplicate
      if (err?.response?.status === 409 && dup) {
        setError(`This question already exists in the bank — not added again. ("${stripHtml(dup.text).slice(0, 70)}…")`)
      } else {
        setError(errStr(err, 'Failed to save question'))
      }
    } finally { setCreating(false) }
  }

  async function uploadImage(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post('/admin/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setCForm(f => ({ ...f, imageUrl: res.data.url }))
    } catch (err: any) {
      setError(errStr(err, 'Image upload failed'))
    } finally { setUploading(false) }
  }

  async function removeQuestion(qid: string) {
    if (!window.confirm('Remove this question from the mock?')) return
    await api.delete(`/admin/mocks/${id}/questions/${qid}`)
    load()
  }

  if (loading) return <><Navbar /><div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading...</p></div></>
  if (!mock) return <><Navbar /><div className="page"><p className="empty">Mock test not found.</p></div></>

  const addedIds = new Set(mtqs.map(m => m.questionId))
  // Only offer bank questions from the same section that aren't already added
  const availableBank = bank.filter(q => q.subject === mock.subject && !addedIds.has(q.id))

  return (
    <>
      <Navbar />
      <div className="page">
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => navigate('/mocks')}>← Mock Tests</button>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ marginBottom: 6 }}>{mock.title}</h1>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {SECTION_LABELS[mock.subject]} &nbsp;·&nbsp; {mock.durationMinutes} min &nbsp;·&nbsp;
                &minus;{mock.negativeMarks} per wrong &nbsp;·&nbsp; {mtqs.length} questions
              </div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
              background: mock.isPublished ? '#dcfce7' : 'var(--bg)',
              color: mock.isPublished ? '#16a34a' : 'var(--text-muted)',
            }}>{mock.isPublished ? 'Published' : 'Draft'}</span>
          </div>
        </div>

        {/* Add question — pick from bank OR create new */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <button className={`btn btn-sm ${tab === 'bank' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setTab('bank'); resetForm() }}>
              Pick from bank{availableBank.length > 0 ? ` (${availableBank.length})` : ''}
            </button>
            <button className={`btn btn-sm ${tab === 'create' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setTab('create'); resetForm() }}>
              {editingQid ? '✎ Editing question' : '+ Create new question'}
            </button>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {/* Marks/negative apply when adding a question (not when editing) */}
          {!editingQid && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, width: 110 }}>
                <label>Marks</label>
                <input className="input" type="number" min={0.1} step="any" value={marks}
                  onChange={e => setMarks(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, width: 110 }}>
                <label>Negative</label>
                <input className="input" type="number" min={0} step="any" value={negMarks}
                  onChange={e => setNegMarks(Number(e.target.value))} />
              </div>
            </div>
          )}

          {tab === 'bank' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Showing only <strong>{SECTION_LABELS[mock.subject]}</strong> questions from the bank.
              </p>
              {availableBank.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                  No more {SECTION_LABELS[mock.subject]} questions in the bank. Use <strong>Create new question</strong> to add one directly.
                </p>
              ) : (
                <form onSubmit={addFromBank} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 300 }}>
                    <label>Question</label>
                    <select className="input" value={selectedQId} onChange={e => setSelectedQId(e.target.value)} required>
                      <option value="">Select a question...</option>
                      {availableBank.map(q => (
                        <option key={q.id} value={q.id}>
                          [{TYPE_LABELS[q.questionType] ?? 'Q'}] {(stripHtml(q.text) || q.passage?.title || 'question').slice(0, 80)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={adding || !selectedQId} style={{ flexShrink: 0 }}>
                    {adding ? 'Adding...' : 'Add'}
                  </button>
                </form>
              )}
            </>
          )}

          {tab === 'create' && (
            <form onSubmit={saveQuestion}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                {editingQid
                  ? 'Editing this question updates it everywhere it is used.'
                  : <>Creates a <strong>{SECTION_LABELS[mock.subject]}</strong> question in the bank and adds it to this mock.</>}
              </p>

              {/* Question type selector */}
              <div className="form-group">
                <label>Question Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 4 }}>
                  {(['STANDARD', 'SYLLOGISM', 'PASSAGE', 'TABLE'] as QuestionType[]).map(t => (
                    <label key={t} style={{
                      border: `2px solid ${cForm.questionType === t ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '8px 10px', cursor: 'pointer', textAlign: 'center',
                      background: cForm.questionType === t ? 'var(--primary-light)' : 'var(--surface)',
                      fontSize: 13, fontWeight: 600,
                      color: cForm.questionType === t ? 'var(--primary)' : 'var(--heading)',
                    }}>
                      <input type="radio" style={{ display: 'none' }} checked={cForm.questionType === t}
                        onChange={() => setCForm(f => ({ ...f, questionType: t }))} />
                      {TYPE_LABELS[t]}
                    </label>
                  ))}
                </div>
              </div>

              {/* Passage/Table selector */}
              {(cForm.questionType === 'PASSAGE' || cForm.questionType === 'TABLE') && (
                <div className="form-group">
                  <label>Link to Passage / Table</label>
                  {passages.filter(p => cForm.questionType === 'TABLE' ? p.type === 'TABLE' : p.type === 'TEXT').length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      No {cForm.questionType === 'TABLE' ? 'tables' : 'passages'} yet — create one in the Questions tab first.
                    </p>
                  ) : (
                    <select className="input" value={cForm.passageId}
                      onChange={e => setCForm(f => ({ ...f, passageId: e.target.value }))} required>
                      <option value="">-- Select --</option>
                      {passages.filter(p => cForm.questionType === 'TABLE' ? p.type === 'TABLE' : p.type === 'TEXT').map(p => (
                        <option key={p.id} value={p.id}>{p.type === 'TABLE' ? '📊' : '📄'} {p.title || stripHtml(p.content).slice(0, 60)}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Syllogism statements / conclusions */}
              {cForm.questionType === 'SYLLOGISM' && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Statements</div>
                  {cForm.statements.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, minWidth: 18 }}>{i + 1}.</span>
                      <input className="input" style={{ flex: 1 }} value={s} placeholder={`Statement ${i + 1}`}
                        onChange={e => setCForm(f => { const st = [...f.statements]; st[i] = e.target.value; return { ...f, statements: st } })} />
                      {cForm.statements.length > 1 && (
                        <button type="button" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
                          onClick={() => setCForm(f => ({ ...f, statements: f.statements.filter((_, j) => j !== i) }))}>×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCForm(f => ({ ...f, statements: [...f.statements, ''] }))}>+ Statement</button>

                  <div style={{ fontWeight: 600, margin: '14px 0 10px', fontSize: 14 }}>Conclusions</div>
                  {cForm.conclusions.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, minWidth: 22 }}>{['I.', 'II.', 'III.', 'IV.'][i] ?? `${i + 1}.`}</span>
                      <input className="input" style={{ flex: 1 }} value={c} placeholder={`Conclusion ${i + 1}`}
                        onChange={e => setCForm(f => { const cs = [...f.conclusions]; cs[i] = e.target.value; return { ...f, conclusions: cs } })} />
                      {cForm.conclusions.length > 1 && (
                        <button type="button" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
                          onClick={() => setCForm(f => ({ ...f, conclusions: f.conclusions.filter((_, j) => j !== i) }))}>×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCForm(f => ({ ...f, conclusions: [...f.conclusions, ''] }))}>+ Conclusion</button>
                </div>
              )}

              <div className="form-group">
                <label>{cForm.questionType === 'SYLLOGISM' ? 'Question / Direction Text' : 'Question Text'}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                    — toolbar for bold, color, x² super/subscript, 🖼 image (or drag &amp; drop)
                  </span>
                </label>
                <RichEditor value={cForm.text} onChange={v => setCForm(f => ({ ...f, text: v }))}
                  minHeight={64} placeholder={cForm.questionType === 'SYLLOGISM' ? 'Which conclusion(s) follow? (or leave blank)' : 'Type the question…'} />
              </div>

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
                    {uploading ? 'Uploading…' : cForm.imageUrl ? '🖼 Replace Image' : '📷 Upload Image'}
                    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{ display: 'none' }}
                      disabled={uploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }} />
                  </label>
                  {cForm.imageUrl && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img src={cForm.imageUrl} alt="Question" style={{ height: 48, borderRadius: 6, border: '1px solid var(--border)' }} />
                      <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                        onClick={() => setCForm(f => ({ ...f, imageUrl: '' }))}>Remove</button>
                    </div>
                  )}
                </div>
              </div>

              <div className="form-row">
                {(['A', 'B', 'C', 'D'] as const).map(opt => (
                  <div className="form-group" key={opt}>
                    <label>Option {opt}</label>
                    <RichEditor minHeight={40}
                      value={cForm[`option${opt}` as keyof typeof emptyCreate] as string}
                      onChange={v => setCForm(f => ({ ...f, [`option${opt}`]: v }))} placeholder={`Option ${opt}…`} />
                  </div>
                ))}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Correct Option</label>
                  <select className="input" value={cForm.correctOption}
                    onChange={e => setCForm(f => ({ ...f, correctOption: e.target.value }))}>
                    {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Difficulty</label>
                  <select className="input" value={cForm.difficulty}
                    onChange={e => setCForm(f => ({ ...f, difficulty: e.target.value }))}>
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Detailed Solution <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <RichEditor value={cForm.solution} onChange={v => setCForm(f => ({ ...f, solution: v }))}
                  minHeight={80} placeholder="Explain the approach and steps…" />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" type="submit" disabled={creating}>
                  {creating ? 'Saving…' : editingQid ? 'Update Question' : 'Create & Add to Mock'}
                </button>
                {editingQid && (
                  <button type="button" className="btn btn-ghost" onClick={resetForm}>Cancel edit</button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Added questions */}
        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Questions ({mtqs.length})</h2>
          {mtqs.length === 0 && <p className="empty">No questions added yet.</p>}
          {mtqs.length > 0 && (
            <table>
              <thead>
                <tr><th>#</th><th>Question</th><th>Type</th><th>Marks</th><th>Ans</th><th></th></tr>
              </thead>
              <tbody>
                {mtqs.map((mtq, i) => (
                  <tr key={mtq.questionId}>
                    <td style={{ color: 'var(--text-muted)', width: 36 }}>{i + 1}</td>
                    <td style={{ maxWidth: 420 }}>
                      {mtq.question.passage && (
                        <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginBottom: 2 }}>
                          {mtq.question.passage.type === 'TABLE' ? '📊' : '📄'} {mtq.question.passage.title || 'Passage'}
                        </div>
                      )}
                      <div style={{ fontWeight: 500 }}>{stripHtml(mtq.question.text) ? <RichText html={mtq.question.text} /> : <em style={{ color: 'var(--text-muted)' }}>(syllogism)</em>}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{TYPE_LABELS[mtq.question.questionType] ?? 'Standard'}</td>
                    <td style={{ fontSize: 13 }}>+{mtq.marks} / −{mtq.negativeMarks}</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>{mtq.question.correctOption}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => editQuestion(mtq.question)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => removeQuestion(mtq.questionId)}>Remove</button>
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
