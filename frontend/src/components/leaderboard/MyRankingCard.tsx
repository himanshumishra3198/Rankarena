import { Link } from 'react-router-dom'
import { getTier } from '../../lib/tiers'
import { useCountUp } from '../landing/hooks'
import type { ProfileData } from '../dashboard/types'

/**
 * Where the reader stands.
 *
 * Rank, rating and percentile are three different numbers and the card
 * labels each one, because the quickest way to make a ranking page
 * untrustworthy is to let them blur together.
 *
 * There is no "↑ 137 positions" here. Rank movement needs a record of what
 * your global rank was previously, and nothing stores one — RatingHistory
 * keeps your rank *within a contest*, which is a different thing. Deriving
 * it by counting today's field against an old rating would produce a
 * number that looks precise and isn't.
 */
export default function MyRankingCard({
  profile, signedIn,
}: {
  profile: ProfileData | null
  signedIn: boolean
}) {
  // Called before any early return: this component renders as a guest
  // prompt, as an unrated notice and as the full card, and a hook that only
  // runs in the third case changes the hook count between renders.
  const { ref, shown } = useCountUp(profile?.user.rating ?? 0)

  if (!signedIn) {
    return (
      <section className="lb-mine lb-mine-guest">
        <div>
          <h2 className="lb-mine-title">Want to see your rank?</h2>
          <p className="lb-mine-sub">Create an account, sit a rated contest and take your place on the board.</p>
        </div>
        <div className="lp-final-cta">
          <Link to="/register" className="lp-btn lp-btn-primary lp-btn-lg">Join RankArena <span aria-hidden="true">→</span></Link>
          <Link to="/login" className="lp-btn lp-btn-ghost lp-btn-lg">Log in</Link>
        </div>
      </section>
    )
  }

  if (!profile) return null

  // A default 1500 is not a rank anybody earned. Until a rated contest has
  // moved it, the honest answer is "unrated", not a position.
  if (profile.ratingHistory.length === 0) {
    return (
      <section className="lb-mine lb-mine-guest">
        <div>
          <h2 className="lb-mine-title">You haven't been rated yet.</h2>
          <p className="lb-mine-sub">
            Sit your first rated contest and you'll appear on the board with a rank of your own.
          </p>
        </div>
        <Link to="/contests" className="lp-btn lp-btn-primary lp-btn-lg">
          Join Your First Contest <span aria-hidden="true">→</span>
        </Link>
      </section>
    )
  }

  const { stats, user, ratingHistory } = profile
  const tier = getTier(user.rating)
  const last = ratingHistory[ratingHistory.length - 1]
  const delta = last ? last.newRating - last.oldRating : null
  // Share of the field you are ahead of, from the rank the backend computed.
  const percentile = stats.globalRank && stats.totalRanked > 1
    ? Math.round(((stats.totalRanked - stats.globalRank) / (stats.totalRanked - 1)) * 100)
    : null

  return (
    <section className="lb-mine">
      <div className="lb-mine-glow" aria-hidden="true" />
      <div className="lb-mine-main">
        <span className="lb-mine-label">Your rank</span>
        <span className="lb-mine-rank">#{stats.globalRank?.toLocaleString('en-IN') ?? '—'}</span>
        <span className="lb-mine-of">of {stats.totalRanked.toLocaleString('en-IN')} rated aspirants</span>
      </div>

      <div className="lb-mine-grid">
        <div>
          <span>Rating</span>
          <b ref={ref} style={{ color: tier.fg }}>{shown.toLocaleString('en-IN')}</b>
          {delta !== null && (
            <em className={delta >= 0 ? 'lb-up' : 'lb-down'}>{delta >= 0 ? '+' : ''}{delta} {delta >= 0 ? '↑' : '↓'} last contest</em>
          )}
        </div>
        <div><span>Tier</span><b style={{ color: tier.fg }}>{tier.label}</b></div>
        <div><span>Peak rating</span><b>{stats.maxRating.toLocaleString('en-IN')}</b></div>
        <div><span>Best contest rank</span><b>{stats.bestRank ? `#${stats.bestRank}` : '—'}</b></div>
        <div><span>Contests</span><b>{stats.totalContests}</b></div>
      </div>

      {percentile !== null && (
        <div className="lb-pct">
          <p className="lb-pct-line">
            You are ahead of <b>{percentile}%</b> of rated aspirants.
          </p>
          <div className="lb-pct-track">
            <span className="lb-pct-fill" style={{ width: `${percentile}%` }} />
            <span className="lb-pct-marker" style={{ left: `${percentile}%` }} aria-hidden="true" />
          </div>
          <div className="lb-pct-ends"><span>0%</span><span>100%</span></div>
        </div>
      )}

      <Link to="/profile" className="lp-link-arrow">View my profile <span aria-hidden="true">→</span></Link>
    </section>
  )
}
