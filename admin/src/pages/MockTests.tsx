import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import type { MockTest } from '../lib/types'
import { SECTIONS, SECTION_LABELS } from '../lib/types'

const emptyForm = {
  title: '',
  subject: 'REASONING' as MockTest['subject'],
  durationMinutes: 15,
  negativeMarks: 0.5,
}

export default function MockTests() {
  const navigate = useNavigate()
  const [mocks, setMocks] = useState<MockTest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterSubject, setFilterSubject] = useState('')

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
    if (!window.confirm('Delete this mock test? All attempts will be removed.')) return
    await api.delete(`/admin/mocks/${id}`)
    load()
  }

  const filtered = filterSubject ? mocks.filter(m => m.subject === filterSubject) : mocks

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="page-header">
          <h1>Mock Tests</h1>
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
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
              <div className="form-row">
                <div className="form-group">
                  <label>Section</label>
                  <select className="input" value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value as any }))}>
                    {SECTIONS.map(s => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}
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
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 'auto' }} value={filterSubject}
              onChange={e => setFilterSubject(e.target.value)}>
              <option value="">All sections</option>
              {SECTIONS.map(s => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}
            </select>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{filtered.length} mock tests</span>
          </div>

          {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
          {!loading && filtered.length === 0 && <p className="empty">No mock tests yet.</p>}
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
