import { RichText } from './RichText'
import type { Question } from '../lib/types'
import {
  OPTIONS, type Answer, hasOption, isSingleChoice, toggleOption, typedText,
} from '../lib/answers'

/**
 * How a candidate answers, whichever format the question is.
 *
 * One component for all three formats, so a multiple-select question is
 * rendered, cleared and counted the same way in a mock test as in a contest.
 * The two rooms style their options differently — the contest room draws a
 * bordered list, the mock room a plain one — so the class prefix is a prop
 * rather than two copies of this logic.
 *
 * The only visible differences between formats are the control itself (a
 * checkbox instead of a radio) and the line of guidance above the options: a
 * candidate who has only ever met single-choice questions needs telling that
 * more than one answer is expected.
 */

/** Which room is rendering: `xs` the mock room, `xr` the contest room. */
export type AnswerVariant = 'xs' | 'xr'

function optionText(q: Question, opt: string): string {
  return ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as Record<string, string>)[opt] ?? ''
}

export default function AnswerInput({ q, value, onChange, disabled, variant = 'xs' }: {
  q: Question
  value: Answer | undefined
  onChange: (next: Answer) => void
  disabled?: boolean
  variant?: AnswerVariant
}) {
  if (q.questionType === 'TITA') {
    const numeric = q.inputKind !== 'TEXT'
    return (
      <div className={`${variant}-tita xa-tita`}>
        <label className="xa-tita-label" htmlFor={`tita-${q.id}`}>
          {numeric ? 'Type your answer as a number' : 'Type your answer'}
        </label>
        <input
          id={`tita-${q.id}`}
          className="xa-tita-input"
          // `text` with a numeric keypad rather than type=number: a number
          // input silently swallows a value it dislikes, and its spinner
          // changes the answer on an accidental scroll — both of which would
          // cost a candidate marks.
          type="text"
          inputMode={numeric ? 'decimal' : 'text'}
          autoComplete="off"
          spellCheck={!numeric}
          value={typedText(value)}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          placeholder={numeric ? 'e.g. 12.5' : 'e.g. New Delhi'}
        />
        <p className="xa-tita-hint">
          This question has no options, and a wrong answer carries no penalty.
        </p>
      </div>
    )
  }

  const multi = q.questionType === 'MSQ'

  return (
    <>
      {multi && (
        <p className="xa-multi-hint">
          <strong>More than one option is correct.</strong> Tick every one that applies.
        </p>
      )}
      <div className={`${variant}-opts`}>
        {OPTIONS.map((opt, i) => {
          const on = hasOption(value, opt)
          return (
            <label
              key={opt}
              className={`${variant}-opt ${on ? 'sel' : ''} ${disabled ? 'locked' : ''} ${multi ? 'xa-opt-multi' : ''}`}
            >
              <input
                type={multi ? 'checkbox' : 'radio'}
                name={`q-${q.id}`}
                checked={on}
                disabled={disabled}
                onChange={() => onChange(multi ? toggleOption(value, opt) : opt)}
              />
              {/* Each room labels its options its own way: "a)" in the mock
                  room, "A." in the contest room. */}
              {variant === 'xr'
                ? <span>{opt}.</span>
                : <span className="xs-opt-letter">{'abcd'[i]})</span>}
              <span><RichText html={optionText(q, opt)} /></span>
            </label>
          )
        })}
      </div>
    </>
  )
}

/** Re-exported so a room does not need to know which formats are single-choice. */
export { isSingleChoice }
