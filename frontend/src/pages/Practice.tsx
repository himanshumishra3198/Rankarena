import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import LanguageToggle from '../components/LanguageToggle'
import { usePageMeta } from '../lib/seo'
import { SECTIONS } from '../lib/types'
import { getPreferredLanguage, setPreferredLanguage, type Language } from '../lib/language'
import {
  DIFFICULTIES, PROBLEMS_PER_PAGE, SUBJECT_COLOR, SUBJECT_LABEL, SUBJECT_SHORT,
  readMarks, titleCase, type ProblemMark,
} from '../lib/practice'

/**
 * The problemset — every question the archive holds, as a list.
 *
 * A problem is in here once the paper it was written for has finished: a
 * contest that has ENDED, or a published mock. Until then it does not appear
 * at all, because a question sitting in the bank unused is not spare content,
 * it is what the next contest will be built from.
 *
 * Rows carry no answers. The correct option and the solution arrive one
 * problem at a time on /practice/:id, which is the difference between a page
 * you read and a page you scrape.
 */

interface Problem {
  id: string
  title: string
  subject: string
  topic: string | null
  difficulty: string
  questionType: 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  hasSolution: boolean
  translated: boolean
  bookmarked: boolean
  source: { type: 'CONTEST' | 'MOCK'; id: string; title: string } | null
}

interface ProblemPage {
  total: number
  page: number
  pageSize: number
  pageCount: number
  problems: Problem[]
}

interface SubjectFilter {
  subject: string
  count: number
  untagged: number
  difficulties: Record<string, number>
  topics: { topic: string; count: number }[]
}

interface SourceOption {
  value: string
  title: string
  count: number
  date?: string
  subject?: string
}

interface Filters {
  total: number
  subjects: SubjectFilter[]
  sources: { contests: SourceOption[]; mocks: SourceOption[] }
}

/** Page numbers around the current one, with gaps marked by null. */
function pageWindow(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const wanted = new Set([1, pageCount, page, page - 1, page + 1])
  const sorted = [...wanted].filter(p => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null)
    out.push(p)
  })
  return out
}

export default function Practice() {
  usePageMeta(
    'Problemset — RankArenas',
    'Every question from past SSC contests and mock tests, browsable by subject, topic and difficulty. Untimed, unrated.'
  )
  const [params, setParams] = useSearchParams()
  const [language, setLanguage] = useState<Language>(getPreferredLanguage())

  const [filters, setFilters] = useState<Filters | null>(null)
  const [data, setData] = useState<ProblemPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [marks, setMarks] = useState<Record<string, ProblemMark>>(readMarks)
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Everything the list is looking at lives in the URL, so a reload, the back
  // button and a shared link all land on the same page of the same filter.
  const rawSubject = (params.get('subject') ?? 'ALL').toUpperCase()
  const subject = (SECTIONS as string[]).includes(rawSubject) ? rawSubject : 'ALL'
  const rawDifficulty = (params.get('difficulty') ?? '').toUpperCase()
  const difficulty = (DIFFICULTIES as readonly string[]).includes(rawDifficulty) ? rawDifficulty : ''
  const source = params.get('source') ?? ''
  const search = params.get('q') ?? ''
  const page = Math.max(Number(params.get('page')) || 1, 1)

  const activeSubject = filters?.subjects.find(s => s.subject === subject) ?? null
  // A topic only means something inside its own subject. Once the filter list
  // has arrived, one the subject doesn't have is dropped rather than sent —
  // an edited or stale link lands on the subject instead of on an error.
  const rawTopic = params.get('topic') ?? ''
  const topic = subject !== 'ALL' && (!filters || activeSubject?.topics.some(t => t.topic === rawTopic))
    ? rawTopic
    : ''

  // Typing shouldn't cost a request per keystroke, so the box is local and
  // the URL catches up on submit or when the box loses focus.
  const [searchDraft, setSearchDraft] = useState(search)
  useEffect(() => setSearchDraft(search), [search])

  const query = useMemo(() => {
    const q = new URLSearchParams()
    if (subject !== 'ALL') q.set('subject', subject)
    if (topic) q.set('topic', topic)
    if (difficulty) q.set('difficulty', difficulty)
    if (source) q.set('source', source)
    if (search) q.set('q', search)
    return q.toString()
  }, [subject, topic, difficulty, source, search])

  function setFilter(next: Record<string, string>) {
    const merged: Record<string, string> = {
      subject, topic, difficulty, source, q: search, page: '1', ...next,
    }
    const q = new URLSearchParams()
    if (merged.subject && merged.subject !== 'ALL') q.set('subject', merged.subject)
    if (merged.topic) q.set('topic', merged.topic)
    if (merged.difficulty) q.set('difficulty', merged.difficulty)
    if (merged.source) q.set('source', merged.source)
    if (merged.q) q.set('q', merged.q)
    // Any change to what is being looked at goes back to page 1 unless the
    // caller asked for a page: keeping page 7 of the old filter would land
    // on an empty list more often than not.
    if (merged.page && merged.page !== '1') q.set('page', merged.page)
    setParams(q, { replace: true })
  }

  useEffect(() => {
    api.get('/practice/filters')
      .then(r => setFilters(r.data))
      .catch(() => setFilters({ total: 0, subjects: [], sources: { contests: [], mocks: [] } }))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)
    const q = new URLSearchParams(query)
    q.set('page', String(page))
    q.set('limit', String(PROBLEMS_PER_PAGE))
    q.set('language', language)
    api.get(`/practice/problems?${q}`)
      .then(r => {
        if (cancelled) return
        const body: ProblemPage = r.data
        setData(body)
        setBookmarks(new Set(body.problems.filter(p => p.bookmarked).map(p => p.id)))
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query, page, language])

  // Marks are written on the problem page; re-read them when a page of
  // results lands so the ticks are current on the way back.
  useEffect(() => setMarks(readMarks()), [data])

  /**
   * A real link, so a row can be middle-clicked into a new tab and its
   * destination shows in the status bar. `i` is where the problem sits in
   * the whole filtered list — enough for the problem page to offer
   * previous/next, and to send "back" to the page it came from, without the
   * list itself being passed along.
   */
  function problemHref(p: Problem, rowIndex: number) {
    const q = new URLSearchParams(query)
    q.set('i', String((page - 1) * PROBLEMS_PER_PAGE + rowIndex))
    return `/practice/${p.id}?${q}`
  }

  function flipBookmark(id: string) {
    setBookmarks(b => {
      const n = new Set(b)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function toggleBookmark(id: string) {
    flipBookmark(id)
    try {
      await api.post(`/bookmarks/${id}`)
    } catch {
      flipBookmark(id)
    }
  }

  function clearFilters() {
    setParams(new URLSearchParams(), { replace: true })
  }

  function pickLanguage(next: Language) {
    setLanguage(next)
    setPreferredLanguage(next)
  }

  const bankTotal = filters?.total ?? 0
  const solvedCount = useMemo(() => Object.values(marks).filter(m => m === 'SOLVED').length, [marks])
  const difficultyCounts = useMemo(() => {
    const scope = activeSubject ? [activeSubject] : (filters?.subjects ?? [])
    return DIFFICULTIES.reduce((acc, d) => {
      acc[d] = scope.reduce((n, f) => n + (f.difficulties[d] ?? 0), 0)
      return acc
    }, {} as Record<string, number>)
  }, [filters, activeSubject])

  const firstRow = data ? (data.page - 1) * data.pageSize + 1 : 0
  const lastRow = data ? Math.min(data.page * data.pageSize, data.total) : 0

  const activeFilters = [subject !== 'ALL', !!topic, !!difficulty, !!source, !!search].filter(Boolean).length

  return (
    <>
      <Navbar />
      <div className="page-wide ps-page">
        <header className="ps-head">
          <h1 className="ps-title">Problemset</h1>
          <LanguageToggle value={language} onChange={pickLanguage} />
        </header>

        <div className="ps-layout">
          {/* ── The list ─────────────────────────────────────────────── */}
          <div className="ps-col">
            <form
              className="ps-searchbar"
              onSubmit={e => { e.preventDefault(); setFilter({ q: searchDraft.trim() }) }}
            >
              <span className="ps-search-icon" aria-hidden="true">⌕</span>
              <input
                className="ps-search-input"
                type="search"
                placeholder="Search question text…"
                aria-label="Search question text"
                value={searchDraft}
                onChange={e => setSearchDraft(e.target.value)}
                onBlur={() => { if (searchDraft.trim() !== search) setFilter({ q: searchDraft.trim() }) }}
              />
            </form>

            {loading && <div className="card ps-status">Loading the problemset…</div>}

            {!loading && failed && (
              <div className="card ps-status">
                <p>Couldn't load the problemset.</p>
                <button className="btn btn-ghost btn-sm" onClick={() => setFilter({})}>Try again</button>
              </div>
            )}

            {!loading && !failed && data && data.total === 0 && (
              <div className="card ps-status">
                <div className="ps-empty-icon">📭</div>
                <p className="ps-empty-title">No problems match</p>
                <p>
                  Nothing here for these filters. A problem only joins the problemset
                  once the contest it was set in has finished.
                </p>
                {activeFilters > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
                )}
              </div>
            )}

            {!loading && !failed && data && data.total > 0 && (
              <>
                <div className="ps-summary">
                  <span>
                    <strong>{firstRow}–{lastRow}</strong> of <strong>{data.total}</strong>
                    {data.total === 1 ? ' problem' : ' problems'}
                  </span>
                  {solvedCount > 0 && <span className="ps-solved-count">✓ {solvedCount} solved</span>}
                </div>

                <div className="card ps-list">
                  {/* Column headings, desktop only — on a phone the row is
                      read top to bottom, not scanned across. */}
                  <div className="ps-head-row" aria-hidden="true">
                    <span>#</span>
                    <span>Problem</span>
                    <span className="ps-head-diff">Difficulty</span>
                    <span />
                  </div>

                  {data.problems.map((p, i) => {
                    const mark = marks[p.id]
                    const number = (page - 1) * PROBLEMS_PER_PAGE + i + 1
                    return (
                      <div key={p.id} className={`ps-row ps-row-${(mark ?? 'none').toLowerCase()}`}>
                        <Link className="ps-row-link" to={problemHref(p, i)}>
                          <span
                            className="ps-idx"
                            title={mark === 'SOLVED' ? 'Solved first try' : mark === 'TRIED' ? 'Attempted' : undefined}
                          >
                            {mark === 'SOLVED' ? '✓' : number}
                          </span>

                          <span className="ps-main">
                            <span className="ps-title-text">{p.title}</span>
                            <span className="ps-meta">
                              <span className="ps-subject" style={{ color: SUBJECT_COLOR[p.subject] }}>
                                {SUBJECT_SHORT[p.subject] ?? p.subject}
                              </span>
                              {p.topic && <span className="ps-topic">{p.topic}</span>}
                              {p.source && (
                                <span className="ps-from" title={p.source.title}>{p.source.title}</span>
                              )}
                              {p.hasSolution && (
                                <span className="ps-has-sol" title="A written solution is available">💡</span>
                              )}
                            </span>
                          </span>

                          <span className={`ps-diff diff-${p.difficulty.toLowerCase()}`}>
                            {titleCase(p.difficulty)}
                          </span>
                        </Link>

                        {/* Outside the link: a button nested in an anchor is not
                            something a browser or a screen reader handles well. */}
                        <button
                          className="bookmark-btn ps-star"
                          title={bookmarks.has(p.id) ? 'Remove bookmark' : 'Bookmark for revision'}
                          aria-label={bookmarks.has(p.id) ? 'Remove bookmark' : 'Bookmark for revision'}
                          onClick={() => toggleBookmark(p.id)}
                        >
                          {bookmarks.has(p.id) ? '⭐' : '☆'}
                        </button>
                      </div>
                    )
                  })}
                </div>

                {data.pageCount > 1 && (
                  <nav className="ps-pager" aria-label="Problemset pages">
                    <button
                      className="ps-pager-btn ps-pager-step"
                      disabled={page <= 1}
                      onClick={() => setFilter({ page: String(page - 1) })}
                    >
                      ←
                    </button>
                    {pageWindow(page, data.pageCount).map((p, i) =>
                      p === null
                        ? <span key={`gap-${i}`} className="ps-pager-gap">…</span>
                        : (
                          <button
                            key={p}
                            className={`ps-pager-btn ${p === page ? 'active' : ''}`}
                            aria-current={p === page ? 'page' : undefined}
                            onClick={() => setFilter({ page: String(p) })}
                          >
                            {p}
                          </button>
                        )
                    )}
                    <button
                      className="ps-pager-btn ps-pager-step"
                      disabled={page >= data.pageCount}
                      onClick={() => setFilter({ page: String(page + 1) })}
                    >
                      →
                    </button>
                  </nav>
                )}
              </>
            )}
          </div>

          {/* ── Filters ──────────────────────────────────────────────── */}
          <aside className={`ps-side ${filtersOpen ? 'open' : ''}`}>
            {/* Phones only: the filters are a panel you pull down, so the
                first problem is on screen when the page opens. */}
            <button
              className="ps-filter-toggle"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(o => !o)}
            >
              <span>Filters{activeFilters > 0 ? ` · ${activeFilters}` : ''}</span>
              <span className="ps-filter-caret" aria-hidden="true">{filtersOpen ? '▲' : '▼'}</span>
            </button>

            <div className="ps-filter-panel">
              <div className="ps-facet-group">
                <div className="ps-facet-head">
                  <span>Subject</span>
                  {activeFilters > 0 && (
                    <button className="ps-clear" onClick={clearFilters}>Clear all</button>
                  )}
                </div>
                <button
                  className={`ps-facet ${subject === 'ALL' ? 'active' : ''}`}
                  onClick={() => setFilter({ subject: 'ALL', topic: '' })}
                >
                  <span className="ps-facet-name">Everything</span>
                  {filters && <span className="ps-facet-count">{bankTotal}</span>}
                </button>
                {SECTIONS.map(s => {
                  const f = filters?.subjects.find(x => x.subject === s)
                  if (filters && !f) return null
                  return (
                    <button
                      key={s}
                      className={`ps-facet ${subject === s ? 'active' : ''}`}
                      title={SUBJECT_LABEL[s] ?? s}
                      onClick={() => setFilter({ subject: s, topic: '' })}
                    >
                      <span className="ps-facet-dot" style={{ background: SUBJECT_COLOR[s] }} />
                      <span className="ps-facet-name">{SUBJECT_SHORT[s] ?? s}</span>
                      {f && <span className="ps-facet-count">{f.count}</span>}
                    </button>
                  )
                })}
              </div>

              <div className="ps-facet-group">
                <div className="ps-facet-head"><span>Difficulty</span></div>
                <button
                  className={`ps-facet ${difficulty === '' ? 'active' : ''}`}
                  onClick={() => setFilter({ difficulty: '' })}
                >
                  <span className="ps-facet-pip ps-facet-pip-any" />
                  <span className="ps-facet-name">Any</span>
                  {filters && (
                    <span className="ps-facet-count">{activeSubject?.count ?? bankTotal}</span>
                  )}
                </button>
                {DIFFICULTIES.map(d => (
                  <button
                    key={d}
                    className={`ps-facet ${difficulty === d ? 'active' : ''}`}
                    onClick={() => setFilter({ difficulty: d })}
                  >
                    <span className={`ps-facet-pip diff-${d.toLowerCase()}`} />
                    <span className="ps-facet-name">{titleCase(d)}</span>
                    {filters && <span className="ps-facet-count">{difficultyCounts[d] ?? 0}</span>}
                  </button>
                ))}
              </div>

              <div className="ps-facet-group">
                <label className="ps-facet-head" htmlFor="ps-topic"><span>Topic</span></label>
                {subject === 'ALL' ? (
                  <p className="ps-facet-hint">Pick a subject to narrow this down by topic.</p>
                ) : (
                  <select
                    id="ps-topic"
                    className="ps-select"
                    value={topic}
                    onChange={e => setFilter({ topic: e.target.value })}
                  >
                    <option value="">
                      All topics{activeSubject ? ` (${activeSubject.count})` : ''}
                    </option>
                    {(activeSubject?.topics ?? []).map(t => (
                      <option key={t.topic} value={t.topic}>{t.topic} ({t.count})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="ps-facet-group">
                <label className="ps-facet-head" htmlFor="ps-source"><span>From</span></label>
                <select
                  id="ps-source"
                  className="ps-select"
                  value={source}
                  onChange={e => setFilter({ source: e.target.value })}
                >
                  <option value="">Every past paper</option>
                  {(filters?.sources.contests.length ?? 0) > 0 && (
                    <optgroup label="Past contests">
                      {filters!.sources.contests.map(c => (
                        <option key={c.value} value={c.value}>{c.title} ({c.count})</option>
                      ))}
                    </optgroup>
                  )}
                  {(filters?.sources.mocks.length ?? 0) > 0 && (
                    <optgroup label="Mock tests">
                      {filters!.sources.mocks.map(m => (
                        <option key={m.value} value={m.value}>{m.title} ({m.count})</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
