import type { ReactNode } from 'react'
import { PassageBlock, QuestionContent } from './QuestionContent'
import { RichText } from './RichText'
import type { Question } from '../lib/types'

/**
 * A question, shown beside its passage when it has one.
 *
 * Questions that share a passage are served together and in order, so a
 * candidate meets them as a set. Rendering the passage above each one in
 * turn meant redrawing the same two hundred words four or five times, and
 * losing the reader's place in it on every answer. Here the passage holds
 * still in its own pane and only the question changes.
 *
 * The pane is keyed on the passage, which is what makes that true: React
 * keeps the same element across questions of one set, so neither the text
 * nor its scroll position is touched, and it remounts only when the
 * candidate reaches a different passage.
 *
 * A question with no passage renders exactly as it did before — one column,
 * no panes, nothing to explain.
 */
export default function PassageSplit({ q, position, children }: {
  q: Question
  /** Where this question sits in its passage set, 1-based. */
  position?: { index: number; total: number } | null
  /** The answer control, rendered under the question text. */
  children?: ReactNode
}) {
  if (!q.passage) {
    return (
      <>
        <QuestionContent q={q} />
        {children}
      </>
    )
  }

  return (
    <div className="qsplit">
      {/* <details> rather than a plain block: on a phone there is no room for
          two panes, and a candidate rereading one line of a question should
          not have to scroll past the whole comprehension to reach the
          options. Open by default — it is collapsible, not collapsed. */}
      <details className="qsplit-passage" open key={q.passage.id}>
        <summary className="qsplit-summary">
          {q.passage.type === 'TABLE' ? 'Data table' : 'Passage'}
          <span className="qsplit-summary-hint">tap to collapse</span>
        </summary>
        <div className="qsplit-passage-inner">
          <PassageBlock passage={q.passage} />
        </div>
      </details>

      <div className="qsplit-question">
        {position && position.total > 1 && (
          <p className="qsplit-pos">
            Question <strong>{position.index}</strong> of {position.total} on this {q.passage.type === 'TABLE' ? 'table' : 'passage'}
          </p>
        )}

        {q.translated === false && (
          <div className="lang-fallback" role="note">
            <span aria-hidden="true">🌐</span>
            <span>This question is currently available only in English.</span>
          </div>
        )}

        {q.imageUrl && (
          <div className="question-image">
            <img src={q.imageUrl} alt="Question diagram" />
          </div>
        )}

        {q.text && <RichText as="p" className="question-text" html={q.text} />}

        {children}
      </div>
    </div>
  )
}

/**
 * Where a question sits among the ones sharing its passage.
 *
 * Counted over the list as the candidate is served it, not over the paper as
 * stored, so the numbering matches what they actually see.
 */
export function setPositionOf(questions: Question[], current: Question) {
  const pid = current.passage?.id
  if (!pid) return null
  const siblings = questions.filter(x => x.passage?.id === pid)
  const index = siblings.findIndex(x => x.id === current.id)
  if (index < 0) return null
  return { index: index + 1, total: siblings.length }
}
