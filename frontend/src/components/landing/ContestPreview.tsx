import { Link } from 'react-router-dom'
import { formatCount, splitDuration, useCountdown, useReveal } from './hooks'
import type { LandingContest } from './types'

/**
 * The next real contest, with a real clock.
 *
 * Renders nothing when there is no contest scheduled rather than inventing
 * one — an empty arena is better than a fake fixture, and the section
 * reappears on its own the moment an admin schedules the next paper.
 */
export default function ContestPreview({ contest }: { contest: LandingContest | null }) {
  const ref = useReveal<HTMLElement>()
  const live = contest?.phase === 'live'
  const endsAt = contest
    ? new Date(new Date(contest.startTime).getTime() + contest.durationMinutes * 60_000).toISOString()
    : null
  const left = useCountdown(live ? endsAt : contest?.startTime)
  const t = left !== null ? splitDuration(left) : null

  if (!contest) return null

  return (
    <section className="lp-section lp-reveal" ref={ref} id="contest">
      <div className="lp-shell">
        <div className="lp-contest">
          <div className="lp-contest-main">
            <span className={`lp-chip ${live ? 'lp-chip-live' : 'lp-chip-soon'}`}>
              <i className="lp-dot" aria-hidden="true" />{live ? 'LIVE NOW' : 'UPCOMING CONTEST'}
            </span>
            <h2 className="lp-contest-title">{contest.title}</h2>

            {t && (
              <div className="lp-clock">
                <span className="lp-clock-label">{live ? 'Ends in' : 'Starts in'}</span>
                <div className="lp-clock-digits">
                  {t.days > 0 && (<><b>{String(t.days).padStart(2, '0')}</b><i>:</i></>)}
                  <b>{t.hh}</b><i>:</i><b>{t.mm}</b><i>:</i><b>{t.ss}</b>
                </div>
              </div>
            )}

            <Link to="/contests" className="lp-btn lp-btn-primary lp-btn-lg">
              {live ? 'Enter Contest' : 'Register for Contest'} <span aria-hidden="true">→</span>
            </Link>
          </div>

          <dl className="lp-contest-meta">
            {contest.questionCount !== undefined && (
              <div><dt>Questions</dt><dd>{contest.questionCount}</dd></div>
            )}
            <div><dt>Duration</dt><dd>{contest.durationMinutes} min</dd></div>
            {contest.participants !== undefined && (
              <div><dt>Participants</dt><dd>{formatCount(contest.participants)}</dd></div>
            )}
            <div><dt>Rating</dt><dd className="lp-rated">Rated</dd></div>
          </dl>
        </div>
      </div>
    </section>
  )
}
