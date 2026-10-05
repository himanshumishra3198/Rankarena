import FeatureCard from './FeatureCard'
import { useReveal } from './hooks'

/* Inline SVG rather than emoji: emoji render at a different size and weight
   on every platform, which made the icon row look uneven. */
const IconTrophy = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    <path d="M12 14v4M9 21h6" />
  </svg>
)
const IconBars = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <path d="M5 20V10M12 20V4M19 20v-7" />
  </svg>
)
const IconPulse = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h4l2.5-7 5 14L17 12h4" />
  </svg>
)
const IconFlame = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3s5 4 5 8a5 5 0 0 1-10 0c0-1.5.8-2.8 1.6-3.7C9.4 6.4 12 5 12 3Z" />
    <path d="M12 21a3 3 0 0 0 3-3c0-1.8-3-3.6-3-3.6S9 16.2 9 18a3 3 0 0 0 3 3Z" />
  </svg>
)

export default function WhyRankArena() {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="lp-section lp-reveal" ref={ref} id="why">
      <div className="lp-shell">
        <header className="lp-section-head">
          <span className="lp-kicker">Why RankArena</span>
          <h2 className="lp-h2">Preparation Meets Competition</h2>
        </header>

        <div className="lp-feature-grid">
          <FeatureCard icon={IconTrophy} title="Rated Contests" accent="#5b8cff">
            Take timed contests and receive a rating based on your performance.
          </FeatureCard>
          <FeatureCard icon={IconBars} title="Live Leaderboards" accent="#a78bfa">
            See how you perform against other aspirants in real time.
          </FeatureCard>
          <FeatureCard icon={IconPulse} title="Performance Tracking" accent="#34d399">
            Understand your strengths, weaknesses and progress over time.
          </FeatureCard>
          <FeatureCard icon={IconFlame} title="Competitive Motivation" accent="#fbbf24">
            Turn preparation into a challenge that keeps you coming back.
          </FeatureCard>
        </div>
      </div>
    </section>
  )
}
