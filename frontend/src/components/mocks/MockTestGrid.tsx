import MockTestCard from './MockTestCard'
import type { MockTestListItem } from '../../lib/types'

export default function MockTestGrid({
  items, loading, emptyTitle, emptyBody, onClear, clearLabel,
}: {
  items: MockTestListItem[]
  loading: boolean
  emptyTitle: string
  emptyBody: string
  onClear?: () => void
  clearLabel?: string
}) {
  if (loading) {
    return (
      <div className="mk-grid">
        {[0, 1, 2, 3, 4, 5].map(i => <div className="mk-card-skel" key={i} />)}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="mk-empty">
        <div className="mk-empty-icon" aria-hidden="true">🗂</div>
        <p className="mk-empty-title">{emptyTitle}</p>
        <p className="mk-empty-body">{emptyBody}</p>
        {onClear && <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={onClear}>{clearLabel ?? 'Clear filters'}</button>}
      </div>
    )
  }

  return (
    <div className="mk-grid">
      {items.map(m => <MockTestCard key={m.id} m={m} />)}
    </div>
  )
}
