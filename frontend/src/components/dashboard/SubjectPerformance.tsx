import { Link } from 'react-router-dom'
import { SECTIONS } from '../../lib/types'
import { SUBJECT_COLOR, SUBJECT_LABEL } from '../../lib/practice'
import type { ProfileData } from './types'

/**
 * Accuracy per subject, from the same subjectStats the profile page draws.
 *
 * The weakest is singled out as somewhere to go next rather than as a
 * failing — the call to action is a link into practice, not a red number.
 * A subject needs a handful of answered questions before its percentage
 * means anything, so thin ones are shown but never named as the weak spot.
 */
export default function SubjectPerformance({ p }: { p: ProfileData }) {
  const rows = SECTIONS.map(s => {
    const v = p.subjectStats[s] ?? { correct: 0, wrong: 0, skipped: 0 }
    const answered = v.correct + v.wrong
    return {
      subject: s,
      answered,
      accuracy: answered > 0 ? Math.round((v.correct / answered) * 100) : null,
    }
  })

  const scored = rows.filter(r => r.answered >= 5)
  const weakest = scored.length > 1
    ? scored.reduce((a, b) => (a.accuracy! <= b.accuracy! ? a : b))
    : null

  if (rows.every(r => r.answered === 0)) {
    return (
      <section className="db-card">
        <header className="db-card-head"><h2 className="db-card-title">Subject Performance</h2></header>
        <p className="db-empty-line">Sit a paper and your accuracy per subject appears here.</p>
      </section>
    )
  }

  return (
    <section className="db-card">
      <header className="db-card-head">
        <h2 className="db-card-title">Subject Performance</h2>
        <Link to="/profile" className="lp-link-arrow db-card-link">Details <span aria-hidden="true">→</span></Link>
      </header>

      <div className="db-subjects">
        {rows.map(r => (
          <div className="db-subject" key={r.subject}>
            <div className="db-subject-head">
              <span className="db-subject-name">
                <i style={{ background: SUBJECT_COLOR[r.subject] }} aria-hidden="true" />
                {SUBJECT_LABEL[r.subject]}
              </span>
              <span className="db-subject-pct">
                {r.accuracy !== null ? `${r.accuracy}%` : <em className="db-muted">no attempts</em>}
              </span>
            </div>
            <div className="db-subject-bar">
              <span style={{ width: `${r.accuracy ?? 0}%`, background: SUBJECT_COLOR[r.subject] }} />
            </div>
            <span className="db-subject-n">{r.answered} answered</span>
          </div>
        ))}
      </div>

      {weakest && (
        <div className="db-weak">
          <div>
            <span className="db-weak-tag">Biggest opportunity</span>
            <p>{SUBJECT_LABEL[weakest.subject]} — <b>{weakest.accuracy}%</b>. A few papers here move your rating most.</p>
          </div>
          <Link to={`/mocks?subject=${weakest.subject}`} className="lp-btn lp-btn-primary lp-btn-sm">
            Practise it <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </section>
  )
}
