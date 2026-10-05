export type Section = 'QUANT' | 'REASONING' | 'ENGLISH' | 'GK'

/**
 * The order the four sections are presented in — in the exam room, in the
 * review afterwards, and on every subject breakdown.
 *
 * Defined once because it is a decision about the paper, not about a page. It
 * used to be a separate array in each file, which meant the order a candidate
 * met the sections in and the order the admin arranged them in could drift
 * apart without anything failing.
 *
 * Changing this line changes the sequence candidates sit the paper in: the
 * first entry is the section the exam opens on, and sections unlock in this
 * order.
 */
export const SECTIONS: Section[] = ['REASONING', 'GK', 'QUANT', 'ENGLISH']

export interface User {
  id: string
  name: string
  email: string
  role: 'STUDENT' | 'ADMIN'
  rating: number
}

export interface Contest {
  id: string
  title: string
  startTime: string
  durationMinutes: number
  negativeMarks: number
  sectionLimits: Record<string, number> | null
  status: 'SCHEDULED' | 'LIVE' | 'ENDED'
  hasJoined?: boolean
  hasSubmitted?: boolean
  /** Questions actually attached to the paper. */
  questionCount?: number
  _count?: { participations: number; contestQuestions?: number }
  /** The caller's own outcome. Null until the contest has settled. */
  myRank?: number | null
  myTotalParticipants?: number | null
  myOldRating?: number | null
  myNewRating?: number | null
}

/** Where a contest is in its lifecycle, by the clock rather than the column. */
export type ContestPhase = 'upcoming' | 'live' | 'past'

export function contestPhase(c: Contest, now = Date.now()): ContestPhase {
  const start = new Date(c.startTime).getTime()
  const end = start + c.durationMinutes * 60_000
  if (now >= end) return 'past'
  if (now >= start) return 'live'
  return 'upcoming'
}

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD'

export interface MockTestListItem {
  id: string
  title: string
  subject: 'QUANT' | 'REASONING' | 'ENGLISH' | 'GK'
  durationMinutes: number
  negativeMarks: number
  questionCount: number
  /** Derived from the questions on the paper, not stored on the test. */
  difficulty: Difficulty | null
  difficultyMix: Record<Difficulty, number>
  /** How many people have sat it, admin test runs excluded. */
  attemptCount: number
  attempted: boolean
  /** "Last", not "best": a retake overwrites the previous attempt row. */
  lastScore: number | null
  lastTotal: number | null
  lastSubmittedAt?: string | null
  accuracy?: number | null
  rank?: number | null
  rankOutOf?: number | null
}

export interface MockTestData {
  id: string
  title: string
  subject: string
  durationMinutes: number
  negativeMarks: number
  questions: Question[]
}

export interface Passage {
  id: string
  title: string
  content: string
  type: 'TEXT' | 'TABLE'
  tableData?: { headers: string[]; rows: string[][] } | null
}

export interface Question {
  /** Language this copy is presented in, and whether it is a real translation. */
  language?: 'EN' | 'HI'
  translated?: boolean
  /** Every language this question exists in — what the instructions sheet promises. */
  availableLanguages?: ('EN' | 'HI')[]
  id: string
  questionType: 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  text: string
  imageUrl?: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  subject: string
  difficulty: string
  marks: number
  negativeMarks: number
  correctOption?: string
  structuredData?: { statements: string[]; conclusions: string[] } | null
  passage?: Passage | null
}

export type ArticleType = 'GENERAL' | 'ANNOUNCEMENT' | 'TECHNIQUE' | 'EDITORIAL'

export interface ArticleAuthor {
  id: string
  name: string
  rating: number
  role: 'STUDENT' | 'ADMIN'
}

export interface ArticleListItem {
  id: string
  title: string
  excerpt: string
  readingMinutes: number
  type: ArticleType
  pinned: boolean
  score: number
  commentCount: number
  createdAt: string
  author: ArticleAuthor
  myVote: number
}

export interface Article {
  id: string
  title: string
  body: string
  type: ArticleType
  pinned: boolean
  score: number
  commentCount: number
  createdAt: string
  updatedAt: string
  authorId: string
  author: ArticleAuthor
  myVote: number
  canModify: boolean
}

export interface ArticleComment {
  id: string
  parentId: string | null
  body: string
  deleted: boolean
  score: number
  createdAt: string
  updatedAt: string
  author: ArticleAuthor | null
  myVote: number
  canModify: boolean
}
