/** Every examination the panel can author for. */
export type Exam = 'SSC_CGL' | 'CAT'

/**
 * Sections, across every exam. Which of them are legal on a given paper
 * depends on its exam — the panel reads that from GET /admin/exams rather
 * than hard-coding it, so adding an exam is a backend change only.
 */
export type Section =
  | 'QUANT' | 'REASONING' | 'ENGLISH' | 'GK'
  | 'VARC' | 'DILR' | 'QA'

/**
 * The order sections are presented in, admin side. Must match the student
 * app's SECTIONS — a candidate has to meet the sections in the order the
 * contest was arranged in, and the two lists are what keep that true.
 */
export const SECTIONS: Section[] = ['REASONING', 'GK', 'QUANT', 'ENGLISH']

export const SECTION_LABELS: Record<Section, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'Logical Reasoning',
  ENGLISH: 'English Language',
  GK: 'General Knowledge',
  VARC: 'Verbal Ability & Reading Comprehension',
  DILR: 'Data Interpretation & Logical Reasoning',
  QA: 'Quantitative Ability',
}

export interface MockTest {
  id: string
  title: string
  exam: Exam
  subject: Section
  durationMinutes: number
  negativeMarks: number
  isPublished: boolean
  createdAt: string
  _count?: { mockTestQuestions: number; attempts: number }
}

export interface MockTestQuestion {
  mockTestId: string
  questionId: string
  displayOrder: number
  marks: number
  negativeMarks: number
  question: Question
}

export interface Contest {
  id: string
  title: string
  exam: Exam
  startTime: string
  durationMinutes: number
  negativeMarks: number
  sectionLimits: Partial<Record<Section, number>> | null
  status: 'SCHEDULED' | 'LIVE' | 'ENDED'
}

export type QuestionType =
  | 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  /** Several correct options, selected together. */
  | 'MSQ'
  /** Type In The Answer: no options, the candidate types a number or a word. */
  | 'TITA'

export type TagCategory = 'TOPIC' | 'SUBTOPIC' | 'DIFFICULTY' | 'SKILL' | 'QUESTION_TYPE' | 'CUSTOM'

/**
 * A reusable label for a question.
 *
 * Referenced by id, so renaming one does not touch the questions carrying it.
 * `exam` is null for a tag that applies to every examination.
 */
export interface Tag {
  id: string
  name: string
  slug: string
  category: TagCategory
  exam: Exam | null
  active: boolean
  /** How many questions carry it. Present on the tag list, not on a question. */
  questionCount?: number
}

/** The answer key for the formats that do not fit in a single letter. */
export interface MsqConfig { correct: string[]; partial?: boolean }
export interface TitaConfig { kind: 'NUMERIC' | 'TEXT'; accepted: string[]; tolerance?: number }
export type AnswerConfig = MsqConfig | TitaConfig
export type PassageType = 'TEXT' | 'TABLE'

export interface Passage {
  id: string
  title: string
  content: string
  type: PassageType
  tableData?: { headers: string[]; rows: string[][] } | null
}

export interface Question {
  id: string
  questionType: QuestionType
  exam: Exam
  text: string
  imageUrl?: string | null
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  /** Null for MSQ and TITA, whose keys live in `answerConfig`. */
  correctOption: string | null
  answerConfig?: AnswerConfig | null
  tags?: Tag[]
  subject: Section
  topic?: string | null
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  passageId?: string | null
  passage?: Passage | null
  structuredData?: { statements: string[]; conclusions: string[] } | null
  solution?: string | null
  /** Every language this question exists in, English always included. */
  languages?: Language[]
  translations?: QuestionTranslation[]
}

export interface ContestQuestion {
  contestId: string
  questionId: string
  displayOrder: number
  marks: number
  negativeMarks: number
  question: Question
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

// ── Multilingual questions ─────────────────────────────────────────────────
// English lives in the base Question fields; every other language is a row
// here. Adding a language means extending this union, not the Question type.
export type Language = 'EN' | 'HI'

export const LANGUAGES: { code: Language; label: string; native: string }[] = [
  { code: 'EN', label: 'English', native: 'English' },
  { code: 'HI', label: 'Hindi', native: 'हिंदी' },
]

export interface QuestionTranslation {
  language: Language
  text: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  solution?: string | null
  structuredData?: { statements: string[]; conclusions: string[] } | null
}
