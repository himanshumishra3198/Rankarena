/**
 * Checkpoint between sections of a sectionally-timed contest.
 *
 * Shown once a section is locked — whether the candidate submitted it or its
 * timer ran out — because in a sequential paper that moment is easy to miss:
 * the section simply becomes read-only and nothing tells you the next one is
 * waiting. It deliberately has no backdrop dismiss and no close button; the
 * only way on is the action, so nobody sits on a locked section wondering why
 * their answers no longer register.
 */
export default function SectionCompleteModal({
  sectionLabel, answered, total, timedOut,
  nextSectionLabel, nextCount, nextMinutes,
  onStartNext, onReviewAndSubmit,
}: {
  /** Display label, e.g. "Quantitative Aptitude". */
  sectionLabel: string
  answered: number
  total: number
  timedOut: boolean
  /** null once every section is done. */
  nextSectionLabel: string | null
  nextCount: number
  nextMinutes: number
  onStartNext: () => void
  onReviewAndSubmit: () => void
}) {
  const label = sectionLabel
  const skipped = total - answered

  return (
    <div className="modal-overlay">
      <div className="modal-box section-done-modal" role="dialog" aria-modal="true"
        aria-labelledby="section-done-title">
        <div className={`section-done-icon ${timedOut ? 'timeout' : ''}`}>
          {timedOut ? '⏱' : '✓'}
        </div>

        <h2 id="section-done-title" className="section-done-title">
          {timedOut ? `Time's up for ${label}` : `${label} submitted`}
        </h2>
        <p className="section-done-sub">
          {timedOut
            ? 'The section closed automatically when its timer ran out.'
            : 'Your answers for this section are locked in.'}
        </p>

        <div className="section-done-stats">
          <div><strong>{answered}</strong><span>answered</span></div>
          <div><strong>{skipped}</strong><span>skipped</span></div>
          <div><strong>{total}</strong><span>questions</span></div>
        </div>

        {nextSectionLabel ? (
          <>
            <div className="section-done-next">
              <div className="section-done-next-label">Up next</div>
              <div className="section-done-next-name">{nextSectionLabel}</div>
              <div className="section-done-next-meta">
                {nextCount} question{nextCount === 1 ? '' : 's'} · {nextMinutes} min
              </div>
            </div>
            {/* The next section's clock starts on this click, not before. */}
            <button className="btn btn-primary btn-full section-done-action" onClick={onStartNext}>
              Start {nextSectionLabel} →
            </button>
            <p className="section-done-note">
              Its timer starts when you press this. You can still reopen finished
              sections to review, but not to change answers.
            </p>
          </>
        ) : (
          <>
            <div className="section-done-next">
              <div className="section-done-next-label">All sections complete</div>
              <div className="section-done-next-meta">
                Nothing left to attempt — submit whenever you're ready.
              </div>
            </div>
            <button className="btn btn-primary btn-full section-done-action" onClick={onReviewAndSubmit}>
              Review &amp; submit test →
            </button>
          </>
        )}
      </div>
    </div>
  )
}
