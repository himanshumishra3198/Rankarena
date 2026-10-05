import { Link } from 'react-router-dom'
import Logo from '../Logo'

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Compete',
    links: [
      { label: 'Contests', to: '/contests' },
      { label: 'Mock Tests', to: '/mocks' },
      { label: 'Rankings', to: '/leaderboard' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { label: 'Roadmap', to: '#roadmap' },
      { label: 'Community', to: '/community' },
      { label: 'Practice', to: '/practice' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
]

export default function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-shell lp-footer-grid">
        <div className="lp-footer-brand">
          <Logo />
          <p className="lp-footer-tag">Built for aspirants who want to compete, not just practice.</p>
        </div>

        {COLUMNS.map(col => (
          <nav className="lp-footer-col" key={col.title} aria-label={col.title}>
            <h3>{col.title}</h3>
            {col.links.map(l => (
              l.to.startsWith('#')
                ? <a key={l.label} href={l.to}>{l.label}</a>
                : <Link key={l.label} to={l.to}>{l.label}</Link>
            ))}
          </nav>
        ))}
      </div>

      <div className="lp-shell lp-footer-bar">
        <span>© {new Date().getFullYear()} RankArenas</span>
        <span>SSC CGL · CHSL · MTS · CPO · GD</span>
      </div>
    </footer>
  )
}
