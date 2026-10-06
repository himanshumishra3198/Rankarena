import { Link } from 'react-router-dom'

/**
 * What a brand-new account sees instead of a grid of zeroes.
 *
 * The sections that will fill in are named rather than rendered empty —
 * a chart with no points and a rank of "—" tells somebody their dashboard
 * is broken, not that they have not started.
 */
export default function NewUserWelcome({ name }: { name: string }) {
  return (
    <section className="db-welcome">
      <div className="db-hero-glow" aria-hidden="true" />
      <div className="db-welcome-body">
        <span className="db-hero-tag">🎯 WELCOME TO RANKARENA</span>
        <h2 className="db-welcome-title">You haven't entered the arena yet, {name.split(' ')[0]}.</h2>
        <p className="db-welcome-sub">
          Start with a sectional mock to find your level, or go straight into a rated
          contest and get a rating on the board.
        </p>
        <div className="db-hero-cta">
          <Link to="/mocks" className="lp-btn lp-btn-primary lp-btn-lg">Take Your First Mock Test <span aria-hidden="true">→</span></Link>
          <Link to="/contests" className="lp-btn lp-btn-ghost lp-btn-lg">Explore Contests</Link>
        </div>

        <div className="db-welcome-next">
          <span className="db-welcome-next-label">Your progress will appear here</span>
          <div className="db-welcome-grid">
            {[
              ['Rating', 'Moves with every rated contest'],
              ['Global rank', 'Where you sit against everyone'],
              ['Subject accuracy', 'Which topics need the work'],
              ['Streak', 'Days in a row you showed up'],
            ].map(([t, d]) => (
              <div className="db-welcome-cell" key={t}>
                <b>{t}</b><span>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
