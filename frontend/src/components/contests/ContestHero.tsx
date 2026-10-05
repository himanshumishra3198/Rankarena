import { Link } from 'react-router-dom'
import { getTier } from '../../lib/tiers'
import { splitDuration, useCountdown } from '../landing/hooks'
import { contestPhase, type Contest } from '../../lib/types'
import type { RankedUser } from '../landing/types'

/**
 * The hero's product shot: whatever the arena is actually doing right now.
 *
 * A live contest with its real clock and real entrant count if one is
 * running, the next scheduled one if not, and the standings underneath
 * either way. The spec's mock showed per-user score and rating deltas
 * mid-contest; the platform does not expose a live scoreboard publicly and
 * ratings are only written when a contest settles, so this shows the
 * standing ranking instead of inventing a race.
 */
function ArenaPanel({ contest, leaders, loading }: {
  contest: Contest | null; leaders: RankedUser[]; loading: boolean
}) {
  const phase = contest ? contestPhase(contest) : null
  const endsAt = contest
    ? new Date(new Date(contest.startTime).getTime() + contest.durationMinutes * 60_000).toISOString()
    : null
  const left = useCountdown(phase === 'live' ? endsAt : contest?.startTime)
  const t = left !== null ? splitDuration(left) : null

  return (
    <div className="ct-panel">
      <div className="lp-arena-glow" aria-hidden="true" />

      <div className="ct-panel-head">
        <span className={`lp-arena-badge ${phase === 'live' ? 'is-live' : ''}`}>
          <i className="lp-dot" aria-hidden="true" />
          {phase === 'live' ? 'LIVE CONTEST' : phase === 'upcoming' ? 'NEXT CONTEST' : 'ARENA STANDINGS'}
        </span>
        {contest && <span className="ct-panel-rated">RATED</span>}
      </div>

      {contest && <p className="ct-panel-title">{contest.title}</p>}

      {t && (
        <div className="ct-panel-clock">
          <span>{phase === 'live' ? 'Time remaining' : 'Starts in'}</span>
          <b>{t.days > 0 ? `${t.days}d ` : ''}{t.hh}:{t.mm}:{t.ss}</b>
        </div>
      )}

      {contest && (
        <div className="ct-panel-stats">
          <div><b>{(contest._count?.participations ?? 0).toLocaleString('en-IN')}</b><span>Entrants</span></div>
          {!!contest.questionCount && <div><b>{contest.questionCount}</b><span>Questions</span></div>}
          <div><b>{contest.durationMinutes}</b><span>Minutes</span></div>
        </div>
      )}

      <div className="ct-panel-board">
        <div className="ct-prow ct-prow-head"><span>#</span><span>Aspirant</span><span className="lp-num">Rating</span></div>
        {loading && [0, 1, 2].map(i => <div className="ct-prow" key={i}><span className="lp-skel" style={{ width: '100%' }} /></div>)}
        {!loading && leaders.slice(0, 3).map((u, i) => {
          const tier = getTier(u.rating)
          return (
            <div className="ct-prow lp-arena-live-row" key={u.id} style={{ animationDelay: `${i * 90}ms` }}>
              <span className={`lp-rank lp-rank-${i + 1}`}>{String(i + 1).padStart(2, '0')}</span>
              <span className="ct-pname" style={{ color: tier.fg }}>{u.name}</span>
              <span className="lp-num ct-prating">{u.rating}</span>
            </div>
          )
        })}
        {!loading && leaders.length === 0 && <div className="lp-arena-empty">Standings open with the first rated contest.</div>}
      </div>
    </div>
  )
}

export default function ContestHero({ contest, leaders, loading }: {
  contest: Contest | null; leaders: RankedUser[]; loading: boolean
}) {
  return (
    <section className="ct-hero">
      <div className="lp-hero-bg" aria-hidden="true">
        <div className="lp-grid" /><div className="lp-orb lp-orb-a" /><div className="lp-orb lp-orb-b" />
      </div>
      <div className="ct-hero-inner">
        <div>
          <span className="mk-badge">RATED SSC CGL CONTESTS</span>
          <h1 className="ct-hero-title">Enter the Arena.<br /><span className="lp-grad">Prove Your Rank.</span></h1>
          <p className="ct-hero-sub">
            Compete in timed SSC CGL contests, climb the leaderboard, and build your
            rating with every battle.
          </p>
          <div className="lp-hero-cta">
            <a href="#contest-list" className="lp-btn lp-btn-primary lp-btn-lg">
              View Upcoming Contests <span aria-hidden="true">→</span>
            </a>
            <Link to="/leaderboard" className="lp-btn lp-btn-ghost lp-btn-lg">View Rankings</Link>
          </div>
        </div>
        <ArenaPanel contest={contest} leaders={leaders} loading={loading} />
      </div>
    </section>
  )
}
