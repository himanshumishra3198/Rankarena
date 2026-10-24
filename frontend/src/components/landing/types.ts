/** Shapes the landing sections consume. Every one is already served by the API. */

export interface RankedUser {
  rank: number
  id: string
  name: string
  rating: number
}

export interface ExamStats {
  exam: 'SSC_CGL' | 'CAT'
  label: string
  sections: string[]
  mockTests: number
  questions: number
  contests: number
}

export interface PublicStats {
  aspirants: number
  mockTests: number
  questions: number
  contests: number
  testsTaken: number
  /** What exists for each examination. Absent on an older API. */
  exams?: ExamStats[]
}

export interface LandingContest {
  id: string
  title: string
  startTime: string
  durationMinutes: number
  status: 'SCHEDULED' | 'LIVE' | 'ENDED'
  questionCount?: number
  participants?: number
  phase: 'live' | 'upcoming'
}
