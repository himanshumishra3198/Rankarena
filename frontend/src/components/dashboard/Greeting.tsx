/**
 * The line at the top of the page.
 *
 * The sub-line is chosen from what the reader has actually done, so it is a
 * remark about them rather than a slogan: a streak worth protecting reads
 * differently from a first visit, and both read differently from somebody
 * who has drifted away for a fortnight.
 */
function partOfDay(d = new Date()) {
  const h = d.getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Greeting({
  name, streak, totalContests, totalMocks, lastActive,
}: {
  name: string
  streak: number
  totalContests: number
  totalMocks: number
  /** Most recent day with any activity, as an ISO date string. */
  lastActive: string | null
}) {
  const nothingYet = totalContests === 0 && totalMocks === 0
  const daysSince = lastActive
    ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86_400_000)
    : null

  const line = nothingYet
    ? 'Your RankArena journey starts today.'
    : streak >= 3
      ? `You're on a ${streak}-day roll. Keep climbing.`
      : daysSince !== null && daysSince >= 7
        ? "It's been a while — pick up where you left off."
        : 'Ready for your next challenge?'

  return (
    <header className="db-greet">
      <h1 className="db-greet-title">
        {partOfDay()}, <span className="lp-grad">{name.split(' ')[0]}</span> <span aria-hidden="true">👋</span>
      </h1>
      <p className="db-greet-sub">{line}</p>
    </header>
  )
}
