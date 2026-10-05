import { SECTIONS } from '../../lib/types'
import { SUBJECT_COLOR, SUBJECT_SHORT } from '../../lib/practice'

/** Horizontally scrollable on a phone; the active pill carries the subject's colour. */
export default function SubjectTabs({
  value, counts, onChange,
}: {
  value: string
  counts: Record<string, number>
  onChange: (subject: string) => void
}) {
  const total = Object.values(counts).reduce((n, v) => n + v, 0)
  return (
    <div className="mk-tabs" role="tablist" aria-label="Subject">
      <button
        role="tab" aria-selected={value === 'ALL'}
        className={`mk-tab ${value === 'ALL' ? 'is-active' : ''}`}
        onClick={() => onChange('ALL')}
      >
        All <span className="mk-tab-n">{total}</span>
      </button>
      {SECTIONS.map(s => (
        <button
          key={s} role="tab" aria-selected={value === s}
          className={`mk-tab ${value === s ? 'is-active' : ''}`}
          style={{ ['--subject' as string]: SUBJECT_COLOR[s] }}
          onClick={() => onChange(s)}
        >
          <i className="mk-tab-dot" style={{ background: SUBJECT_COLOR[s] }} aria-hidden="true" />
          {SUBJECT_SHORT[s]} <span className="mk-tab-n">{counts[s] ?? 0}</span>
        </button>
      ))}
    </div>
  )
}
