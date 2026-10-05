import { formatCount, useCountUp, useReveal } from './hooks'
import type { PublicStats } from './types'

/**
 * Platform numbers, counted up as they come into view.
 *
 * These are the real figures from /stats/public, not rounded marketing
 * claims — the component renders whatever the backend reports and shows a
 * placeholder until it arrives, so it stays honest as the platform grows.
 * The last tile is a statement about availability rather than a count,
 * which is why it has no number to animate.
 */

function StatTile({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  const { ref, shown } = useCountUp(value)
  return (
    <div className="lp-stat">
      <span className="lp-stat-value" ref={ref}>
        {value > 0 ? formatCount(shown) : '—'}{value > 0 && suffix}
      </span>
      <span className="lp-stat-label">{label}</span>
    </div>
  )
}

export default function Stats({ stats }: { stats: PublicStats | null }) {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="lp-stats lp-reveal" ref={ref}>
      <div className="lp-shell lp-stats-grid">
        <StatTile value={stats?.aspirants ?? 0} label="Aspirants" suffix="+" />
        <StatTile value={stats?.questions ?? 0} label="Problems" suffix="+" />
        <StatTile value={stats?.contests ?? 0} label="Contests" suffix="" />
        <div className="lp-stat">
          <span className="lp-stat-value">24/7</span>
          <span className="lp-stat-label">Practice Arena</span>
        </div>
      </div>
    </section>
  )
}
