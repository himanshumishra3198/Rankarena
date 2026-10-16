import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../lib/api'
import { RichText } from '../RichText'
import { QuestionContext } from '../QuestionContent'
import { SUBJECT_COLOR, SUBJECT_SHORT, titleCase } from '../../lib/practice'

/**
 * One question a day, the same one for everybody.
 *
 * The answer is checked in the browser, the way the problemset does it —
 * nothing is recorded, so this cannot touch a rating or a leaderboard. What
 * is remembered is the attempt itself, keyed by the challenge's own date, so
 * a reload does not offer a question you have already answered and tomorrow
 * clears itself without any cleanup.
 */

const OPTIONS = ['A', 'B', 'C', 'D'] as const
const KEY = 'daily-challenge'

interface DailyQuestion {
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
    type: 'TEXT' | 'TABLE'; tableData?: { headers: string[]; rows: string[][] } | null
  } | null
  solution?: string | null
  translated: boolean
}

function readPick(day: string): string | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return raw?.day === day ? (raw.picked ?? null) : null
  } catch { return null }
}

function savePick(day: string, picked: string) {
  // Only today's attempt is kept — the record replaces itself each morning.
  try { localStorage.setItem(KEY, JSON.stringify({ day, picked })) } catch { /* noop */ }
}

function optText(q: DailyQuestion, opt: string) {
  return ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as Record<string, string>)[opt] ?? ''
}

export default function DailyChallenge() {
  const [day, setDay] = useState<string | null>(null)
  const [q, setQ] = useState<DailyQuestion | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'failed'>('loading')

  useEffect(() => {
    let cancelled = false
    api.get('/practice/daily')
      .then(r => {
        if (cancelled) return
        setDay(r.data.day)
        if (!r.data.question) { setState('none'); return }
        setQ(r.data.question)
        setPicked(readPick(r.data.day))
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('failed') })
    return () => { cancelled = true }
  }, [])

  function choose(opt: string) {
    if (!q || !day || picked) return
    setPicked(opt)
    savePick(day, opt)
  }

  if (state === 'loading') {
    return <section className="db-card"><div className="db-skel" style={{ height: 150 }} /></section>
  }
  if (state === 'failed') {
    return (
      <section className="db-card">
        <header className="db-card-head"><h2 className="db-card-title">Today's Challenge</h2></header>
        <p className="db-empty-line">Couldn't load today's question.</p>
      </section>
    )
  }
  if (state === 'none' || !q) {
    return (
      <section className="db-card">
        <header className="db-card-head"><h2 className="db-card-title">Today's Challenge</h2></header>
        <p className="db-empty-line">
          No question available yet — the challenge draws from contests that have finished.
        </p>
      </section>
    )
  }

  const right = picked === q.correctOption

  return (
    <section className="db-card dc-card">
      <header className="db-card-head">
        <h2 className="db-card-title">Today's Challenge</h2>
        <span className="dc-tags">
          <span className="dc-subject" style={{ color: SUBJECT_COLOR[q.subject] }}>
            {SUBJECT_SHORT[q.subject] ?? q.subject}
          </span>
          <span className={`mk-diff mk-diff-${q.difficulty.toLowerCase()}`}>{titleCase(q.difficulty)}</span>
        </span>
      </header>

      {picked && (
        <div className={`dc-verdict ${right ? 'is-right' : 'is-wrong'}`}>
          {right ? '✓ Correct — nicely done.' : '✗ Not this time. The right answer is marked below.'}
        </div>
      )}

      <QuestionContext q={q} />
      {q.imageUrl && <div className="qd-image"><img src={q.imageUrl} alt="Question diagram" /></div>}
      {q.text && <RichText as="div" className="dc-qtext" html={q.text} />}

      <div className="review-options dc-options">
        {OPTIONS.map(opt => {
          const isCorrect = opt === q.correctOption
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
              <span><RichText html={optText(q, opt)} /></span>
              {picked && isCorrect && <span className="opt-tag correct-tag">✓ Correct</span>}
              {picked && isPicked && !isCorrect && <span className="opt-tag wrong-tag">Your pick</span>}
            </div>
          )
        })}
      </div>

      {picked && (
        q.solution
          ? <div className="qd-solution dc-solution">
              <div className="qd-solution-title">💡 Solution</div>
              <RichText as="div" className="sol-explain-text" html={q.solution} />
            </div>
          : <p className="qd-no-solution">No written solution has been added for this one yet.</p>
      )}

      <footer className="dc-foot">
        {picked
          ? <span className="dc-done">A new question lands tomorrow.</span>
          : <span className="dc-prompt">Pick an answer to check yourself.</span>}
        <Link to="/practice" className="lp-link-arrow db-card-link">
          More practice <span aria-hidden="true">→</span>
        </Link>
      </footer>
    </section>
  )
}
