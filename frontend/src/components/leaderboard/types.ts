export interface LeaderEntry {
  rank: number
  id: string
  name: string
  rating: number
  /** Rating movement over the selected period. Never a change in rank. */
  ratingChange: number | null
  contests: number
  bestRank: number | null
}

export interface LeaderPage {
  entries: LeaderEntry[]
  total: number
  rankedTotal: number
  page: number
  pageSize: number
  offset: number
  pageCount: number
}

export type Period = 'all' | 'month' | 'week'
