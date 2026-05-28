import { useNavigate, useLocation } from 'react-router-dom'

export default function Navbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <span className="navbar-brand">Rank<span>Arena</span> <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>Admin</span></span>
        <div className="nav-links">
          <button className={`nav-link ${pathname === '/' || pathname.startsWith('/contests') ? 'active' : ''}`} onClick={() => navigate('/')}>Contests</button>
          <button className={`nav-link ${pathname === '/questions' ? 'active' : ''}`} onClick={() => navigate('/questions')}>Questions</button>
        </div>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
    </nav>
  )
}
