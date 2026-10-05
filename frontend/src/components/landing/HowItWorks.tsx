import { useReveal } from './hooks'

const STEPS = [
  { n: '01', title: 'Choose', body: 'Pick a mock test or live contest.' },
  { n: '02', title: 'Compete', body: 'Solve questions under a real exam-like time limit.' },
  { n: '03', title: 'Get Ranked', body: 'See your position on the leaderboard.' },
  { n: '04', title: 'Improve', body: 'Track your performance and come back stronger.' },
]

/** Horizontal rail on desktop, vertical on a phone — same markup, CSS decides. */
export default function HowItWorks() {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="lp-section lp-reveal" ref={ref} id="how">
      <div className="lp-shell">
        <header className="lp-section-head">
          <span className="lp-kicker">How it works</span>
          <h2 className="lp-h2">Enter. Compete. Improve.</h2>
        </header>

        <ol className="lp-steps">
          {STEPS.map((s, i) => (
            <li className="lp-step" key={s.n} style={{ ['--i' as string]: i }}>
              <span className="lp-step-node" aria-hidden="true" />
              <span className="lp-step-n">{s.n}</span>
              <h3 className="lp-step-title">{s.title}</h3>
              <p className="lp-step-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
