import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Motion helpers shared by the landing sections.
 *
 * Everything here is plain CSS + rAF — the app has no animation library and
 * a marketing page is a poor reason to add one. Every hook checks
 * `prefers-reduced-motion` and degrades to the finished state rather than
 * animating, so the page never moves for someone who asked it not to.
 */

export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Adds `is-in` to an element the first time it scrolls into view, which is
 * what the CSS reveal transitions key off. One-shot: sections do not
 * re-animate when you scroll back up, which reads as jitter.
 *
 * A callback ref, not a plain one with a mount effect. Several sections
 * render nothing until their data arrives (a featured contest, a
 * recommendation list) — with an effect keyed on `[]` the observer was
 * attached once while the element did not exist yet and never again once it
 * did, so the section mounted at opacity 0 and stayed invisible for good.
 * A callback ref fires whenever the node actually attaches.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const io = useRef<IntersectionObserver | null>(null)
  useEffect(() => () => io.current?.disconnect(), [])

  return useCallback((node: T | null) => {
    io.current?.disconnect()
    if (!node) return
    if (prefersReducedMotion()) { node.classList.add('is-in'); return }
    io.current = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.current?.unobserve(e.target) }
      }),
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    )
    io.current.observe(node)
  }, [])
}

/**
 * Counts up to `value` once the element is on screen.
 *
 * Starts from zero only on the first reveal; if the number arrives later
 * (the stats request resolving after the section is already visible) it
 * animates from whatever is on screen to the new figure instead of snapping.
 */
export function useCountUp(value: number, duration = 1100) {
  const [shown, setShown] = useState(0)
  const ref = useRef<HTMLSpanElement | null>(null)
  const seen = useRef(false)
  const from = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) { setShown(value); return }

    const run = () => {
      const start = performance.now()
      const a = from.current
      const b = value
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1)
        // easeOutCubic: fast first, settles on the number rather than racing to it
        const eased = 1 - Math.pow(1 - t, 3)
        setShown(Math.round(a + (b - a) * eased))
        if (t < 1) requestAnimationFrame(tick)
        else from.current = b
      }
      requestAnimationFrame(tick)
    }

    if (seen.current) { run(); return }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { seen.current = true; run(); io.disconnect() }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [value, duration])

  return { ref, shown }
}

/** ms remaining until `iso`, ticking every second. Null when there is no target. */
export function useCountdown(iso: string | null | undefined) {
  const target = iso ? new Date(iso).getTime() : null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!target) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [target])
  if (!target) return null
  return Math.max(0, target - now)
}

/** Splits a duration into zero-padded dd/hh/mm/ss parts. */
export function splitDuration(ms: number) {
  const total = Math.floor(ms / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    days: Math.floor(total / 86400),
    hh: pad(Math.floor((total % 86400) / 3600)),
    mm: pad(Math.floor((total % 3600) / 60)),
    ss: pad(total % 60),
  }
}

/** True once the page has scrolled past `offset` — drives the sticky nav. */
export function useScrolled(offset = 12) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [offset])
  return scrolled
}

/** 1284 -> "1,284" in the Indian grouping the rest of the app uses. */
export function formatCount(n: number) {
  return n.toLocaleString('en-IN')
}
