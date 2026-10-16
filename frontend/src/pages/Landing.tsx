import { useEffect, useState } from 'react'
import api from '../lib/api'
import { usePageMeta } from '../lib/seo'
import LandingNav from '../components/landing/LandingNav'
import Hero from '../components/landing/Hero'
import Stats from '../components/landing/Stats'
import WhyRankArena from '../components/landing/WhyRankArena'
import HowItWorks from '../components/landing/HowItWorks'
import ContestPreview from '../components/landing/ContestPreview'
import LeaderboardPreview from '../components/landing/LeaderboardPreview'
import RatingSection from '../components/landing/RatingSection'
import Roadmap from '../components/landing/Roadmap'
import Motivation from '../components/landing/Motivation'
import FinalCTA from '../components/landing/FinalCTA'
import LandingFooter from '../components/landing/LandingFooter'
import type { Contest } from '../lib/types'
import type { LandingContest, PublicStats, RankedUser } from '../components/landing/types'

/**
 * The arena's front door, for visitors who are not signed in.
 *
 * Signed-in users keep the feed on `/` — see App.tsx. A marketing page is
 * the wrong thing to show someone who came back to sit a contest.
 *
 * Every number on this page is fetched, never written into the markup: the
 * stats, the next contest and its clock, and the top of the ranking all come
 * from endpoints that already exist. Each section renders a placeholder or
 * hides itself when its data is missing, so a quiet week looks empty rather
 * than dishonest.
 */
export default function Landing() {
  usePageMeta(
    'RankArena — Don’t Just Prepare. Compete.',
    'Rated SSC CGL contests, live leaderboards and a competitive rating system. Practice the way the real exam feels — timed, ranked, and against other aspirants.',
  )

  const [stats, setStats] = useState<PublicStats | null>(null)
  const [leaders, setLeaders] = useState<RankedUser[]>([])
  const [contest, setContest] = useState<LandingContest | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    Promise.allSettled([
      api.get('/stats/public'),
      api.get('/ratings/leaderboard?limit=5'),
      api.get('/contests'),
    ]).then(([s, l, c]) => {
      if (cancelled) return

      if (s.status === 'fulfilled') setStats(s.value.data)
      if (l.status === 'fulfilled') setLeaders(l.value.data?.entries ?? [])

      if (c.status === 'fulfilled') {
        const all: Contest[] = [...(c.value.data?.active ?? []), ...(c.value.data?.past ?? [])]
        const now = Date.now()
        const phaseOf = (x: Contest) => {
          const start = new Date(x.startTime).getTime()
          const end = start + x.durationMinutes * 60_000
          return now >= end ? 'ended' : now >= start ? 'live' : 'scheduled'
        }
        // Something running beats something scheduled; otherwise the soonest.
        const live = all.find(x => phaseOf(x) === 'live')
        const next = all
          .filter(x => phaseOf(x) === 'scheduled')
          .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))[0]
        const pick = live ?? next

        if (pick) {
          // The paper's length is the sum of its section limits when the
          // contest is sectioned; otherwise we simply don't claim a count.
          const limits = pick.sectionLimits
          const questionCount = limits
            ? Object.values(limits).reduce((n, v) => n + (Number(v) || 0), 0)
            : undefined
          setContest({
            id: pick.id,
            title: pick.title,
            startTime: pick.startTime,
            durationMinutes: pick.durationMinutes,
            status: pick.status,
            participants: pick._count?.participations,
            questionCount: questionCount || undefined,
            phase: live ? 'live' : 'upcoming',
          })
        }
      }

      setLoading(false)
    })

    return () => { cancelled = true }
  }, [])

  return (
    <div className="lp">
      <LandingNav />
      <main>
        <Hero contest={contest} leaders={leaders} aspirants={stats?.aspirants ?? null} loading={loading} />
        <Stats stats={stats} />
        <WhyRankArena />
        <HowItWorks />
        <ContestPreview contest={contest} />
        <LeaderboardPreview leaders={leaders} loading={loading} />
        <RatingSection />
        <Roadmap />
        <Motivation />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  )
}
