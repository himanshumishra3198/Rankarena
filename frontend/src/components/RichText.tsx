import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { renderMathToHtml } from '../lib/math'

// Allowlist: inline formatting + inline images the admin editor can produce.
const CONFIG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'sub', 'sup', 'span', 'br', 'img'],
  ALLOWED_ATTR: ['style', 'src', 'alt'],
}

// Keep only `color` in inline styles — drop background-color and everything
// else. Pasted content sometimes carries a near-white background that is
// invisible in light mode but shows as a white box in dark mode.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const el = node as HTMLElement
  if (el.nodeType === 1 && el.hasAttribute?.('style')) {
    const color = el.style.color
    el.removeAttribute('style')
    if (color) el.style.color = color
  }
})

// contentEditable creates a <div>/<p> per line (Enter). Those tags aren't in
// the allowlist, so DOMPurify would drop them and collapse everything onto one
// line. Convert each block boundary into a <br> (which is allowed) so line
// breaks survive rendering.
function blocksToBr(html: string): string {
  if (!html || (!/<div/i.test(html) && !/<p[\s>]/i.test(html))) return html
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  tmp.querySelectorAll('div, p').forEach((el) => {
    const parent = el.parentNode
    if (!parent) return
    // A block starts a new line, so the break belongs BEFORE it. Chrome leaves
    // the first typed line unwrapped and wraps only the ones after it, so
    // appending the break instead merged the first two lines together.
    if (!(parent === tmp && parent.firstChild === el)) {
      parent.insertBefore(document.createElement('br'), el)
    }
    // Chrome emits <div><br></div> for a blank line. The break just added is
    // that blank line; keeping the inner one too would double the gap.
    if (el.childNodes.length === 1 && el.firstChild!.nodeName === 'BR') el.firstChild!.remove()
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    el.remove()
  })
  return tmp.innerHTML.replace(/^(<br\s*\/?>)+/i, '').replace(/(<br\s*\/?>)+$/i, '')
}

// Render admin-authored rich text safely (sanitized HTML) in the student app.
//
// Mathematics is rendered after sanitising, and into the html string rather
// than into the mounted element: KaTeX emits markup DOMPurify's allowlist
// would strip, while the formula source is plain text the sanitiser leaves
// alone. Doing it during render rather than in an effect is what keeps it —
// a dangerouslySetInnerHTML subtree belongs to React, and any later commit
// resets it to whatever string it was last given.
export function RichText({ html, as = 'span', className, style }: {
  html: string
  as?: 'span' | 'div' | 'p'
  className?: string
  style?: React.CSSProperties
}) {
  const clean = DOMPurify.sanitize(blocksToBr(html ?? ''), CONFIG)
  // Memoised because this parses and walks the fragment: the exam room
  // re-renders every second, and the clock must not drag a KaTeX pass behind
  // it on every question on the page.
  const withMath = useMemo(() => renderMathToHtml(clean), [clean])
  const Tag = as as any
  return <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: withMath }} />
}
