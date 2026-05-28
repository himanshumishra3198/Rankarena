const SECTION_LABELS: Record<string, string> = {
  QUANT: 'Quant', REASONING: 'Reasoning', ENGLISH: 'English', GK: 'GK',
}

export interface SectionSummary {
  section: string
  answered: number
  marked: number
  total: number
}

interface Props {
  sections: SectionSummary[]
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function SubmitModal({ sections, submitting, onConfirm, onCancel }: Props) {
  const totals = sections.reduce(
    (acc, s) => ({ answered: acc.answered + s.answered, marked: acc.marked + s.marked, total: acc.total + s.total }),
    { answered: 0, marked: 0, total: 0 },
  )
  const totalUnanswered = totals.total - totals.answered

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2 style={{ marginBottom: 4 }}>Submit Test</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Review your attempt summary before submitting.
        </p>

        <table className="submit-summary-table">
          <thead>
            <tr>
              <th>Section</th>
              <th className="col-green">Answered</th>
              <th className="col-purple">Marked</th>
              <th className="col-red">Unanswered</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(s => (
              <tr key={s.section}>
                <td style={{ fontWeight: 500 }}>{SECTION_LABELS[s.section] ?? s.section}</td>
                <td className="col-green">{s.answered}</td>
                <td className="col-purple">{s.marked}</td>
                <td className="col-red">{s.total - s.answered}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: 700 }}>Total ({totals.total} questions)</td>
              <td className="col-green" style={{ fontWeight: 700 }}>{totals.answered}</td>
              <td className="col-purple" style={{ fontWeight: 700 }}>{totals.marked}</td>
              <td className="col-red" style={{ fontWeight: 700 }}>{totalUnanswered}</td>
            </tr>
          </tfoot>
        </table>

        {totalUnanswered > 0 && (
          <div className="alert alert-error" style={{ marginTop: 16 }}>
            ⚠️ {totalUnanswered} question{totalUnanswered > 1 ? 's' : ''} will be submitted as unattempted (score 0).
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
            Go back
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Yes, Submit Test'}
          </button>
        </div>
      </div>
    </div>
  )
}
