import { useCountUp, useReveal } from '../landing/hooks'
import type { MockTestListItem } from '../../lib/types'

function Tile({ value, label, suffix, text }: { value?: number; label: string; suffix?: string; text?: string }) {
  const { ref, shown } = useCountUp(value ?? 0)
  return (
    <div className="mk-stat">
      <span className="mk-stat-value" ref={ref}>
        {text ?? (value && value > 0 ? `${shown.toLocaleString('en-IN')}${suffix ?? ''}` : '—')}
      </span>
      <span className="mk-stat-label">{label}</span>
    </div>
  )
}

/**
 * Counts taken from the list the page already has, so the headline figures
 * and the grid can never tell different stories. "Your best" only appears
 * once there is an attempt to take a best of.
 */
export default function StatsOverview({ mocks, signedIn }: { mocks: MockTestListItem[]; signedIn: boolean }) {
  const ref = useReveal<HTMLElement>()
  const questions = mocks.reduce((n, m) => n + m.questionCount, 0)
  const subjects = new Set(mocks.map(m => m.subject)).size
  const scored = mocks.filter(m => m.attempted && m.lastTotal)
  const best = scored.length
    ? Math.round(Math.max(...scored.map(m => (m.lastScore! / m.lastTotal!) * 100)))
    : null

  return (
    <section className="mk-stats lp-reveal" ref={ref}>
      <div className="mk-stats-grid">
        <Tile value={mocks.length} label="Mock Tests" />
        <Tile value={subjects} label="Subjects" />
        <Tile value={questions} label="Questions" suffix="+" />
        {signedIn
          ? <Tile text={best !== null ? `${best}%` : '—'} label="Your Best" />
          : <Tile text="24/7" label="Open Arena" />}
      </div>
    </section>
  )
}
