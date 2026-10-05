import { Link } from 'react-router-dom'
import { useReveal } from './hooks'

export default function FinalCTA() {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="lp-section lp-reveal" ref={ref}>
      <div className="lp-shell">
        <div className="lp-final">
          <h2 className="lp-h2">Ready to Enter the Arena?</h2>
          <p className="lp-final-sub">Your next rank starts with your next contest.</p>
          <div className="lp-final-cta">
            <Link to="/register" className="lp-btn lp-btn-primary lp-btn-lg">Create Free Account</Link>
            <Link to="/contests" className="lp-btn lp-btn-ghost lp-btn-lg">Explore Contests</Link>
          </div>
        </div>
      </div>
    </section>
  )
}
