import DOMPurify from 'dompurify'

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

// Render admin-authored rich text safely (sanitized HTML) in the student app.
export function RichText({ html, as = 'span', className, style }: {
  html: string
  as?: 'span' | 'div' | 'p'
  className?: string
  style?: React.CSSProperties
}) {
  const clean = DOMPurify.sanitize(html ?? '', CONFIG)
  const Tag = as as any
  return <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: clean }} />
}
