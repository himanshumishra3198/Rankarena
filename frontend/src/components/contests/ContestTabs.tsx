export type Tab = 'upcoming' | 'live' | 'past' | 'mine'

const TABS: { k: Tab; label: string }[] = [
  { k: 'upcoming', label: 'Upcoming' },
  { k: 'live', label: 'Live' },
  { k: 'past', label: 'Past' },
  { k: 'mine', label: 'My Contests' },
]

/** Counts come from the loaded list, so a badge can never disagree with the tab it sits on. */
export default function ContestTabs({
  value, counts, onChange, signedIn,
}: {
  value: Tab; counts: Record<Tab, number>; onChange: (t: Tab) => void; signedIn: boolean
}) {
  return (
    <div className="ct-tabs" role="tablist" aria-label="Contest status">
      {TABS.filter(t => signedIn || t.k !== 'mine').map(t => (
        <button
          key={t.k} role="tab" aria-selected={value === t.k}
          className={`ct-tab ${value === t.k ? 'is-active' : ''} ${t.k === 'live' && counts.live > 0 ? 'has-live' : ''}`}
          onClick={() => onChange(t.k)}
        >
          {t.k === 'live' && counts.live > 0 && <i className="ct-dot" aria-hidden="true" />}
          {t.label}
          <span className="ct-tab-n">{counts[t.k]}</span>
        </button>
      ))}
    </div>
  )
}
