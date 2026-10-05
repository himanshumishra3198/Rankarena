import { useEffect } from 'react'

export type DateKey = 'all' | 'today' | 'week' | 'month'
export type SortKey = 'soon' | 'participants' | 'newest'
export interface Filters { date: DateKey; sort: SortKey }
export const DEFAULT_FILTERS: Filters = { date: 'all', sort: 'soon' }

const DATES: { k: DateKey; label: string }[] = [
  { k: 'all', label: 'Any time' }, { k: 'today', label: 'Today' },
  { k: 'week', label: 'This week' }, { k: 'month', label: 'This month' },
]
const SORTS: { k: SortKey; label: string }[] = [
  { k: 'soon', label: 'Starting soon' }, { k: 'participants', label: 'Most participants' }, { k: 'newest', label: 'Newest' },
]

function Body({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  return (
    <>
      <div className="mk-fgroup">
        <span className="mk-flabel">Date</span>
        <div className="mk-fchips">
          {DATES.map(d => (
            <button key={d.k} className={`mk-chip ${value.date === d.k ? 'is-on' : ''}`}
              onClick={() => onChange({ ...value, date: d.k })}>{d.label}</button>
          ))}
        </div>
      </div>
      <div className="mk-fgroup">
        <span className="mk-flabel">Sort by</span>
        <div className="mk-fchips">
          {SORTS.map(s => (
            <button key={s.k} className={`mk-chip ${value.sort === s.k ? 'is-on' : ''}`}
              onClick={() => onChange({ ...value, sort: s.k })}>{s.label}</button>
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * Date and sort only.
 *
 * The brief also asked for contest type and difficulty. Neither exists:
 * Contest has no type column, every contest is rated (a RatingHistory row is
 * written for every participant of every one), and a contest spans all four
 * subjects by design — so a derived difficulty band would come out the same
 * for all of them and filter nothing. Status is the tab bar above instead of
 * a duplicate control down here.
 */
export default function ContestFilters({
  value, onChange, open, onClose, activeCount,
}: {
  value: Filters; onChange: (f: Filters) => void
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
      <div className="mk-filters-inline"><Body value={value} onChange={onChange} /></div>
      {open && (
        <div className="mk-sheet-wrap" role="dialog" aria-modal="true" aria-label="Contest filters">
          <div className="mk-sheet-scrim" onClick={onClose} />
          <div className="mk-sheet">
            <div className="mk-sheet-grip" aria-hidden="true" />
            <div className="mk-sheet-head">
              <h2>Filters</h2>
              <button className="mk-sheet-close" onClick={onClose} aria-label="Close filters">×</button>
            </div>
            <div className="mk-sheet-body"><Body value={value} onChange={onChange} /></div>
            <div className="mk-sheet-foot">
              <button className="lp-btn lp-btn-ghost" onClick={() => onChange(DEFAULT_FILTERS)}>
                Reset{activeCount > 0 ? ` (${activeCount})` : ''}
              </button>
              <button className="lp-btn lp-btn-primary" onClick={onClose}>Show contests</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
