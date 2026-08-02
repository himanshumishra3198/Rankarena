import { Link } from 'react-router-dom'

// Site footer for the public-facing pages. It exists mainly so /about is
// reachable from the UI at all, and gives Contact / Privacy somewhere to
// live later without another layout change.
export default function Footer() {
  const signedIn = Boolean(localStorage.getItem('token'))

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link to="/" className="navbar-brand site-footer-logo">
            Rank<span>Arena</span>
          </Link>
          <p className="site-footer-tagline">
            Live contests, mock tests and a community for SSC aspirants.
          </p>
        </div>

        <nav className="site-footer-links" aria-label="Footer">
          <Link to="/about">About</Link>
          <Link to="/community">Community</Link>
          <Link to="/leaderboard">Leaderboard</Link>
          {signedIn
            ? <Link to="/mocks">Mock Tests</Link>
            : <Link to="/register">Sign up</Link>}
        </nav>
      </div>
      <div className="site-footer-bottom">
        © {new Date().getFullYear()} RankArena
      </div>
    </footer>
  )
}
