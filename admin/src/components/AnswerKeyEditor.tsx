import type { Question, QuestionType } from '../lib/types'

/**
 * The answer key, in whichever shape the question's format calls for.
 *
 * One component rather than a branch inside the question form, because the
 * three shapes have nothing in common: a single letter, a set of letters, or
 * a list of accepted strings. Each writes into its own form fields, and the
 * form turns whichever is in use into the payload — so switching format
 * cannot leave a half-written key from the previous one behind.
 */

export interface AnswerKeyValue {
  correctOption: string
  msqCorrect: string[]
  msqPartial: boolean
  titaKind: 'NUMERIC' | 'TEXT'
  titaAccepted: string[]
  titaTolerance: string
}

export const EMPTY_ANSWER_KEY: AnswerKeyValue = {
  correctOption: 'A',
  msqCorrect: [],
  msqPartial: false,
  titaKind: 'NUMERIC',
  titaAccepted: [''],
  titaTolerance: '',
}

const OPTIONS = ['A', 'B', 'C', 'D'] as const

/**
 * Turns the form's answer fields into what the API expects.
 *
 * The unused shapes are sent as null rather than left out, so that saving a
 * question that used to be multiple-select and is now single-choice clears
 * the old key instead of leaving two keys on one row.
 */
export function answerKeyPayload(type: QuestionType, v: AnswerKeyValue) {
  if (type === 'MSQ') {
    return {
      correctOption: null,
      answerConfig: { correct: v.msqCorrect, partial: v.msqPartial },
    }
  }
  if (type === 'TITA') {
    const accepted = v.titaAccepted.map(a => a.trim()).filter(Boolean)
    const tolerance = Number(v.titaTolerance)
    return {
      correctOption: null,
      answerConfig: {
        kind: v.titaKind,
        accepted,
        tolerance: v.titaKind === 'NUMERIC' && Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0,
      },
    }
  }
  return { correctOption: v.correctOption, answerConfig: null }
}

/** Reads an existing question's key back into the form fields. */
export function answerKeyFrom(q: {
  questionType: QuestionType
  correctOption?: string | null
  answerConfig?: unknown
}): AnswerKeyValue {
  const cfg = (q.answerConfig ?? {}) as Record<string, unknown>
  if (q.questionType === 'MSQ') {
    return {
      ...EMPTY_ANSWER_KEY,
      msqCorrect: Array.isArray(cfg.correct) ? (cfg.correct as string[]) : [],
      msqPartial: cfg.partial === true,
    }
  }
  if (q.questionType === 'TITA') {
    const accepted = Array.isArray(cfg.accepted) ? (cfg.accepted as string[]) : []
    return {
      ...EMPTY_ANSWER_KEY,
      titaKind: cfg.kind === 'TEXT' ? 'TEXT' : 'NUMERIC',
      // At least one row, so the editor always has a field to type into.
      titaAccepted: accepted.length ? accepted : [''],
      titaTolerance: cfg.tolerance ? String(cfg.tolerance) : '',
    }
  }
  return { ...EMPTY_ANSWER_KEY, correctOption: q.correctOption ?? 'A' }
}

/**
 * What is wrong with the key as it stands, or null.
 *
 * Mirrors the server's rules so the admin is told before saving rather than
 * by a 400. The server still checks — this is a courtesy, not the guard.
 */
export function answerKeyError(type: QuestionType, v: AnswerKeyValue): string | null {
  if (type === 'MSQ') {
    if (v.msqCorrect.length < 1) return 'Tick at least one correct option.'
    if (v.msqCorrect.length === OPTIONS.length) {
      return 'All four options cannot be correct — there would be nothing to choose.'
    }
    return null
  }
  if (type === 'TITA') {
    const accepted = v.titaAccepted.map(a => a.trim()).filter(Boolean)
    if (!accepted.length) return 'Add at least one accepted answer.'
    if (v.titaKind === 'NUMERIC') {
      const bad = accepted.find(a => !Number.isFinite(Number(a)))
      if (bad) return `"${bad}" is not a number. Switch the answer to text, or correct it.`
    }
    return null
  }
  if (!(OPTIONS as readonly string[]).includes(v.correctOption)) return 'Pick the correct option.'
  return null
}

const hintStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5,
}

export default function AnswerKeyEditor({ type, value, onChange }: {
  type: QuestionType
  value: AnswerKeyValue
  onChange: (patch: Partial<AnswerKeyValue>) => void
}) {
  const error = answerKeyError(type, value)

  if (type === 'MSQ') {
    const toggle = (o: string) => onChange({
      msqCorrect: value.msqCorrect.includes(o)
        ? value.msqCorrect.filter(x => x !== o)
        // Sorted, so the key reads the same however it was clicked.
        : [...value.msqCorrect, o].sort(),
    })
    return (
      <div className="form-group">
        <label>Correct Options <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(tick every one)</span></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 4 }}>
          {OPTIONS.map(o => {
            const on = value.msqCorrect.includes(o)
            return (
              <label key={o} style={{
                border: `2px solid ${on ? 'var(--success, #16a34a)' : 'var(--border)'}`,
                borderRadius: 8, padding: '10px 8px', cursor: 'pointer', textAlign: 'center',
                background: on ? 'rgba(22,163,74,0.08)' : 'var(--surface)',
                fontSize: 14, fontWeight: 700,
                color: on ? 'var(--success, #16a34a)' : 'var(--heading)',
              }}>
                <input type="checkbox" style={{ display: 'none' }} checked={on} onChange={() => toggle(o)} />
                {on ? '✓ ' : ''}{o}
              </label>
            )
          })}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontWeight: 400, fontSize: 13 }}>
          <input type="checkbox" checked={value.msqPartial}
            onChange={e => onChange({ msqPartial: e.target.checked })} />
          Award partial marks for a correct subset
        </label>
        <div style={hintStyle}>
          {value.msqPartial
            ? 'A subset of the correct options scores pro rata. Picking any wrong option still scores the full penalty.'
            : 'All-or-nothing: the selection has to be exactly right. This is how CAT marks these.'}
        </div>
        {error && <div style={{ ...hintStyle, color: 'var(--danger)' }}>{error}</div>}
      </div>
    )
  }

  if (type === 'TITA') {
    const setAt = (i: number, text: string) => onChange({
      titaAccepted: value.titaAccepted.map((a, j) => (j === i ? text : a)),
    })
    return (
      <div className="form-group">
        <label>Accepted Answers</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 10 }}>
          {(['NUMERIC', 'TEXT'] as const).map(k => (
            <label key={k} style={{
              border: `2px solid ${value.titaKind === k ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: value.titaKind === k ? 'var(--primary-light)' : 'var(--surface)',
              color: value.titaKind === k ? 'var(--primary)' : 'var(--heading)',
            }}>
              <input type="radio" style={{ display: 'none' }} checked={value.titaKind === k}
                onChange={() => onChange({ titaKind: k })} />
              {k === 'NUMERIC' ? 'Number' : 'Text'}
            </label>
          ))}
        </div>

        {value.titaAccepted.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input className="input" value={a} onChange={e => setAt(i, e.target.value)}
              placeholder={value.titaKind === 'NUMERIC' ? 'e.g. 12.5' : 'e.g. New Delhi'} />
            {value.titaAccepted.length > 1 && (
              <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                onClick={() => onChange({ titaAccepted: value.titaAccepted.filter((_, j) => j !== i) })}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-sm btn-ghost"
          onClick={() => onChange({ titaAccepted: [...value.titaAccepted, ''] })}>
          + Another accepted answer
        </button>

        {value.titaKind === 'NUMERIC' && (
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 13 }}>Tolerance <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input className="input" value={value.titaTolerance} inputMode="decimal"
              onChange={e => onChange({ titaTolerance: e.target.value })}
              placeholder="0.01" style={{ maxWidth: 160 }} />
          </div>
        )}

        <div style={hintStyle}>
          {value.titaKind === 'NUMERIC'
            ? 'Compared as numbers, so 12, 12.0 and 12.00 all match. Add a tolerance for an answer that does not divide evenly.'
            : 'Compared ignoring case and extra spaces. Add a row for each spelling that should count.'}
          {' '}Type-in questions carry no negative marking on CAT.
        </div>
        {error && <div style={{ ...hintStyle, color: 'var(--danger)' }}>{error}</div>}
      </div>
    )
  }

  return (
    <div className="form-group">
      <label>Correct Option</label>
      <select className="input" value={value.correctOption}
        onChange={e => onChange({ correctOption: e.target.value })}>
        {OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {error && <div style={{ ...hintStyle, color: 'var(--danger)' }}>{error}</div>}
    </div>
  )
}

/**
 * The answer key as one short string, for a listing's narrow column.
 *
 * Three shapes have to fit in one cell: a letter, a set of letters, or typed
 * text. A type-in question shows its first accepted answer and a count of the
 * rest, because the column cannot hold them all.
 */
export function answerLabel(
  q: Pick<Question, 'questionType' | 'correctOption' | 'answerConfig'>,
): string {
  if (q.questionType === 'MSQ') {
    const correct = (q.answerConfig as { correct?: string[] } | null)?.correct ?? []
    return correct.length ? correct.join(' + ') : '—'
  }
  if (q.questionType === 'TITA') {
    const accepted = (q.answerConfig as { accepted?: string[] } | null)?.accepted ?? []
    if (!accepted.length) return '—'
    return accepted.length > 1 ? `${accepted[0]} +${accepted.length - 1}` : accepted[0]
  }
  return q.correctOption ?? '—'
}
