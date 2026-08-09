import { useState } from 'react'
import api from '../lib/api'

type Reason = 'WRONG_ANSWER' | 'TYPO' | 'UNCLEAR' | 'MULTIPLE_CORRECT' | 'OTHER'

const REASONS: { value: Reason; label: string }[] = [
  { value: 'WRONG_ANSWER', label: 'Wrong answer key' },
  { value: 'MULTIPLE_CORRECT', label: 'More than one correct option' },
  { value: 'TYPO', label: 'Typo / formatting error' },
  { value: 'UNCLEAR', label: 'Question is unclear or incomplete' },
  { value: 'OTHER', label: 'Something else' },
]

interface Props {
  questionId: string
  /** where the report is raised from, e.g. "mock:<id>" or "contest:<id>" */
  source?: string
  questionLabel?: string
  onClose: () => void
}

export default function ReportModal({ questionId, source, questionLabel, onClose }: Props) {
  const [reason, setReason] = useState<Reason>('WRONG_ANSWER')
  const [details, setDetails] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  async function submit() {
    setState('sending')
    try {
      await api.post('/reports', { questionId, reason, details: details.trim() || null, source: source ?? null })
      setState('done')
      setTimeout(onClose, 1400)
    } catch {
      setState('error')
    }
  }

  return (
    <div className="follow-modal-overlay" onClick={onClose}>
      <div className="follow-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="follow-modal-header">
          <h3 style={{ margin: 0 }}>Report {questionLabel ?? 'Question'}</h3>
          <button className="follow-modal-close" onClick={onClose}>×</button>
        </div>

        {state === 'done' ? (
          <div style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>✅</div>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Thanks for flagging this.</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Our team will review it shortly.</p>
          </div>
        ) : (
          <div className="report-modal-body">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Spotted a mistake? Let us know and we'll fix the question bank.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {REASONS.map(r => (
                <label key={r.value} className={`report-reason ${reason === r.value ? 'selected' : ''}`}>
                  <input type="radio" name="report-reason" checked={reason === r.value}
                    onChange={() => setReason(r.value)} />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>

            <textarea
              className="input"
              placeholder="Add any details (optional)"
              value={details}
              maxLength={1000}
              onChange={e => setDetails(e.target.value)}
              style={{ width: '100%', minHeight: 72, resize: 'vertical' }}
            />

            {state === 'error' && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>Could not send report. Please try again.</div>
            )}
          </div>
        )}

        {state !== 'done' && (
          <div className="report-modal-actions">
            <button className="btn btn-ghost btn-full" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-full" disabled={state === 'sending'} onClick={submit}>
              {state === 'sending' ? 'Sending…' : 'Submit Report'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
