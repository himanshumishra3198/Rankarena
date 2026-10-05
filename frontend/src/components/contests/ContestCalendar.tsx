import { contestPhase, type Contest } from '../../lib/types'
import { useReveal } from '../landing/hooks'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * The week ahead, built from the real schedule.
 *
 * Seven columns starting from today's Monday. A day with a contest shows its
 * start time and a marker; clicking one selects it, which filters the list
 * below. Nothing is drawn for a week with no contests — the empty grid says
 * "nothing scheduled" more clearly than a sentence would.
 */
export default function ContestCalendar({
  contests, selected, onSelect,
}: {
  contests: Contest[]
  selected: string | null
  onSelect: (iso: string | null) => void
}) {
  const ref = useReveal<HTMLElement>()

  const today = new Date()
  const monday = new Date(today)
  // getDay(): 0 is Sunday, so Sunday has to step back six days, not forward one.
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const key = d.toDateString()
    return {
      date: d,
      key,
      isToday: key === today.toDateString(),
      items: contests.filter(c => new Date(c.startTime).toDateString() === key),
    }
  })

  const any = week.some(d => d.items.length > 0)

  return (
    <section className="ct-section lp-reveal" ref={ref}>
      <header className="mk-section-head">
        <div>
          <span className="lp-kicker">Schedule</span>
          <h2 className="mk-h2">Contest Calendar</h2>
          <p className="mk-section-sub">
            {any ? 'Tap a day to see what runs then.' : 'Nothing scheduled this week — the next contest will appear here.'}
          </p>
        </div>
        {selected && (
          <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => onSelect(null)}>Clear day</button>
        )}
      </header>

      <div className="ct-cal">
        {week.map((d, i) => (
          <button
            key={d.key}
            className={`ct-day ${d.isToday ? 'is-today' : ''} ${selected === d.key ? 'is-sel' : ''} ${d.items.length ? 'has-items' : ''}`}
            disabled={d.items.length === 0}
            onClick={() => onSelect(selected === d.key ? null : d.key)}
          >
            <span className="ct-day-name">{DAYS[i]}</span>
            <span className="ct-day-num">{d.date.getDate()}</span>
            <span className="ct-day-slots">
              {d.items.slice(0, 2).map(c => (
                <i key={c.id} className={`ct-slot ${contestPhase(c) === 'live' ? 'is-live' : ''}`}>
                  {new Date(c.startTime).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </i>
              ))}
              {d.items.length > 2 && <i className="ct-slot">+{d.items.length - 2}</i>}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
