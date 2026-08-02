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
  _count?: { participations: number }
}

export interface MockTestListItem {
  id: string
  title: string
  subject: 'QUANT' | 'REASONING' | 'ENGLISH' | 'GK'
  durationMinutes: number
  negativeMarks: number
  questionCount: number
  attempted: boolean
  lastScore: number | null
  lastTotal: number | null
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
