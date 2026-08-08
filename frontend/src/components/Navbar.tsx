import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toggleTheme, getTheme } from '../lib/theme'
import NotificationBell from './NotificationBell'

// `guest: true` means the link is shown to logged-out visitors too. The rest
// are hidden rather than shown-and-bounced, so a guest never clicks into a
// login redirect from the nav.
const NAV_ITEMS = [
  { path: '/', label: 'Home', guest: true },
  { path: '/contests', label: 'Contests', guest: true },
  { path: '/mocks', label: 'Mock Tests' },
  { path: '/leaderboard', label: 'Leaderboard', guest: true },
  { path: '/community', label: 'Community', guest: true },
  { path: '/bookmarks', label: 'Bookmarks' },
  { path: '/profile', label: 'Profile' },
]

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const signedIn = Boolean(localStorage.getItem('token'))
  const navItems = NAV_ITEMS.filter(i => signedIn || i.guest)
  const [dark, setDark] = useState(getTheme() === 'dark')
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the mobile menu whenever the route changes, and on Escape.
  useEffect(() => setMenuOpen(false), [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  function handleThemeToggle() {
    const next = toggleTheme()
    setDark(next === 'dark')
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  const isActive = (path: string) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <button className="navbar-brand" onClick={() => navigate('/')}>
          Rank<span>Arena</span>
        </button>
        <div className="nav-links">
          {navItems.map(item => (
            <button
              key={item.path}
              className={`nav-link ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="navbar-right">
        {/* Hidden on phones by CSS — the drawer carries it there instead, so
            the bar keeps room for the bell and the user chip. */}
        <button className="theme-toggle" onClick={handleThemeToggle} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {dark ? '☀️' : '🌙'}
        </button>
        {signedIn ? (
          <>
            <NotificationBell />
            <button className="navbar-user" onClick={() => navigate('/profile')}>
              <span className="navbar-avatar">{(user.name || '?')[0].toUpperCase()}</span>
              <span className="navbar-username">{user.name}</span>
              <span className="rating-badge">⭐ {user.rating ?? 1500}</span>
            </button>
            <button className="btn btn-ghost btn-sm navbar-logout" onClick={logout}>Logout</button>
          </>
        ) : (
          <div className="navbar-guest">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/login')}>Log in</button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/register')}>Sign up</button>
          </div>
        )}
        <button
          className="nav-toggle"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <span className={`nav-toggle-bars ${menuOpen ? 'open' : ''}`} />
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="nav-drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="nav-drawer">
            {navItems.map(item => (
              <button
                key={item.path}
                className={`nav-drawer-link ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => { setMenuOpen(false); navigate(item.path) }}
              >
                {item.label}
              </button>
            ))}
            <div className="nav-drawer-sep" />
            <button
              className="nav-drawer-link nav-drawer-theme"
              onClick={handleThemeToggle}
              aria-pressed={dark}
            >
              <span>{dark ? '☀️' : '🌙'} {dark ? 'Light mode' : 'Dark mode'}</span>
              <span className="nav-drawer-theme-state">{dark ? 'Dark' : 'Light'}</span>
            </button>
            <div className="nav-drawer-sep" />
            {signedIn ? (
              <button className="nav-drawer-link nav-drawer-logout" onClick={logout}>Logout</button>
            ) : (
              <>
                <button className="nav-drawer-link" onClick={() => navigate('/login')}>Log in</button>
                <button className="nav-drawer-link nav-drawer-signup" onClick={() => navigate('/register')}>Sign up</button>
              </>
            )}
          </div>
        </>
      )}
    </nav>
  )
}
