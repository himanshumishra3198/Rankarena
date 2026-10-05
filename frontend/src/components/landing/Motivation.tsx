import { Link } from 'react-router-dom'
import { useReveal } from './hooks'

export default function Motivation() {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="lp-motivation lp-reveal" ref={ref}>
      <div className="lp-motivation-bg" aria-hidden="true"><div className="lp-grid" /></div>
      <div className="lp-shell lp-motivation-inner">
        <h2 className="lp-motivation-title">
          Everyone can take a mock test.<br />
          <span className="lp-grad">Not everyone can compete.</span>
        </h2>
        <p className="lp-motivation-sub">
          Step into the arena, challenge yourself, and see where you actually stand.
        </p>
        <Link to="/register" className="lp-btn lp-btn-primary lp-btn-lg">
          Start Competing <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  )
}
