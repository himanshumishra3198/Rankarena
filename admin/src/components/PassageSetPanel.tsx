import { useState } from 'react'
import { RichText, stripHtml } from './RichText'
import { answerLabel } from './AnswerKeyEditor'
import type { Passage, Question } from '../lib/types'

/**
 * A passage and the questions written on it, as one thing.
 *
 * Sits above the question editor while a set is being written, so the
 * passage stays on screen with its questions listed under it and the next
 * one is plainly the next one. Before this the editor simply remembered the
 * passage between saves, which worked but gave no sense of a set — each
 * question looked like a fresh start and there was nothing to show how far
 * along the set was, or to reread without leaving the page.
 *
 * Shows, never edits: the editor below owns the question being written, and
 * the passage is edited through its own form. Keeping the two apart is what
 * stops a half-typed question being lost to a passage edit.
 */

function preview(p: Passage): string {
  if (p.type === 'TABLE' && p.tableData?.headers?.length) {
    return `Columns: ${p.tableData.headers.filter(Boolean).join(' · ')}`
  }
  return stripHtml(p.content).replace(/\s+/g, ' ').trim()
}

export default function PassageSetPanel({
  passage, questions, nextNumber, onEditPassage, onEditQuestion, onRemoveQuestion, onFinish,
}: {
  passage: Passage
  /** Those already on this paper and this passage, in paper order. */
  questions: Question[]
  /** What the editor below is about to write. */
  nextNumber: number
  onEditPassage: () => void
  onEditQuestion: (q: Question) => void
  onRemoveQuestion: (questionId: string) => void
  onFinish: () => void
}) {
  // Long comprehensions push the editor off screen, so the text collapses —
  // open to begin with, because the first thing you do is read it.
  const [open, setOpen] = useState(true)
  const body = preview(passage)

  return (
    <section className="ps-set">
      <header className="ps-set-head">
        <div className="ps-set-title">
          <span className="ps-set-kind">{passage.type === 'TABLE' ? '📊 Data table' : '📄 Passage'}</span>
          <strong>{passage.title?.trim() || 'Untitled passage'}</strong>
        </div>
        <div className="ps-set-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onEditPassage}>Edit passage</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onFinish}>Finish set</button>
        </div>
      </header>

      <div className="ps-set-bodywrap">
        <button type="button" className="ps-set-toggle" onClick={() => setOpen(o => !o)}>
          {open ? '▾ Hide text' : '▸ Show text'}
        </button>
        {open && (
          passage.type === 'TABLE' && passage.tableData ? (
            <div className="ps-set-tablewrap">
              <table className="ps-set-table">
                <thead><tr>{passage.tableData.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>
                  {passage.tableData.rows.map((r, i) => (
                    <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ps-set-body">{body || <em>(empty)</em>}</div>
          )
        )}
      </div>

      <div className="ps-set-qs">
        <div className="ps-set-qs-head">
          {questions.length === 0
            ? 'No questions on it yet — the first one is below.'
            : `${questions.length} question${questions.length === 1 ? '' : 's'} on this passage`}
        </div>

        {questions.map((q, i) => (
          <div key={q.id} className="ps-set-q">
            <span className="ps-set-q-n">{i + 1}</span>
            <span className="ps-set-q-text">
              {stripHtml(q.text) ? <RichText html={q.text} /> : <em>(no stem)</em>}
            </span>
            <span className="ps-set-q-ans">{answerLabel(q)}</span>
            <span className="ps-set-q-actions">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onEditQuestion(q)}>Edit</button>
              <button type="button" className="btn btn-sm btn-ghost ps-set-q-rm"
                onClick={() => onRemoveQuestion(q.id)}>Remove</button>
            </span>
          </div>
        ))}

        {/* Names what the editor underneath is for, so the set reads as a
            numbered sequence rather than as a form that happens to reopen. */}
        <div className="ps-set-next">Question {nextNumber} — being written below</div>
      </div>
    </section>
  )
}
