import DOMPurify from 'dompurify'

// Allowlist: only the inline formatting our editor can produce.
const CONFIG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'sub', 'sup', 'span', 'br'],
  ALLOWED_ATTR: ['style'],
}

// Render admin/user-authored rich text safely (sanitized HTML).
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
