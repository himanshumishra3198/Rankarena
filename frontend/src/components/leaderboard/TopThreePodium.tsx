import { Link } from 'react-router-dom'
import { getTier } from '../../lib/tiers'
import { useReveal } from '../landing/hooks'
import type { LeaderEntry } from './types'

// Rendered left-to-right as 2nd, 1st, 3rd so the winner stands in the
// middle. `i` is the index into the ranked list, so first place is i=0 and
// keeps the gold — getting these crossed crowns the runner-up.
const PLACE = [
  { i: 1, cls: 'is-silver', medal: '🥈' },
  { i: 0, cls: 'is-gold', medal: '🥇' },
  { i: 2, cls: 'is-bronze', medal: '🥉' },
]

/**
 * The top three, first place raised in the middle.
 *
 * Rendered in visual order (silver, gold, bronze) rather than rank order so
 * the winner sits centre on a wide screen; on a phone the grid collapses and
 * CSS `order` puts them back into 1-2-3 reading order, because a podium
 * stacked silver-first makes no sense in a column.
 */
export default function TopThreePodium({ top, meId }: { top: LeaderEntry[]; meId: string | null }) {
  const ref = useReveal<HTMLElement>()
  if (top.length === 0) return null

  return (
    <section className="lb-podium lp-reveal" ref={ref}>
      {PLACE.filter(p => top[p.i]).map(({ i, cls, medal }) => {
        const e = top[i]
        const tier = getTier(e.rating)
        return (
          <article className={`lb-pod ${cls} ${e.id === meId ? 'is-me' : ''}`} key={e.id} style={{ ['--i' as string]: i }}>
            <span className="lb-pod-medal" aria-hidden="true">{medal}</span>
            <span className="lb-pod-avatar" style={{ background: tier.fg }}>{e.name[0]?.toUpperCase()}</span>
            <Link to={e.id === meId ? '/profile' : `/profile/${e.id}`} className="lb-pod-name" style={{ color: tier.fg }}>
              {e.name}
            </Link>
            <span className="lb-pod-tier">{tier.label}</span>
            <span className="lb-pod-rating">{e.rating.toLocaleString('en-IN')}</span>
            {e.ratingChange ? (
              <span className={`lb-pod-change ${e.ratingChange > 0 ? 'is-up' : 'is-down'}`}>
                {e.ratingChange > 0 ? '+' : ''}{e.ratingChange} {e.ratingChange > 0 ? '↑' : '↓'}
              </span>
            ) : <span className="lb-pod-change" />}
            <span className="lb-pod-meta">
              {e.contests} {e.contests === 1 ? 'contest' : 'contests'}
              {e.bestRank && <> · best #{e.bestRank}</>}
            </span>
          </article>
        )
      })}
    </section>
  )
}
