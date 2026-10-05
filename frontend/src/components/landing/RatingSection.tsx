import { useReveal } from './hooks'

/**
 * How a contest turns into a rating.
 *
 * The numbers here are a worked example, and the section says so — it is a
 * diagram of the mechanism, not a claim about anybody's account.
 */
export default function RatingSection() {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="lp-section lp-reveal" ref={ref} id="rating">
      <div className="lp-shell lp-rating">
        <div className="lp-rating-copy">
          <span className="lp-kicker">The rating</span>
          <h2 className="lp-h2">Your Preparation Has a Rating</h2>
          <p className="lp-lede">
            A mock test tells you a score. RankArena tells you where that score puts
            you. Every rated contest moves a single number that carries across the
            whole platform — so progress is something you can watch, not guess at.
          </p>
          <ul className="lp-rating-points">
            <li><b>Relative, not absolute.</b> You are measured against the people who sat the same paper.</li>
            <li><b>It follows you.</b> One rating across every contest, with the full history on your profile.</li>
            <li><b>Tiers to climb.</b> Newbie through Grandmaster, the same ladder the leaderboard shows.</li>
          </ul>
        </div>

        <figure className="lp-ladder">
          <figcaption className="lp-ladder-cap">Example</figcaption>

          <div className="lp-ladder-step">
            <span className="lp-ladder-label">Previous rating</span>
            <span className="lp-ladder-value">1520</span>
          </div>

          <span className="lp-ladder-arrow" aria-hidden="true">↓</span>

          <div className="lp-ladder-step lp-ladder-perf">
            <span className="lp-ladder-label">Contest performance</span>
            <span className="lp-ladder-bars" aria-hidden="true">
              {[38, 64, 52, 81, 70].map((h, i) => (
                <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 110}ms` }} />
              ))}
            </span>
          </div>

          <span className="lp-ladder-arrow" aria-hidden="true">↓</span>

          <div className="lp-ladder-step lp-ladder-new">
            <span className="lp-ladder-label">New rating</span>
            <span className="lp-ladder-value">
              1587 <em className="lp-up">+67 ↑</em>
            </span>
          </div>
        </figure>
      </div>
    </section>
  )
}
