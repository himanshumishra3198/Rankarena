import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Logo from '../Logo'
import { useScrolled } from './hooks'

/**
 * The landing page's own navigation.
 *
 * Deliberately not the app's <Navbar/>: that one is for signed-in work
 * (notifications, rating chip, the user menu) and carries the app's theme,
 * while this sits transparent over the dark hero and solidifies on scroll.
 * Keeping them separate means the marketing page can't regress any screen
 * behind the login.
 */

const LINKS = [
  { label: 'Contests', to: '/contests' },
  { label: 'Mock Tests', to: '/mocks' },
  { label: 'Leaderboard', to: '/leaderboard' },
  { label: 'Rankings', to: '#leaderboard', hash: true },
  { label: 'Roadmap', to: '#roadmap', hash: true },
]

export default function LandingNav() {
  const navigate = useNavigate()
  const scrolled = useScrolled(14)
  const [open, setOpen] = useState(false)

  // The drawer must not outlive the reason it was opened.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  function go(link: typeof LINKS[number]) {
    setOpen(false)
    if (link.hash) document.querySelector(link.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else navigate(link.to)
  }

  return (
    <header className={`lp-nav ${scrolled ? 'is-stuck' : ''}`}>
      <div className="lp-nav-inner">
        <Link to="/" className="lp-brand" aria-label="RankArena home">
          <Logo />
        </Link>

        <nav className="lp-nav-links" aria-label="Primary">
          {LINKS.map(l => (
            <button key={l.label} className="lp-nav-link" onClick={() => go(l)}>{l.label}</button>
          ))}
        </nav>

        <div className="lp-nav-actions">
          <Link to="/login" className="lp-nav-login">Login</Link>
          <Link to="/register" className="lp-btn lp-btn-primary lp-btn-sm">Sign Up</Link>
        </div>

        <button
          className="lp-burger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <span className={open ? 'open' : ''} />
        </button>
      </div>

      {open && (
        <>
          <div className="lp-drawer-scrim" onClick={() => setOpen(false)} />
          <div className="lp-drawer">
            {LINKS.map(l => (
              <button key={l.label} className="lp-drawer-link" onClick={() => go(l)}>{l.label}</button>
            ))}
            <div className="lp-drawer-sep" />
            <Link to="/login" className="lp-drawer-link" onClick={() => setOpen(false)}>Login</Link>
            <Link to="/register" className="lp-btn lp-btn-primary lp-drawer-cta" onClick={() => setOpen(false)}>
              Sign Up
            </Link>
          </div>
        </>
      )}
    </header>
  )
}
