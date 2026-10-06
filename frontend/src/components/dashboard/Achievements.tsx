import type { ProfileData } from './types'

/**
 * Milestones, every one of them decided by data already on the page.
 *
 * Nothing here is stored: there is no achievements table, so rather than
 * invent one these are predicates over the real stats. That keeps them
 * honest and means they unlock the moment the underlying number does —
 * but it also means they cannot carry a date, which is why none is shown.
 */
export default function Achievements({ p }: { p: ProfileData }) {
  const answered = p.verdictTotals.correct + p.verdictTotals.wrong
  const accuracy = answered > 0 ? p.verdictTotals.correct / answered : 0

  const items = [
    { icon: '🎯', name: 'First Steps', desc: 'Finished your first mock test', got: p.stats.totalMocks >= 1 },
    { icon: '🏆', name: 'First Contest', desc: 'Completed a rated contest', got: p.stats.totalContests >= 1 },
    { icon: '🔥', name: '7 Day Streak', desc: 'Practised seven days running', got: p.stats.maxStreak >= 7 },
    { icon: '📈', name: 'Breakthrough', desc: 'Crossed a 1600 rating', got: p.stats.maxRating >= 1600 },
    { icon: '🎖', name: 'Accuracy Master', desc: '90% accuracy across everything you have answered', got: answered >= 50 && accuracy >= 0.9 },
    { icon: '💯', name: 'Top 100 Finish', desc: 'Finished a contest in the top 100', got: p.stats.bestRank !== null && p.stats.bestRank <= 100 },
  ]
  const unlocked = items.filter(i => i.got).length

  return (
    <section className="db-card">
      <header className="db-card-head">
        <h2 className="db-card-title">Achievements</h2>
        <span className="db-ach-count">{unlocked} of {items.length}</span>
      </header>
      <div className="db-ach-grid">
        {items.map(i => (
          <div className={`db-ach ${i.got ? 'is-got' : ''}`} key={i.name}>
            <span className="db-ach-icon" aria-hidden="true">{i.got ? i.icon : '🔒'}</span>
            <span className="db-ach-name">{i.name}</span>
            <span className="db-ach-desc">{i.desc}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
