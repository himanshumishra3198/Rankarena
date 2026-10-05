import { useNavigate } from 'react-router-dom'
import { discardDraft, type MockDraft } from '../../lib/mockDrafts'
import { SUBJECT_COLOR, SUBJECT_SHORT } from '../../lib/practice'
import type { MockTestListItem } from '../../lib/types'

/**
 * Papers left open on this device.
 *
 * Only rendered when there is something to resume, which is the whole point
 * — an empty "continue" block is a reminder that you have done nothing.
 */
export default function ContinuePracticing({
  drafts, mocks, onDiscard,
}: {
  drafts: MockDraft[]
  mocks: MockTestListItem[]
  onDiscard: () => void
}) {
  const navigate = useNavigate()
  const rows = drafts
    .map(d => ({ draft: d, mock: mocks.find(m => m.id === d.mockTestId) }))
    .filter((r): r is { draft: MockDraft; mock: MockTestListItem } => !!r.mock)

  if (rows.length === 0) return null

  return (
    <section className="mk-section">
      <header className="mk-section-head">
        <div>
          <span className="lp-kicker">Unfinished</span>
          <h2 className="mk-h2">Continue Where You Left Off</h2>
        </div>
      </header>

      <div className="mk-continue-grid">
        {rows.map(({ draft, mock }) => {
          const pct = mock.questionCount ? (draft.answered / mock.questionCount) * 100 : 0
          const mins = Math.floor(draft.timeLeft / 60)
          const secs = String(draft.timeLeft % 60).padStart(2, '0')
          return (
            <article className="mk-continue" key={mock.id} style={{ ['--subject' as string]: SUBJECT_COLOR[mock.subject] }}>
              <div className="mk-card-top">
                <span className="mk-card-subject">{SUBJECT_SHORT[mock.subject]}</span>
                <span className="mk-continue-left">{mins}:{secs} left</span>
              </div>
              <h3 className="mk-card-title">{mock.title}</h3>
              <div className="mk-bar"><span className="tone-mid" style={{ width: `${pct}%` }} /></div>
              <p className="mk-continue-prog">{draft.answered} / {mock.questionCount} answered</p>
              <div className="mk-card-actions">
                <button className="lp-btn lp-btn-ghost lp-btn-sm"
                  onClick={() => { discardDraft(mock.id); onDiscard() }}>Discard</button>
                <button className="lp-btn lp-btn-primary lp-btn-sm mk-start"
                  onClick={() => navigate(`/mocks/${mock.id}`)}>Continue <span aria-hidden="true">→</span></button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
