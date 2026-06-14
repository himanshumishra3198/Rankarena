import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import type { MockTest, MockTestQuestion, Question } from '../lib/types'
import { SECTION_LABELS } from '../lib/types'

const TYPE_LABELS: Record<string, string> = {
  STANDARD: 'Standard', SYLLOGISM: 'Syllogism', PASSAGE: 'Passage', TABLE: 'Table',
}

export default function MockTestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [mock, setMock] = useState<MockTest | null>(null)
  const [mtqs, setMtqs] = useState<MockTestQuestion[]>([])
  const [bank, setBank] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedQId, setSelectedQId] = useState('')
  const [marks, setMarks] = useState(2)
  const [negMarks, setNegMarks] = useState(0.5)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [mockRes, mtqRes, bankRes] = await Promise.all([
      api.get('/admin/mocks'),
      api.get(`/admin/mocks/${id}/questions`),
      api.get('/admin/questions'),
    ])
    const m = (mockRes.data as MockTest[]).find(x => x.id === id) ?? null
    setMock(m)
    setMtqs(mtqRes.data)
    setBank(bankRes.data)
    if (m) setNegMarks(m.negativeMarks)
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

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

        {/* Add question from bank */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginBottom: 12 }}>Add Question from Bank</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Showing only <strong>{SECTION_LABELS[mock.subject]}</strong> questions. Create new questions in the Questions tab.
          </p>
          {error && <div className="alert alert-error">{error}</div>}
          {availableBank.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              No more {SECTION_LABELS[mock.subject]} questions available. Add some in the Questions tab.
            </p>
          ) : (
            <form onSubmit={addFromBank} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 300 }}>
                <label>Question</label>
                <select className="input" value={selectedQId} onChange={e => setSelectedQId(e.target.value)} required>
                  <option value="">Select a question...</option>
                  {availableBank.map(q => (
                    <option key={q.id} value={q.id}>
                      [{TYPE_LABELS[q.questionType] ?? 'Q'}] {(q.text || q.passage?.title || 'question').slice(0, 80)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, width: 90 }}>
                <label>Marks</label>
                <input className="input" type="number" min={0.1} step="any" value={marks}
                  onChange={e => setMarks(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, width: 90 }}>
                <label>Negative</label>
                <input className="input" type="number" min={0} step="any" value={negMarks}
                  onChange={e => setNegMarks(Number(e.target.value))} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={adding || !selectedQId} style={{ flexShrink: 0 }}>
                {adding ? 'Adding...' : 'Add'}
              </button>
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
                      <div style={{ fontWeight: 500 }}>{mtq.question.text || <em style={{ color: 'var(--text-muted)' }}>(syllogism)</em>}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{TYPE_LABELS[mtq.question.questionType] ?? 'Standard'}</td>
                    <td style={{ fontSize: 13 }}>+{mtq.marks} / −{mtq.negativeMarks}</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>{mtq.question.correctOption}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => removeQuestion(mtq.questionId)}>Remove</button></td>
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
