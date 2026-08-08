/**
 * Analytics for a single-page app.
 *
 * Two things need handling that a plain snippet doesn't do:
 *  1. Client-side navigation fires no page load, so GA4 sees one pageview per
 *     session unless routes are reported manually.
 *  2. The measurement id is build-time config, so the tag is only injected
 *     when VITE_GA_ID is set. With it unset — local dev, previews — nothing
 *     loads and no requests leave the browser.
 */

const GA_ID = import.meta.env.VITE_GA_ID as string | undefined

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let loaded = false

/** Injects gtag.js once, on first call. Safe to call when unconfigured. */
export function initAnalytics() {
  if (loaded || !GA_ID) return
  loaded = true

  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(s)

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // gtag relies on `arguments`, so this cannot be a rest-parameter arrow.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }
  window.gtag('js', new Date())
  // Routes are reported explicitly below, so the automatic one is turned off
  // to avoid double-counting the first view.
  window.gtag('config', GA_ID, { send_page_view: false })
}

/** Report a route change. Title is read after React has set it. */
export function trackPageView(path: string) {
  if (!GA_ID || !window.gtag) return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

/** Report a named action, e.g. trackEvent('contest_registered', { id }). */
export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  if (!GA_ID || !window.gtag) return
  window.gtag('event', name, params)
}
