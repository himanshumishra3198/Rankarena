import { useCountUp } from '../landing/hooks'
import { getTier } from '../../lib/tiers'
import type { ProfileData } from './types'

function Tile({ value, label, sub, colour, text }: {
  value?: number; label: string; sub?: React.ReactNode; colour?: string; text?: string
}) {
  const { ref, shown } = useCountUp(value ?? 0)
  return (
    <div className="db-stat">
      <span className="db-stat-label">{label}</span>
      <span className="db-stat-value" ref={ref} style={colour ? { color: colour } : undefined}>
        {text ?? (value !== undefined ? shown.toLocaleString('en-IN') : '—')}
      </span>
      {sub && <span className="db-stat-sub">{sub}</span>}
    </div>
  )
}

/**
 * Four numbers, each one the reader's own.
 *
 * The rating delta is the change from the most recent rated contest, not a
 * running total — it is the answer to "how did the last one go".
 */
export default function StatsOverview({ p }: { p: ProfileData }) {
  const last = p.ratingHistory[p.ratingHistory.length - 1]
  const delta = last ? last.newRating - last.oldRating : null
  const tier = getTier(p.user.rating)

  return (
    <div className="db-stats">
      <Tile
        label="Rating" value={p.user.rating} colour={tier.fg}
        sub={delta !== null
          ? <em className={delta >= 0 ? 'db-up' : 'db-down'}>{delta >= 0 ? '+' : ''}{delta} {delta >= 0 ? '↑' : '↓'}</em>
          : <em className="db-muted">{tier.label}</em>}
      />
      <Tile
        label="Global rank"
        text={p.stats.globalRank ? `#${p.stats.globalRank.toLocaleString('en-IN')}` : '—'}
        sub={p.stats.globalRank ? <em className="db-muted">of {p.stats.totalRanked.toLocaleString('en-IN')}</em> : undefined}
      />
      <Tile label="Mock tests" value={p.stats.totalMocks} sub={<em className="db-muted">{p.stats.totalSolved} questions solved</em>} />
      <Tile
        label="Contests" value={p.stats.totalContests}
        sub={p.stats.bestRank ? <em className="db-muted">best #{p.stats.bestRank}</em> : undefined}
      />
    </div>
  )
}
