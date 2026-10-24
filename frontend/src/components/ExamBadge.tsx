import type { Exam } from '../lib/types'

/**
 * Which examination a paper is for.
 *
 * Shown only where it tells the reader something. On a platform running one
 * exam it is noise on every card, so the catalogues pass `show` and decide
 * from their own contents — the badge appears the day a second exam does.
 */

export const EXAM_LABEL: Record<Exam, string> = {
  SSC_CGL: 'SSC CGL',
  CAT: 'CAT',
}

export function examLabel(exam: Exam | undefined): string {
  return EXAM_LABEL[exam ?? 'SSC_CGL'] ?? String(exam)
}

export default function ExamBadge({ exam, show = false }: {
  exam: Exam | undefined
  /**
   * Opt-in. Defaulting to shown meant every call site that had not thought
   * about it — the recommendations strip, the resume-a-draft row — labelled
   * every card "SSC CGL" on a platform running only SSC, which is the exact
   * noise this component exists to avoid.
   */
  show?: boolean
}) {
  if (!show) return null
  const key = exam ?? 'SSC_CGL'
  return (
    <span className={`exam-badge exam-${key.toLowerCase()}`}>{examLabel(key)}</span>
  )
}
