import { Link } from 'react-router-dom'
import { useReveal } from '../landing/hooks'

export default function ContestsCTA({ signedIn }: { signedIn: boolean }) {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="ct-section lp-reveal" ref={ref}>
      <div className="lp-final">
        <h2 className="lp-h2">{signedIn ? 'There Is Always Another Contest.' : 'Ready to Prove Your Rank?'}</h2>
        <p className="lp-final-sub">
          {signedIn
            ? 'Register for the next one and put your rating on the line.'
            : 'Create an account to register for contests, earn a rating and climb the leaderboard.'}
        </p>
        <div className="lp-final-cta">
          {signedIn
            ? <a href="#contest-list" className="lp-btn lp-btn-primary lp-btn-lg">See Upcoming Contests</a>
            : <Link to="/register" className="lp-btn lp-btn-primary lp-btn-lg">Create Free Account</Link>}
          <Link to="/mocks" className="lp-btn lp-btn-ghost lp-btn-lg">Warm Up With a Mock</Link>
        </div>
      </div>
    </section>
  )
}
