/** Shapes the landing sections consume. Every one is already served by the API. */

export interface RankedUser {
  rank: number
  id: string
  name: string
  rating: number
}

export interface PublicStats {
  aspirants: number
  mockTests: number
  questions: number
  contests: number
  testsTaken: number
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
