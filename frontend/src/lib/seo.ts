import { useEffect } from 'react'

const SITE = 'https://rankarenas.com'
const DEFAULT_IMAGE = `${SITE}/og-image.png`

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(url: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = url
}

/**
 * Per-route title, description, canonical URL and Open Graph tags.
 *
 * index.html carries only the home page's tags, so without this every route
 * shares them. Google re-reads the head after running our JS, which fixes
 * search results — but link-preview bots (WhatsApp, Twitter, LinkedIn) do not
 * execute JS, so they will still show the home page card until the app is
 * prerendered. See the SEO notes in system-design-phase1.md.
 */
export function usePageMeta(title: string, description?: string, opts?: {
  image?: string
  type?: 'website' | 'article'
}) {
  useEffect(() => {
    document.title = title

    const url = SITE + window.location.pathname
    const image = opts?.image ?? DEFAULT_IMAGE
    const type = opts?.type ?? 'website'

    setCanonical(url)
    setMeta('meta[property="og:title"]', 'property', 'og:title', title)
    setMeta('meta[property="og:url"]', 'property', 'og:url', url)
    setMeta('meta[property="og:type"]', 'property', 'og:type', type)
    setMeta('meta[property="og:image"]', 'property', 'og:image', image)
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title)
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image)

    if (description) {
      setMeta('meta[name="description"]', 'name', 'description', description)
      setMeta('meta[property="og:description"]', 'property', 'og:description', description)
      setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description)
    }
  }, [title, description, opts?.image, opts?.type])
}

/**
 * Attach a JSON-LD block for the current page, replacing any previous one.
 * Used by article pages so search engines can read author, dates and headline
 * without inferring them from the markup.
 */
export function useJsonLd(data: object | null) {
  useEffect(() => {
    const ID = 'page-jsonld'
    document.getElementById(ID)?.remove()
    if (!data) return

    const el = document.createElement('script')
    el.id = ID
    el.type = 'application/ld+json'
    el.textContent = JSON.stringify(data)
    document.head.appendChild(el)
    return () => { document.getElementById(ID)?.remove() }
  }, [JSON.stringify(data)])
}
