import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { RichText } from '../components/RichText'

type Choice = 'A' | 'B' | 'C' | 'D'
const CHOICES: Choice[] = ['A', 'B', 'C', 'D']

interface FlaggedQuestion {
  id: string
  text: string
  imageUrl: string | null
  subject: string
  topic: string | null
  difficulty: string
  questionType: string
  structuredData: { statements?: string[]; conclusions?: string[] } | null
  passageTitle: string | null
  options: Record<Choice, string>
  correctOption: Choice
  attempts: number
  skipped: number
  counts: Record<Choice, number>
  dominantWrong: { option: Choice; count: number; pct: number }
  correctPct: number
  papers: { type: 'CONTEST' | 'MOCK'; id: string; title: string }[]
  openReports: number
  markedSafe: { at: string; by: string | null } | null
}

type Filter = 'ALL' | 'UNMARKED' | 'SAFE'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'UNMARKED', label: 'Unmarked' },
  { value: 'SAFE', label: 'Marked safe' },
]

const DEFAULT_MIN_ATTEMPTS = 20
const STORAGE_KEY = 'flaggedMinAttempts'

// Remembered per browser so an admin who settled on a threshold does not have
// to type it again. Storage can be unavailable (private windows), so every
// access is guarded and the page works without it.
function savedMinAttempts(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isInteger(n) && n >= 1 ? n : DEFAULT_MIN_ATTEMPTS
  } catch {
    return DEFAULT_MIN_ATTEMPTS
  }
}

export default function FlaggedQuestions() {
  const navigate = useNavigate()
  const [input, setInput] = useState(String(savedMinAttempts()))
  const [minAttempts, setMinAttempts] = useState(savedMinAttempts)
  const [questions, setQuestions] = useState<FlaggedQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [busyId, setBusyId] = useState<string | null>(null)

  // Debounce typing so the list is not recomputed on every keystroke. An
  // empty or invalid value waits instead of querying.
  useEffect(() => {
    const n = Number(input)
    if (!Number.isInteger(n) || n < 1 || n === minAttempts) return
    const t = setTimeout(() => { setLoading(true); setMinAttempts(n) }, 400)
    return () => clearTimeout(t)
  }, [input, minAttempts])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(minAttempts)) } catch { /* not remembered, still works */ }
    // A slower response for an earlier N must not overwrite the current one.
    let current = true
    api.get('/admin/questions/flagged', { params: { minAttempts } })
      .then(res => { if (current) { setQuestions(res.data.questions); setError('') } })
      .catch(err => { if (current) setError(err.response?.data?.error ?? 'Could not load flagged questions.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [minAttempts])

  const inputInvalid = !Number.isInteger(Number(input)) || Number(input) < 1

  const counts: Record<Filter, number> = {
    ALL: questions.length,
    UNMARKED: questions.filter(q => !q.markedSafe).length,
    SAFE: questions.filter(q => q.markedSafe).length,
  }
  const shown = questions.filter(q =>
    filter === 'ALL' ? true : filter === 'SAFE' ? !!q.markedSafe : !q.markedSafe)

  async function setSafe(q: FlaggedQuestion, safe: boolean) {
    setBusyId(q.id)
    try {
      if (safe) await api.post(`/admin/questions/${q.id}/safe`)
      else await api.delete(`/admin/questions/${q.id}/safe`)
      // Updated in place rather than refetched, so the list does not jump.
      setQuestions(qs => qs.map(x => x.id === q.id
        ? { ...x, markedSafe: safe ? { at: new Date().toISOString(), by: 'you' } : null }
        : x))
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(message ?? 'Could not update the question.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Navbar />
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <h1 style={{ margin: 0 }}>Flagged Questions</h1>
          {!loading && counts.UNMARKED > 0 && <span className="report-count-badge">{counts.UNMARKED} to review</span>}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 0, marginBottom: 20 }}>
          Questions where a wrong option was chosen more often than the answer key — the usual sign of a wrong key.
          Counted from submitted attempts in ended contests and in mocks; admin test attempts are left out.
          Fix the key in the editor; scores already given are not recalculated.
        </p>

        <div className="card flagged-controls">
          <label htmlFor="min-attempts" className="flagged-controls-label">Minimum attempts per question</label>
          <input
            id="min-attempts"
            type="number"
            min={1}
            step={1}
            className={`flagged-controls-input ${inputInvalid ? 'invalid' : ''}`}
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <span className="flagged-controls-hint">
            Only people who chose an option count; skips don't. A small number means a few answers can flag a question.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.value} className={`btn btn-sm ${filter === f.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f.value)}>
              {f.label}{!loading && ` (${counts[f.value]})`}
            </button>
          ))}
        </div>

        {error ? (
          <div className="card" style={{ color: '#dc2626' }}>{error}</div>
        ) : loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading flagged questions…</p>
        ) : shown.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            {questions.length === 0
              ? `No question with ${minAttempts} or more attempts has a wrong option chosen more often than its key.`
              : filter === 'SAFE' ? 'No flagged question has been marked safe.' : 'Every flagged question has been marked safe.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {shown.map(q => (
              <div key={q.id} className="card report-card">
                <div className="report-card-head">
                  <span className="report-reason-tag" style={{ background: '#dc2626' }}>
                    {q.dominantWrong.pct}% chose {q.dominantWrong.option} · key is {q.correctOption} ({q.correctPct}%)
                  </span>
                  <span className="report-meta">
                    {q.subject}{q.topic ? ` · ${q.topic}` : ''} · {q.difficulty} · {q.attempts} attempts
                    {q.skipped > 0 ? ` · ${q.skipped} skipped` : ''}
                  </span>
                  {q.openReports > 0 && (
                    <span className="report-meta flagged-reports" style={{ marginLeft: 'auto' }}>
                      {q.openReports} open report{q.openReports > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="report-question">
                  {q.passageTitle && <div className="report-meta" style={{ marginBottom: 6 }}>Passage: {q.passageTitle}</div>}
                  {q.imageUrl && (
                    <img src={q.imageUrl} alt="Question" style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 8 }} />
                  )}
                  {q.text && <RichText as="div" className="report-qtext" html={q.text} />}
                  {q.structuredData?.statements?.length ? (
                    <div className="report-meta" style={{ marginBottom: 10 }}>
                      {q.structuredData.statements.map((s, i) => <div key={`s${i}`}>{s}</div>)}
                      {q.structuredData.conclusions?.map((c, i) => <div key={`c${i}`}>{c}</div>)}
                    </div>
                  ) : null}

                  <div className="report-options">
                    {CHOICES.map(opt => {
                      const share = q.attempts > 0 ? (q.counts[opt] / q.attempts) * 100 : 0
                      const isKey = opt === q.correctOption
                      const isDominant = opt === q.dominantWrong.option
                      return (
                        <div key={opt} className={`report-option flagged-option ${isKey ? 'correct' : ''} ${isDominant ? 'dominant' : ''}`}>
                          <span className="flagged-option-bar" style={{ width: `${share}%` }} />
                          <span className="report-opt-label">{opt}</span>
                          <span className="flagged-option-text"><RichText html={q.options[opt]} /></span>
                          <span className="flagged-option-count">
                            {q.counts[opt]} ({Math.round(share)}%)
                            {isKey && <span className="report-opt-tag"> ✓ key</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="report-card-actions">
                  <span className="report-meta">
                    In: {q.papers.map(p => `${p.title}${p.type === 'MOCK' ? ' (mock)' : ''}`).join(', ') || '—'}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {q.markedSafe ? (
                      <>
                        <span className="flagged-safe-tag">
                          ✓ Marked safe{q.markedSafe.by ? ` by ${q.markedSafe.by}` : ''} · {new Date(q.markedSafe.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                        <button className="btn btn-ghost btn-sm" disabled={busyId === q.id} onClick={() => setSafe(q, false)}>
                          Unmark
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-ghost btn-sm" disabled={busyId === q.id} onClick={() => setSafe(q, true)}
                        title="The key is right: keep it out of the Unmarked list. Editing the question's text, options or key clears this.">
                        Mark as safe
                      </button>
                    )}
                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/questions?edit=${q.id}`)}>
                      Edit question →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
