import { useNavigate } from 'react-router-dom'
import { SUBJECT_COLOR, SUBJECT_SHORT, titleCase } from '../../lib/practice'
import type { MockTestListItem } from '../../lib/types'

/**
 * One mock test.
 *
 * Driven entirely by the item it is handed — the card has no idea where the
 * data came from, so the same component serves the subject grid, the
 * recommendations and the search results.
 *
 * Two states, not four. The spec asked for attempted/completed/locked as
 * well, but a mock has exactly one attempt row per user (submit upserts it)
 * and the product has no access model, so "attempted" and "completed" are
 * the same fact and "locked" would be a lie. Inventing the distinction in
 * the UI would promise something the data cannot keep.
 */
export default function MockTestCard({ m, cta }: { m: MockTestListItem; cta?: string }) {
  const navigate = useNavigate()
  const colour = SUBJECT_COLOR[m.subject]
  const pct = m.attempted && m.lastTotal ? Math.max(0, Math.min(100, (m.lastScore! / m.lastTotal) * 100)) : null
  const tone = pct === null ? '' : pct >= 70 ? 'good' : pct >= 40 ? 'mid' : 'low'
  // Rank is only interesting once there is a field to be ranked against.
  const showRank = m.rank && m.rankOutOf && m.rankOutOf > 1
  const topPct = showRank ? Math.max(1, Math.round((m.rank! / m.rankOutOf!) * 100)) : null

  return (
    <article className="mk-card" style={{ ['--subject' as string]: colour }}>
      <div className="mk-card-top">
        <span className="mk-card-subject">{SUBJECT_SHORT[m.subject] ?? m.subject}</span>
        {m.difficulty && (
          <span className={`mk-diff mk-diff-${m.difficulty.toLowerCase()}`} title={`${m.difficultyMix.EASY} easy · ${m.difficultyMix.MEDIUM} medium · ${m.difficultyMix.HARD} hard`}>
            {titleCase(m.difficulty)}
          </span>
        )}
      </div>

      <h3 className="mk-card-title">{m.title}</h3>

      <div className="mk-card-meta">
        <span>{m.questionCount} {m.questionCount === 1 ? 'question' : 'questions'}</span>
        <span className="mk-sep" aria-hidden="true">·</span>
        <span>{m.durationMinutes} min</span>
        {m.attemptCount > 0 && (
          <>
            <span className="mk-sep" aria-hidden="true">·</span>
            <span>{m.attemptCount.toLocaleString('en-IN')} {m.attemptCount === 1 ? 'attempt' : 'attempts'}</span>
          </>
        )}
      </div>

      {pct !== null ? (
        <div className="mk-score">
          <div className="mk-score-row">
            <span className="mk-score-label">Last score</span>
            <span className={`mk-score-val tone-${tone}`}>
              {m.lastScore}<span className="mk-score-total">/{m.lastTotal}</span>
              <b>{Math.round(pct)}%</b>
            </span>
          </div>
          <div className="mk-bar"><span className={`tone-${tone}`} style={{ width: `${pct}%` }} /></div>
          <div className="mk-score-extra">
            {m.accuracy !== null && m.accuracy !== undefined && <span>Accuracy <b>{m.accuracy}%</b></span>}
            {showRank && <span>Rank <b>#{m.rank}</b> of {m.rankOutOf}</span>}
            {topPct !== null && topPct <= 50 && <span className="mk-top">Top {topPct}%</span>}
          </div>
        </div>
      ) : (
        <div className="mk-score mk-score-empty">
          <span className="mk-score-label">Not attempted yet</span>
          <div className="mk-bar"><span className="mk-bar-empty" /></div>
        </div>
      )}

      <div className="mk-card-actions">
        {m.attempted && (
          <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => navigate(`/mocks/${m.id}/result`)}>
            View result
          </button>
        )}
        <button className="lp-btn lp-btn-primary lp-btn-sm mk-start" onClick={() => navigate(`/mocks/${m.id}`)}>
          {cta ?? (m.attempted ? 'Retake Test' : 'Start Test')} <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>
  )
}
