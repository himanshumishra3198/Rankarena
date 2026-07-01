import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { RichText } from '../components/RichText'

type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED'
type ReportReason = 'WRONG_ANSWER' | 'TYPO' | 'UNCLEAR' | 'MULTIPLE_CORRECT' | 'OTHER'

interface ReportedQuestion {
  id: string; text: string; imageUrl?: string | null
  subject: string; difficulty: string
  optionA: string; optionB: string; optionC: string; optionD: string
  correctOption: string; solution?: string | null
}

interface QuestionReport {
  id: string
  reason: ReportReason
  details: string | null
  source: string | null
  status: ReportStatus
  createdAt: string
  resolvedAt: string | null
  user: { id: string; name: string }
  question: ReportedQuestion
}

const REASON_LABELS: Record<ReportReason, string> = {
  WRONG_ANSWER: 'Wrong answer key',
  MULTIPLE_CORRECT: 'Multiple correct',
  TYPO: 'Typo / formatting',
  UNCLEAR: 'Unclear / incomplete',
  OTHER: 'Other',
}
const REASON_COLORS: Record<ReportReason, string> = {
  WRONG_ANSWER: '#dc2626', MULTIPLE_CORRECT: '#dc2626', TYPO: '#d97706',
  UNCLEAR: '#0ea5e9', OTHER: '#64748b',
}
const STATUS_TABS: { value: ReportStatus | 'ALL'; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'DISMISSED', label: 'Dismissed' },
  { value: 'ALL', label: 'All' },
]

function optText(q: ReportedQuestion, opt: string) {
  return ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as any)[opt] ?? ''
}

export default function Reports() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<ReportStatus | 'ALL'>('OPEN')
  const [reports, setReports] = useState<QuestionReport[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await api.get('/admin/reports', { params: { status: tab } })
    setReports(res.data.reports)
    setOpenCount(res.data.openCount)
    setLoading(false)
  }
  useEffect(() => { load() }, [tab])

  async function setStatus(id: string, status: ReportStatus) {
    setBusyId(id)
    try {
      await api.patch(`/admin/reports/${id}`, { status })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Navbar />
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <h1 style={{ margin: 0 }}>Question Reports</h1>
          {openCount > 0 && <span className="report-count-badge">{openCount} open</span>}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 0, marginBottom: 20 }}>
          Student-flagged questions. Fix the question in the Questions tab, then mark the report resolved.
        </p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {STATUS_TABS.map(t => (
            <button key={t.value} className={`btn btn-sm ${tab === t.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading reports…</p>
        ) : reports.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            {tab === 'OPEN' ? '🎉 No open reports. The question bank is clean!' : 'No reports here.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {reports.map(r => {
              const q = r.question
              return (
                <div key={r.id} className="card report-card">
                  <div className="report-card-head">
                    <span className="report-reason-tag" style={{ background: REASON_COLORS[r.reason] }}>
                      {REASON_LABELS[r.reason]}
                    </span>
                    <span className="report-meta">
                      {q.subject} · {q.difficulty} · reported by {r.user.name}
                    </span>
                    <span className="report-meta" style={{ marginLeft: 'auto' }}>
                      {new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {r.details && (
                    <div className="report-details">“{r.details}”</div>
                  )}

                  <div className="report-question">
                    {q.imageUrl && (
                      <img src={q.imageUrl} alt="Question" style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 8 }} />
                    )}
                    {q.text && <RichText as="div" className="report-qtext" html={q.text} />}
                    <div className="report-options">
                      {(['A', 'B', 'C', 'D'] as const).map(opt => (
                        <div key={opt} className={`report-option ${opt === q.correctOption ? 'correct' : ''}`}>
                          <span className="report-opt-label">{opt}</span>
                          <span><RichText html={optText(q, opt)} /></span>
                          {opt === q.correctOption && <span className="report-opt-tag">✓ answer key</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="report-card-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/questions')}>
                      Open Questions →
                    </button>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      {r.status !== 'OPEN' && (
                        <button className="btn btn-ghost btn-sm" disabled={busyId === r.id}
                          onClick={() => setStatus(r.id, 'OPEN')}>Reopen</button>
                      )}
                      {r.status !== 'DISMISSED' && (
                        <button className="btn btn-ghost btn-sm" disabled={busyId === r.id}
                          onClick={() => setStatus(r.id, 'DISMISSED')}>Dismiss</button>
                      )}
                      {r.status !== 'RESOLVED' && (
                        <button className="btn btn-primary btn-sm" disabled={busyId === r.id}
                          onClick={() => setStatus(r.id, 'RESOLVED')}>Mark Resolved</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
