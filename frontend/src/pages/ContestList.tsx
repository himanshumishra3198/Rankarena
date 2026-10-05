import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import { usePageMeta } from '../lib/seo'
import LandingNav from '../components/landing/LandingNav'
import LandingFooter from '../components/landing/LandingFooter'
import ContestHero from '../components/contests/ContestHero'
import ContestTabs, { type Tab } from '../components/contests/ContestTabs'
import FeaturedContest from '../components/contests/FeaturedContest'
import ContestCard from '../components/contests/ContestCard'
import ContestCalendar from '../components/contests/ContestCalendar'
import MyContestPerformance from '../components/contests/MyContestPerformance'
import RatingExplanation from '../components/contests/RatingExplanation'
import HowContestsWork from '../components/contests/HowContestsWork'
import ContestsCTA from '../components/contests/ContestsCTA'
import ContestFilters, { DEFAULT_FILTERS, type Filters } from '../components/contests/ContestFilters'
import type { RatingPoint } from '../components/RatingChart'
import type { RankedUser } from '../components/landing/types'
import { contestPhase, type Contest } from '../lib/types'

/**
 * The contests page.
 *
 * Open to guests — GET /contests already answers without a token, returning
 * the schedule and entrant counts but none of the caller's own results, so
 * the arena is visible before you join it.
 *
 * Registration is a POST to /contests/:id/join, which is the same call the
 * room makes on entry; the card just does it earlier. The backend requires a
 * verified email for it, and that refusal is surfaced rather than swallowed.
 */
export default function ContestList() {
  usePageMeta(
    'Contests — RankArena',
    'Timed, rated SSC CGL contests with live leaderboards. Register, compete and build your rating.',
  )
  const navigate = useNavigate()
  const signedIn = Boolean(localStorage.getItem('token'))
  const [params, setParams] = useSearchParams()

  const [contests, setContests] = useState<Contest[]>([])
  const [leaders, setLeaders] = useState<RankedUser[]>([])
  const [history, setHistory] = useState<RatingPoint[]>([])
  const [rating, setRating] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  // One clock for every countdown and phase check on the page.
  const [, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const rawTab = (params.get('tab') ?? '') as Tab
  const tab: Tab = (['upcoming', 'live', 'past', 'mine'] as const).includes(rawTab)
    ? (rawTab === 'mine' && !signedIn ? 'upcoming' : rawTab)
    : 'upcoming'
  const search = params.get('q') ?? ''
  const [draft, setDraft] = useState(search)
  useEffect(() => setDraft(search), [search])

  function setUrl(next: { tab?: Tab; q?: string }) {
    const merged = { tab, q: search, ...next }
    const p = new URLSearchParams()
    if (merged.tab !== 'upcoming') p.set('tab', merged.tab)
    if (merged.q) p.set('q', merged.q)
    setParams(p, { replace: true })
  }

  const load = useCallback(() => {
    const calls: Promise<unknown>[] = [api.get('/contests'), api.get('/ratings/leaderboard')]
    if (signedIn) calls.push(api.get('/profile'))
    return Promise.allSettled(calls).then(([c, l, p]) => {
      if (c.status === 'fulfilled') {
        const d = (c.value as { data: { active?: Contest[]; past?: Contest[] } }).data
        setContests([...(d?.active ?? []), ...(d?.past ?? [])])
      }
      if (l.status === 'fulfilled') setLeaders((l.value as { data: RankedUser[] }).data ?? [])
      if (p?.status === 'fulfilled') {
        const d = (p.value as { data: { ratingHistory?: RatingPoint[]; user?: { rating: number } } }).data
        setHistory(d?.ratingHistory ?? [])
        setRating(d?.user?.rating ?? null)
      }
      setLoading(false)
    })
  }, [signedIn])

  useEffect(() => { load() }, [load])

  const byPhase = useMemo(() => ({
    upcoming: contests.filter(c => contestPhase(c) === 'upcoming'),
    live: contests.filter(c => contestPhase(c) === 'live'),
    past: contests.filter(c => contestPhase(c) === 'past'),
    mine: contests.filter(c => c.hasJoined),
  }), [contests])

  const counts: Record<Tab, number> = {
    upcoming: byPhase.upcoming.length, live: byPhase.live.length,
    past: byPhase.past.length, mine: byPhase.mine.length,
  }

  const liveNow = byPhase.live[0] ?? null
  const nextUp = byPhase.upcoming[0] ?? null
  // The hero shows whatever is most urgent: something running, else the next.
  const heroContest = liveNow ?? nextUp

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const now = new Date()
    const endOf = (k: Filters['date']) => {
      if (k === 'today') { const d = new Date(now); d.setHours(23, 59, 59, 999); return d.getTime() }
      if (k === 'week') return now.getTime() + 7 * 86400_000
      if (k === 'month') return now.getTime() + 30 * 86400_000
      return Infinity
    }
    const limit = endOf(filters.date)

    const out = byPhase[tab].filter(c => {
      if (q && !c.title.toLowerCase().includes(q)) return false
      if (day && new Date(c.startTime).toDateString() !== day) return false
      // Date windows only constrain things that have not happened yet.
      if (filters.date !== 'all' && tab !== 'past' && new Date(c.startTime).getTime() > limit) return false
      return true
    })

    out.sort((a, b) => {
      if (filters.sort === 'participants') return (b._count?.participations ?? 0) - (a._count?.participations ?? 0)
      if (filters.sort === 'newest') return +new Date(b.startTime) - +new Date(a.startTime)
      // Starting soon: forward in time for anything pending, most recent
      // first once it is history.
      return tab === 'past'
        ? +new Date(b.startTime) - +new Date(a.startTime)
        : +new Date(a.startTime) - +new Date(b.startTime)
    })
    return out
  }, [byPhase, tab, search, day, filters])

  async function register(c: Contest) {
    if (!signedIn) { navigate('/login'); return }
    setBusyId(c.id); setNotice(null)
    try {
      if (!c.hasJoined) await api.post(`/contests/${c.id}/join`)
      if (contestPhase(c) === 'live') navigate(`/contests/${c.id}`)
      else { await load(); setNotice(`You're registered for ${c.title}.`) }
    } catch (e) {
      const err = e as { response?: { data?: { error?: string; code?: string } } }
      setNotice(err.response?.data?.error ?? 'Could not register for this contest.')
    } finally {
      setBusyId(null)
    }
  }

  const activeCount = [filters.date !== 'all', filters.sort !== 'soon'].filter(Boolean).length

  const empties: Record<Tab, { title: string; body: string }> = {
    upcoming: { title: 'No contests scheduled yet.', body: 'The next battle is being prepared.' },
    live: { title: 'Nothing running right now.', body: 'Register for the next one and be ready when it opens.' },
    past: { title: 'No finished contests yet.', body: 'The archive fills up as contests run.' },
    mine: { title: "You haven't entered a contest yet.", body: 'Your first rank is waiting.' },
  }
  const filtered = (search || day || filters.date !== 'all') && byPhase[tab].length > 0

  return (
    <div className="lp ct-page">
      <LandingNav active="Contests" />

      <ContestHero contest={heroContest} leaders={leaders} loading={loading} />

      <main className="lp-shell">
        {notice && <div className="ct-notice" role="status">{notice}</div>}

        <FeaturedContest contest={nextUp} onRegister={register} registering={busyId === nextUp?.id} />

        <section className="ct-section" id="contest-list">
          <header className="mk-section-head">
            <div>
              <span className="lp-kicker">The arena</span>
              <h2 className="mk-h2">{liveNow ? 'Live Now' : 'Contests'}</h2>
            </div>
          </header>

          <ContestTabs value={tab} counts={counts} onChange={t => setUrl({ tab: t })} signedIn={signedIn} />

          <div className="mk-toolbar">
            <form className="mk-search" onSubmit={e => { e.preventDefault(); setUrl({ q: draft.trim() }) }}>
              <span className="mk-search-icon" aria-hidden="true">⌕</span>
              <input
                className="mk-search-input" type="search" placeholder="Search contests..."
                aria-label="Search contests" value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => { if (draft.trim() !== search) setUrl({ q: draft.trim() }) }}
              />
            </form>
            <button className="mk-filter-btn" onClick={() => setSheet(true)}>
              Filters{activeCount > 0 && <span className="mk-filter-n">{activeCount}</span>}
            </button>
          </div>

          <ContestFilters
            value={filters} onChange={setFilters} open={sheet}
            onClose={() => setSheet(false)} activeCount={activeCount}
          />

          {loading && <div className="ct-grid">{[0, 1, 2].map(i => <div className="mk-card-skel" key={i} />)}</div>}

          {!loading && visible.length === 0 && (
            <div className="mk-empty">
              <div className="mk-empty-icon" aria-hidden="true">{tab === 'live' ? '⏳' : '🗓'}</div>
              <p className="mk-empty-title">{filtered ? 'No contests found.' : empties[tab].title}</p>
              <p className="mk-empty-body">{filtered ? 'Try a different search or filter.' : empties[tab].body}</p>
              {filtered
                ? <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => { setFilters(DEFAULT_FILTERS); setDay(null); setUrl({ q: '' }) }}>Clear filters</button>
                : <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => navigate('/mocks')}>Explore Mock Tests →</button>}
            </div>
          )}

          {!loading && visible.length > 0 && (
            <div className="ct-grid">
              {visible.map(c => (
                <ContestCard key={c.id} c={c} onRegister={register} registering={busyId === c.id} />
              ))}
            </div>
          )}
        </section>

        <ContestCalendar
          contests={[...byPhase.upcoming, ...byPhase.live]}
          selected={day}
          onSelect={d => { setDay(d); if (d) setUrl({ tab: 'upcoming' }) }}
        />

        <MyContestPerformance history={history} currentRating={rating} signedIn={signedIn} />
        <RatingExplanation />
        <HowContestsWork />
        <ContestsCTA signedIn={signedIn} />
      </main>

      <LandingFooter />
    </div>
  )
}
