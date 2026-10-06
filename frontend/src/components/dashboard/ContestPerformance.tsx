import { Link, useNavigate } from 'react-router-dom'
import type { ProfileData } from './types'

/** Recent rated contests, newest first, each linking to its own result. */
export default function ContestPerformance({ p }: { p: ProfileData }) {
  const navigate = useNavigate()
  const recent = [...p.ratingHistory].reverse().slice(0, 4)
  const topTen = p.ratingHistory.filter(
    h => h.totalParticipants > 0 && h.rank / h.totalParticipants <= 0.1,
  ).length

  return (
    <section className="db-card">
      <header className="db-card-head">
        <h2 className="db-card-title">Your Contest Journey</h2>
        <Link to="/contests?tab=mine" className="lp-link-arrow db-card-link">All <span aria-hidden="true">→</span></Link>
      </header>

      {recent.length === 0 ? (
        <>
          <p className="db-empty-line">No rated contest yet — your first rank is waiting.</p>
          <Link to="/contests" className="lp-btn lp-btn-primary lp-btn-sm">See upcoming contests →</Link>
        </>
      ) : (
        <>
          <div className="db-cj-stats">
            <div><b>{p.stats.totalContests}</b><span>Played</span></div>
            <div><b>{p.stats.bestRank ? `#${p.stats.bestRank}` : '—'}</b><span>Best rank</span></div>
            <div><b>{p.stats.maxRating}</b><span>Peak rating</span></div>
            <div><b>{topTen}</b><span>Top 10% finishes</span></div>
          </div>

          <ul className="db-cj-list">
            {recent.map(h => {
              const delta = h.newRating - h.oldRating
              return (
                <li key={h.contestId}>
                  <button className="db-cj-row" onClick={() => navigate(`/contests/${h.contestId}/result`)}>
                    <span className="db-cj-name">{h.contestTitle}</span>
                    <span className="db-cj-rank">#{h.rank}<i> / {h.totalParticipants}</i></span>
                    <span className={`db-cj-delta ${delta >= 0 ? 'db-up' : 'db-down'}`}>
                      {delta >= 0 ? '+' : ''}{delta} {delta >= 0 ? '↑' : '↓'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
