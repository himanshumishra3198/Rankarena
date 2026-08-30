import { useState } from 'react'

const KEY = 'examPaletteCollapsed'

/**
 * Whether the question palette is collapsed, remembered across papers.
 *
 * Persisted rather than reset per attempt: collapsing it is a statement about
 * the screen you are on — a narrow laptop, a phone with a 100-question grid
 * pushing the question below the fold — and none of that changes between one
 * paper and the next. Getting the panel back on every reload would mean
 * collapsing it again every time.
 */
export function usePaletteCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(KEY, next ? '1' : '0') } catch { /* storage disabled */ }
  }

  return [collapsed, toggle]
}
