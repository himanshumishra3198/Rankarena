import { Link } from 'react-router-dom'
import { useReveal } from './hooks'
import type { ExamStats } from './types'

/**
 * The examinations the platform runs, described from the catalogue.
 *
 * Counts come from /stats/public, so an exam that has been added but has no
 * papers behind it yet says exactly that rather than implying a library. A
 * visitor who signs up for CAT and finds nothing is a worse outcome than one
 * who was told plainly it is on the way — and the rest of this page already
 * works that way, showing placeholders instead of inventing numbers.
 */

/** Written per exam because "what you sit" differs, not as decoration. */
const BLURB: Record<string, string> = {
  SSC_CGL: 'Tier-1 pattern: four sections, 25 questions each, negative marking, sat against the clock.',
  CAT: 'VARC, DILR and QA — with the formats CAT actually uses, including multiple-correct and type-in answers.',
}

function Card({ e }: { e: ExamStats }) {
  const ready = e.mockTests > 0 || e.contests > 0
  return (
    <article className={`lp-exam ${ready ? '' : 'lp-exam-soon'}`}>
      <header className="lp-exam-head">
        <h3 className="lp-exam-name">{e.label}</h3>
        {!ready && <span className="lp-exam-tag">Opening soon</span>}
      </header>

      <p className="lp-exam-sections">{e.sections.join(' · ')}</p>
      <p className="lp-exam-blurb">{BLURB[e.exam] ?? ''}</p>

      {ready ? (
        <>
          <dl className="lp-exam-figures">
            <div><dt>Mock tests</dt><dd>{e.mockTests}</dd></div>
            <div><dt>Contests</dt><dd>{e.contests}</dd></div>
            <div><dt>Questions</dt><dd>{e.questions.toLocaleString('en-IN')}</dd></div>
          </dl>
          <div className="lp-exam-links">
            <Link className="lp-link-arrow" to={`/mocks?exam=${e.exam}`}>
              Mock tests <span aria-hidden="true">→</span>
            </Link>
            <Link className="lp-link-arrow" to={`/contests?exam=${e.exam}`}>
              Contests <span aria-hidden="true">→</span>
            </Link>
          </div>
        </>
      ) : (
        <p className="lp-exam-pending">
          The question bank and the exam room already understand this paper.
          Papers are being written now — sign up and you will be told when the
          first one is scheduled.
        </p>
      )}
    </article>
  )
}

export default function Exams({ exams }: { exams: ExamStats[] | undefined }) {
  const ref = useReveal<HTMLElement>()
  // Nothing to say until the API answers, and nothing worth a section if
  // only one exam exists — the rest of the page is already about that one.
  if (!exams || exams.length < 2) return null

  return (
    <section className="lp-section lp-reveal" ref={ref} id="exams">
      <div className="lp-shell">
        <span className="lp-kicker">What you can sit</span>
        <h2 className="lp-h2">Two examinations, one arena</h2>
        <p className="lp-section-sub">
          Same rated contests, same leaderboards, same rating — kept on separate
          ladders, because a CAT result and an SSC result are not the same achievement.
        </p>
        <div className="lp-exam-grid">
          {exams.map(e => <Card key={e.exam} e={e} />)}
        </div>
      </div>
    </section>
  )
}
