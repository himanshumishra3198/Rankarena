import { useState } from 'react'
import { RichText, stripHtml } from './RichText'
import type { Passage, QuestionType } from '../lib/types'
import { MATH_HINT } from '../lib/math'

/**
 * The question as a candidate will meet it.
 *
 * Built from the form as it is being typed, not from what was saved, so the
 * things that are easy to get wrong and expensive to discover — a formula
 * with a stray backslash, an option that is an image and a caption, a
 * syllogism whose conclusions read as statements, a type-in whose accepted
 * answers disagree — are visible before the question reaches a paper.
 *
 * The answer key is marked, which the real exam room never does. This is an
 * author's view of the finished article, not a simulation of sitting it.
 */

export interface PreviewValue {
  questionType: QuestionType
  text: string
  imageUrl?: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  /** Single-choice key. */
  correctOption?: string
  /** Multiple-select key. */
  msqCorrect?: string[]
  /** Type-in key. */
  titaKind?: 'NUMERIC' | 'TEXT'
  titaAccepted?: string[]
  titaTolerance?: string
  statements?: string[]
  conclusions?: string[]
  solution?: string
  /** Non-English content, so the preview can show what a Hindi candidate sees. */
  hi?: { text: string; optionA: string; optionB: string; optionC: string; optionD: string; solution?: string }
}

const OPTIONS = ['A', 'B', 'C', 'D'] as const

function hasInk(html: string | undefined): boolean {
  return !!html && (stripHtml(html).length > 0 || /<img/i.test(html))
}

export default function QuestionPreview({ value, passage }: {
  value: PreviewValue
  /** Resolved passage for a PASSAGE or TABLE question, if one is attached. */
  passage?: Passage | null
}) {
  const hindiReady = hasInk(value.hi?.text)
  const [lang, setLang] = useState<'EN' | 'HI'>('EN')
  // Falls back the moment the Hindi text is cleared, so the preview cannot
  // sit on a language that no longer has any content.
  const showHi = lang === 'HI' && hindiReady
  const src = showHi && value.hi ? value.hi : value

  const text = src.text
  const opt = (o: typeof OPTIONS[number]) =>
    ({ A: src.optionA, B: src.optionB, C: src.optionC, D: src.optionD })[o]

  const isMsq = value.questionType === 'MSQ'
  const isTita = value.questionType === 'TITA'
  const isSyll = value.questionType === 'SYLLOGISM'
  const keyed = (o: string) =>
    isMsq ? (value.msqCorrect ?? []).includes(o) : value.correctOption === o

  const accepted = (value.titaAccepted ?? []).map(a => a.trim()).filter(Boolean)
  const empty = !hasInk(text) && !isSyll && !value.imageUrl

  return (
    <div className="qp">
      <div className="qp-head">
        <span className="qp-title">Student preview</span>
        {hindiReady && (
          <div className="qp-langs">
            {(['EN', 'HI'] as const).map(l => (
              <button key={l} type="button"
                className={`qp-lang ${lang === l ? 'on' : ''}`}
                onClick={() => setLang(l)}>
                {l === 'EN' ? 'English' : 'हिंदी'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="qp-body">
        {empty ? (
          <p className="qp-empty">
            Nothing to show yet — the preview fills in as you type.
            <br />
            <span className="qp-hint">{MATH_HINT}</span>
          </p>
        ) : (
          <>
            {passage && (
              <div className="qp-passage">
                {passage.title && <div className="qp-passage-title">{passage.title}</div>}
                {passage.type === 'TABLE' && passage.tableData ? (
                  <div className="qp-tablewrap">
                    <table className="qp-table">
                      <thead>
                        <tr>{passage.tableData.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {passage.tableData.rows.map((r, i) => (
                          <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <RichText as="div" className="qp-passage-text" html={passage.content} />
                )}
              </div>
            )}

            {isSyll ? (
              <div className="qp-syll">
                <div className="qp-syll-head">Statements:</div>
                {(value.statements ?? []).filter(hasInk).map((st, i) => (
                  <div key={i} className="qp-syll-line">
                    <span className="qp-syll-n">{i + 1}.</span> <RichText html={st} />
                  </div>
                ))}
                <div className="qp-syll-head">Conclusions:</div>
                {(value.conclusions ?? []).filter(hasInk).map((c, i) => (
                  <div key={i} className="qp-syll-line">
                    <span className="qp-syll-n">{['I', 'II', 'III', 'IV', 'V'][i] ?? i + 1}.</span>{' '}
                    <RichText html={c} />
                  </div>
                ))}
              </div>
            ) : null}

            {hasInk(text) && <RichText as="div" className="qp-qtext" html={text} />}

            {value.imageUrl && <img className="qp-image" src={value.imageUrl} alt="" />}

            {isTita ? (
              <div className="qp-tita">
                <label className="qp-tita-label">
                  {value.titaKind === 'TEXT' ? 'Type your answer' : 'Type your answer as a number'}
                </label>
                <input className="qp-tita-input" disabled
                  placeholder={value.titaKind === 'TEXT' ? 'e.g. New Delhi' : 'e.g. 12.5'} />
                <div className="qp-key">
                  {accepted.length
                    ? <>Accepted: <strong>{accepted.join('  /  ')}</strong>
                        {value.titaKind !== 'TEXT' && Number(value.titaTolerance) > 0 &&
                          <> &nbsp;±{value.titaTolerance}</>}</>
                    : <span className="qp-warn">No accepted answer yet — this question cannot be marked.</span>}
                </div>
              </div>
            ) : (
              <>
                {isMsq && <p className="qp-multi">More than one option is correct. Tick every one that applies.</p>}
                <div className="qp-opts">
                  {OPTIONS.map(o => (
                    <div key={o} className={`qp-opt ${keyed(o) ? 'key' : ''}`}>
                      <span className={`qp-box ${isMsq ? 'sq' : ''} ${keyed(o) ? 'on' : ''}`} aria-hidden="true" />
                      <span className="qp-opt-letter">{o}.</span>
                      {hasInk(opt(o))
                        ? <RichText html={opt(o)} />
                        : <em className="qp-blank">(empty)</em>}
                      {keyed(o) && <span className="qp-tag">answer</span>}
                    </div>
                  ))}
                </div>
                {!isMsq && !value.correctOption && (
                  <div className="qp-key"><span className="qp-warn">No correct option chosen yet.</span></div>
                )}
                {isMsq && (value.msqCorrect ?? []).length === 0 && (
                  <div className="qp-key"><span className="qp-warn">No correct options ticked yet.</span></div>
                )}
              </>
            )}

            {hasInk(src.solution) && (
              <details className="qp-sol">
                <summary>Solution</summary>
                <RichText as="div" html={src.solution ?? ''} />
              </details>
            )}
          </>
        )}
      </div>
    </div>
  )
}
