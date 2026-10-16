import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import { usePageMeta } from '../lib/seo'
import LandingNav from '../components/landing/LandingNav'
import LandingFooter from '../components/landing/LandingFooter'
import LeaderboardRow from '../components/leaderboard/LeaderboardRow'
import TopThreePodium from '../components/leaderboard/TopThreePodium'
import MyRankingCard from '../components/leaderboard/MyRankingCard'
import RankNeighbors from '../components/leaderboard/RankNeighbors'
import RatingDistribution, { type Bucket } from '../components/leaderboard/RatingDistribution'
import StickyMyRank from '../components/leaderboard/StickyMyRank'
import LeaderboardFilters, { PERIODS } from '../components/leaderboard/LeaderboardFilters'
import { RatingChart } from '../components/RatingChart'
import { TIERS } from '../lib/tiers'
import { useReveal } from '../components/landing/hooks'
import type { LeaderEntry, LeaderPage, Period } from '../components/leaderboard/types'
import type { ProfileData } from '../components/dashboard/types'

const PAGE = 25
const BANDS = TIERS.map(t => `${t.min}:${t.max}`).join(',')

/** Page numbers around the current one, gaps marked by null. */
function pageWindow(page: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const want = new Set([1, count, page, page - 1, page + 1])
  const sorted = [...want].filter(p => p >= 1 && p <= count).sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((p, i) => { if (i > 0 && p - sorted[i - 1] > 1) out.push(null); out.push(p) })
  return out
}

/**
 * The ranking.
 *
 * Paginated server-side: the table asks for one page at a time and the rank
 * on each row is a window function over the whole field, so searching for
 * one person still reports where they sit globally rather than first of one.
 *
 * Open to guests, who get the board and a prompt instead of a rank card.
 * Nothing here is live — the platform has no WebSocket layer and the brief
 * said not to introduce one for this, so the board is a fetch per page.
 */
export default function Leaderboard() {
  usePageMeta(
    'Leaderboard — RankArena',
    'Live SSC CGL rankings: ratings, tiers and contest performance across every rated aspirant.',
  )
  const signedIn = Boolean(localStorage.getItem('token'))
  const [params, setParams] = useSearchParams()
  const tableRef = useRef<HTMLDivElement | null>(null)
  const topRef = useReveal<HTMLElement>()

  const [data, setData] = useState<LeaderPage | null>(null)
  const [top3, setTop3] = useState<LeaderEntry[]>([])
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [neighbours, setNeighbours] = useState<LeaderEntry[]>([])
  const [dist, setDist] = useState<{ total: number; buckets: Bucket[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [nbLoading, setNbLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [sheet, setSheet] = useState(false)

  const rawPeriod = (params.get('period') ?? 'all') as Period
  const period: Period = PERIODS.some(p => p.k === rawPeriod) ? rawPeriod : 'all'
  const minRating = Number(params.get('min')) || 0
  const search = params.get('q') ?? ''
  const page = Math.max(Number(params.get('page')) || 1, 1)
  const [draft, setDraft] = useState(search)
  useEffect(() => setDraft(search), [search])

  function setUrl(next: Record<string, string>) {
    const merged: Record<string, string> = {
      period, min: String(minRating), q: search, page: '1', ...next,
    }
    const p = new URLSearchParams()
    if (merged.period !== 'all') p.set('period', merged.period)
    if (merged.min && merged.min !== '0') p.set('min', merged.min)
    if (merged.q) p.set('q', merged.q)
    if (merged.page && merged.page !== '1') p.set('page', merged.page)
    setParams(p, { replace: true })
  }

  // Typing shouldn't cost a request per keystroke.
  useEffect(() => {
    if (draft.trim() === search) return
    const t = setTimeout(() => setUrl({ q: draft.trim() }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE), page: String(page), period })
    if (minRating > 0) p.set('minRating', String(minRating))
    if (search) p.set('q', search)
    return p.toString()
  }, [page, period, minRating, search])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setFailed(false)
    api.get(`/ratings/leaderboard?${query}`)
      .then(r => { if (!cancelled) setData(r.data) })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query])

  // The podium is the top of the unfiltered board, so it does not change
  // when somebody searches — it is the state of the arena, not of the query.
  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      api.get(`/ratings/leaderboard?limit=3&period=${period}`),
      api.get(`/ratings/distribution?bands=${encodeURIComponent(BANDS)}`),
      signedIn ? api.get('/profile') : Promise.resolve(null),
    ]).then(([t, d, p]) => {
      if (cancelled) return
      if (t.status === 'fulfilled') setTop3(t.value.data?.entries ?? [])
      if (d.status === 'fulfilled') setDist(d.value.data)
      if (p.status === 'fulfilled' && p.value) setProfile(p.value.data)
    })
    return () => { cancelled = true }
  }, [period, signedIn])

  // A window centred on the reader, fetched by rank rather than by page.
  const myRank = profile?.stats.globalRank ?? null
  useEffect(() => {
    if (!myRank) return
    let cancelled = false
    setNbLoading(true)
    const offset = Math.max(myRank - 4, 0)
    api.get(`/ratings/leaderboard?offset=${offset}&limit=7&period=all`)
      .then(r => { if (!cancelled) setNeighbours(r.data?.entries ?? []) })
      .catch(() => { if (!cancelled) setNeighbours([]) })
      .finally(() => { if (!cancelled) setNbLoading(false) })
    return () => { cancelled = true }
  }, [myRank])

  const meId = profile?.user.id ?? null
  const gapToNext = useMemo(() => {
    if (!meId) return null
    const i = neighbours.findIndex(n => n.id === meId)
    return i > 0 ? neighbours[i - 1].rating - neighbours[i].rating : null
  }, [neighbours, meId])

  const jumpToMe = useCallback(() => {
    if (!myRank) return
    setUrl({ q: '', page: String(Math.ceil(myRank / PAGE)) })
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRank, period, minRating])

  const activeCount = [period !== 'all', minRating > 0].filter(Boolean).length
  const firstRow = data ? data.offset + 1 : 0
  const lastRow = data ? Math.min(data.offset + data.pageSize, data.total) : 0

  return (
    <div className="lp lb-page">
      <LandingNav active="Leaderboard" />

      <main className="lp-shell">
        <header className="lb-hero lp-reveal" ref={topRef}>
          <span className="mk-badge">LIVE RANKINGS</span>
          <h1 className="mk-title">The Arena <span className="lp-grad">Leaderboard</span></h1>
          <p className="mk-sub">
            See where you stand among RankArena aspirants and compete your way to the top.
          </p>
          {data && (
            <p className="lb-hero-count">
              <b>{data.rankedTotal.toLocaleString('en-IN')}</b> rated {data.rankedTotal === 1 ? 'aspirant' : 'aspirants'}
            </p>
          )}
        </header>

        <MyRankingCard profile={profile} signedIn={signedIn} />

        <TopThreePodium top={top3} meId={meId} />

        <section className="lb-section" ref={tableRef}>
          <div className="lb-tabs">
            {PERIODS.map(p => (
              <button
                key={p.k}
                className={`ct-tab ${period === p.k ? 'is-active' : ''}`}
                onClick={() => setUrl({ period: p.k })}
              >
                {p.label}
              </button>
            ))}
            <Link to="/contests?tab=past" className="ct-tab lb-tab-link">Contest rankings →</Link>
          </div>

          <div className="mk-toolbar">
            <div className="mk-search">
              <span className="mk-search-icon" aria-hidden="true">⌕</span>
              <input
                className="mk-search-input" type="search" placeholder="Search aspirants…"
                aria-label="Search aspirants" value={draft} onChange={e => setDraft(e.target.value)}
              />
            </div>
            <button className="mk-filter-btn" onClick={() => setSheet(true)}>
              Filters{activeCount > 0 && <span className="mk-filter-n">{activeCount}</span>}
            </button>
          </div>

          <LeaderboardFilters
            period={period} minRating={minRating}
            onPeriod={p => setUrl({ period: p })} onMin={n => setUrl({ min: String(n) })}
            open={sheet} onClose={() => setSheet(false)} activeCount={activeCount}
          />

          {data && !loading && data.total > 0 && (
            <p className="mk-count">
              Showing <b>{firstRow}–{lastRow}</b> of <b>{data.total.toLocaleString('en-IN')}</b>
              {search && <> matching “{search}”</>}
            </p>
          )}

          <div className="card lb-table">
            <div className="lb-row lb-head">
              <span>Rank</span><span>Aspirant</span><span>Rating</span>
              <span title="Change in rating, not in position">Change</span><span>Contests</span><span>Best</span>
            </div>

            {loading && [...Array(8)].map((_, i) => (
              <div className="lb-row" key={i}><span className="lp-skel" style={{ width: '100%' }} /></div>
            ))}

            {!loading && failed && (
              <div className="lb-state">
                <p>Unable to load the leaderboard.</p>
                <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => setUrl({})}>Retry</button>
              </div>
            )}

            {!loading && !failed && data?.total === 0 && (
              <div className="lb-state">
                <p className="mk-empty-title">{search ? 'No aspirants found.' : 'No rankings yet.'}</p>
                <p>{search ? 'Try another username.' : 'Be the first to enter the arena.'}</p>
                {search && <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => { setDraft(''); setUrl({ q: '' }) }}>Clear search</button>}
              </div>
            )}

            {!loading && !failed && data?.entries.map(e => (
              <LeaderboardRow key={e.id} e={e} isMe={e.id === meId} />
            ))}
          </div>

          {data && data.pageCount > 1 && (
            <nav className="ps-pager" aria-label="Leaderboard pages">
              <button className="ps-pager-btn" disabled={page <= 1} onClick={() => setUrl({ page: String(page - 1) })}>←</button>
              {pageWindow(page, data.pageCount).map((p, i) =>
                p === null
                  ? <span key={`g${i}`} className="ps-pager-gap">…</span>
                  : <button key={p} className={`ps-pager-btn ${p === page ? 'active' : ''}`} onClick={() => setUrl({ page: String(p) })}>{p}</button>,
              )}
              <button className="ps-pager-btn" disabled={page >= data.pageCount} onClick={() => setUrl({ page: String(page + 1) })}>→</button>
            </nav>
          )}
        </section>

        {meId && <RankNeighbors rows={neighbours} meId={meId} loading={nbLoading} />}

        {dist && (
          <RatingDistribution
            buckets={dist.buckets} total={dist.total}
            myRating={profile?.user.rating ?? null}
          />
        )}

        {profile && profile.ratingHistory.length > 0 && (
          <section className="lb-section">
            <header className="mk-section-head">
              <div>
                <span className="lp-kicker">Your climb</span>
                <h2 className="mk-h2">Rating History</h2>
              </div>
            </header>
            <div className="card"><RatingChart history={profile.ratingHistory} /></div>
          </section>
        )}

        <section className="lb-section">
          <div className="lp-final">
            <h2 className="lp-h2">Ready to Climb?</h2>
            <p className="lp-final-sub">
              Your current rank is just a starting point. Enter the next contest and challenge yourself.
            </p>
            <div className="lp-final-cta">
              <Link to="/contests" className="lp-btn lp-btn-primary lp-btn-lg">Join Next Contest <span aria-hidden="true">→</span></Link>
              <Link to="/mocks" className="lp-btn lp-btn-ghost lp-btn-lg">Practise Now</Link>
            </div>
          </div>
        </section>
      </main>

      {signedIn && profile && profile.ratingHistory.length > 0 && (
        <StickyMyRank
          rank={myRank} name={profile.user.name} rating={profile.user.rating}
          gapToNext={gapToNext} onJump={jumpToMe}
        />
      )}

      <LandingFooter />
    </div>
  )
}
