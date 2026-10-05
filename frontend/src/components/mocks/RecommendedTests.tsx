import MockTestCard from './MockTestCard'
import { SUBJECT_LABEL } from '../../lib/practice'
import { useReveal } from '../landing/hooks'
import type { MockTestListItem } from '../../lib/types'

export interface SubjectAccuracy { subject: string; correct: number; wrong: number }

/**
 * What to sit next, argued from the reader's own record.
 *
 * The weakest subject is taken from /profile's subjectStats — the same
 * figures the profile page draws its bars from — and the suggestion is an
 * unattempted paper in it. When there is no record to reason from (a guest,
 * or nobody who has sat anything yet) the section says "most attempted"
 * instead of pretending to personalise. The heading is never "based on your
 * performance" unless it actually is.
 */
export default function RecommendedTests({
  mocks, subjectStats, signedIn,
}: {
  mocks: MockTestListItem[]
  subjectStats: SubjectAccuracy[]
  signedIn: boolean
}) {
  const ref = useReveal<HTMLElement>()

  // A subject needs a few answered questions before its accuracy means
  // anything; one wrong answer should not define a weakness.
  const ranked = subjectStats
    .filter(s => s.correct + s.wrong >= 5)
    .map(s => ({ ...s, acc: s.correct / (s.correct + s.wrong) }))
    .sort((a, b) => a.acc - b.acc)
  const weakest = ranked[0]

  const personalised = signedIn && !!weakest
  let picks: MockTestListItem[] = []
  let reason = ''

  if (personalised) {
    const inWeak = mocks.filter(m => m.subject === weakest.subject && !m.attempted)
    const elsewhere = mocks.filter(m => m.subject !== weakest.subject && !m.attempted)
    picks = [...inWeak, ...elsewhere].slice(0, 3)
    reason = `You're at ${Math.round(weakest.acc * 100)}% in ${SUBJECT_LABEL[weakest.subject] ?? weakest.subject}. These build it up.`
  } else {
    picks = [...mocks].sort((a, b) => b.attemptCount - a.attemptCount).slice(0, 3)
    reason = signedIn
      ? 'Sit a test and this becomes a plan built from your own weak spots.'
      : 'The papers most aspirants are sitting right now.'
  }

  if (picks.length === 0) return null

  return (
    <section className="mk-section lp-reveal" ref={ref}>
      <header className="mk-section-head">
        <div>
          <span className="lp-kicker">{personalised ? 'Recommended for you' : 'Popular right now'}</span>
          <h2 className="mk-h2">{personalised ? 'Built From Your Weak Spots' : 'Where Everyone Is Training'}</h2>
          <p className="mk-section-sub">{reason}</p>
        </div>
      </header>
      <div className="mk-grid">
        {picks.map(m => <MockTestCard key={m.id} m={m} cta="Practice Now" />)}
      </div>
    </section>
  )
}
