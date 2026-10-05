import { useEffect } from 'react'

export type SortKey = 'recommended' | 'newest' | 'difficulty' | 'score' | 'attempts'
export type StatusKey = 'all' | 'new' | 'attempted'
export type DiffKey = 'all' | 'EASY' | 'MEDIUM' | 'HARD'

export interface Filters { difficulty: DiffKey; status: StatusKey; sort: SortKey }

export const DEFAULT_FILTERS: Filters = { difficulty: 'all', status: 'all', sort: 'recommended' }

const DIFFS: { k: DiffKey; label: string }[] = [
  { k: 'all', label: 'All' }, { k: 'EASY', label: 'Easy' }, { k: 'MEDIUM', label: 'Medium' }, { k: 'HARD', label: 'Hard' },
]
const STATUSES: { k: StatusKey; label: string }[] = [
  { k: 'all', label: 'All' }, { k: 'new', label: 'Not attempted' }, { k: 'attempted', label: 'Attempted' },
]
const SORTS: { k: SortKey; label: string }[] = [
  { k: 'recommended', label: 'Recommended' },
  { k: 'newest', label: 'Newest' },
  { k: 'difficulty', label: 'Difficulty' },
  { k: 'score', label: 'Highest score' },
  { k: 'attempts', label: 'Most attempted' },
]

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mk-fgroup">
      <span className="mk-flabel">{title}</span>
      <div className="mk-fchips">{children}</div>
    </div>
  )
}

function Body({ value, onChange, signedIn }: {
  value: Filters; onChange: (f: Filters) => void; signedIn: boolean
}) {
  return (
    <>
      <Group title="Difficulty">
        {DIFFS.map(d => (
          <button key={d.k} className={`mk-chip ${value.difficulty === d.k ? 'is-on' : ''}`}
            onClick={() => onChange({ ...value, difficulty: d.k })}>{d.label}</button>
        ))}
      </Group>

      {/* Status is a fact about the reader, so it is meaningless to a guest. */}
      {signedIn && (
        <Group title="Status">
          {STATUSES.map(s => (
            <button key={s.k} className={`mk-chip ${value.status === s.k ? 'is-on' : ''}`}
              onClick={() => onChange({ ...value, status: s.k })}>{s.label}</button>
          ))}
        </Group>
      )}

      <Group title="Sort by">
        {SORTS.filter(s => signedIn || s.k !== 'score').map(s => (
          <button key={s.k} className={`mk-chip ${value.sort === s.k ? 'is-on' : ''}`}
            onClick={() => onChange({ ...value, sort: s.k })}>{s.label}</button>
        ))}
      </Group>
    </>
  )
}

/**
 * Inline on desktop; a bottom sheet on a phone, where a permanently
 * expanded filter block would push the first test below the fold.
 *
 * There is no "test type" filter. MockTest has no type column — every mock
 * is one subject's paper — so Practice / Previous Year / Full Length /
 * Topic Wise would be four buttons that cannot filter anything. That needs
 * a schema field and an admin control first.
 */
export default function FilterPanel({
  value, onChange, open, onClose, signedIn, activeCount,
}: {
  value: Filters
  onChange: (f: Filters) => void
  open: boolean
  onClose: () => void
  signedIn: boolean
  activeCount: number
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
      <div className="mk-filters-inline"><Body value={value} onChange={onChange} signedIn={signedIn} /></div>

      {open && (
        <div className="mk-sheet-wrap" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="mk-sheet-scrim" onClick={onClose} />
          <div className="mk-sheet">
            <div className="mk-sheet-grip" aria-hidden="true" />
            <div className="mk-sheet-head">
              <h2>Filters</h2>
              <button className="mk-sheet-close" onClick={onClose} aria-label="Close filters">×</button>
            </div>
            <div className="mk-sheet-body">
              <Body value={value} onChange={onChange} signedIn={signedIn} />
            </div>
            <div className="mk-sheet-foot">
              <button className="lp-btn lp-btn-ghost" onClick={() => onChange(DEFAULT_FILTERS)}>
                Reset{activeCount > 0 ? ` (${activeCount})` : ''}
              </button>
              <button className="lp-btn lp-btn-primary" onClick={onClose}>Show results</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
