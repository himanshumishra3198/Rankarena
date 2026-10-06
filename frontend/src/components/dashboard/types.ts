import type { RatingPoint } from '../RatingChart'

/** Exactly what GET /profile returns — the dashboard's single source. */
export interface ProfileData {
  user: { id: string; name: string; role: string; rating: number; createdAt: string }
  ratingHistory: RatingPoint[]
  heatmap: Record<string, number>
  stats: {
    totalContests: number
    totalMocks: number
    totalSolved: number
    activeDays: number
    bestRank: number | null
    maxRating: number
    maxStreak: number
    currentStreak: number
    globalRank: number | null
    totalRanked: number
  }
  subjectStats: Record<string, { correct: number; wrong: number; skipped: number }>
  topicStats: { topic: string; subject: string; correct: number; wrong: number; skipped: number }[]
  verdictTotals: { correct: number; wrong: number; skipped: number; total: number }
}

/** A user who has done nothing yet gets the welcome, not a wall of zeroes. */
export function isNewUser(p: ProfileData | null) {
  if (!p) return false
  return p.stats.totalContests === 0 && p.stats.totalMocks === 0
}
