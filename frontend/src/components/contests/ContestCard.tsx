import { useNavigate } from 'react-router-dom'
import { splitDuration, useCountdown } from '../landing/hooks'
import { contestPhase, type Contest } from '../../lib/types'

/**
 * One contest, in whatever state it happens to be in.
 *
 * A single component rather than one per state: the states are the same
 * object at different points on its own clock, and splitting them would
 * mean four places to change when a field moves.
 *
 * Every contest here is rated — the platform writes a RatingHistory row for
 * each participant of every contest, and there is no unrated flag to read —
 * so the badge states that rather than offering a distinction that does not
 * exist.
 */
export default function ContestCard({
  c, onRegister, registering,
}: {
  c: Contest
  onRegister: (c: Contest) => void
  registering: boolean
}) {
  const navigate = useNavigate()
  const phase = contestPhase(c)
  const endsAt = new Date(new Date(c.startTime).getTime() + c.durationMinutes * 60_000)
  const left = useCountdown(phase === 'live' ? endsAt.toISOString() : phase === 'upcoming' ? c.startTime : null)
  const t = left !== null ? splitDuration(left) : null

  const start = new Date(c.startTime)
  const when = start.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  })
  const delta = c.myOldRating !== null && c.myOldRating !== undefined
    && c.myNewRating !== null && c.myNewRating !== undefined
    ? c.myNewRating - c.myOldRating
    : null

  return (
    <article className={`ct-card is-${phase}`}>
      <div className="ct-card-top">
        <span className={`ct-state ct-state-${phase}`}>
          {phase === 'live' && <i className="ct-dot" aria-hidden="true" />}
          {phase === 'live' ? 'LIVE' : phase === 'upcoming' ? 'UPCOMING' : 'ENDED'}
        </span>
        <span className="ct-rated">RATED</span>
      </div>

      <h3 className="ct-card-title">{c.title}</h3>

      <dl className="ct-facts">
        <div><dt>When</dt><dd>{when}</dd></div>
        <div><dt>Duration</dt><dd>{c.durationMinutes} min</dd></div>
        {!!c.questionCount && <div><dt>Questions</dt><dd>{c.questionCount}</dd></div>}
        <div>
          <dt>{phase === 'past' ? 'Participants' : 'Registered'}</dt>
          <dd>{(c._count?.participations ?? 0).toLocaleString('en-IN')}</dd>
        </div>
      </dl>

      {t && (
        <div className="ct-count">
          <span className="ct-count-label">{phase === 'live' ? 'Time remaining' : 'Starts in'}</span>
          <span className="ct-count-digits">
            {t.days > 0 && <><b>{String(t.days).padStart(2, '0')}</b><i>:</i></>}
            <b>{t.hh}</b><i>:</i><b>{t.mm}</b><i>:</i><b>{t.ss}</b>
          </span>
        </div>
      )}

      {/* A result only when the contest has actually settled into one. */}
      {phase === 'past' && c.myRank && (
        <div className="ct-result">
          <div><span>Your rank</span><b>#{c.myRank}<i> / {c.myTotalParticipants}</i></b></div>
          {delta !== null && (
            <div>
              <span>Rating</span>
              <b className={delta >= 0 ? 'ct-up' : 'ct-down'}>
                {c.myNewRating} <em>{delta >= 0 ? '+' : ''}{delta} {delta >= 0 ? '↑' : '↓'}</em>
              </b>
            </div>
          )}
        </div>
      )}

      <div className="ct-card-actions">
        {phase === 'upcoming' && (c.hasJoined
          ? <>
              <span className="ct-registered">✓ Registered</span>
              <button className="lp-btn lp-btn-ghost lp-btn-sm ct-go" onClick={() => navigate(`/contests/${c.id}`)}>
                View Contest <span aria-hidden="true">→</span>
              </button>
            </>
          : <button className="lp-btn lp-btn-primary lp-btn-sm ct-go" disabled={registering} onClick={() => onRegister(c)}>
              {registering ? 'Registering…' : <>Register <span aria-hidden="true">→</span></>}
            </button>
        )}

        {phase === 'live' && (c.hasSubmitted
          ? <button className="lp-btn lp-btn-ghost lp-btn-sm ct-go" onClick={() => navigate(`/contests/${c.id}/result`)}>
              View Result <span aria-hidden="true">→</span>
            </button>
          : <button className="lp-btn lp-btn-danger lp-btn-sm ct-go" disabled={registering} onClick={() => onRegister(c)}>
              {registering ? 'Entering…' : <>Enter Contest <span aria-hidden="true">→</span></>}
            </button>
        )}

        {phase === 'past' && (c.hasSubmitted
          ? <button className="lp-btn lp-btn-primary lp-btn-sm ct-go" onClick={() => navigate(`/contests/${c.id}/result`)}>
              View Results <span aria-hidden="true">→</span>
            </button>
          : <button className="lp-btn lp-btn-ghost lp-btn-sm ct-go" onClick={() => navigate(`/contests/${c.id}/result`)}>
              View Leaderboard <span aria-hidden="true">→</span>
            </button>
        )}
      </div>
    </article>
  )
}
