import { sectionsWithBaseline } from '../../lib/types'
import { SUBJECT_COLOR, SUBJECT_LABEL } from '../../lib/practice'
import { useReveal } from '../landing/hooks'
import type { MockTestListItem } from '../../lib/types'

const ICONS: Record<string, React.ReactNode> = {
  QUANT: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h2m3 0h3M8 16h2m3 0h3" />
    </svg>
  ),
  REASONING: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 17a3 3 0 0 0 5 2 3 3 0 0 0 5-2 3 3 0 0 0 2-5.2A3 3 0 0 0 18 6a3 3 0 0 0-3-3 3 3 0 0 0-3 1.5A3 3 0 0 0 9 3Z" />
      <path d="M12 4.5V19" />
    </svg>
  ),
  ENGLISH: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" /><path d="M9 7.5h6M9 11h4" />
    </svg>
  ),
  GK: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
    </svg>
  ),
  // CAT. Drawn in the same weight and box as the four above so a mixed grid
  // reads as one set rather than two.
  VARC: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5h7v15H4zM13 4.5h7v15h-7z" /><path d="M6 8.5h3M6 12h3M15 8.5h3M15 12h3" />
    </svg>
  ),
  DILR: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M9.5 20V4M15 20v-7M20.5 20V7" />
    </svg>
  ),
  QA: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h7M7.5 3.5v7M13.5 7h6.5M13.5 17h6.5M13.5 20.5 20 14M4.5 14.5l5 5M9.5 14.5l-5 5" />
    </svg>
  ),
}

/**
 * The four subjects, each with what the platform actually holds for it and
 * how the reader has done. Counts are computed from the test list rather
 * than a second endpoint, so they can never disagree with the grid below.
 */
export default function SubjectCards({
  mocks, onPick,
}: {
  mocks: MockTestListItem[]
  onPick: (subject: string) => void
}) {
  const ref = useReveal<HTMLElement>()

  return (
    <section className="mk-section lp-reveal" ref={ref}>
      <div className="mk-subject-grid">
        {sectionsWithBaseline(mocks, m => m.subject).map(s => {
          const mine = mocks.filter(m => m.subject === s)
          const questions = mine.reduce((n, m) => n + m.questionCount, 0)
          const scored = mine.filter(m => m.attempted && m.lastTotal)
          // Best across this subject's papers — each test keeps one score,
          // so this is the strongest of the ones they have sat.
          const best = scored.length
            ? Math.round(Math.max(...scored.map(m => (m.lastScore! / m.lastTotal!) * 100)))
            : null

          return (
            <button
              key={s}
              className="mk-subject"
              style={{ ['--subject' as string]: SUBJECT_COLOR[s] }}
              onClick={() => onPick(s)}
              disabled={mine.length === 0}
            >
              <span className="mk-subject-icon" aria-hidden="true">{ICONS[s]}</span>
              <span className="mk-subject-name">{SUBJECT_LABEL[s]}</span>
              <span className="mk-subject-meta">
                {mine.length} {mine.length === 1 ? 'test' : 'tests'} · {questions} questions
              </span>
              <span className="mk-subject-best">
                {best !== null
                  ? <>Your best <b>{best}%</b></>
                  : mine.length ? <i>Not attempted</i> : <i>Coming soon</i>}
              </span>
              <span className="mk-subject-go">Explore <span aria-hidden="true">→</span></span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
