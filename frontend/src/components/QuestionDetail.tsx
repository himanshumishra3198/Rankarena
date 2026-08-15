import { useEffect, useState } from 'react'
import { QuestionContext } from './QuestionContent'
import { RichText } from './RichText'
import { fmtSecs, timeVerdict } from '../lib/time'
import api from '../lib/api'

/**
 * One attempted question, in full, rendered inline under the question map.
 *
 * The result pages used to list every question at once, so reading one meant
 * scrolling a hundred-row page and losing your place. The map is the
 * navigator now and this panel shows whatever is selected there — the
 * passage, the image, every option with the correct one and your pick marked,
 * the solution, and how your time compared. Previous/Next step through
 * whatever the map is currently showing.
 */

export interface ReviewQuestion {
  id: string
  text: string
  imageUrl?: string | null
  optionA: string; optionB: string; optionC: string; optionD: string
  correctOption: string
  subject: string
  /** EASY | MEDIUM | HARD — lowercased into a badge class. */
  difficulty: string
  marks: number
  negativeMarks: number
  questionType?: 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  structuredData?: { statements: string[]; conclusions: string[] } | null
  passage?: {
    id: string; title: string; content: string
    type: 'TEXT' | 'TABLE'
    tableData?: { headers: string[]; rows: string[][] } | null
  } | null
  solution?: string | null
}

interface PracticeRecommendation {
  id: string
  text: string
  imageUrl?: string | null
  optionA: string; optionB: string; optionC: string; optionD: string
  correctOption: string
  subject: string
  topic: string | null
  difficulty: string
  questionType?: 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  structuredData?: { statements: string[]; conclusions: string[] } | null
  passage?: ReviewQuestion['passage']
  solution?: string | null
  bookmarked: boolean
}

interface PracticeRecsResponse {
  subject: string
  topic: string | null
  questions: PracticeRecommendation[]
}

const OPTIONS = ['A', 'B', 'C', 'D'] as const

function optText(q: { optionA: string; optionB: string; optionC: string; optionD: string }, opt: string) {
  return ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as Record<string, string>)[opt] ?? ''
}

export default function QuestionDetail({
  q, qNum, given, marked, timeSpent, avgTime, correctPct,
  subjectLabel, subjectColor, bookmarked, position,
  onToggleBookmark, onReport, onPrev, onNext,
}: {
  q: ReviewQuestion
  /** Number in the paper, not in the filtered set. */
  qNum: number
  /** The option the candidate picked, if any. */
  given?: string
  marked?: boolean
  timeSpent?: number
  avgTime?: number
  /** Share of all takers who got it right, if the API reports it. */
  correctPct?: number
  subjectLabel?: string
  subjectColor?: string
  bookmarked?: boolean
  /** Place within whatever the map is currently showing. */
  position?: { index: number; total: number }
  onToggleBookmark?: () => void
  onReport?: () => void
  /** Undefined at either end — the button renders disabled. */
  onPrev?: () => void
  onNext?: () => void
}) {
  // Practice state is per-question scratch work that is never saved, so it
  // lives here and clears when you move on.
  const [practice, setPractice] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [recsOpen, setRecsOpen] = useState(false)
  const [recs, setRecs] = useState<PracticeRecsResponse | null>(null)
  const [recsLoading, setRecsLoading] = useState(false)
  const [recBookmarks, setRecBookmarks] = useState<Set<string>>(new Set())
  useEffect(() => {
    setPractice(false); setPicked(null)
    setRecsOpen(false); setRecs(null); setRecsLoading(false); setRecBookmarks(new Set())
  }, [q.id])

  async function openRecs() {
    setRecsOpen(o => !o)
    if (recs || recsLoading) return
    setRecsLoading(true)
    try {
      const res = await api.get('/practice/recommendations', { params: { questionId: q.id, limit: 5 } })
      const data: PracticeRecsResponse = res.data
      setRecs(data)
      setRecBookmarks(new Set(data.questions.filter(r => r.bookmarked).map(r => r.id)))
    } catch {
      // leave recs null — the panel renders a retry state
    } finally {
      setRecsLoading(false)
    }
  }

  function flipRecBookmark(id: string) {
    setRecBookmarks(b => {
      const n = new Set(b)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function toggleRecBookmark(id: string) {
    flipRecBookmark(id)
    try {
      await api.post(`/bookmarks/${id}`)
    } catch {
      flipRecBookmark(id)
    }
  }

  const isCorrect = given === q.correctOption
  const isWrong = !!given && given !== q.correctOption
  const marksEarned = isCorrect ? q.marks : isWrong ? -q.negativeMarks : 0
  const verdict = timeSpent !== undefined && avgTime !== undefined && avgTime > 0
    ? timeVerdict(timeSpent, avgTime) : null

  // The arrow keys page through the paper, unless you are typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowLeft' && onPrev) { e.preventDefault(); onPrev() }
      if (e.key === 'ArrowRight' && onNext) { e.preventDefault(); onNext() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPrev, onNext])

  return (
    <div className="qd-panel">
      <div className="qd-header">
        <div className="qd-header-left">
          <span className="qd-qnum">Question {qNum}</span>
          <span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
          {subjectLabel && <span className="qd-subject" style={{ color: subjectColor }}>{subjectLabel}</span>}
          {marked && <span className="badge" style={{ background: '#fef3c7', color: '#b45309' }}>🔖 Marked</span>}
        </div>
        {onToggleBookmark && (
          <button
            className="bookmark-btn"
            title={bookmarked ? 'Remove bookmark' : 'Bookmark for revision'}
            onClick={onToggleBookmark}
          >
            {bookmarked ? '⭐' : '☆'}
          </button>
        )}
      </div>

      <div className={`qd-verdict-strip qd-${isCorrect ? 'cor' : isWrong ? 'wrg' : 'skp'}`}>
        <span className="qd-verdict">
          {isCorrect ? '✓ Correct' : isWrong ? '✗ Wrong' : '— Skipped'}
        </span>
        <span className={`qd-marks ${marksEarned > 0 ? 'pos' : marksEarned < 0 ? 'neg' : ''}`}>
          {marksEarned > 0 ? '+' : ''}{marksEarned.toFixed(2)} marks
        </span>
        {correctPct !== undefined && correctPct > 0 && (
          <span className="qd-pct">{correctPct}% got this right</span>
        )}
        {timeSpent !== undefined && (
          <span className="qd-time">
            <strong>{fmtSecs(timeSpent)}</strong>
            {avgTime !== undefined && avgTime > 0 && <> · avg {fmtSecs(avgTime)}</>}
            {verdict && <span style={{ color: verdict.color, marginLeft: 6 }}>{verdict.emoji} {verdict.label}</span>}
          </span>
        )}
      </div>

      <div className="qd-body">
        <QuestionContext q={q} />

        {q.imageUrl && (
          <div className="qd-image">
            <img src={q.imageUrl} alt="Question diagram" />
          </div>
        )}

        {q.text && <RichText as="div" className="qd-qtext" html={q.text} />}

        {practice ? (
          <>
            <div className="practice-banner">🔄 Re-attempt mode — pick an answer (won't change your score)</div>
            <div className="review-options qd-options">
              {OPTIONS.map(opt => {
                const isCorrectOpt = opt === q.correctOption
                const isPicked = opt === picked
                const cls = picked && isCorrectOpt ? 'correct-opt' : picked && isPicked ? 'wrong-opt' : ''
                return (
                  <div key={opt} className={`review-option ${cls}`}
                    style={{ cursor: picked ? 'default' : 'pointer' }}
                    onClick={() => { if (!picked) setPicked(opt) }}>
                    <span className="option-label">{opt}</span>
                    <span><RichText html={optText(q, opt)} /></span>
                    {picked && isCorrectOpt && <span className="opt-tag correct-tag">✓ Correct</span>}
                    {picked && isPicked && !isCorrectOpt && <span className="opt-tag wrong-tag">Your pick</span>}
                  </div>
                )
              })}
            </div>
            {picked && (
              <div className="qd-practice-verdict" style={{ color: picked === q.correctOption ? '#16a34a' : '#dc2626' }}>
                {picked === q.correctOption ? '✓ Correct!' : '✗ Not quite — the correct answer is highlighted.'}
              </div>
            )}
            <div className="qd-practice-actions">
              {picked && <button className="btn btn-ghost btn-sm" onClick={() => setPicked(null)}>Try again</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => { setPractice(false); setPicked(null) }}>
                Exit practice
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="review-options qd-options">
              {OPTIONS.map(opt => {
                const isCorrectOpt = opt === q.correctOption
                const isGivenOpt = opt === given
                return (
                  <div key={opt} className={`review-option ${isCorrectOpt ? 'correct-opt' : isGivenOpt ? 'wrong-opt' : ''}`}>
                    <span className="option-label">{opt}</span>
                    <span><RichText html={optText(q, opt)} /></span>
                    {isCorrectOpt && <span className="opt-tag correct-tag">✓ Correct answer</span>}
                    {isGivenOpt && !isCorrectOpt && <span className="opt-tag wrong-tag">Your answer</span>}
                  </div>
                )
              })}
            </div>
            <div className="qd-practice-actions">
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--primary)' }}
                onClick={() => setPractice(true)}>
                🔄 Re-attempt this question
              </button>
            </div>
          </>
        )}

        {q.solution ? (
          <div className="qd-solution">
            <div className="qd-solution-title">💡 Solution</div>
            <RichText as="div" className="sol-explain-text" html={q.solution} />
          </div>
        ) : (
          <p className="qd-no-solution">No written solution has been added for this question yet.</p>
        )}

        {isWrong && (
          <div className="sol-explain practice-recs">
            <button
              className="sol-explain-toggle"
              aria-expanded={recsOpen}
              onClick={openRecs}
            >
              <span style={{ fontSize: 16 }}>📚</span>
              {recsOpen ? 'Hide practice questions' : recs?.topic ? `Practise: ${recs.topic}` : recs ? `More practice in ${subjectLabel ?? recs.subject}` : 'Practise this topic'}
            </button>
            {recsOpen && (
              <div className="sol-explain-body practice-recs-body">
                {recsLoading && <p className="practice-recs-status">Loading recommendations…</p>}
                {!recsLoading && !recs && (
                  <p className="practice-recs-status">
                    Couldn't load recommendations.{' '}
                    <button className="btn btn-ghost btn-sm" onClick={() => { setRecs(null); openRecs() }}>Retry</button>
                  </p>
                )}
                {!recsLoading && recs && recs.questions.length === 0 && (
                  <p className="practice-recs-status">No other practice questions available yet.</p>
                )}
                {!recsLoading && recs && recs.questions.length > 0 && (
                  <div className="practice-recs-list">
                    {recs.questions.map((rec, i) => (
                      <div key={rec.id} className="practice-rec-card">
                        <div className="practice-rec-head">
                          <span className="practice-rec-num">Practice {i + 1}</span>
                          <button
                            className="bookmark-btn"
                            title={recBookmarks.has(rec.id) ? 'Remove bookmark' : 'Bookmark for revision'}
                            onClick={() => toggleRecBookmark(rec.id)}
                          >
                            {recBookmarks.has(rec.id) ? '⭐' : '☆'}
                          </button>
                        </div>
                        <QuestionContext q={rec} />
                        {rec.imageUrl && (
                          <div className="qd-image">
                            <img src={rec.imageUrl} alt="Question diagram" />
                          </div>
                        )}
                        {rec.text && <RichText as="div" className="qd-qtext" html={rec.text} />}
                        <div className="review-options qd-options">
                          {OPTIONS.map(opt => {
                            const isCorrectOpt = opt === rec.correctOption
                            return (
                              <div key={opt} className={`review-option ${isCorrectOpt ? 'correct-opt' : ''}`}>
                                <span className="option-label">{opt}</span>
                                <span><RichText html={optText(rec, opt)} /></span>
                                {isCorrectOpt && <span className="opt-tag correct-tag">✓ Correct answer</span>}
                              </div>
                            )
                          })}
                        </div>
                        {rec.solution && (
                          <div className="qd-solution">
                            <div className="qd-solution-title">💡 Solution</div>
                            <RichText as="div" className="sol-explain-text" html={rec.solution} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {onReport && (
          <div className="qd-report-row">
            <button className="btn btn-ghost btn-sm qd-report" onClick={onReport}>
              ⚑ Report a problem
            </button>
          </div>
        )}
      </div>

      {position && (
        <div className="qd-pager">
          <button className="btn btn-ghost qd-pager-btn" onClick={onPrev} disabled={!onPrev}>
            ← Previous
          </button>
          <span className="qd-pager-count">{position.index} of {position.total}</span>
          <button className="btn btn-ghost qd-pager-btn" onClick={onNext} disabled={!onNext}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
