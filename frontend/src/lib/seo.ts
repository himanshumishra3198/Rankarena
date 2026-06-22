import { useEffect } from 'react'

// Per-route document title + meta description for this SPA. Google executes
// JS and indexes the rendered DOM, so updating these on navigation helps.
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title
    if (description) {
      let m = document.querySelector('meta[name="description"]')
      if (!m) {
        m = document.createElement('meta')
        m.setAttribute('name', 'description')
        document.head.appendChild(m)
      }
      m.setAttribute('content', description)
    }
  }, [title, description])
}
