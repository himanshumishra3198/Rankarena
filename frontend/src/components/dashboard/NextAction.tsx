import { Link, useNavigate } from 'react-router-dom'
import { splitDuration, useCountdown } from '../landing/hooks'
import { contestPhase, type Contest, type MockTestListItem } from '../../lib/types'
import { SUBJECT_SHORT } from '../../lib/practice'

/**
 * The one thing to do next, decided by what is actually happening.
 *
 * Priority runs: a contest in progress, then one about to start, then a
 * paper left half-finished, then a practice suggestion. Only one of these
 * shows — a dashboard that offers four equally-weighted "next steps" has
 * not answered the question it exists to answer.
 */
export default function NextAction({
  contest, resumable, suggestion, onRegister, registering,
}: {
  contest: Contest | null
  resumable: { mock: MockTestListItem; answered: number } | null
  suggestion: MockTestListItem | null
  onRegister: (c: Contest) => void
  registering: boolean
}) {
  const navigate = useNavigate()
  const phase = contest ? contestPhase(contest) : null
  const endsAt = contest
    ? new Date(new Date(contest.startTime).getTime() + contest.durationMinutes * 60_000).toISOString()
    : null
  const left = useCountdown(phase === 'live' ? endsAt : contest?.startTime)
  const t = left !== null ? splitDuration(left) : null

  // ── A contest, running or imminent ──────────────────────────────────
  if (contest && phase !== 'past') {
    const live = phase === 'live'
    return (
      <section className={`db-hero ${live ? 'is-live' : ''}`}>
        <div className="db-hero-glow" aria-hidden="true" />
        <div className="db-hero-body">
          <span className={`db-hero-tag ${live ? 'is-live' : ''}`}>
            {live ? <><i className="ct-dot" aria-hidden="true" />LIVE NOW</> : '🔥 NEXT CONTEST'}
          </span>
          <h2 className="db-hero-title">{contest.title}</h2>

          <div className="db-hero-meta">
            {!!contest.questionCount && <span><b>{contest.questionCount}</b> questions</span>}
            <span><b>{contest.durationMinutes}</b> minutes</span>
            <span className="db-rated">Rated</span>
            <span><b>{(contest._count?.participations ?? 0).toLocaleString('en-IN')}</b> registered</span>
          </div>

          {contest.hasJoined && !live && <p className="db-hero-note">✓ You're registered</p>}

          <div className="db-hero-cta">
            {live
              ? <button className="lp-btn lp-btn-danger lp-btn-lg" disabled={registering} onClick={() => onRegister(contest)}>
                  {registering ? 'Entering…' : <>Enter Contest <span aria-hidden="true">→</span></>}
                </button>
              : contest.hasJoined
                ? <button className="lp-btn lp-btn-ghost lp-btn-lg" onClick={() => navigate(`/contests/${contest.id}`)}>
                    View Contest <span aria-hidden="true">→</span>
                  </button>
                : <button className="lp-btn lp-btn-primary lp-btn-lg" disabled={registering} onClick={() => onRegister(contest)}>
                    {registering ? 'Registering…' : <>Register Now <span aria-hidden="true">→</span></>}
                  </button>}
          </div>
        </div>

        {t && (
          <div className="db-hero-clock">
            <span className="ct-fc-label">{live ? 'Time remaining' : 'Starts in'}</span>
            <div className="ct-fc-digits">
              {t.days > 0 && <span><b>{String(t.days).padStart(2, '0')}</b><i>days</i></span>}
              <span><b>{t.hh}</b><i>hrs</i></span>
              <span><b>{t.mm}</b><i>min</i></span>
              <span><b>{t.ss}</b><i>sec</i></span>
            </div>
          </div>
        )}
      </section>
    )
  }

  // ── A paper left open ───────────────────────────────────────────────
  if (resumable) {
    const { mock, answered } = resumable
    const pct = mock.questionCount ? (answered / mock.questionCount) * 100 : 0
    return (
      <section className="db-hero">
        <div className="db-hero-glow" aria-hidden="true" />
        <div className="db-hero-body">
          <span className="db-hero-tag">⏳ UNFINISHED</span>
          <h2 className="db-hero-title">{mock.title}</h2>
          <p className="db-hero-note">{answered} of {mock.questionCount} answered — the clock is still on it.</p>
          <div className="mk-bar" style={{ maxWidth: 360 }}><span className="tone-mid" style={{ width: `${pct}%` }} /></div>
          <div className="db-hero-cta">
            <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={() => navigate(`/mocks/${mock.id}`)}>
              Continue Test <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>
    )
  }

  // ── Otherwise, something to practise ────────────────────────────────
  if (suggestion) {
    return (
      <section className="db-hero">
        <div className="db-hero-glow" aria-hidden="true" />
        <div className="db-hero-body">
          <span className="db-hero-tag">📝 RECOMMENDED PRACTICE</span>
          <h2 className="db-hero-title">{suggestion.title}</h2>
          <div className="db-hero-meta">
            <span>{SUBJECT_SHORT[suggestion.subject] ?? suggestion.subject}</span>
            <span><b>{suggestion.questionCount}</b> questions</span>
            <span><b>{suggestion.durationMinutes}</b> minutes</span>
            {suggestion.difficulty && <span>{suggestion.difficulty[0] + suggestion.difficulty.slice(1).toLowerCase()}</span>}
          </div>
          <div className="db-hero-cta">
            <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={() => navigate(`/mocks/${suggestion.id}`)}>
              Start Test <span aria-hidden="true">→</span>
            </button>
            <Link to="/contests" className="lp-btn lp-btn-ghost lp-btn-lg">See contests</Link>
          </div>
        </div>
      </section>
    )
  }

  return null
}
