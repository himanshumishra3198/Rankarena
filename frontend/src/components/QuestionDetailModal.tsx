import { useEffect } from 'react'
import { QuestionContext } from './QuestionContent'
import { RichText } from './RichText'
import { fmtSecs, timeVerdict } from '../lib/time'

/**
 * Full read-only view of a single attempted question.
 *
 * The result page lists questions in several compact places (time analysis,
 * question map) where only a two-line excerpt fits. Clicking one used to do
 * nothing, so the only way to actually read a question was to switch tabs and
 * hunt for it. This shows the whole thing in place: passage, image, every
 * option with the correct one and your pick marked, the solution, and how your
 * time compared with everyone else's.
 */

export interface ReviewQuestion {
  id: string
  text: string
  imageUrl?: string | null
  optionA: string; optionB: string; optionC: string; optionD: string
  correctOption: string
  subject: string
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
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

const OPTIONS = ['A', 'B', 'C', 'D'] as const

function optText(q: ReviewQuestion, opt: string) {
  return ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as Record<string, string>)[opt] ?? ''
}

export default function QuestionDetailModal({
  q, qNum, given, marked, timeSpent, avgTime,
  subjectLabel, subjectColor, bookmarked,
  onToggleBookmark, onReport, onOpenInReview, onClose,
}: {
  q: ReviewQuestion
  qNum: number
  /** The option the candidate picked, if any. */
  given?: string
  marked?: boolean
  timeSpent?: number
  avgTime?: number
  subjectLabel?: string
  subjectColor?: string
  bookmarked?: boolean
  onToggleBookmark?: () => void
  onReport?: () => void
  /** Jumps to this question in the Solutions tab and closes the modal. */
  onOpenInReview?: () => void
  onClose: () => void
}) {
  const isCorrect = given === q.correctOption
  const isWrong = !!given && given !== q.correctOption
  const marksEarned = isCorrect ? q.marks : isWrong ? -q.negativeMarks : 0
  const verdict = timeSpent !== undefined && avgTime !== undefined
    ? timeVerdict(timeSpent, avgTime) : null

  // Escape closes, matching every other dialog in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-overlay qdm-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-box qdm-box" role="dialog" aria-modal="true" aria-labelledby="qdm-title">
        <div className="qdm-header">
          <div className="qdm-header-left">
            <span id="qdm-title" className="qdm-qnum">Question {qNum}</span>
            <span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
            {subjectLabel && (
              <span className="qdm-subject" style={{ color: subjectColor }}>{subjectLabel}</span>
            )}
            {marked && <span className="badge" style={{ background: '#fef3c7', color: '#b45309' }}>🔖 Marked</span>}
          </div>
          <div className="qdm-header-right">
            {onToggleBookmark && (
              <button
                className="bookmark-btn"
                title={bookmarked ? 'Remove bookmark' : 'Bookmark for revision'}
                onClick={onToggleBookmark}
              >
                {bookmarked ? '⭐' : '☆'}
              </button>
            )}
            <button className="qdm-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        <div className={`qdm-verdict-strip qdm-${isCorrect ? 'cor' : isWrong ? 'wrg' : 'skp'}`}>
          <span className="qdm-verdict">
            {isCorrect ? '✓ Correct' : isWrong ? '✗ Wrong' : '— Skipped'}
          </span>
          <span className={`qdm-marks ${marksEarned > 0 ? 'pos' : marksEarned < 0 ? 'neg' : ''}`}>
            {marksEarned > 0 ? '+' : ''}{marksEarned.toFixed(2)} marks
          </span>
          {timeSpent !== undefined && (
            <span className="qdm-time">
              <strong>{fmtSecs(timeSpent)}</strong>
              {avgTime !== undefined && <> · avg {fmtSecs(avgTime)}</>}
              {verdict && (
                <span style={{ color: verdict.color, marginLeft: 6 }}>{verdict.emoji} {verdict.label}</span>
              )}
            </span>
          )}
        </div>

        <div className="qdm-body">
          <QuestionContext q={q} />

          {q.imageUrl && (
            <div className="qdm-image">
              <img src={q.imageUrl} alt="Question diagram" />
            </div>
          )}

          {q.text && <RichText as="div" className="qdm-qtext" html={q.text} />}

          <div className="review-options qdm-options">
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

          {/* Opened deliberately to study one question, so the solution is
              expanded rather than hidden behind another click. */}
          {q.solution ? (
            <div className="qdm-solution">
              <div className="qdm-solution-title">💡 Solution</div>
              <RichText as="div" className="sol-explain-text" html={q.solution} />
            </div>
          ) : (
            <p className="qdm-no-solution">No written solution has been added for this question yet.</p>
          )}
        </div>

        <div className="qdm-footer">
          {onReport && (
            <button className="btn btn-ghost btn-sm qdm-report" onClick={onReport}>
              ⚑ Report a problem
            </button>
          )}
          <div className="qdm-footer-right">
            {onOpenInReview && (
              <button className="btn btn-ghost btn-sm" onClick={onOpenInReview}>
                Open in full review →
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}
