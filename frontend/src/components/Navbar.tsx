import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toggleTheme, getTheme } from '../lib/theme'

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const [dark, setDark] = useState(getTheme() === 'dark')

  function handleThemeToggle() {
    const next = toggleTheme()
    setDark(next === 'dark')
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <button className="navbar-brand" onClick={() => navigate('/')}>
          Rank<span>Arena</span>
        </button>
        <div className="nav-links">
          <button
            className={`nav-link ${isActive('/') && !isActive('/profile') && !isActive('/mocks') ? 'active' : ''}`}
            onClick={() => navigate('/')}
          >
            Contests
          </button>
          <button
            className={`nav-link ${isActive('/mocks') ? 'active' : ''}`}
            onClick={() => navigate('/mocks')}
          >
            Mock Tests
          </button>
          <button
            className={`nav-link ${isActive('/leaderboard') ? 'active' : ''}`}
            onClick={() => navigate('/leaderboard')}
          >
            Leaderboard
          </button>
          <button
            className={`nav-link ${isActive('/bookmarks') ? 'active' : ''}`}
            onClick={() => navigate('/bookmarks')}
          >
            Bookmarks
          </button>
          <button
            className={`nav-link ${isActive('/profile') ? 'active' : ''}`}
            onClick={() => navigate('/profile')}
          >
            Profile
          </button>
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
        <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
      </div>
    </nav>
  )
}
