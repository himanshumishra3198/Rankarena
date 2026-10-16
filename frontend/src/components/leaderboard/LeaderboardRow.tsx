import { Link } from 'react-router-dom'
import { getTier } from '../../lib/tiers'
import type { LeaderEntry } from './types'

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

/**
 * One row, used by the table and by the neighbours list.
 *
 * `ratingChange` is rating, never position — the two are different numbers
 * and the column header says so. A change of zero is shown as a dash rather
 * than "+0", which reads like a result when it means "nothing happened".
 */
export default function LeaderboardRow({ e, isMe }: { e: LeaderEntry; isMe: boolean }) {
  const tier = getTier(e.rating)
  const change = e.ratingChange
  return (
    <div className={`lb-row ${isMe ? 'is-me' : ''}`}>
      <span className="lb-rank">{MEDAL[e.rank] ?? e.rank.toLocaleString('en-IN')}</span>
      <Link to={isMe ? '/profile' : `/profile/${e.id}`} className="lb-user">
        <span className="lb-avatar" style={{ background: tier.fg }}>{e.name[0]?.toUpperCase()}</span>
        <span className="lb-name" style={{ color: tier.fg }}>{e.name}{isMe && <em> (you)</em>}</span>
        <span className="lb-tier">{tier.label}</span>
      </Link>
      <span className="lb-rating">{e.rating.toLocaleString('en-IN')}</span>
      <span className={`lb-change ${change && change > 0 ? 'is-up' : change && change < 0 ? 'is-down' : ''}`}>
        {change ? <>{change > 0 ? '+' : ''}{change} {change > 0 ? '↑' : '↓'}</> : <i>—</i>}
      </span>
      <span className="lb-contests">{e.contests}</span>
      <span className="lb-best">{e.bestRank ? `#${e.bestRank}` : <i>—</i>}</span>
    </div>
  )
}
