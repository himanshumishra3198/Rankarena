/**
 * What the problemset and the problem page both need.
 *
 * The marks below are the one thing practice remembers, and they live in this
 * browser on purpose. Nothing about practice is recorded server-side — that
 * is what keeps it away from ratings and leaderboards — so a tick against a
 * problem is a note to yourself, not a score. It does not follow you to
 * another device, and clearing site data clears it.
 */

export const SUBJECT_LABEL: Record<string, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'General Intelligence & Reasoning',
  ENGLISH: 'English Language',
  GK: 'General Awareness',
}

export const SUBJECT_SHORT: Record<string, string> = {
  QUANT: 'Quant', REASONING: 'Reasoning', ENGLISH: 'English', GK: 'GK',
}

export const SUBJECT_COLOR: Record<string, string> = {
  QUANT: '#7c3aed', REASONING: '#0ea5e9', ENGLISH: '#16a34a', GK: '#f59e0b',
}

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const

/**
 * Rows per page of the problemset.
 *
 * Shared because both pages do arithmetic with it: the list turns a row into
 * an absolute position in the filtered set, and the problem page turns that
 * position back into the page it came from. Two copies that drifted would
 * send "back" to the wrong page.
 */
export const PROBLEMS_PER_PAGE = 25

export function titleCase(word: string) {
  return word ? word[0] + word.slice(1).toLowerCase() : word
}

/** SOLVED: right on the first try. TRIED: opened and answered, not first time. */
export type ProblemMark = 'SOLVED' | 'TRIED'

const MARKS_KEY = 'practice-marks'

export function readMarks(): Record<string, ProblemMark> {
  try {
    const raw = JSON.parse(localStorage.getItem(MARKS_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export function markProblem(id: string, mark: ProblemMark): Record<string, ProblemMark> {
  const all = readMarks()
  // TRIED never overwrites SOLVED. Getting it right once is the thing worth
  // remembering; fumbling the same question on a revisit months later
  // shouldn't quietly take the tick away.
  if (all[id] === 'SOLVED' && mark === 'TRIED') return all
  all[id] = mark
  try {
    localStorage.setItem(MARKS_KEY, JSON.stringify(all))
  } catch {
    // A full or blocked localStorage costs the tick, nothing else.
  }
  return all
}
