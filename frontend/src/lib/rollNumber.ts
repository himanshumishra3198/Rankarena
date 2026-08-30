/**
 * A stable roll number for a candidate in a paper.
 *
 * Real exam halls print one on the admit card; we have no such field, so it is
 * derived from the user and the paper instead. Derived rather than stored
 * because it carries no meaning of its own — it exists so the room reads like
 * the exam it is imitating, and so a candidate reporting a problem has
 * something concrete to quote.
 *
 * Deterministic: the same person always sees the same number for the same
 * paper, across reloads and devices. Twelve digits, matching the format
 * candidates will recognise.
 */
export function rollNumber(userId: string, paperId: string): string {
  // FNV-1a over the pair. Not security-sensitive — only stability and spread
  // matter, so a short non-cryptographic hash is the right tool.
  let h = 0x811c9dc5
  const seed = `${userId}:${paperId}`
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  // Two rounds widen 32 bits to the 12 digits the format needs.
  let h2 = h
  for (let i = 0; i < 4; i++) h2 = Math.imul(h2 ^ (h2 >>> 13), 0x85ebca6b) >>> 0

  const n = (BigInt(h) * 100000n + BigInt(h2 % 100000)) % 900000000000n + 100000000000n
  return n.toString()
}
