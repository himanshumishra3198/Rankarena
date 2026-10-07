import { TIERS, getTier } from '../../lib/tiers'
import { useReveal } from '../landing/hooks'

export interface Bucket { min: number; max: number; count: number }

/**
 * How the field is spread across tiers, and where the reader sits in it.
 *
 * The bands are tiers.ts — the same ladder the ratings everywhere else are
 * coloured by — so there is one definition of what "Expert" means rather
 * than a second set invented for this chart.
 */
export default function RatingDistribution({
  buckets, total, myRating,
}: {
  buckets: Bucket[]; total: number; myRating: number | null
}) {
  const ref = useReveal<HTMLElement>()
  if (!buckets.length || total === 0) return null

  const peak = Math.max(...buckets.map(b => b.count), 1)
  const mine = myRating !== null ? getTier(myRating) : null

  return (
    <section className="lb-section lp-reveal" ref={ref}>
      <header className="mk-section-head">
        <div>
          <span className="lp-kicker">The field</span>
          <h2 className="mk-h2">Where Do You Stand?</h2>
          <p className="mk-section-sub">
            Every rated aspirant, by tier. {mine && <>You are in <b style={{ color: mine.fg }}>{mine.label}</b>.</>}
          </p>
        </div>
      </header>

      <div className="card lb-dist">
        {/* Highest tier first, so the chart reads like a ladder. */}
        {[...buckets].reverse().map(b => {
          const tier = TIERS.find(t => t.min === b.min) ?? getTier(b.min)
          const isMine = mine?.label === tier.label
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0
          return (
            <div className={`lb-dist-row ${isMine ? 'is-mine' : ''}`} key={b.min}>
              <span className="lb-dist-label" style={{ color: tier.fg }}>
                {tier.label}
                <i>{b.min}{b.max >= 9999 ? '+' : `–${b.max - 1}`}</i>
              </span>
              <span className="lb-dist-track">
                <span
                  className="lb-dist-fill"
                  style={{ width: `${(b.count / peak) * 100}%`, background: tier.fg }}
                />
              </span>
              <span className="lb-dist-count">{b.count}<i> · {pct}%</i></span>
              {isMine && <span className="lb-dist-you">You are here</span>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
