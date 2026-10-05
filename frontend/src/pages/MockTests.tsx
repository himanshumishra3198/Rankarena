import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import { usePageMeta } from '../lib/seo'
import LandingNav from '../components/landing/LandingNav'
import LandingFooter from '../components/landing/LandingFooter'
import StatsOverview from '../components/mocks/StatsOverview'
import SubjectCards from '../components/mocks/SubjectCards'
import SubjectTabs from '../components/mocks/SubjectTabs'
import MockTestGrid from '../components/mocks/MockTestGrid'
import ContinuePracticing from '../components/mocks/ContinuePracticing'
import RecommendedTests, { type SubjectAccuracy } from '../components/mocks/RecommendedTests'
import FullLengthTests from '../components/mocks/FullLengthTests'
import MocksCTA from '../components/mocks/MocksCTA'
import FilterPanel, { DEFAULT_FILTERS, type Filters } from '../components/mocks/FilterPanel'
import { readDrafts, type MockDraft } from '../lib/mockDrafts'
import { SECTIONS, type Contest, type MockTestListItem } from '../lib/types'

const PAGE = 9
const DIFF_ORDER: Record<string, number> = { EASY: 0, MEDIUM: 1, HARD: 2 }

/**
 * The mock test catalogue.
 *
 * Open to guests: /mocks/public serves the same shape without the reader's
 * own scores, so somebody can see what they would be signing up for. The
 * card component does not branch on it — a guest simply has no attempt.
 *
 * Filtering and sorting happen on the client because the whole catalogue is
 * a few dozen rows. The shape is deliberately server-ready: subject, search
 * and page are already in the URL, so moving the work behind a query string
 * later is a change to where `visible` comes from and nothing else.
 */
export default function MockTests() {
  usePageMeta(
    'Mock Tests — RankArena',
    'Subject-wise SSC CGL mock tests with timed papers, accuracy tracking and ranking against other aspirants.',
  )

  const signedIn = Boolean(localStorage.getItem('token'))
  const [params, setParams] = useSearchParams()

  const [mocks, setMocks] = useState<MockTestListItem[]>([])
  const [subjectStats, setSubjectStats] = useState<SubjectAccuracy[]>([])
  const [contest, setContest] = useState<Contest | null>(null)
  const [drafts, setDrafts] = useState<MockDraft[]>(readDrafts)
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [shown, setShown] = useState(PAGE)

  // Subject and search live in the URL so a filtered view is a link.
  const rawSubject = (params.get('subject') ?? 'ALL').toUpperCase()
  const subject = (SECTIONS as string[]).includes(rawSubject) ? rawSubject : 'ALL'
  const search = params.get('q') ?? ''
  const [draft, setDraft] = useState(search)
  useEffect(() => setDraft(search), [search])

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  function setUrl(next: { subject?: string; q?: string }) {
    const merged = { subject, q: search, ...next }
    const p = new URLSearchParams()
    if (merged.subject !== 'ALL') p.set('subject', merged.subject)
    if (merged.q) p.set('q', merged.q)
    setParams(p, { replace: true })
    setShown(PAGE)
  }

  useEffect(() => {
    let cancelled = false
    const calls: Promise<unknown>[] = [api.get(signedIn ? '/mocks' : '/mocks/public')]
    if (signedIn) calls.push(api.get('/profile'))
    calls.push(api.get('/contests'))

    Promise.allSettled(calls).then(results => {
      if (cancelled) return
      const [list, ...rest] = results
      if (list.status === 'fulfilled') setMocks((list.value as { data: MockTestListItem[] }).data ?? [])

      if (signedIn) {
        const prof = rest[0]
        if (prof?.status === 'fulfilled') {
          const raw = (prof.value as { data: { subjectStats?: Record<string, { correct: number; wrong: number }> } }).data
          setSubjectStats(Object.entries(raw.subjectStats ?? {}).map(([s, v]) => ({ subject: s, ...v })))
        }
      }

      const c = rest[signedIn ? 1 : 0]
      if (c?.status === 'fulfilled') {
        const data = (c.value as { data: { active?: Contest[] } }).data
        const now = Date.now()
        // The next paper that has not finished — live beats scheduled.
        const upcoming = (data?.active ?? [])
          .filter(x => now < new Date(x.startTime).getTime() + x.durationMinutes * 60_000)
          .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
        setContest(upcoming[0] ?? null)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [signedIn])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of mocks) c[m.subject] = (c[m.subject] ?? 0) + 1
    return c
  }, [mocks])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = mocks.filter(m => {
      if (subject !== 'ALL' && m.subject !== subject) return false
      if (filters.difficulty !== 'all' && m.difficulty !== filters.difficulty) return false
      if (filters.status === 'new' && m.attempted) return false
      if (filters.status === 'attempted' && !m.attempted) return false
      if (q && !m.title.toLowerCase().includes(q) && !m.subject.toLowerCase().includes(q)) return false
      return true
    })

    const pct = (m: MockTestListItem) => (m.attempted && m.lastTotal ? m.lastScore! / m.lastTotal : -1)
    out.sort((a, b) => {
      switch (filters.sort) {
        case 'newest': return 0 // the API already returns oldest-first; reversed below
        case 'difficulty': return (DIFF_ORDER[a.difficulty ?? ''] ?? 9) - (DIFF_ORDER[b.difficulty ?? ''] ?? 9)
        case 'score': return pct(b) - pct(a)
        case 'attempts': return b.attemptCount - a.attemptCount
        // Recommended: what you have not sat yet, busiest first — the most
        // useful default for somebody deciding what to open.
        default: return Number(a.attempted) - Number(b.attempted) || b.attemptCount - a.attemptCount
      }
    })
    if (filters.sort === 'newest') out.reverse()
    return out
  }, [mocks, subject, search, filters])

  const activeCount = [
    filters.difficulty !== 'all', filters.status !== 'all', filters.sort !== 'recommended',
  ].filter(Boolean).length

  // True when the chosen subject has no published tests at all, as opposed
  // to the filters having excluded every one of them.
  const subjectIsBare = mocks.length === 0
    || (subject !== 'ALL' && (counts[subject] ?? 0) === 0)

  function clearAll() {
    setFilters(DEFAULT_FILTERS)
    setParams(new URLSearchParams(), { replace: true })
    setShown(PAGE)
  }

  return (
    <div className="lp mk-page">
      <LandingNav active="Mock Tests" />

      <main className="lp-shell">
        <header className="mk-head">
          <span className="mk-badge">SSC CGL • MOCK TESTS</span>
          <h1 className="mk-title">Practice. Improve. <span className="lp-grad">Dominate.</span></h1>
          <p className="mk-sub">
            Sharpen your SSC CGL preparation with subject-wise mock tests designed to
            help you identify weaknesses and improve your rank.
          </p>
        </header>

        <StatsOverview mocks={mocks} signedIn={signedIn} />

        <ContinuePracticing drafts={drafts} mocks={mocks} onDiscard={() => setDrafts(readDrafts())} />

        <SubjectCards mocks={mocks} onPick={s => setUrl({ subject: s })} />

        <section className="mk-section" id="all-tests">
          <header className="mk-section-head">
            <div>
              <span className="lp-kicker">The catalogue</span>
              <h2 className="mk-h2">Choose Your Next Test</h2>
            </div>
          </header>

          <div className="mk-toolbar">
            <form className="mk-search" onSubmit={e => { e.preventDefault(); setUrl({ q: draft.trim() }) }}>
              <span className="mk-search-icon" aria-hidden="true">⌕</span>
              <input
                className="mk-search-input" type="search" placeholder="Search mock tests..."
                aria-label="Search mock tests" value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => { if (draft.trim() !== search) setUrl({ q: draft.trim() }) }}
              />
            </form>
            <button className="mk-filter-btn" onClick={() => setSheetOpen(true)}>
              Filters{activeCount > 0 && <span className="mk-filter-n">{activeCount}</span>}
            </button>
          </div>

          <SubjectTabs value={subject} counts={counts} onChange={s => setUrl({ subject: s })} />

          <FilterPanel
            value={filters} onChange={setFilters} open={sheetOpen}
            onClose={() => setSheetOpen(false)} signedIn={signedIn} activeCount={activeCount}
          />

          <p className="mk-count">
            {loading ? 'Loading tests…' : `${visible.length} ${visible.length === 1 ? 'test' : 'tests'}`}
          </p>

          {/* Two different empties. A subject with no papers at all is not
              the reader's filters being wrong — telling them to adjust the
              search would send them looking for something that isn't there. */}
          <MockTestGrid
            items={visible.slice(0, shown)}
            loading={loading}
            emptyTitle={subjectIsBare ? 'More tests are coming soon.' : 'No mock tests found.'}
            emptyBody={subjectIsBare
              ? "We're preparing new challenges for this subject."
              : 'Try changing your search or filters.'}
            onClear={subjectIsBare ? () => setUrl({ subject: 'ALL' }) : clearAll}
            clearLabel={subjectIsBare ? 'Explore other subjects' : 'Clear filters'}
          />

          {visible.length > shown && (
            <div className="mk-more">
              <button className="lp-btn lp-btn-ghost lp-btn-lg" onClick={() => setShown(n => n + PAGE)}>
                Load More Tests <span aria-hidden="true">→</span>
              </button>
              <span className="mk-more-n">Showing {Math.min(shown, visible.length)} of {visible.length}</span>
            </div>
          )}
        </section>

        {!loading && <RecommendedTests mocks={mocks} subjectStats={subjectStats} signedIn={signedIn} />}

        <FullLengthTests contest={contest} />

        <MocksCTA signedIn={signedIn} />
      </main>

      <LandingFooter />
    </div>
  )
}
