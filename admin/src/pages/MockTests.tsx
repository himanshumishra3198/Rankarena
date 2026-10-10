import { useEffect, useState } from 'react'
import { useConfirm } from '../components/ConfirmDialog'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import type { Exam, MockTest, Section } from '../lib/types'
import { SECTIONS, SECTION_LABELS } from '../lib/types'
import { useExams, sectionsOf } from '../lib/exams'

const emptyForm = {
  title: '',
  exam: 'SSC_CGL' as Exam,
  subject: 'REASONING' as MockTest['subject'],
  durationMinutes: 15,
  negativeMarks: 0.5,
}

export default function MockTests() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [mocks, setMocks] = useState<MockTest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterSubject, setFilterSubject] = useState('')

  // The sections a paper can be about come from its exam, so the panel
  // cannot offer a combination the API will refuse.
  const { catalogue, error: examError } = useExams()
  const formSections = sectionsOf(catalogue, form.exam)
  const formSectionKeys: Section[] = formSections.length ? formSections.map(sec => sec.key) : SECTIONS

  /**
   * Switching examination moves the paper to that exam's first section and
   * takes on its marking conventions. The old section does not carry over —
   * it belongs to the other syllabus.
   */
  function pickExam(exam: Exam) {
    const spec = catalogue?.exams.find(e => e.key === exam)
    setForm(f => ({
      ...f,
      exam,
      subject: (spec?.sections[0]?.key ?? f.subject) as MockTest['subject'],
      negativeMarks: spec?.defaults.negativeMarks ?? f.negativeMarks,
    }))
  }

  function errMsg(err: any, fallback: string): string {
    const e = err?.response?.data?.error
    if (typeof e === 'string') return e
    if (Array.isArray(e)) return e.map((i: any) => i?.message).filter(Boolean).join(', ') || fallback
    return fallback
  }

  async function load() {
    const res = await api.get('/admin/mocks')
    setMocks(res.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function createMock(e: FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await api.post('/admin/mocks', {
        title: form.title,
        exam: form.exam,
        subject: form.subject,
        durationMinutes: Number(form.durationMinutes),
        negativeMarks: Number(form.negativeMarks),
      })
      setForm(emptyForm); setShowForm(false)
      navigate(`/mocks/${res.data.id}`)
    } catch (err: any) {
      setError(errMsg(err, 'Failed to create mock test'))
    } finally { setSaving(false) }
  }

  async function togglePublish(m: MockTest) {
    await api.put(`/admin/mocks/${m.id}`, { isPublished: !m.isPublished })
    load()
  }

  async function deleteMock(id: string) {
    if (!(await confirm({
      title: 'Delete this mock test?',
      message: 'The mock and every attempt recorded against it will be removed. This cannot be undone.',
      confirmLabel: 'Delete mock test',
      danger: true,
    }))) return
    await api.delete(`/admin/mocks/${id}`)
    load()
  }

  const filtered = filterSubject ? mocks.filter(m => m.subject === filterSubject) : mocks
  const countFor = (s: string) => mocks.filter(m => m.subject === s).length
  // Only the sections that actually have papers, so the tab strip does not
  // list three empty CAT sections on an SSC-only install.
  const listedSections: Section[] = [
    ...SECTIONS,
    ...(catalogue?.exams ?? []).flatMap(e => e.sections.map(sec => sec.key)),
  ].filter((sec, i, all) => all.indexOf(sec) === i && (SECTIONS.includes(sec) || countFor(sec) > 0))

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="page-header">
          <h1>Mock Tests</h1>
          <button className="btn btn-primary" onClick={() => {
            if (!showForm) {
              setForm({ ...emptyForm, subject: (filterSubject || emptyForm.subject) as MockTest['subject'] })
              setError('')
            }
            setShowForm(v => !v)
          }}>
            {showForm ? 'Cancel' : '+ New Mock Test'}
          </button>
        </div>

        {showForm && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 16 }}>Create Sectional Mock Test</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={createMock}>
              <div className="form-group">
                <label>Title</label>
                <input className="input" value={form.title} required
                  placeholder="e.g. General Intelligence and Reasoning Sectional Test - 1"
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              {/* First, because it decides which sections the paper can be
                  about and the defaults for duration and marking. */}
              <div className="form-group">
                <label>Examination</label>
                {examError && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{examError}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {(catalogue?.exams ?? []).map(e => (
                    <label key={e.key} style={{
                      border: `2px solid ${form.exam === e.key ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      background: form.exam === e.key ? 'var(--primary-light)' : 'var(--surface)',
                      color: form.exam === e.key ? 'var(--primary)' : 'var(--heading)',
                    }}>
                      <input type="radio" style={{ display: 'none' }} checked={form.exam === e.key}
                        onChange={() => pickExam(e.key)} />
                      {e.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Section</label>
                  <select className="input" value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value as any }))}>
                    {formSectionKeys.map(s => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Duration (minutes)</label>
                  <input className="input" type="number" min={1} value={form.durationMinutes}
                    onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label>Negative Marks</label>
                  <input className="input" type="number" min={0} step="any" value={form.negativeMarks}
                    onChange={e => setForm(f => ({ ...f, negativeMarks: Number(e.target.value) }))} />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create & Add Questions'}
              </button>
            </form>
          </div>
        )}

        <div className="card">
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <button className={`tab-btn ${filterSubject === '' ? 'active' : ''}`}
              onClick={() => setFilterSubject('')}>
              All sections <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({mocks.length})</span>
            </button>
            {listedSections.map(s => (
              <button key={s} className={`tab-btn ${filterSubject === s ? 'active' : ''}`}
                onClick={() => setFilterSubject(s)}>
                {SECTION_LABELS[s]} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({countFor(s)})</span>
              </button>
            ))}
          </div>

          {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
          {!loading && filtered.length === 0 && (
            <p className="empty">
              {filterSubject
                ? `No ${SECTION_LABELS[filterSubject as MockTest['subject']]} mock tests yet.`
                : 'No mock tests yet.'}
            </p>
          )}
          {filtered.length > 0 && (
            <table>
              <thead>
                <tr><th>Title</th><th>Section</th><th>Qs</th><th>Duration</th><th>Attempts</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id}>
                    <td>
                      <button style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}
                        onClick={() => navigate(`/mocks/${m.id}`)}>
                        {m.title}
                      </button>
                    </td>
                    <td style={{ fontSize: 13 }}>{SECTION_LABELS[m.subject]}</td>
                    <td>{m._count?.mockTestQuestions ?? 0}</td>
                    <td style={{ fontSize: 13 }}>{m.durationMinutes} min</td>
                    <td>{m._count?.attempts ?? 0}</td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                        background: m.isPublished ? '#dcfce7' : 'var(--bg)',
                        color: m.isPublished ? '#16a34a' : 'var(--text-muted)',
                      }}>{m.isPublished ? 'Published' : 'Draft'}</span>
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => togglePublish(m)}>
                        {m.isPublished ? 'Unpublish' : 'Publish'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteMock(m.id)}>Delete</button>
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
