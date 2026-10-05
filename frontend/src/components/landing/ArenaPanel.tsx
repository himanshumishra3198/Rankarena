import { getTier } from '../../lib/tiers'
import { formatCount, splitDuration, useCountdown } from './hooks'
import type { LandingContest, RankedUser } from './types'

/**
 * The hero's product shot: the real arena, not a drawing of one.
 *
 * Every figure on this panel comes from the API — the contest, its clock,
 * how many people are in it, and the actual top of the ranking with the
 * tier colours the rest of the site uses. Nothing is invented, because a
 * landing page that fakes its own numbers is the fastest way to look like
 * the generic test site this is trying not to be. With no contest on, it
 * falls back to standings, which is still true.
 */
export default function ArenaPanel({
  contest, leaders, aspirants, loading,
}: {
  contest: LandingContest | null
  leaders: RankedUser[]
  aspirants: number | null
  loading: boolean
}) {
  // Live contests count down to the end; scheduled ones to the start.
  const endsAt = contest
    ? new Date(new Date(contest.startTime).getTime() + contest.durationMinutes * 60_000).toISOString()
    : null
  const left = useCountdown(contest?.phase === 'live' ? endsAt : contest?.startTime)
  const t = left !== null ? splitDuration(left) : null

  const rows = leaders.slice(0, 5)

  return (
    <div className="lp-arena" role="img" aria-label="Live RankArena standings">
      <div className="lp-arena-glow" aria-hidden="true" />

      <div className="lp-arena-head">
        <span className={`lp-arena-badge ${contest?.phase === 'live' ? 'is-live' : ''}`}>
          <i className="lp-dot" aria-hidden="true" />
          {contest ? (contest.phase === 'live' ? 'LIVE CONTEST' : 'NEXT CONTEST') : 'ARENA RANKINGS'}
        </span>
        {t && (
          <span className="lp-arena-clock" title={contest?.phase === 'live' ? 'Time left' : 'Starts in'}>
            {t.days > 0 && <>{t.days}d </>}{t.hh}:{t.mm}:{t.ss}
          </span>
        )}
      </div>

      {contest && <p className="lp-arena-title">{contest.title}</p>}

      <div className="lp-arena-table">
        <div className="lp-arena-row lp-arena-hrow">
          <span>#</span><span>Aspirant</span><span>Tier</span><span className="lp-num">Rating</span>
        </div>

        {loading && [0, 1, 2, 3, 4].map(i => (
          <div className="lp-arena-row" key={i}><span className="lp-skel" style={{ width: '100%' }} /></div>
        ))}

        {!loading && rows.length === 0 && (
          <div className="lp-arena-empty">Standings open with the first rated contest.</div>
        )}

        {!loading && rows.map((u, i) => {
          const tier = getTier(u.rating)
          return (
            <div className="lp-arena-row lp-arena-live-row" key={u.id} style={{ animationDelay: `${i * 90}ms` }}>
              <span className={`lp-rank lp-rank-${i + 1}`}>{String(i + 1).padStart(2, '0')}</span>
              <span className="lp-arena-user" style={{ color: tier.fg }}>{u.name}</span>
              <span className="lp-arena-tier">
                <i className="lp-tier-dot" style={{ background: tier.fg }} aria-hidden="true" />
                {tier.label}
              </span>
              <span className="lp-num lp-arena-rating">{u.rating}</span>
            </div>
          )
        })}
      </div>

      <div className="lp-arena-foot">
        <span className="lp-arena-foot-label">
          <i className="lp-pulse" aria-hidden="true" />
          Live rankings
        </span>
        {contest?.participants
          ? <span>{formatCount(contest.participants)} competing</span>
          : aspirants !== null ? <span>{formatCount(aspirants)} aspirants</span> : null}
      </div>
    </div>
  )
}
