import { useReveal } from './hooks'

type Status = 'done' | 'active' | 'soon' | 'future'

const PHASES: {
  phase: string; name: string; status: Status; label: string; pct: number; items: string[]
}[] = [
  {
    phase: 'Phase 1', name: 'Foundation', status: 'done', label: 'Completed', pct: 100,
    items: ['SSC CGL Mock Tests', 'Rated Contests', 'User Authentication', 'Live Leaderboards', 'Rating System', 'Performance Tracking'],
  },
  {
    phase: 'Phase 2', name: 'Level Up', status: 'active', label: 'In Progress', pct: 65,
    items: ['Hindi + English Questions', 'Improved Contest Experience', 'Detailed Performance Analytics', 'Topic-wise Performance', 'Contest History', 'Rating History'],
  },
  {
    phase: 'Phase 3', name: 'Expand the Arena', status: 'soon', label: 'Coming Soon', pct: 0,
    items: ['More SSC Exams', 'More Question Categories', 'Advanced Rankings', 'Weekly Competitions', 'Achievement System', 'Badges & Streaks'],
  },
  {
    phase: 'Phase 4', name: 'The Bigger Arena', status: 'future', label: 'Future', pct: 0,
    items: ['Multiple Competitive Exams', 'National Rankings', 'Team Competitions', 'Community Features', 'Personalized Preparation'],
  },
]

/**
 * The roadmap as a progression track rather than a Gantt chart: a spine you
 * climb, each phase a stage with its own state, bar and unlock list.
 */
export default function Roadmap() {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="lp-section lp-roadmap-section lp-reveal" ref={ref} id="roadmap">
      <div className="lp-shell">
        <header className="lp-section-head">
          <span className="lp-kicker">Roadmap</span>
          <h2 className="lp-h2">The Arena Is Just Getting Started.</h2>
          <p className="lp-section-sub">Here's where we're taking RankArena next.</p>
        </header>

        <ol className="lp-track">
          {PHASES.map((p, i) => (
            <li className={`lp-phase is-${p.status}`} key={p.phase} style={{ ['--i' as string]: i }}>
              <div className="lp-phase-spine" aria-hidden="true">
                <span className="lp-phase-node">{p.status === 'done' ? '✓' : i + 1}</span>
              </div>

              <div className="lp-phase-card">
                <div className="lp-phase-head">
                  <div>
                    <span className="lp-phase-no">{p.phase}</span>
                    <h3 className="lp-phase-name">{p.name}</h3>
                  </div>
                  <span className="lp-phase-status">{p.label}</span>
                </div>

                <div className="lp-phase-bar" role="img" aria-label={`${p.pct}% complete`}>
                  <span style={{ width: `${p.pct}%` }} />
                </div>
                <span className="lp-phase-pct">{p.pct}%</span>

                <ul className="lp-phase-items">
                  {p.items.map(it => (
                    <li key={it}><i aria-hidden="true">{p.status === 'done' ? '✓' : '◆'}</i>{it}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
