import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import ReportModal from '../components/ReportModal'
import LanguageToggle from '../components/LanguageToggle'
import { QuestionContext } from '../components/QuestionContent'
import { RichText } from '../components/RichText'
import { usePageMeta } from '../lib/seo'
import { getPreferredLanguage, setPreferredLanguage, type Language } from '../lib/language'
import {
  PROBLEMS_PER_PAGE, SUBJECT_COLOR, SUBJECT_SHORT, markProblem, readMarks, titleCase,
} from '../lib/practice'

/**
 * One problem from the archive, with the answer behind your attempt.
 *
 * This is the only place practice hands out a correct option or a solution,
 * and the server re-checks the archive rule on the way in — the problemset
 * is a view, not a gate, so an id typed straight into the address bar gets
 * exactly the same answer as a click.
 *
 * Previous/next walk the filtered list the problemset was showing. The URL
 * carries that filter and this problem's place in it, so the pair of them is
 * enough to fetch the surrounding page without the list being passed along.
 */

const OPTIONS = ['A', 'B', 'C', 'D'] as const

interface Problem {
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
  source: { type: 'CONTEST' | 'MOCK'; id: string; title: string } | null
  language: string
  translated: boolean
}

/** The page of the filtered list this problem sits on, for prev/next. */
interface Neighbours {
  total: number
  ids: string[]
  /** Index in the whole filtered list of `ids[0]`. */
  offset: number
}

function optText(q: Problem, opt: string) {
  return ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as Record<string, string>)[opt] ?? ''
}

export default function PracticeProblem() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [language, setLanguage] = useState<Language>(getPreferredLanguage())

  const [problem, setProblem] = useState<Problem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'none' | 'missing' | 'failed'>('none')
  const [picked, setPicked] = useState<string | null>(null)
  const [bookmarked, setBookmarked] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [neighbours, setNeighbours] = useState<Neighbours | null>(null)

  usePageMeta(
    problem ? `${problem.topic ?? SUBJECT_SHORT[problem.subject] ?? 'Practice'} — RankArenas` : 'Practice — RankArenas',
    'Attempt a question from a past SSC contest or mock test, with the answer and solution.'
  )

  // The filter the problemset was showing, carried through so "back" and
  // previous/next stay inside the same list. Held as a string: it is what
  // identifies the list, and a fresh URLSearchParams every render would
  // restart the neighbour fetch on every render.
  const listKey = useMemo(() => {
    const q = new URLSearchParams(params)
    q.delete('i')
    return q.toString()
  }, [params])
  const index = Number(params.get('i'))
  const hasPlace = Number.isInteger(index) && index >= 0

  // Back to the page of the list this problem was on, not to the top of it:
  // the position is already in the URL, so the page it implies comes free.
  const backHref = useMemo(() => {
    const q = new URLSearchParams(listKey)
    const pageNo = hasPlace ? Math.floor(index / PROBLEMS_PER_PAGE) + 1 : 1
    if (pageNo > 1) q.set('page', String(pageNo))
    const qs = q.toString()
    return `/practice${qs ? `?${qs}` : ''}`
  }, [listKey, hasPlace, index])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('none')
    setPicked(null)
    api.get(`/practice/problems/${id}?language=${language}`)
      .then(r => {
        if (cancelled) return
        setProblem(r.data)
        setBookmarked(!!r.data.bookmarked)
      })
      .catch(e => { if (!cancelled) setError(e?.response?.status === 404 ? 'missing' : 'failed') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, language])

  // The page of the list this problem is on. One request, and both
  // neighbours come with it — crossing a page boundary fetches the next one.
  useEffect(() => {
    if (!hasPlace) { setNeighbours(null); return }
    let cancelled = false
    const pageNo = Math.floor(index / PROBLEMS_PER_PAGE) + 1
    const q = new URLSearchParams(listKey)
    q.set('page', String(pageNo))
    q.set('limit', String(PROBLEMS_PER_PAGE))
    q.set('language', language)
    api.get(`/practice/problems?${q}`)
      .then(r => {
        if (cancelled) return
        setNeighbours({
          total: r.data.total,
          ids: r.data.problems.map((p: { id: string }) => p.id),
          offset: (pageNo - 1) * PROBLEMS_PER_PAGE,
        })
      })
      .catch(() => { if (!cancelled) setNeighbours(null) })
    return () => { cancelled = true }
  }, [id, index, hasPlace, language, listKey])

  function choose(opt: string) {
    if (!problem || picked) return
    setPicked(opt)
    markProblem(problem.id, opt === problem.correctOption ? 'SOLVED' : 'TRIED')
  }

  async function toggleBookmark() {
    if (!problem) return
    setBookmarked(b => !b)
    try {
      await api.post(`/bookmarks/${problem.id}`)
    } catch {
      setBookmarked(b => !b)
    }
  }

  function pickLanguage(next: Language) {
    setLanguage(next)
    setPreferredLanguage(next)
  }

  /** The id `step` places away in the filtered list, if this page holds it. */
  function neighbourId(step: -1 | 1): string | null {
    if (!neighbours || !hasPlace) return null
    const target = index + step
    if (target < 0 || target >= neighbours.total) return null
    const local = target - neighbours.offset
    return neighbours.ids[local] ?? null
  }

  /**
   * Stepping off the end of the loaded page still moves: the next page is
   * fetched on arrival, because the URL carries the place, not the list.
   */
  function go(step: -1 | 1) {
    if (!hasPlace) return
    const target = index + step
    if (target < 0 || (neighbours && target >= neighbours.total)) return
    const known = neighbourId(step)
    const q = new URLSearchParams(listKey)
    q.set('i', String(target))
    if (known) {
      navigate(`/practice/${known}?${q}`)
      return
    }
    // Off the edge of what is loaded — resolve the id from the page it is on.
    const pageNo = Math.floor(target / PROBLEMS_PER_PAGE) + 1
    const lookup = new URLSearchParams(listKey)
    lookup.set('page', String(pageNo))
    lookup.set('limit', String(PROBLEMS_PER_PAGE))
    lookup.set('language', language)
    api.get(`/practice/problems?${lookup}`).then(r => {
      const next = r.data.problems[target - (pageNo - 1) * PROBLEMS_PER_PAGE]
      if (next) navigate(`/practice/${next.id}?${q}`)
    }).catch(() => { /* the buttons simply don't move */ })
  }

  const canPrev = hasPlace && index > 0
  const canNext = hasPlace && (!neighbours || index + 1 < neighbours.total)

  // Arrow keys walk the list, A–D answer — the same drill as the exam room.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')) return
      const letter = (OPTIONS as readonly string[]).indexOf(e.key.toUpperCase())
      const number = ['1', '2', '3', '4'].indexOf(e.key)
      if (letter >= 0 || number >= 0) { e.preventDefault(); choose(OPTIONS[letter >= 0 ? letter : number]); return }
      if (e.key === 'ArrowLeft' && canPrev) { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowRight' && canNext) { e.preventDefault(); go(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const solvedMark = problem ? readMarks()[problem.id] : undefined

  return (
    <>
      <Navbar />
      <div className="page pp-page">
        <div className="pp-topbar">
          <Link to={backHref} className="pp-back">← Problemset</Link>
          {hasPlace && neighbours && (
            <span className="pp-place">Problem {index + 1} of {neighbours.total}</span>
          )}
          <LanguageToggle value={language} onChange={pickLanguage} />
        </div>

        {loading && <div className="card ps-status">Loading…</div>}

        {!loading && error === 'missing' && (
          <div className="card ps-status">
            <div className="ps-empty-icon">🔒</div>
            <p className="ps-empty-title">Not in the problemset</p>
            <p>
              This question isn't available for practice. Questions join the
              problemset once the contest they were set in has finished.
            </p>
            <Link to={backHref} className="btn btn-primary btn-sm">Back to the problemset</Link>
          </div>
        )}

        {!loading && error === 'failed' && (
          <div className="card ps-status">
            <p>Couldn't load this problem.</p>
            <Link to={backHref} className="btn btn-ghost btn-sm">Back to the problemset</Link>
          </div>
        )}

        {!loading && problem && error === 'none' && (
          <article className="card pp-card">
            <div className="pp-head">
              <div className="pp-tags">
                <span className="pp-subject" style={{ color: SUBJECT_COLOR[problem.subject] }}>
                  {SUBJECT_SHORT[problem.subject] ?? problem.subject}
                </span>
                {problem.topic && <span className="pp-topic">{problem.topic}</span>}
                <span className={`badge badge-${problem.difficulty.toLowerCase()}`}>
                  {titleCase(problem.difficulty)}
                </span>
                {problem.source && (
                  <span className="pp-source">from <strong>{problem.source.title}</strong></span>
                )}
                {solvedMark === 'SOLVED' && <span className="pp-solved-flag">✓ Solved</span>}
              </div>
              <button
                className="bookmark-btn"
                title={bookmarked ? 'Remove bookmark' : 'Bookmark for revision'}
                onClick={toggleBookmark}
              >
                {bookmarked ? '⭐' : '☆'}
              </button>
            </div>

            <QuestionContext q={problem} />

            {problem.imageUrl && (
              <div className="qd-image">
                <img src={problem.imageUrl} alt="Question diagram" />
              </div>
            )}

            {problem.text && <RichText as="div" className="pp-qtext" html={problem.text} />}

            {!picked && <div className="practice-banner">Pick an answer to check yourself</div>}

            <div className="review-options qd-options" style={{ marginTop: 12 }}>
              {OPTIONS.map(opt => {
                const isCorrect = opt === problem.correctOption
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
                    <span><RichText html={optText(problem, opt)} /></span>
                    {picked && isCorrect && <span className="opt-tag correct-tag">✓ Correct answer</span>}
                    {picked && isPicked && !isCorrect && <span className="opt-tag wrong-tag">Your pick</span>}
                  </div>
                )
              })}
            </div>

            {picked && (
              <>
                <div
                  className="qd-practice-verdict"
                  style={{ color: picked === problem.correctOption ? '#16a34a' : '#dc2626' }}
                >
                  {picked === problem.correctOption
                    ? '✓ Correct!'
                    : '✗ Not quite — the correct answer is highlighted.'}
                </div>
                <div className="qd-practice-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setPicked(null)}>Try again</button>
                </div>
                {problem.solution ? (
                  <div className="qd-solution">
                    <div className="qd-solution-title">💡 Solution</div>
                    <RichText as="div" className="sol-explain-text" html={problem.solution} />
                  </div>
                ) : (
                  <p className="qd-no-solution">No written solution has been added for this question yet.</p>
                )}
              </>
            )}

            <div className="pp-foot">
              <button className="btn btn-ghost btn-sm" onClick={() => setReporting(true)}>
                ⚑ Report a problem
              </button>
              {hasPlace && (
                <div className="pp-nav">
                  <button className="btn btn-ghost" onClick={() => go(-1)} disabled={!canPrev}>← Previous</button>
                  <button className="btn btn-primary" onClick={() => go(1)} disabled={!canNext}>Next →</button>
                </div>
              )}
            </div>

            <div className="kbd-hint">
              <span><kbd>A</kbd>–<kbd>D</kbd> answer</span>
              {hasPlace && <span><kbd>←</kbd> <kbd>→</kbd> move through the list</span>}
            </div>
          </article>
        )}
      </div>

      {reporting && problem && (
        <ReportModal questionId={problem.id} source="practice" onClose={() => setReporting(false)} />
      )}
    </>
  )
}
