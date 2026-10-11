import renderMathInElement from 'katex/contrib/auto-render'
import 'katex/dist/katex.min.css'

/**
 * Rendering mathematics inside question content.
 *
 * Applied by RichText, which is the single path every question stem, option,
 * solution and passage is rendered through — so a formula written once in the
 * admin panel renders the same way in the exam room, the review screen,
 * practice and the bank listing.
 */

/**
 * What counts as mathematics.
 *
 * Bare `$…$` is deliberately absent. `$` is a literal symbol in this question
 * bank: coding-decoding questions say things like "'$' means '÷'", and
 * treating it as a delimiter would swallow everything between two of them and
 * corrupt a live question mid-exam. Eleven questions do this today. None use
 * any of the delimiters below, so these three are safe to turn on over
 * existing content.
 */
export const MATH_DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
]

/** A one-line reminder of the syntax, for the editor's help text. */
export const MATH_HINT = 'Maths: \\( … \\) inline, $$ … $$ or \\[ … \\] on its own line. A plain $ stays a plain $.'

/**
 * Returns the html with every formula rendered.
 *
 * A string in, a string out — deliberately not a DOM side-effect on a
 * rendered element. Rendering math in an effect worked, and then silently
 * came undone: `dangerouslySetInnerHTML` is React's to own, so the next
 * commit that touched the element reset it to the unrendered source, and an
 * effect keyed on that source saw no change and never ran again. In the
 * editor a debounced lookup undid it ~600ms after typing; in the exam room
 * the clock re-renders every second, which would have wiped every formula
 * on the page a second after it appeared.
 *
 * Handing React html that already contains the rendered markup removes the
 * race entirely: there is nothing left to re-assert.
 *
 * Call this only on already-sanitised html. KaTeX's output is generated from
 * the formula source with `trust` off, and sanitising afterwards would strip
 * the very markup it just produced.
 */
export function renderMathToHtml(html: string): string {
  // Cheap bail-out: most questions contain no maths at all, and this spares
  // them a parse and a tree walk on every render.
  if (!html || !HAS_MATH.test(html)) return html
  try {
    const host = document.createElement('div')
    host.innerHTML = html
    renderMathInElement(host, {
      delimiters: MATH_DELIMITERS,
      // A malformed formula shows as its own source in red rather than
      // throwing — one bad backslash must not blank the question around it.
      throwOnError: false,
      errorColor: '#dc2626',
      // `trust` stays at its default of false, which is what stops \href and
      // \url smuggling a javascript: link into pasted content.
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
    })
    return host.innerHTML
  } catch {
    // Leave the text exactly as written. A rendering failure must never take
    // the question with it.
    return html
  }
}

/** Any of the opening delimiters above, for the bail-out. */
const HAS_MATH = /\$\$|\\\(|\\\[/
