import LeaderboardRow from './LeaderboardRow'
import { useReveal } from '../landing/hooks'
import type { LeaderEntry } from './types'

/**
 * The handful of people either side of you.
 *
 * The point of the section is the gap: seeing that the next rank is four
 * rating points away is a far more actionable fact than "you are 1,284th".
 */
export default function RankNeighbors({
  rows, meId, loading,
}: {
  rows: LeaderEntry[]; meId: string; loading: boolean
}) {
  const ref = useReveal<HTMLElement>()
  if (!loading && rows.length <= 1) return null

  const meIdx = rows.findIndex(r => r.id === meId)
  const me = meIdx >= 0 ? rows[meIdx] : null
  const above = meIdx > 0 ? rows[meIdx - 1] : null
  const gap = me && above ? above.rating - me.rating : null

  return (
    <section className="lb-section lp-reveal" ref={ref}>
      <header className="mk-section-head">
        <div>
          <span className="lp-kicker">Around you</span>
          <h2 className="mk-h2">Your Nearest Rivals</h2>
          {gap !== null && (
            <p className="mk-section-sub">
              {gap === 0
                ? <>You are level on rating with the aspirant above you — a single contest separates you.</>
                : <>The next rank is <b>{gap} rating {gap === 1 ? 'point' : 'points'}</b> away.</>}
            </p>
          )}
        </div>
      </header>

      <div className="card lb-table lb-table-compact">
        <div className="lb-row lb-head">
          <span>Rank</span><span>Aspirant</span><span>Rating</span><span>Change</span><span>Contests</span><span>Best</span>
        </div>
        {loading
          ? [0, 1, 2].map(i => <div className="lb-row" key={i}><span className="lp-skel" style={{ width: '100%' }} /></div>)
          : rows.map(e => <LeaderboardRow key={e.id} e={e} isMe={e.id === meId} />)}
      </div>
    </section>
  )
}
