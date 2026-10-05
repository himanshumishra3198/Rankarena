import { splitDuration, useCountdown, useReveal } from '../landing/hooks'
import type { Contest } from '../../lib/types'

/**
 * The next contest, given room.
 *
 * "Featured" in the brief implied a hand-picked flagship, but no contest
 * carries a featured flag and inventing one would mean choosing arbitrarily.
 * The soonest upcoming contest is the one a visitor should act on anyway, so
 * that is what gets the big card — and the heading says so rather than
 * implying an editorial pick.
 */
export default function FeaturedContest({
  contest, onRegister, registering,
}: {
  contest: Contest | null; onRegister: (c: Contest) => void; registering: boolean
}) {
  const ref = useReveal<HTMLElement>()
  const left = useCountdown(contest?.startTime)
  const t = left !== null ? splitDuration(left) : null
  if (!contest) return null

  const start = new Date(contest.startTime)
  return (
    <section className="ct-section lp-reveal" ref={ref}>
      <div className="ct-featured">
        <div className="ct-featured-glow" aria-hidden="true" />
        <div className="ct-featured-body">
          <span className="lp-kicker">Next up</span>
          <h2 className="ct-featured-title">{contest.title}</h2>
          <p className="ct-featured-sub">
            The next rated paper. Register before it opens — entries close when the clock starts.
          </p>

          <div className="ct-featured-grid">
            {!!contest.questionCount && <div><b>{contest.questionCount}</b><span>Questions</span></div>}
            <div><b>{contest.durationMinutes}</b><span>Minutes</span></div>
            <div><b>{(contest._count?.participations ?? 0).toLocaleString('en-IN')}</b><span>Registered</span></div>
            <div><b className="ct-up">Rated</b><span>Affects rating</span></div>
          </div>

          <p className="ct-featured-when">
            {start.toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' • '}
            {start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
          </p>

          {contest.hasJoined ? (
            <span className="ct-registered ct-registered-lg">✓ You're registered</span>
          ) : (
            <button className="lp-btn lp-btn-primary lp-btn-lg" disabled={registering} onClick={() => onRegister(contest)}>
              {registering ? 'Registering…' : <>Register Now <span aria-hidden="true">→</span></>}
            </button>
          )}
        </div>

        {t && (
          <div className="ct-featured-clock">
            <span className="ct-fc-label">Starts in</span>
            <div className="ct-fc-digits">
              {t.days > 0 && <span><b>{String(t.days).padStart(2, '0')}</b><i>days</i></span>}
              <span><b>{t.hh}</b><i>hrs</i></span>
              <span><b>{t.mm}</b><i>min</i></span>
              <span><b>{t.ss}</b><i>sec</i></span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
