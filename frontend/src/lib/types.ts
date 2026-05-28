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

export interface Question {
  id: string
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
}
