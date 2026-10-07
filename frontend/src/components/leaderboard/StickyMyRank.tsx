import { useEffect, useState } from 'react'
import { getTier } from '../../lib/tiers'

/**
 * A bar that follows the reader down a long table.
 *
 * It appears only once their own row has been scrolled past, so it never
 * duplicates something already on screen, and it carries the three numbers
 * that matter — rank, rating, and how far the next rank is.
 */
export default function StickyMyRank({
  rank, name, rating, gapToNext, onJump,
}: {
  rank: number | null
  name: string
  rating: number
  gapToNext: number | null
  onJump: () => void
}) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 620)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!show || rank === null) return null
  const tier = getTier(rating)

  return (
    <div className="lb-sticky" role="status">
      <span className="lb-sticky-label">Your rank</span>
      <span className="lb-sticky-rank">#{rank.toLocaleString('en-IN')}</span>
      <span className="lb-sticky-name" style={{ color: tier.fg }}>{name}</span>
      <span className="lb-sticky-rating">{rating.toLocaleString('en-IN')}</span>
      {gapToNext !== null && gapToNext > 0 && (
        <span className="lb-sticky-gap">{gapToNext} to next rank</span>
      )}
      <button className="lp-btn lp-btn-primary lp-btn-sm" onClick={onJump}>Jump to me</button>
    </div>
  )
}
