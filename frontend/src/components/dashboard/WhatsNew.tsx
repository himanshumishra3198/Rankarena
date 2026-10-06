import { Link } from 'react-router-dom'

/**
 * A short read of the roadmap. The full version lives on the public page,
 * and these three mirror its Phase 2 and 3 so there is one place to edit
 * when the plan moves — deliberately a summary, not a second roadmap.
 */
const ITEMS = [
  { icon: '🚧', name: 'Hindi mock tests', state: 'In progress' },
  { icon: '📊', name: 'Detailed performance analytics', state: 'In progress' },
  { icon: '🏆', name: 'Weekly championships', state: 'Coming soon' },
]

export default function WhatsNew() {
  return (
    <section className="db-card">
      <header className="db-card-head">
        <h2 className="db-card-title">What's Coming</h2>
        <Link to="/#roadmap" className="lp-link-arrow db-card-link">Roadmap <span aria-hidden="true">→</span></Link>
      </header>
      <ul className="db-new">
        {ITEMS.map(i => (
          <li key={i.name}>
            <span aria-hidden="true">{i.icon}</span>
            <span className="db-new-name">{i.name}</span>
            <span className={`db-new-state ${i.state === 'In progress' ? 'is-active' : ''}`}>{i.state}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
