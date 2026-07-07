import DOMPurify from 'dompurify'

// Allowlist: inline formatting + inline images our editor can produce.
const CONFIG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'sub', 'sup', 'span', 'br', 'img'],
  ALLOWED_ATTR: ['style', 'src', 'alt'],
}

// Keep only `color` in inline styles — drop background-color (pasted content
// can carry a near-white background that shows as a box in dark mode).
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
    el.parentNode?.insertBefore(document.createElement('br'), el.nextSibling)
    while (el.firstChild) el.parentNode!.insertBefore(el.firstChild, el)
    el.remove()
  })
  return tmp.innerHTML.replace(/(<br\s*\/?>)+$/i, '')
}

// Render admin/user-authored rich text safely (sanitized HTML).
export function RichText({ html, as = 'span', className, style }: {
  html: string
  as?: 'span' | 'div' | 'p'
  className?: string
  style?: React.CSSProperties
}) {
  const clean = DOMPurify.sanitize(blocksToBr(html ?? ''), CONFIG)
  const Tag = as as any
  return <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: clean }} />
}

// Plain-text version for dropdowns, slicing, and other non-HTML contexts.
export function stripHtml(html: string): string {
  return (html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}
