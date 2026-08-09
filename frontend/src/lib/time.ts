// Duration of a question attempt, e.g. "45s" or "2m 10s".
export function fmtSecs(s: number) {
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60); const r = Math.round(s % 60)
  return r === 0 ? `${m}m` : `${m}m ${r}s`
}

// How the candidate's time on a question compares with everyone else's.
export function timeVerdict(userSecs: number, avgSecs: number): { emoji: string; label: string; color: string } {
  if (avgSecs === 0) return { emoji: '⏱', label: 'No avg data', color: 'var(--text-muted)' }
  const ratio = userSecs / avgSecs
  if (ratio < 0.5)  return { emoji: '🚀', label: 'Much faster than avg', color: '#16a34a' }
  if (ratio < 0.8)  return { emoji: '⚡', label: 'Faster than avg',      color: '#0ea5e9' }
  if (ratio < 1.2)  return { emoji: '😊', label: 'About avg time',        color: '#6366f1' }
  if (ratio < 2)    return { emoji: '🐢', label: 'Slower than avg',       color: '#d97706' }
  return { emoji: '😰', label: 'Much slower than avg', color: '#dc2626' }
}

// Relative timestamp for community posts and comments ("3 hours ago").
// Falls back to an absolute date past a month, where "5 weeks ago" stops
// being easier to read than the date itself.
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'

  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`

  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
