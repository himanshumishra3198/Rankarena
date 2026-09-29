import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import ReportModal from '../components/ReportModal'
import LanguageToggle from '../components/LanguageToggle'
import { QuestionContext } from '../components/QuestionContent'
import { RichText } from '../components/RichText'
import { usePageMeta } from '../lib/seo'
import { SECTIONS } from '../lib/types'
import { getPreferredLanguage, setPreferredLanguage, type Language } from '../lib/language'

/**
 * Free practice — the question bank without a test around it.
 *
 * Everywhere else on the site a question arrives inside a paper: you sit the
 * whole thing, submit, and only then see any answers. That is the right shape
 * for a contest and the wrong one for revision, where you want a single
 * question on a single topic and the answer a second later.
 *
 * Nothing here is recorded. There is no attempt row, no score and no rating
 * on the other side of the answer, so the session tally below is the only
 * record that this happened at all and it lasts as long as the tab does. The
 * one thing that does persist is your place in the bank — see PROGRESS_KEY.
 */

const PAGE_SIZE = 10

const SECTION_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'General Intelligence & Reasoning',
  ENGLISH: 'English Language',
  GK: 'General Awareness',
}
const SECTION_SHORT: Record<string, string> = {
  QUANT: 'Quant', REASONING: 'Reasoning', ENGLISH: 'English', GK: 'GK',
}
const SECTION_COLORS: Record<string, string> = {
  QUANT: '#7c3aed', REASONING: '#0ea5e9', ENGLISH: '#16a34a', GK: '#f59e0b',
}
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const
const OPTIONS = ['A', 'B', 'C', 'D'] as const

interface PracticeQuestion {
  id: string
  text: string
  imageUrl?: string | null
  optionA: string; optionB: string; optionC: string; optionD: string
  correctOption: string
  subject: string
  topic: string | null
  difficulty: string
  questionType?: 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  structuredData?: { statements: string[]; conclusions: string[] } | null
  passage?: {
    id: string; title: string; content: string
    type: 'TEXT' | 'TABLE'
    tableData?: { headers: string[]; rows: string[][] } | null
  } | null
  solution?: string | null
  bookmarked: boolean
  /** The language actually rendered, and whether it matched what was asked for. */
  language: string
  translated: boolean
}

interface PracticePage {
  total: number
  nextCursor: string | null
  questions: PracticeQuestion[]
}

interface SubjectFilter {
  subject: string
  count: number
  /** Questions with no topic tag — reachable under "all topics", not on their own. */
  untagged: number
  difficulties: Record<string, number>
  topics: { topic: string; count: number }[]
}

/**
 * One pass through the bank under one set of filters.
 *
 * `start` is where `questions[0]` sits in the whole filtered set and `cursor`
 * is what fetched it, which together are enough to say "question 14 of 43"
 * and to pick the run up again later.
 */
interface Run {
  /** The filters this run belongs to; a stale run is ignored, never saved. */
  key: string
  cursor: string
  start: number
  total: number
  next: string | null
  questions: PracticeQuestion[]
}

/**
 * Where you had got to, per filter combination.
 *
 * The server orders the bank by question id — arbitrary, but the same order
 * every time — so a cursor is a real place in a topic rather than a page
 * number over a reshuffle. Coming back tomorrow continues from the question
 * after the last one you looked at instead of starting at the top of
 * Percentage again. Kept in the browser because practice is deliberately
 * unrecorded server-side.
 */
const PROGRESS_KEY = 'practice-progress'
type Progress = Record<string, { cursor: string; seen: number }>

function readProgress(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function writeProgress(key: string, value: { cursor: string; seen: number } | null) {
  try {
    const all = readProgress()
    if (value) all[key] = value
    else delete all[key]
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all))
  } catch {
    // A full or blocked localStorage costs the resume, nothing else.
  }
}

function optText(q: PracticeQuestion, opt: string) {
  return ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as Record<string, string>)[opt] ?? ''
}

export default function Practice() {
  usePageMeta(
    'Practice questions — RankArenas',
    'Work through SSC questions by subject, topic and difficulty. Untimed, unrated, with answers and solutions as you go.'
  )

  const [filters, setFilters] = useState<SubjectFilter[] | null>(null)
  const [language, setLanguage] = useState<Language>(getPreferredLanguage())
  // The filters live in the URL rather than in state: a reload comes back to
  // the same drill, and "Percentage, hard" is a link you can keep.
  const [params, setParams] = useSearchParams()

  const [run, setRun] = useState<Run | null>(null)
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)

  const [picks, setPicks] = useState<Record<string, string>>({})
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [reportId, setReportId] = useState<string | null>(null)
  // First attempts only: retrying a question you got wrong doesn't quietly
  // turn it into a correct one.
  const [tally, setTally] = useState({ attempted: 0, correct: 0 })
  const tallied = useRef<Set<string>>(new Set())

  const rawSubject = (params.get('subject') ?? 'ALL').toUpperCase()
  const subject = (SECTIONS as string[]).includes(rawSubject) ? rawSubject : 'ALL'
  const rawDifficulty = (params.get('difficulty') ?? '').toUpperCase()
  const difficulty = (DIFFICULTIES as readonly string[]).includes(rawDifficulty) ? rawDifficulty : ''
  const activeSubject = filters?.find(f => f.subject === subject) ?? null
  // A topic only means something inside its own subject. Once the filter list
  // has arrived, one the subject doesn't have is dropped rather than sent —
  // an edited or stale URL lands on the subject instead of on an error.
  const rawTopic = params.get('topic') ?? ''
  const topic = subject !== 'ALL' && (!filters || activeSubject?.topics.some(t => t.topic === rawTopic))
    ? rawTopic
    : ''

  const filterKey = `${subject}|${topic}|${difficulty}`

  function setFilter(next: { subject?: string; topic?: string; difficulty?: string }) {
    const merged = { subject, topic, difficulty, ...next }
    const q = new URLSearchParams()
    if (merged.subject !== 'ALL') q.set('subject', merged.subject)
    if (merged.topic) q.set('topic', merged.topic)
    if (merged.difficulty) q.set('difficulty', merged.difficulty)
    // Replaced, not pushed: the back button should leave the page, not walk
    // back through every chip that was tapped on the way here.
    setParams(q, { replace: true })
  }

  useEffect(() => {
    api.get('/practice/filters')
      .then(r => setFilters(r.data.subjects))
      .catch(() => setFilters([]))
  }, [])

  // Every filter change starts a fresh run, resumed from wherever this
  // combination was left. A language change lands here too: the saved
  // position is the question on screen, so it comes back in the new language
  // rather than jumping to the top of the topic.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)

    const saved = readProgress()[filterKey]
    const params: Record<string, string | number> = { limit: PAGE_SIZE, language }
    if (subject !== 'ALL') params.subject = subject
    if (topic) params.topic = topic
    if (difficulty) params.difficulty = difficulty
    if (saved?.cursor) params.cursor = saved.cursor

    api.get('/practice/questions', { params })
      .then(r => {
        if (cancelled) return
        const page: PracticePage = r.data
        setRun({
          key: filterKey,
          cursor: saved?.cursor ?? '',
          start: page.questions.length ? (saved?.seen ?? 0) : 0,
          total: page.total,
          next: page.nextCursor,
          questions: page.questions,
        })
        setIndex(0)
        setBookmarks(new Set(page.questions.filter(q => q.bookmarked).map(q => q.id)))
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
    // subject/topic/difficulty are exactly what filterKey is built from, so
    // they change together and this runs once per change, not three times.
  }, [filterKey, subject, topic, difficulty, language, reload])

  // Remember the question on screen, not the one after it, so a reload or a
  // language switch resumes here rather than skipping one.
  useEffect(() => {
    if (!run || run.key !== filterKey || run.questions.length === 0) return
    writeProgress(filterKey, {
      cursor: index === 0 ? run.cursor : run.questions[index - 1].id,
      seen: run.start + index,
    })
  }, [run, index, filterKey])

  const current: PracticeQuestion | null = run?.questions[index] ?? null
  const picked = current ? picks[current.id] : undefined
  const atEnd = !!run && index >= run.questions.length - 1 && !run.next
  const position = run ? run.start + index + 1 : 0

  function choose(opt: string) {
    if (!current || picks[current.id]) return
    setPicks(p => ({ ...p, [current.id]: opt }))
    if (!tallied.current.has(current.id)) {
      tallied.current.add(current.id)
      setTally(t => ({
        attempted: t.attempted + 1,
        correct: t.correct + (opt === current.correctOption ? 1 : 0),
      }))
    }
  }

  function retry() {
    if (!current) return
    setPicks(p => { const next = { ...p }; delete next[current.id]; return next })
  }

  async function goNext() {
    if (!run || loadingMore) return
    if (index + 1 < run.questions.length) { setIndex(index + 1); return }
    if (!run.next) return

    setLoadingMore(true)
    try {
      const params: Record<string, string | number> = { limit: PAGE_SIZE, language, cursor: run.next }
      if (subject !== 'ALL') params.subject = subject
      if (topic) params.topic = topic
      if (difficulty) params.difficulty = difficulty
      const page: PracticePage = (await api.get('/practice/questions', { params })).data

      setRun(r => r && ({
        ...r,
        total: page.total,
        // An exactly-full page looks like there is more until the follow-up
        // comes back empty; that empty answer is what ends the run.
        next: page.questions.length ? page.nextCursor : null,
        questions: [...r.questions, ...page.questions],
      }))
      setBookmarks(b => {
        const n = new Set(b)
        page.questions.filter(q => q.bookmarked).forEach(q => n.add(q.id))
        return n
      })
      if (page.questions.length) setIndex(i => i + 1)
    } catch {
      setFailed(true)
    } finally {
      setLoadingMore(false)
    }
  }

  function startOver() {
    writeProgress(filterKey, null)
    setReload(n => n + 1)
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

  function pickSubject(next: string) {
    // A topic belongs to one subject, so it cannot survive the switch.
    setFilter({ subject: next, topic: '' })
  }

  function pickLanguage(next: Language) {
    setLanguage(next)
    setPreferredLanguage(next)
  }

  // A drill is a keyboard thing: A–D (or 1–4) answers, the arrows move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')) return
      const letter = e.key.toUpperCase()
      const byLetter = (OPTIONS as readonly string[]).indexOf(letter)
      const byNumber = ['1', '2', '3', '4'].indexOf(e.key)
      if (byLetter >= 0 || byNumber >= 0) {
        e.preventDefault()
        choose(OPTIONS[byLetter >= 0 ? byLetter : byNumber])
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); setIndex(index - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const bankTotal = useMemo(() => (filters ?? []).reduce((n, f) => n + f.count, 0), [filters])
  const difficultyCounts = useMemo(() => {
    const source = activeSubject ? [activeSubject] : (filters ?? [])
    return DIFFICULTIES.reduce((acc, d) => {
      acc[d] = source.reduce((n, f) => n + (f.difficulties[d] ?? 0), 0)
      return acc
    }, {} as Record<string, number>)
  }, [filters, activeSubject])

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 880 }}>
        <header className="prac-head">
          <div>
            <h1 className="prac-title">Practice</h1>
            <p className="prac-sub">
              One question at a time, with the answer as soon as you've tried it.
              Nothing here is timed, scored or rated — your rating and the
              leaderboard only ever move in contests.
            </p>
          </div>
          <LanguageToggle value={language} onChange={pickLanguage} />
        </header>

        <div className="card prac-filters">
          <div className="prac-filter-row">
            <span className="prac-filter-label">Subject</span>
            <div className="prac-chips">
              <button
                className={`mock-section-tab ${subject === 'ALL' ? 'active' : ''}`}
                onClick={() => pickSubject('ALL')}
              >
                Everything
                {filters && <span className="mock-tab-count">{bankTotal}</span>}
              </button>
              {SECTIONS.map(s => {
                const f = filters?.find(x => x.subject === s)
                if (filters && !f) return null
                const isActive = subject === s
                return (
                  <button
                    key={s}
                    className={`mock-section-tab ${isActive ? 'active' : ''}`}
                    onClick={() => pickSubject(s)}
                    style={isActive
                      ? { background: SECTION_COLORS[s], borderColor: SECTION_COLORS[s], color: '#fff' }
                      : { ['--subject' as string]: SECTION_COLORS[s] }}
                  >
                    <span className="mock-tab-dot" style={{ background: SECTION_COLORS[s] }} />
                    {SECTION_SHORT[s]}
                    {f && <span className="mock-tab-count">{f.count}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="prac-filter-row">
            <span className="prac-filter-label">Topic</span>
            {subject === 'ALL' ? (
              <p className="prac-filter-hint">Pick a subject to narrow this down by topic.</p>
            ) : (
              <select
                className="prac-select"
                value={topic}
                onChange={e => setFilter({ topic: e.target.value })}
              >
                <option value="">
                  All of {SECTION_LABELS[subject] ?? subject}
                  {activeSubject ? ` (${activeSubject.count})` : ''}
                </option>
                {(activeSubject?.topics ?? []).map(t => (
                  <option key={t.topic} value={t.topic}>{t.topic} ({t.count})</option>
                ))}
              </select>
            )}
          </div>

          <div className="prac-filter-row">
            <span className="prac-filter-label">Difficulty</span>
            <div className="prac-chips">
              <button
                className={`mock-section-tab ${difficulty === '' ? 'active' : ''}`}
                onClick={() => setFilter({ difficulty: '' })}
              >
                Any
              </button>
              {DIFFICULTIES.map(d => (
                <button
                  key={d}
                  className={`mock-section-tab ${difficulty === d ? 'active' : ''}`}
                  onClick={() => setFilter({ difficulty: d })}
                >
                  {d[0] + d.slice(1).toLowerCase()}
                  {filters && <span className="mock-tab-count">{difficultyCounts[d] ?? 0}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {tally.attempted > 0 && (
          <div className="prac-tally">
            <span><strong>{tally.attempted}</strong> attempted this session</span>
            <span className="prac-tally-sep">·</span>
            <span><strong>{tally.correct}</strong> right first time</span>
            <span className="prac-tally-sep">·</span>
            <span>{Math.round((tally.correct / tally.attempted) * 100)}%</span>
          </div>
        )}

        {loading && <div className="card prac-status">Loading questions…</div>}

        {!loading && failed && (
          <div className="card prac-status">
            <p>Couldn't load practice questions.</p>
            <button className="btn btn-ghost btn-sm" onClick={() => setReload(n => n + 1)}>Try again</button>
          </div>
        )}

        {!loading && !failed && run && run.total === 0 && (
          <div className="card prac-status">
            <div className="prac-empty-icon">📭</div>
            <p className="prac-empty-title">Nothing here yet</p>
            <p>No questions match these filters. Try a different topic or difficulty.</p>
          </div>
        )}

        {/* The run's questions are exhausted: either worked all the way
            through, or resumed past the end of a bank that has since shrunk. */}
        {!loading && !failed && run && run.total > 0 && !current && (
          <div className="card prac-status">
            <div className="prac-empty-icon">🎉</div>
            <p className="prac-empty-title">That's every question in this filter</p>
            <p>You've been through all {run.total}. Start again, or pick another topic.</p>
            <button className="btn btn-primary btn-sm" onClick={startOver}>Start over</button>
          </div>
        )}

        {!loading && !failed && current && run && (
          <>
            <div className="prac-progress-row">
              <span className="prac-position">
                Question {Math.min(position, run.total)} of {run.total}
              </span>
              {position > 1 && (
                <button className="btn btn-ghost btn-sm" onClick={startOver}>Start from the top</button>
              )}
            </div>
            <div className="prac-progress">
              <div
                className="prac-progress-fill"
                style={{ width: `${Math.min(100, (position / Math.max(run.total, 1)) * 100)}%` }}
              />
            </div>

            <article className="card prac-card">
              <div className="prac-card-head">
                <div className="prac-card-tags">
                  <span className="prac-subject" style={{ color: SECTION_COLORS[current.subject] }}>
                    {SECTION_SHORT[current.subject] ?? current.subject}
                  </span>
                  {current.topic && <span className="prac-topic">{current.topic}</span>}
                  <span className={`badge badge-${current.difficulty.toLowerCase()}`}>{current.difficulty}</span>
                </div>
                <button
                  className="bookmark-btn"
                  title={bookmarks.has(current.id) ? 'Remove bookmark' : 'Bookmark for revision'}
                  onClick={() => toggleBookmark(current.id)}
                >
                  {bookmarks.has(current.id) ? '⭐' : '☆'}
                </button>
              </div>

              <QuestionContext q={current} />

              {current.imageUrl && (
                <div className="qd-image">
                  <img src={current.imageUrl} alt="Question diagram" />
                </div>
              )}

              {current.text && <RichText as="div" className="qd-qtext" html={current.text} />}

              {!picked && <div className="practice-banner">Pick an answer to check yourself</div>}

              <div className="review-options qd-options" style={{ marginTop: 12 }}>
                {OPTIONS.map(opt => {
                  const isCorrect = opt === current.correctOption
                  const isPicked = opt === picked
                  const cls = picked && isCorrect ? 'correct-opt' : picked && isPicked ? 'wrong-opt' : ''
                  return (
                    <div
                      key={opt}
                      className={`review-option ${cls}`}
                      style={{ cursor: picked ? 'default' : 'pointer' }}
                      onClick={() => choose(opt)}
                    >
                      <span className="option-label">{opt}</span>
                      <span><RichText html={optText(current, opt)} /></span>
                      {picked && isCorrect && <span className="opt-tag correct-tag">✓ Correct answer</span>}
                      {picked && isPicked && !isCorrect && <span className="opt-tag wrong-tag">Your pick</span>}
                    </div>
                  )
                })}
              </div>

              {picked && (
                <div
                  className="qd-practice-verdict"
                  style={{ color: picked === current.correctOption ? '#16a34a' : '#dc2626' }}
                >
                  {picked === current.correctOption
                    ? '✓ Correct!'
                    : '✗ Not quite — the correct answer is highlighted.'}
                </div>
              )}

              {picked && (
                <div className="qd-practice-actions">
                  <button className="btn btn-ghost btn-sm" onClick={retry}>Try again</button>
                </div>
              )}

              {picked && (
                current.solution ? (
                  <div className="qd-solution">
                    <div className="qd-solution-title">💡 Solution</div>
                    <RichText as="div" className="sol-explain-text" html={current.solution} />
                  </div>
                ) : (
                  <p className="qd-no-solution">No written solution has been added for this question yet.</p>
                )
              )}

              <div className="prac-card-foot">
                <button className="btn btn-ghost btn-sm" onClick={() => setReportId(current.id)}>
                  ⚑ Report a problem
                </button>
                <div className="prac-nav">
                  <button className="btn btn-ghost" onClick={() => setIndex(index - 1)} disabled={index === 0}>
                    ← Previous
                  </button>
                  <button className="btn btn-primary" onClick={goNext} disabled={atEnd || loadingMore}>
                    {loadingMore ? 'Loading…' : atEnd ? 'No more questions' : picked ? 'Next question →' : 'Skip →'}
                  </button>
                </div>
              </div>

              <div className="kbd-hint">
                <span><kbd>A</kbd>–<kbd>D</kbd> answer</span>
                <span><kbd>←</kbd> <kbd>→</kbd> move between questions</span>
              </div>
            </article>
          </>
        )}
      </div>

      {reportId && (
        <ReportModal
          questionId={reportId}
          source="practice"
          onClose={() => setReportId(null)}
        />
      )}
    </>
  )
}
