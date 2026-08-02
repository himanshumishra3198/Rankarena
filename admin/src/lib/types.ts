export type Section = 'QUANT' | 'REASONING' | 'ENGLISH' | 'GK'

export const SECTIONS: Section[] = ['QUANT', 'REASONING', 'ENGLISH', 'GK']

export const SECTION_LABELS: Record<Section, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'Logical Reasoning',
  ENGLISH: 'English Language',
  GK: 'General Knowledge',
}

export interface MockTest {
  id: string
  title: string
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
  startTime: string
  durationMinutes: number
  negativeMarks: number
  sectionLimits: Record<Section, number> | null
  status: 'SCHEDULED' | 'LIVE' | 'ENDED'
}

export type QuestionType = 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
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
  text: string
  imageUrl?: string | null
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  correctOption: string
  subject: 'QUANT' | 'REASONING' | 'ENGLISH' | 'GK'
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  passageId?: string | null
  passage?: Passage | null
  structuredData?: { statements: string[]; conclusions: string[] } | null
  solution?: string | null
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
