export type Section = 'QUANT' | 'REASONING' | 'ENGLISH' | 'GK'

export const SECTIONS: Section[] = ['QUANT', 'REASONING', 'ENGLISH', 'GK']

export const SECTION_LABELS: Record<Section, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'Logical Reasoning',
  ENGLISH: 'English Language',
  GK: 'General Knowledge',
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

export interface Question {
  id: string
  text: string
  imageUrl?: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  correctOption: string
  subject: 'QUANT' | 'REASONING' | 'ENGLISH' | 'GK'
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
}

export interface ContestQuestion {
  contestId: string
  questionId: string
  displayOrder: number
  marks: number
  negativeMarks: number
  question: Question
}
