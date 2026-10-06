import { Link } from 'react-router-dom'

const ACTIONS = [
  { to: '/mocks', icon: '📝', label: 'Take a Mock Test', primary: true },
  { to: '/contests', icon: '🏆', label: 'Join a Contest', primary: true },
  { to: '/profile', icon: '📊', label: 'My Performance' },
  { to: '/leaderboard', icon: '🏅', label: 'Leaderboard' },
]

export default function QuickActions() {
  return (
    <nav className="db-quick" aria-label="Quick actions">
      {ACTIONS.map(a => (
        <Link key={a.to} to={a.to} className={`db-quick-btn ${a.primary ? 'is-primary' : ''}`}>
          <span aria-hidden="true">{a.icon}</span>{a.label}
        </Link>
      ))}
    </nav>
  )
}
