/**
 * Mock tests in progress, read back out of the browser.
 *
 * A mock has no server-side state until it is submitted — MockRoom keeps the
 * running paper under `mockDraft:<id>` in localStorage and clears it on
 * submit. So "continue where you left off" is answerable without any new
 * API: whatever drafts are sitting here are exactly the unfinished papers.
 * It is per-device by nature, which is the honest limit of the feature.
 */

const PREFIX = 'mockDraft:'

export interface MockDraft {
  mockTestId: string
  answered: number
  currentIdx: number
  timeLeft: number
  savedAt: number
  paused: boolean
}

export function readDrafts(): MockDraft[] {
  const out: MockDraft[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(PREFIX)) continue
      try {
        const d = JSON.parse(localStorage.getItem(key) || '')
        if (!d || typeof d !== 'object' || !d.answers) continue
        out.push({
          mockTestId: key.slice(PREFIX.length),
          answered: Object.keys(d.answers).length,
          currentIdx: d.currentIdx ?? 0,
          timeLeft: d.timeLeft ?? 0,
          savedAt: d.savedAt ?? 0,
          paused: !!d.paused,
        })
      } catch { /* a corrupt draft is not worth failing the page over */ }
    }
  } catch { /* storage blocked — the section simply doesn't appear */ }
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

export function discardDraft(mockTestId: string) {
  try { localStorage.removeItem(PREFIX + mockTestId) } catch { /* noop */ }
}
