import { useEffect, useState } from 'react'
import { RichText } from './RichText'

/**
 * What maths syntax this platform understands, with every example rendered
 * by the same pipeline that renders a real question.
 *
 * The examples are not screenshots or hand-written descriptions: each one is
 * passed through RichText exactly as a question stem would be, so this sheet
 * cannot drift from what the exam room actually does. If a row here looks
 * wrong, the platform is wrong.
 */

interface Row {
  /** What an author is trying to write. */
  what: string
  /** What they type, without the surrounding delimiters. */
  src: string
}

interface Group {
  title: string
  rows: Row[]
}

const GROUPS: Group[] = [
  {
    title: 'Numbers and arithmetic',
    rows: [
      { what: 'Fraction', src: '\\frac{3}{4}' },
      { what: 'Mixed fraction', src: '2\\frac{1}{2}' },
      { what: 'Ratio', src: 'a : b = 3 : 5' },
      { what: 'Multiply', src: '12 \\times 8' },
      { what: 'Divide', src: '144 \\div 12' },
      { what: 'Plus or minus', src: '\\pm 5' },
      { what: 'Percentage (escape the %)', src: '25\\% \\text{ of } 80' },
      { what: 'Rupees', src: '\\text{₹}1200' },
    ],
  },
  {
    title: 'Powers, roots and indices',
    rows: [
      { what: 'Power', src: 'x^2' },
      { what: 'Power of more than one character', src: 'x^{10}' },
      { what: 'Subscript', src: 'a_1, a_{n+1}' },
      { what: 'Square root', src: '\\sqrt{169}' },
      { what: 'Cube root', src: '\\sqrt[3]{216}' },
      { what: 'Nested', src: '\\sqrt{x^2 + y^2}' },
    ],
  },
  {
    title: 'Comparisons and symbols',
    rows: [
      { what: 'Not equal', src: 'a \\neq b' },
      { what: 'Less / greater than or equal', src: 'x \\leq 5, \\; y \\geq 2' },
      { what: 'Approximately', src: '\\pi \\approx 3.14' },
      { what: 'Therefore / because', src: '\\therefore \\quad \\because' },
      { what: 'Infinity', src: '\\infty' },
      { what: 'Degrees', src: '60^\\circ' },
      { what: 'Greek letters', src: '\\alpha, \\beta, \\theta, \\pi' },
    ],
  },
  {
    title: 'Geometry',
    rows: [
      { what: 'Angle', src: '\\angle ABC = 90^\\circ' },
      { what: 'Triangle', src: '\\triangle ABC' },
      { what: 'Line segment', src: '\\overline{AB}' },
      { what: 'Parallel / perpendicular', src: 'AB \\parallel CD, \\; PQ \\perp RS' },
      { what: 'Similar / congruent', src: '\\sim \\quad \\cong' },
      { what: 'Area of a circle', src: 'A = \\pi r^2' },
    ],
  },
  {
    title: 'Trigonometry and logs',
    rows: [
      { what: 'Trig functions', src: '\\sin\\theta + \\cos\\theta' },
      { what: 'With a degree', src: '\\tan 45^\\circ = 1' },
      { what: 'Squared trig', src: '\\sin^2\\theta + \\cos^2\\theta = 1' },
      { what: 'Logarithm', src: '\\log_{2} 8 = 3' },
    ],
  },
  {
    title: 'Bigger expressions',
    rows: [
      { what: 'Summation', src: '\\sum_{i=1}^{n} i' },
      { what: 'Permutation / combination', src: '^{n}P_{r}, \\; ^{n}C_{r}' },
      { what: 'Determinant', src: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}' },
      { what: 'Matrix', src: '\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}' },
      { what: 'Words inside maths', src: '12 \\text{ cm}' },
    ],
  },
]

/** Wraps a snippet in inline delimiters, which is how an author would use it. */
const inline = (src: string) => `\\(${src}\\)`

function CopyableRow({ row }: { row: Row }) {
  const [copied, setCopied] = useState(false)
  const snippet = inline(row.src)

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard access can be refused; the source is on screen to retype.
    }
  }

  return (
    <tr>
      <td className="lx-what">{row.what}</td>
      <td>
        {/* The snippet an author copies includes the delimiters, because
            pasting the bare formula is the commonest way to get nothing. */}
        <button type="button" className="lx-code" onClick={copy}
          title="Click to copy, with the \( \) around it">
          <code>{row.src}</code>
          <span className="lx-copy">{copied ? 'copied' : 'copy'}</span>
        </button>
      </td>
      <td className="lx-out">
        <RichText html={inline(row.src)} />
      </td>
    </tr>
  )
}

export default function LatexHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-box lx-box" onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Maths syntax reference">
        <div className="lx-head">
          <h3 className="lx-title">Writing maths in a question</h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
        </div>

        <p className="lx-lead">
          Anything between these marks is rendered as a formula. They work in the question
          text, in all four options and in the solution — and in Hindi as well as English.
        </p>

        <table className="lx-table lx-delims">
          <tbody>
            <tr>
              <td className="lx-what">Inside a sentence</td>
              <td><code>{'\\( … \\)'}</code></td>
              <td className="lx-out">The area is <RichText html={'\\(\\pi r^2\\)'} /> exactly.</td>
            </tr>
            <tr>
              <td className="lx-what">On its own line</td>
              <td><code>{'$$ … $$'}</code> or <code>{'\\[ … \\]'}</code></td>
              <td className="lx-out"><RichText html={'$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$'} /></td>
            </tr>
          </tbody>
        </table>

        {/* Both of these have bitten real questions, so they lead rather than
            sit in a footnote. */}
        <div className="lx-warn">
          <strong>Two things to watch</strong>
          <ul>
            <li>
              Write a percent sign as <code>{'\\%'}</code>. A bare <code>%</code> starts a
              comment and silently swallows the rest of the formula —{' '}
              <code>{'\\(50% of 200\\)'}</code> shows only <RichText html={'\\(50\\)'} />,
              while <code>{'\\(50\\% \\text{ of } 200\\)'}</code> shows{' '}
              <RichText html={'\\(50\\% \\text{ of } 200\\)'} />.
            </li>
            <li>
              A lone <code>$</code> is <em>not</em> a formula marker here — it stays a plain
              dollar sign, so reasoning questions that use <code>$</code> as a symbol are safe.
              Use <code>$$</code> for a centred formula.
            </li>
          </ul>
        </div>

        {GROUPS.map(g => (
          <section key={g.title} className="lx-group">
            <h4 className="lx-group-title">{g.title}</h4>
            <table className="lx-table">
              <thead>
                <tr><th>For</th><th>Type this</th><th>Shows as</th></tr>
              </thead>
              <tbody>
                {g.rows.map(r => <CopyableRow key={r.what} row={r} />)}
              </tbody>
            </table>
          </section>
        ))}

        <p className="lx-foot">
          A formula with a mistake in it shows in <span className="lx-err">red</span> rather than
          breaking the question around it, so an error is visible in the preview before you save.
        </p>
      </div>
    </div>
  )
}
