import { useEffect } from 'react'
import type { Period } from './types'

export const PERIODS: { k: Period; label: string }[] = [
  { k: 'all', label: 'Overall' }, { k: 'month', label: 'This month' }, { k: 'week', label: 'This week' },
]
export const RATING_BANDS = [0, 1200, 1400, 1600, 1900]

/**
 * Period and a rating floor — the two the backend can actually filter on.
 *
 * The brief also asked for exam and region. Users carry neither: there is
 * one exam track and no location on the model, so those controls would be
 * decoration that filters nothing.
 */
function Body({ period, minRating, onPeriod, onMin }: {
  period: Period; minRating: number
  onPeriod: (p: Period) => void; onMin: (n: number) => void
}) {
  return (
    <>
      <div className="mk-fgroup">
        <span className="mk-flabel">Period</span>
        <div className="mk-fchips">
          {PERIODS.map(p => (
            <button key={p.k} className={`mk-chip ${period === p.k ? 'is-on' : ''}`} onClick={() => onPeriod(p.k)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mk-fgroup">
        <span className="mk-flabel">Rating</span>
        <div className="mk-fchips">
          {RATING_BANDS.map(b => (
            <button key={b} className={`mk-chip ${minRating === b ? 'is-on' : ''}`} onClick={() => onMin(b)}>
              {b === 0 ? 'All' : `${b}+`}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

export default function LeaderboardFilters({
  period, minRating, onPeriod, onMin, open, onClose, activeCount,
}: {
  period: Period; minRating: number
  onPeriod: (p: Period) => void; onMin: (n: number) => void
  open: boolean; onClose: () => void; activeCount: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  return (
    <>
      <div className="mk-filters-inline">
        <Body period={period} minRating={minRating} onPeriod={onPeriod} onMin={onMin} />
      </div>
      {open && (
        <div className="mk-sheet-wrap" role="dialog" aria-modal="true" aria-label="Leaderboard filters">
          <div className="mk-sheet-scrim" onClick={onClose} />
          <div className="mk-sheet">
            <div className="mk-sheet-grip" aria-hidden="true" />
            <div className="mk-sheet-head">
              <h2>Filters</h2>
              <button className="mk-sheet-close" onClick={onClose} aria-label="Close filters">×</button>
            </div>
            <div className="mk-sheet-body">
              <Body period={period} minRating={minRating} onPeriod={onPeriod} onMin={onMin} />
            </div>
            <div className="mk-sheet-foot">
              <button className="lp-btn lp-btn-ghost" onClick={() => { onPeriod('all'); onMin(0) }}>
                Reset{activeCount > 0 ? ` (${activeCount})` : ''}
              </button>
              <button className="lp-btn lp-btn-primary" onClick={onClose}>Show rankings</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
