import { Link } from 'react-router-dom'
import { RatingChart } from '../RatingChart'
import { getTier } from '../../lib/tiers'
import type { ProfileData } from './types'

export default function RatingOverview({ p }: { p: ProfileData }) {
  const last = p.ratingHistory[p.ratingHistory.length - 1]
  const delta = last ? last.newRating - last.oldRating : null
  const tier = getTier(p.user.rating)

  return (
    <section className="db-card">
      <header className="db-card-head">
        <h2 className="db-card-title">Your Rating</h2>
        <Link to="/profile" className="lp-link-arrow db-card-link">History <span aria-hidden="true">→</span></Link>
      </header>

      <div className="db-rating-row">
        <div>
          <span className="db-rating-value" style={{ color: tier.fg }}>{p.user.rating.toLocaleString('en-IN')}</span>
          {delta !== null && (
            <em className={delta >= 0 ? 'db-up' : 'db-down'}>{delta >= 0 ? '+' : ''}{delta} {delta >= 0 ? '↑' : '↓'}</em>
          )}
          <span className="db-rating-tier" style={{ color: tier.fg }}>{tier.label}</span>
        </div>
        <div className="db-rating-peak">
          <span>Peak</span>
          <b>{p.stats.maxRating.toLocaleString('en-IN')}</b>
        </div>
      </div>

      {p.ratingHistory.length > 0 ? (
        <div className="db-chart"><RatingChart history={p.ratingHistory} /></div>
      ) : (
        <p className="db-empty-line">Your first rated contest draws the first point.</p>
      )}
    </section>
  )
}
