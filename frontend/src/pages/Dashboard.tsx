import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { usePageMeta } from '../lib/seo'
import LandingNav from '../components/landing/LandingNav'
import LandingFooter from '../components/landing/LandingFooter'
import Greeting from '../components/dashboard/Greeting'
import QuickActions from '../components/dashboard/QuickActions'
import NextAction from '../components/dashboard/NextAction'
import StatsOverview from '../components/dashboard/StatsOverview'
import RatingOverview from '../components/dashboard/RatingOverview'
import SubjectPerformance from '../components/dashboard/SubjectPerformance'
import ContestPerformance from '../components/dashboard/ContestPerformance'
import LeaderboardPreview from '../components/dashboard/LeaderboardPreview'
import ActivityStreak from '../components/dashboard/ActivityStreak'
import Achievements from '../components/dashboard/Achievements'
import WhatsNew from '../components/dashboard/WhatsNew'
import NewUserWelcome from '../components/dashboard/NewUserWelcome'
import { isNewUser, type ProfileData } from '../components/dashboard/types'
// Reused wholesale from the mock tests page rather than reimplemented.
import ContinuePracticing from '../components/mocks/ContinuePracticing'
import RecommendedTests from '../components/mocks/RecommendedTests'
import { readDrafts, type MockDraft } from '../lib/mockDrafts'
import type { RankedUser } from '../components/landing/types'
import { contestPhase, type Contest, type MockTestListItem } from '../lib/types'

/**
 * The signed-in home page.
 *
 * Four independent requests, gathered with allSettled so that one failing
 * endpoint costs its own card and nothing else — a dead leaderboard must not
 * take the rating chart down with it. Each section is handed only what it
 * needs and renders a message of its own when that is missing.
 *
 * Everything shown is the reader's own record from /profile, /contests,
 * /mocks and /ratings/leaderboard. Nothing is simulated: the streak, the
 * global rank and the achievement predicates are all computed from stored
 * data, and a brand-new account gets the welcome rather than a grid of
 * zeroes pretending to be a dashboard.
 */
export default function Dashboard() {
  usePageMeta('Home — RankArena', 'Your rating, rank, contests and practice in one place.')
  const navigate = useNavigate()

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [contests, setContests] = useState<Contest[]>([])
  const [mocks, setMocks] = useState<MockTestListItem[]>([])
  const [leaders, setLeaders] = useState<RankedUser[]>([])
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<MockDraft[]>(readDrafts)
  const [busyId, setBusyId] = useState<string | null>(null)
  // One clock so every countdown and phase check on the page agrees.
  const [, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    return Promise.allSettled([
      api.get('/profile'), api.get('/contests'), api.get('/mocks'), api.get('/ratings/leaderboard'),
    ]).then(([p, c, m, l]) => {
      const bad: Record<string, boolean> = {}
      if (p.status === 'fulfilled') setProfile(p.value.data); else bad.profile = true
      if (c.status === 'fulfilled') {
        const d = c.value.data as { active?: Contest[]; past?: Contest[] }
        setContests([...(d?.active ?? []), ...(d?.past ?? [])])
      } else bad.contests = true
      if (m.status === 'fulfilled') setMocks(m.value.data ?? []); else bad.mocks = true
      if (l.status === 'fulfilled') setLeaders(l.value.data ?? []); else bad.leaders = true
      setFailed(bad)
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

  // Live beats scheduled; a finished contest is never the next action.
  const nextContest = useMemo(() => {
    const live = contests.find(c => contestPhase(c) === 'live')
    const soon = contests
      .filter(c => contestPhase(c) === 'upcoming')
      .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))[0]
    return live ?? soon ?? null
  }, [contests])

  const resumable = useMemo(() => {
    for (const d of drafts) {
      const mock = mocks.find(m => m.id === d.mockTestId)
      if (mock) return { mock, answered: d.answered }
    }
    return null
  }, [drafts, mocks])

  // Fallback suggestion for the hero: an unattempted paper in the weakest
  // subject, else simply one they have not sat.
  const suggestion = useMemo(() => {
    if (!mocks.length) return null
    const stats = profile?.subjectStats ?? {}
    const ranked = Object.entries(stats)
      .map(([subject, v]) => ({ subject, answered: v.correct + v.wrong, acc: v.correct / Math.max(v.correct + v.wrong, 1) }))
      .filter(s => s.answered >= 5)
      .sort((a, b) => a.acc - b.acc)
    const weak = ranked[0]?.subject
    const fresh = mocks.filter(m => !m.attempted)
    return fresh.find(m => m.subject === weak) ?? fresh[0] ?? null
  }, [mocks, profile])

  const subjectAccuracy = useMemo(
    () => Object.entries(profile?.subjectStats ?? {}).map(([subject, v]) => ({ subject, correct: v.correct, wrong: v.wrong })),
    [profile],
  )

  const lastActive = useMemo(() => {
    const days = Object.keys(profile?.heatmap ?? {}).sort()
    return days.length ? days[days.length - 1] : null
  }, [profile])

  async function register(c: Contest) {
    setBusyId(c.id)
    try {
      if (!c.hasJoined) await api.post(`/contests/${c.id}/join`)
      if (contestPhase(c) === 'live') navigate(`/contests/${c.id}`)
      else await load()
    } catch {
      navigate('/contests')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="lp db-page">
        <LandingNav active="Home" />
        <main className="lp-shell">
          <div className="db-skel db-skel-greet" />
          <div className="db-skel db-skel-quick" />
          <div className="db-grid-hero">
            <div className="db-skel db-skel-hero" />
            <div className="db-skel db-skel-stats" />
          </div>
          <div className="db-grid-2">
            <div className="db-skel db-skel-card" /><div className="db-skel db-skel-card" />
          </div>
        </main>
      </div>
    )
  }

  // Without /profile there is no dashboard to draw — everything personal
  // comes from it. The rest of the app is still reachable from the nav.
  if (!profile) {
    return (
      <div className="lp db-page">
        <LandingNav active="Home" />
        <main className="lp-shell">
          <div className="mk-empty" style={{ marginTop: 40 }}>
            <div className="mk-empty-icon" aria-hidden="true">⚠️</div>
            <p className="mk-empty-title">Couldn't load your dashboard.</p>
            <p className="mk-empty-body">Your account is fine — this is just the page failing to fetch.</p>
            <button className="lp-btn lp-btn-primary lp-btn-sm" onClick={() => load()}>Retry</button>
          </div>
        </main>
        <LandingFooter />
      </div>
    )
  }

  const fresh = isNewUser(profile)

  return (
    <div className="lp db-page">
      <LandingNav active="Home" />

      <main className="lp-shell">
        <Greeting
          name={profile.user.name}
          streak={profile.stats.currentStreak}
          totalContests={profile.stats.totalContests}
          totalMocks={profile.stats.totalMocks}
          lastActive={lastActive}
        />
        <QuickActions />

        {fresh ? (
          <NewUserWelcome name={profile.user.name} />
        ) : (
          <div className="db-grid-hero">
            <NextAction
              contest={nextContest}
              resumable={resumable}
              suggestion={suggestion}
              onRegister={register}
              registering={busyId !== null}
            />
            <StatsOverview p={profile} />
          </div>
        )}

        <ContinuePracticing drafts={drafts} mocks={mocks} onDiscard={() => setDrafts(readDrafts())} />

        {!failed.mocks && mocks.length > 0 && (
          <RecommendedTests mocks={mocks} subjectStats={subjectAccuracy} signedIn />
        )}

        {!fresh && (
          <>
            {/* The rating chart sizes its geometry from the viewport, not its
                container, so in a half-width card on a wide screen it draws
                desktop proportions into 400px and the tier bands swallow the
                line. It gets the full row. */}
            <RatingOverview p={profile} />

            <div className="db-grid-2">
              <SubjectPerformance p={profile} />
              <ContestPerformance p={profile} />
            </div>

            <div className="db-grid-2">
              <ActivityStreak p={profile} />
              {failed.leaders
                ? <section className="db-card">
                    <header className="db-card-head"><h2 className="db-card-title">Current Leaders</h2></header>
                    <p className="db-empty-line">Unable to load the leaderboard.</p>
                    <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => load()}>Retry</button>
                  </section>
                : <LeaderboardPreview
                    leaders={leaders}
                    me={{ id: profile.user.id, name: profile.user.name, rating: profile.user.rating, rank: profile.stats.globalRank }}
                  />}
            </div>

            <div className="db-grid-2">
              <Achievements p={profile} />
              <WhatsNew />
            </div>
          </>
        )}

        {fresh && <WhatsNew />}
      </main>

      <LandingFooter />
    </div>
  )
}
