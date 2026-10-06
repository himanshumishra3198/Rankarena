import { ActivityHeatmap } from '../ActivityHeatmap'
import type { ProfileData } from './types'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * The last seven days, plus the streak the backend already tracks.
 *
 * `currentStreak` and `maxStreak` come from /profile — this does not
 * recompute them, it just draws them, so the dashboard and the profile can
 * never disagree about how many days in a row somebody has shown up.
 */
export default function ActivityStreak({ p }: { p: ProfileData }) {
  const today = new Date()
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (6 - i))
    const key = d.toISOString().split('T')[0]
    return { label: DAYS[(d.getDay() + 6) % 7], count: p.heatmap[key] ?? 0, isToday: i === 6 }
  })

  const { currentStreak, maxStreak } = p.stats

  return (
    <section className="db-card">
      <header className="db-card-head">
        <h2 className="db-card-title">Your Activity</h2>
        {currentStreak > 0 && (
          <span className="db-streak">{currentStreak} day{currentStreak === 1 ? '' : 's'} <span aria-hidden="true">🔥</span></span>
        )}
      </header>

      <div className="db-week">
        {week.map((d, i) => (
          <div className={`db-day ${d.count > 0 ? 'is-on' : ''} ${d.isToday ? 'is-today' : ''}`} key={i}>
            <span className="db-day-dot" title={`${d.count} solved`} aria-hidden="true" />
            <span className="db-day-label">{d.label}</span>
          </div>
        ))}
      </div>

      <p className="db-week-note">
        {currentStreak > 0
          ? <>Longest run so far: <b>{maxStreak} days</b>. Keep it going.</>
          : <>Solve anything today to start a streak.</>}
      </p>

      {p.stats.activeDays > 0 && (
        <div className="db-heatmap"><ActivityHeatmap heatmap={p.heatmap} /></div>
      )}
    </section>
  )
}
