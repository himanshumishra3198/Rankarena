import { Link } from 'react-router-dom'
import { getTier } from '../../lib/tiers'
import { useReveal } from './hooks'
import type { RankedUser } from './types'

const MEDAL = ['🥇', '🥈', '🥉']

/**
 * The top of the real ranking.
 *
 * Shows each aspirant's actual rating and the tier it puts them in, using
 * the same colours as every other rating on the site. There are no
 * "+42 ↑" deltas here because /ratings/leaderboard does not return one —
 * inventing movement on named real users would be a lie about a person,
 * not just about a number.
 */
export default function LeaderboardPreview({ leaders, loading }: { leaders: RankedUser[]; loading: boolean }) {
  const ref = useReveal<HTMLElement>()
  const rows = leaders.slice(0, 5)

  return (
    <section className="lp-section lp-reveal" ref={ref} id="leaderboard">
      <div className="lp-shell">
        <header className="lp-section-head">
          <span className="lp-kicker">Rankings</span>
          <h2 className="lp-h2">Who's Leading the Arena?</h2>
        </header>

        <div className="lp-board">
          <div className="lp-board-row lp-board-head">
            <span>Rank</span><span>Aspirant</span><span>Tier</span><span className="lp-num">Rating</span>
          </div>

          {loading && [0, 1, 2, 3, 4].map(i => (
            <div className="lp-board-row" key={i}><span className="lp-skel" style={{ width: '100%' }} /></div>
          ))}

          {!loading && rows.length === 0 && (
            <div className="lp-board-empty">No ratings yet — the first contest sets the board.</div>
          )}

          {!loading && rows.map((u, i) => {
            const tier = getTier(u.rating)
            return (
              <div className={`lp-board-row lp-board-live ${i < 3 ? 'is-podium' : ''}`} key={u.id}>
                <span className="lp-board-rank">{MEDAL[i] ?? u.rank}</span>
                <span className="lp-board-name" style={{ color: tier.fg }}>{u.name}</span>
                <span className="lp-board-tier">
                  <i className="lp-tier-dot" style={{ background: tier.fg }} aria-hidden="true" />{tier.label}
                </span>
                <span className="lp-num lp-board-rating">{u.rating}</span>
              </div>
            )
          })}
        </div>

        <div className="lp-board-foot">
          <Link to="/leaderboard" className="lp-link-arrow">View Full Rankings <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </section>
  )
}
