import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import type { Question } from '../lib/types'

const SUBJECTS = ['QUANT', 'REASONING', 'ENGLISH', 'GK'] as const
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const

const SUBJECT_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'Reasoning',
  ENGLISH: 'English',
  GK: 'General Knowledge',
}

const emptyForm = {
  text: '', optionA: '', optionB: '', optionC: '', optionD: '',
  correctOption: 'A' as Question['correctOption'],
  subject: 'QUANT' as Question['subject'],
  difficulty: 'MEDIUM' as Question['difficulty'],
}

export default function Questions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterSubject, setFilterSubject] = useState('')

  function set(field: keyof typeof emptyForm, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function load() {
    const res = await api.get('/admin/questions', {
      params: filterSubject ? { subject: filterSubject } : {},
    })
    setQuestions(res.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterSubject])

  async function saveQuestion(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.post('/admin/questions', form)
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save question')
    } finally {
      setSaving(false)
    }
  }

  async function deleteQuestion(id: string) {
    if (!window.confirm('Delete this question?')) return
    await api.delete(`/admin/questions/${id}`)
    load()
  }

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="page-header">
          <h1>Question Bank</h1>
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : '+ Add Question'}
          </button>
        </div>

        {showForm && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 16 }}>Add Question</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={saveQuestion}>
              <div className="form-group">
                <label>Question Text</label>
                <textarea className="input" rows={3} value={form.text} onChange={e => set('text', e.target.value)} required style={{ resize: 'vertical' }} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Option A</label>
                  <input className="input" value={form.optionA} onChange={e => set('optionA', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Option B</label>
                  <input className="input" value={form.optionB} onChange={e => set('optionB', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Option C</label>
                  <input className="input" value={form.optionC} onChange={e => set('optionC', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Option D</label>
                  <input className="input" value={form.optionD} onChange={e => set('optionD', e.target.value)} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Correct Option</label>
                  <select className="input" value={form.correctOption} onChange={e => set('correctOption', e.target.value)}>
                    {['A','B','C','D'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Subject</label>
                  <select className="input" value={form.subject} onChange={e => set('subject', e.target.value)}>
                    {SUBJECTS.map(s => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Difficulty</label>
                  <select className="input" value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
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

        <div className="card">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Filter by subject:</label>
            <select className="input" style={{ width: 'auto' }} value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
              <option value="">All</option>
              {SUBJECTS.map(s => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
            </select>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{questions.length} questions</span>
          </div>

          {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
          {!loading && questions.length === 0 && <p className="empty">No questions yet.</p>}
          {questions.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Subject</th>
                  <th>Difficulty</th>
                  <th>Answer</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q, i) => (
                  <tr key={q.id}>
                    <td style={{ color: 'var(--text-muted)', width: 36 }}>{i + 1}</td>
                    <td style={{ maxWidth: 380 }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>{q.text}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        A: {q.optionA} &nbsp; B: {q.optionB} &nbsp; C: {q.optionC} &nbsp; D: {q.optionD}
                      </div>
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
      </div>
    </>
  )
}
