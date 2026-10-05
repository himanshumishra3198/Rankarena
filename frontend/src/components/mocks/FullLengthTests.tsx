import { Link } from 'react-router-dom'
import { splitDuration, useCountdown, useReveal } from '../landing/hooks'
import type { Contest } from '../../lib/types'

/**
 * The step up from a sectional paper.
 *
 * Every MockTest belongs to exactly one subject, so there is no such thing
 * as a full-length mock in this product — the multi-subject, timed, ranked
 * paper *is* a contest. Rather than invent a "Full Length" test type with
 * nothing behind it, this points at the real thing, which is also the
 * funnel the platform wants: sectional practice feeds rated competition.
 */
export default function FullLengthTests({ contest }: { contest: Contest | null }) {
  const ref = useReveal<HTMLElement>()
  const left = useCountdown(contest?.startTime)
  const t = left !== null ? splitDuration(left) : null
  const questions = contest?.sectionLimits
    ? Object.values(contest.sectionLimits).reduce((n, v) => n + (Number(v) || 0), 0)
    : null

  return (
    <section className="mk-section lp-reveal" ref={ref}>
      <div className="mk-full">
        <div className="mk-full-copy">
          <span className="lp-kicker">Full length</span>
          <h2 className="mk-h2">Ready for the Real Exam?</h2>
          <p className="mk-section-sub">
            Sectional tests sharpen one subject. A rated contest is the whole paper,
            against everyone else, with a rating on the other side of it.
          </p>

          {contest ? (
            <>
              <p className="mk-full-name">{contest.title}</p>
              <div className="mk-full-meta">
                {questions && <span><b>{questions}</b> questions</span>}
                <span><b>{contest.durationMinutes}</b> min</span>
                <span className="mk-full-rated">Rated</span>
                {t && <span><b>{t.days > 0 ? `${t.days}d ` : ''}{t.hh}:{t.mm}:{t.ss}</b> to go</span>}
              </div>
              <Link to="/contests" className="lp-btn lp-btn-primary lp-btn-lg">
                Start Full Mock <span aria-hidden="true">→</span>
              </Link>
            </>
          ) : (
            <>
              <p className="mk-full-none">No contest is scheduled right now — the next one will appear here.</p>
              <Link to="/contests" className="lp-btn lp-btn-ghost lp-btn-lg">See past contests</Link>
            </>
          )}
        </div>
        <div className="mk-full-art" aria-hidden="true">
          <span className="mk-full-ring" /><span className="mk-full-ring" /><span className="mk-full-ring" />
          <span className="mk-full-core">100<i>%</i></span>
        </div>
      </div>
    </section>
  )
}
