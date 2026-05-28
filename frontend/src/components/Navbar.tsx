import { useNavigate } from 'react-router-dom'

export default function Navbar() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <span className="navbar-brand">Rank<span>Arena</span></span>
      <div className="navbar-right">
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{user.name}</span>
        <span className="rating-badge">⭐ {user.rating ?? 1500}</span>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
      </div>
    </nav>
  )
}
