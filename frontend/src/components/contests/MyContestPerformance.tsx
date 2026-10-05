import { Link } from 'react-router-dom'
import { RatingChart, type RatingPoint } from '../RatingChart'
import { getTier } from '../../lib/tiers'
import { useReveal } from '../landing/hooks'

/**
 * The reader's own contest record.
 *
 * Every figure comes from /profile's ratingHistory, which is one row per
 * rated contest they finished — so "contests played" is literally the
 * number of papers that moved their rating, and best rank is the best of
 * those. The chart is the same RatingChart the profile page uses; a second
 * implementation would be a second thing to keep correct.
 */
export default function MyContestPerformance({
  history, currentRating, signedIn,
}: {
  history: RatingPoint[]
  currentRating: number | null
  signedIn: boolean
}) {
  const ref = useReveal<HTMLElement>()

  if (!signedIn) {
    return (
      <section className="ct-section lp-reveal" ref={ref}>
        <div className="ct-journey-guest">
          <h2 className="mk-h2">Your Contest Journey</h2>
          <p className="mk-section-sub">Log in to track your rank, rating and every contest you've sat.</p>
          <div className="lp-final-cta">
            <Link to="/login" className="lp-btn lp-btn-primary lp-btn-lg">Login <span aria-hidden="true">→</span></Link>
            <Link to="/register" className="lp-btn lp-btn-ghost lp-btn-lg">Create account</Link>
          </div>
        </div>
      </section>
    )
  }

  const played = history.length
  const bestRank = played ? Math.min(...history.map(h => h.rank)) : null
  const peak = played ? Math.max(...history.map(h => h.newRating)) : null
  // Best finishing position as a share of the field — the closest honest
  // thing to "top %" without a percentile stored anywhere.
  const bestTop = played
    ? Math.min(...history.map(h => (h.totalParticipants > 0 ? Math.round((h.rank / h.totalParticipants) * 100) : 100)))
    : null
  const tier = currentRating !== null ? getTier(currentRating) : null

  return (
    <section className="ct-section lp-reveal" ref={ref}>
      <header className="mk-section-head">
        <div>
          <span className="lp-kicker">Your record</span>
          <h2 className="mk-h2">Your Contest Journey</h2>
        </div>
      </header>

      {played === 0 ? (
        <div className="mk-empty">
          <div className="mk-empty-icon" aria-hidden="true">🏁</div>
          <p className="mk-empty-title">You haven't finished a rated contest yet.</p>
          <p className="mk-empty-body">Your first rank is waiting.</p>
          <a href="#contest-list" className="lp-btn lp-btn-primary lp-btn-sm">See upcoming contests</a>
        </div>
      ) : (
        <>
          <div className="ct-journey-stats">
            <div className="ct-jstat"><b>{played}</b><span>Contests played</span></div>
            <div className="ct-jstat"><b>#{bestRank}</b><span>Best rank</span></div>
            <div className="ct-jstat">
              <b style={tier ? { color: tier.fg } : undefined}>{currentRating ?? '—'}</b>
              <span>{tier ? tier.label : 'Current rating'}</span>
            </div>
            <div className="ct-jstat"><b>{peak}</b><span>Highest rating</span></div>
            <div className="ct-jstat"><b>Top {bestTop}%</b><span>Best finish</span></div>
          </div>

          <div className="ct-chart">
            <RatingChart history={history} />
          </div>
        </>
      )}
    </section>
  )
}
