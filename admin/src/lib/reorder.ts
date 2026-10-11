import api from './api'

/**
 * Putting a paper in the order the candidate will meet it.
 *
 * Until now `displayOrder` was written once, when a question was added, and
 * never again — so fixing an order meant removing questions and adding them
 * back in the right sequence. These helpers back a drag handle and a pair of
 * move buttons instead.
 */

/** Moves one entry to a new index, returning a new array. */
export function moveTo<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(items.length - 1, to)), 0, moved)
  return next
}

/**
 * Persists the whole order in one request.
 *
 * The server takes the complete list rather than a pair to swap, so a drag
 * across several rows is one atomic write and cannot half-apply.
 */
export async function saveOrder(
  kind: 'mocks' | 'contests',
  paperId: string,
  questionIds: string[],
): Promise<void> {
  await api.patch(`/admin/${kind}/${paperId}/questions/order`, { questionIds })
}

interface HasPassage {
  questionId: string
  question: { passage?: { id: string; title?: string; content?: string } | null }
}

/**
 * Something recognisable to call a passage.
 *
 * A title is optional and in practice usually blank, so "Untitled passage"
 * would name every one of them — useless in a warning whose whole job is to
 * say *which* set is split.
 */
function nameOf(p: { title?: string; content?: string }): string {
  const t = p.title?.trim()
  if (t) return t
  const body = (p.content ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return body ? `“${body.slice(0, 44)}${body.length > 44 ? '…' : ''}”` : 'an untitled passage'
}

/**
 * The passage sets on this paper whose questions are not sitting together.
 *
 * Worth saying out loud: a mock test is served in exactly this order, so a
 * split set means a candidate reads the same comprehension twice, pages
 * apart. A contest reshuffles anyway and keeps each set whole, so there the
 * split is only an authoring annoyance — but the warning is the same, since
 * the same question bank feeds both.
 */
export function splitPassageSets(rows: HasPassage[]): { id: string; title: string; count: number }[] {
  const seen = new Map<string, { first: number; last: number; count: number; title: string }>()
  rows.forEach((r, i) => {
    const p = r.question.passage
    if (!p?.id) return
    const prev = seen.get(p.id)
    if (prev) { prev.last = i; prev.count++ }
    else seen.set(p.id, { first: i, last: i, count: 1, title: nameOf(p) })
  })
  return [...seen.entries()]
    // Contiguous means the span covers exactly as many rows as the set has.
    .filter(([, v]) => v.last - v.first + 1 !== v.count)
    .map(([id, v]) => ({ id, title: v.title, count: v.count }))
}
