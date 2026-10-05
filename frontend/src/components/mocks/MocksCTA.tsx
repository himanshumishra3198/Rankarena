import { Link } from 'react-router-dom'
import { useReveal } from '../landing/hooks'

export default function MocksCTA({ signedIn }: { signedIn: boolean }) {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="mk-section lp-reveal" ref={ref}>
      <div className="lp-final">
        <h2 className="lp-h2">{signedIn ? 'One More Test Changes Your Rank.' : 'Ready to Enter the Arena?'}</h2>
        <p className="lp-final-sub">
          {signedIn
            ? 'Every paper you sit sharpens the next one — and moves where you stand.'
            : 'Create an account to keep your scores, track accuracy and climb the rankings.'}
        </p>
        <div className="lp-final-cta">
          {signedIn
            ? <Link to="/contests" className="lp-btn lp-btn-primary lp-btn-lg">Enter a Rated Contest</Link>
            : <Link to="/register" className="lp-btn lp-btn-primary lp-btn-lg">Create Free Account</Link>}
          <Link to="/practice" className="lp-btn lp-btn-ghost lp-btn-lg">Browse the Problemset</Link>
        </div>
      </div>
    </section>
  )
}
