import { Link } from 'react-router-dom'
import { useReveal } from '../landing/hooks'

/**
 * What a contest does to a rating. The figures are a worked example and the
 * card says so — the mechanism is the point, not the numbers.
 */
export default function RatingExplanation() {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="ct-section lp-reveal" ref={ref} id="ratings">
      <div className="ct-rating">
        <div>
          <span className="lp-kicker">Ratings</span>
          <h2 className="mk-h2">Every Contest Changes Your Rating</h2>
          <p className="mk-section-sub">
            Your rating reflects how you perform against other participants. The stronger
            the competition you beat, the more it can grow — and a quiet contest against
            a strong field costs less than it looks.
          </p>
          <ul className="lp-rating-points">
            <li><b>Relative, not absolute.</b> A score only means something next to the people who sat the same paper.</li>
            <li><b>One number, everywhere.</b> It follows you onto the leaderboard and your profile.</li>
            <li><b>Tiers to climb.</b> Newbie through Grandmaster, the same ladder the rankings use.</li>
          </ul>
          <Link to="/leaderboard" className="lp-link-arrow">See where it puts you <span aria-hidden="true">→</span></Link>
        </div>

        <figure className="lp-ladder">
          <figcaption className="lp-ladder-cap">Example</figcaption>
          <div className="lp-ladder-step">
            <span className="lp-ladder-label">Your rating</span>
            <span className="lp-ladder-value">1542</span>
          </div>
          <span className="lp-ladder-arrow" aria-hidden="true">↓</span>
          <div className="lp-ladder-step lp-ladder-perf">
            <span className="lp-ladder-label">Contest · rank 142 of 1,847</span>
            <span className="lp-ladder-bars" aria-hidden="true">
              {[42, 70, 55, 86, 64].map((h, i) => <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 110}ms` }} />)}
            </span>
          </div>
          <span className="lp-ladder-arrow" aria-hidden="true">↓</span>
          <div className="lp-ladder-step lp-ladder-new">
            <span className="lp-ladder-label">New rating</span>
            <span className="lp-ladder-value">1587 <em className="lp-up">+45 ↑</em></span>
          </div>
        </figure>
      </div>
    </section>
  )
}
