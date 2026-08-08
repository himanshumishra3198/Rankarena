import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { initAnalytics, trackPageView } from '../lib/analytics'

/**
 * Reports a pageview on every route change. Rendered once inside the router;
 * renders nothing itself.
 */
export default function AnalyticsTracker() {
  const location = useLocation()

  useEffect(() => { initAnalytics() }, [])

  useEffect(() => {
    // A tick's delay lets usePageMeta set document.title first, so the report
    // carries the page's own title rather than the previous one.
    const t = setTimeout(() => trackPageView(location.pathname + location.search), 0)
    return () => clearTimeout(t)
  }, [location.pathname, location.search])

  return null
}
