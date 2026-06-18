import DOMPurify from 'dompurify'

// Allowlist: only the inline formatting the admin editor can produce.
const CONFIG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'sub', 'sup', 'span', 'br'],
  ALLOWED_ATTR: ['style'],
}

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
