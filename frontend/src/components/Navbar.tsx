import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toggleTheme, getTheme } from '../lib/theme'

const NAV_ITEMS = [
  { path: '/', label: 'Contests' },
  { path: '/mocks', label: 'Mock Tests' },
  { path: '/leaderboard', label: 'Leaderboard' },
  { path: '/community', label: 'Community' },
  { path: '/bookmarks', label: 'Bookmarks' },
  { path: '/profile', label: 'Profile' },
]

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
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
      ? location.pathname === '/' || location.pathname.startsWith('/contest')
      : location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <button className="navbar-brand" onClick={() => navigate('/')}>
          Rank<span>Arena</span>
        </button>
        <div className="nav-links">
          {NAV_ITEMS.map(item => (
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
        <button className="theme-toggle" onClick={handleThemeToggle} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {dark ? '☀️' : '🌙'}
        </button>
        <button className="navbar-user" onClick={() => navigate('/profile')}>
          <span className="navbar-avatar">{(user.name || '?')[0].toUpperCase()}</span>
          <span className="navbar-username">{user.name}</span>
          <span className="rating-badge">⭐ {user.rating ?? 1500}</span>
        </button>
        <button className="btn btn-ghost btn-sm navbar-logout" onClick={logout}>Logout</button>
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
            {NAV_ITEMS.map(item => (
              <button
                key={item.path}
                className={`nav-drawer-link ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => { setMenuOpen(false); navigate(item.path) }}
              >
                {item.label}
              </button>
            ))}
            <div className="nav-drawer-sep" />
            <button className="nav-drawer-link nav-drawer-logout" onClick={logout}>Logout</button>
          </div>
        </>
      )}
    </nav>
  )
}
