import type { QuestionType } from './types'

/**
 * The answer-key fields a review screen reads.
 *
 * Declared once and extended by each screen's own question type. Every
 * review page had its own `correctOption: string`, and widening five
 * identical copies by hand is how one of them gets missed and quietly
 * reports every multiple-select answer as wrong.
 *
 * All optional: a paper in progress carries none of them, because the server
 * strips the key until the paper is over.
 */
export interface AnswerKeyFields {
  questionType?: QuestionType
  /** Single-choice key. */
  correctOption?: string | null
  /** Multiple-select key. */
  correctOptions?: string[] | null
  /** Every accepted type-in answer. */
  acceptedAnswers?: string[] | null
}

/**
 * What a candidate's answer is, now that not every question has four options.
 *
 * A single-choice answer is still the bare string it has always been, so
 * every attempt recorded before multiple-select existed reads back
 * unchanged. A multiple-select answer is a list; a type-in answer is the text
 * that was typed.
 */
export type Answer = string | string[]

export const OPTIONS = ['A', 'B', 'C', 'D'] as const
export type Option = typeof OPTIONS[number]

/** Formats answered by picking exactly one of the four options. */
export function isSingleChoice(type: QuestionType | undefined): boolean {
  return type !== 'MSQ' && type !== 'TITA'
}

/**
 * Whether the candidate has actually answered.
 *
 * An empty list and an empty string both count as unanswered: clearing every
 * tick on a multiple-select question has to leave it looking skipped, not
 * answered-with-nothing, or the palette would show it green and the score
 * would treat it as a wrong answer.
 */
export function isAnswered(a: Answer | undefined | null): boolean {
  if (a === undefined || a === null) return false
  if (Array.isArray(a)) return a.length > 0
  return a.trim() !== ''
}

/** The answer with one option toggled — for multiple-select. */
export function toggleOption(a: Answer | undefined, opt: string): string[] {
  const list = Array.isArray(a) ? a : isAnswered(a) ? [a as string] : []
  return list.includes(opt)
    // Sorted so the stored answer does not depend on click order.
    ? list.filter(x => x !== opt).sort()
    : [...list, opt].sort()
}

/** Whether an option is part of the current answer. */
export function hasOption(a: Answer | undefined, opt: string): boolean {
  return Array.isArray(a) ? a.includes(opt) : a === opt
}

/** The typed text of a type-in answer. */
export function typedText(a: Answer | undefined): string {
  if (Array.isArray(a)) return a[0] ?? ''
  return a ?? ''
}

/**
 * Whether an answer was right, for a review screen.
 *
 * Mirrors the server's marking so the review agrees with the score. It reads
 * only the key the server chose to reveal once the paper was over — which is
 * why these fields are absent while a paper is in progress.
 */
export function wasCorrect(q: AnswerKeyFields, given: Answer | undefined): boolean {
  if (!isAnswered(given)) return false

  if (q.questionType === 'MSQ') {
    const want = q.correctOptions ?? []
    const got = Array.isArray(given) ? given : [given as string]
    return want.length === got.length && want.every(w => got.includes(w))
  }

  if (q.questionType === 'TITA') {
    const accepted = q.acceptedAnswers ?? []
    const text = typedText(given).trim()
    if (!text) return false
    const asNumber = Number(text)
    return accepted.some(a => {
      const want = Number(a)
      // Compared as numbers where both sides are numbers, so 12 and 12.0
      // match; as text otherwise.
      if (Number.isFinite(asNumber) && Number.isFinite(want)) {
        return Math.abs(asNumber - want) <= Math.max(Math.abs(want), 1) * 1e-9
      }
      return a.trim().toLowerCase().replace(/\s+/g, ' ')
        === text.toLowerCase().replace(/\s+/g, ' ')
    })
  }

  return given === q.correctOption
}

/** The key as one short string, for a review screen's summary line. */
export function keyLabel(q: AnswerKeyFields): string {
  if (q.questionType === 'MSQ') return (q.correctOptions ?? []).join(' + ') || '—'
  if (q.questionType === 'TITA') return (q.acceptedAnswers ?? []).join(' / ') || '—'
  return q.correctOption ?? '—'
}

/**
 * Whether an option is part of the key — for highlighting it on review.
 *
 * A multiple-select question has several, so a review screen cannot ask
 * "is this *the* answer". A type-in question has no options at all.
 */
export function isKeyOption(q: AnswerKeyFields, opt: string): boolean {
  if (q.questionType === 'MSQ') return (q.correctOptions ?? []).includes(opt)
  if (q.questionType === 'TITA') return false
  return opt === q.correctOption
}

/** Whether the question is answered by picking from the four options at all. */
export function hasOptions(type: QuestionType | undefined): boolean {
  return type !== 'TITA'
}
