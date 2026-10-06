import { Link } from 'react-router-dom'
import { getTier } from '../../lib/tiers'
import type { RankedUser } from '../landing/types'

const MEDAL = ['🥇', '🥈', '🥉']

/**
 * The top of the ladder, with the reader's own position pinned underneath
 * when they are not already in it. /ratings/leaderboard returns the top 100,
 * so for everyone below that the row is built from the rank /profile
 * computed — which is why that number had to exist server-side.
 */
export default function LeaderboardPreview({
  leaders, me,
}: {
  leaders: RankedUser[]
  me: { id: string; name: string; rating: number; rank: number | null } | null
}) {
  const top = leaders.slice(0, 5)
  const meInTop = me ? top.some(u => u.id === me.id) : false

  return (
    <section className="db-card">
      <header className="db-card-head">
        <h2 className="db-card-title">Current Leaders</h2>
        <Link to="/leaderboard" className="lp-link-arrow db-card-link">Full table <span aria-hidden="true">→</span></Link>
      </header>

      <div className="db-lb">
        {top.length === 0 && <p className="db-empty-line">The board opens with the first rated contest.</p>}
        {top.map((u, i) => {
          const tier = getTier(u.rating)
          const isMe = me?.id === u.id
          return (
            <div className={`db-lb-row ${isMe ? 'is-me' : ''}`} key={u.id}>
              <span className="db-lb-rank">{MEDAL[i] ?? u.rank}</span>
              <span className="db-lb-name" style={{ color: tier.fg }}>{u.name}{isMe && <em> (you)</em>}</span>
              <span className="db-lb-rating">{u.rating}</span>
            </div>
          )
        })}

        {me && !meInTop && me.rank && (
          <>
            <div className="db-lb-gap" aria-hidden="true">⋯</div>
            <div className="db-lb-row is-me">
              <span className="db-lb-rank">{me.rank}</span>
              <span className="db-lb-name" style={{ color: getTier(me.rating).fg }}>{me.name} <em>(you)</em></span>
              <span className="db-lb-rating">{me.rating}</span>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
