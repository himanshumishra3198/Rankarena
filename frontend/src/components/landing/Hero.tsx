import { Link } from 'react-router-dom'
import ArenaPanel from './ArenaPanel'
import type { LandingContest, RankedUser } from './types'

const SIGNALS = ['Rated Contests', 'Live Leaderboards', 'Performance Tracking', 'SSC CGL Focused']

export default function Hero({
  contest, leaders, aspirants, loading,
}: {
  contest: LandingContest | null
  leaders: RankedUser[]
  aspirants: number | null
  loading: boolean
}) {
  return (
    <section className="lp-hero">
      <div className="lp-hero-bg" aria-hidden="true">
        <div className="lp-grid" />
        <div className="lp-orb lp-orb-a" />
        <div className="lp-orb lp-orb-b" />
      </div>

      <div className="lp-shell lp-hero-inner">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow">
            <i className="lp-pulse" aria-hidden="true" />
            Rated SSC CGL contests
          </span>

          <h1 className="lp-hero-title">
            Don't Just Prepare.<br />
            <span className="lp-grad">Compete.</span>
          </h1>

          <p className="lp-hero-sub">
            Practice SSC CGL with rated contests, live leaderboards, and a competitive
            ranking system built to make preparation more engaging.
          </p>

          <div className="lp-hero-cta">
            <Link to="/register" className="lp-btn lp-btn-primary lp-btn-lg">
              Enter the Arena <span aria-hidden="true">→</span>
            </Link>
            <Link to="/contests" className="lp-btn lp-btn-ghost lp-btn-lg">Explore Contests</Link>
          </div>

          <ul className="lp-signals">
            {SIGNALS.map(s => (
              <li key={s}><i className="lp-tick" aria-hidden="true">✓</i>{s}</li>
            ))}
          </ul>
        </div>

        <div className="lp-hero-visual">
          <ArenaPanel contest={contest} leaders={leaders} aspirants={aspirants} loading={loading} />
        </div>
      </div>
    </section>
  )
}
