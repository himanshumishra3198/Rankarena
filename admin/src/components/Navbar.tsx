import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getTheme, toggleTheme } from '../lib/theme'
import api from '../lib/api'

export default function Navbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [dark, setDark] = useState(getTheme() === 'dark')
  const [openReports, setOpenReports] = useState(0)

  useEffect(() => {
    api.get('/admin/reports', { params: { status: 'OPEN' } })
      .then(r => setOpenReports(r.data.openCount ?? 0))
      .catch(() => {})
  }, [pathname])

  function handleThemeToggle() {
    const next = toggleTheme()
    setDark(next === 'dark')
  }

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <span className="navbar-brand">
          Rank<span>Arena</span>{' '}
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>Admin</span>
        </span>
        <div className="nav-links">
          <button
            className={`nav-link ${pathname === '/' || pathname.startsWith('/contests') ? 'active' : ''}`}
            onClick={() => navigate('/')}
          >
            Contests
          </button>
          <button
            className={`nav-link ${pathname === '/questions' ? 'active' : ''}`}
            onClick={() => navigate('/questions')}
          >
            Questions
          </button>
          <button
            className={`nav-link ${pathname.startsWith('/mocks') ? 'active' : ''}`}
            onClick={() => navigate('/mocks')}
          >
            Mock Tests
          </button>
          <button
            className={`nav-link ${pathname.startsWith('/community') ? 'active' : ''}`}
            onClick={() => navigate('/community')}
          >
            Community
          </button>
          <button
            className={`nav-link ${pathname.startsWith('/reports') ? 'active' : ''}`}
            onClick={() => navigate('/reports')}
          >
            Reports
            {openReports > 0 && <span className="nav-report-badge">{openReports}</span>}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleThemeToggle}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ fontSize: 16, padding: '4px 8px' }}
        >
          {dark ? '☀️' : '🌙'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
      </div>
    </nav>
  )
}
