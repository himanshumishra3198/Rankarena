import { useReveal } from '../landing/hooks'

const STEPS = [
  { n: '01', title: 'Register', body: 'Choose a contest and register before it starts.' },
  { n: '02', title: 'Enter', body: 'Join the moment the contest goes live.' },
  { n: '03', title: 'Compete', body: 'Solve the paper inside the time limit.' },
  { n: '04', title: 'Climb', body: 'Get your rank, rating change and performance report.' },
]

export default function HowContestsWork() {
  const ref = useReveal<HTMLElement>()
  return (
    <section className="ct-section lp-reveal" ref={ref}>
      <header className="mk-section-head">
        <div>
          <span className="lp-kicker">The loop</span>
          <h2 className="mk-h2">How the Arena Works</h2>
        </div>
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
    </section>
  )
}
