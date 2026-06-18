import crypto from "crypto";

// Normalize text so trivial differences (case, whitespace, punctuation, and
// rich-text HTML markup) collapse to the same string — dedup works on the
// visible text, so "x<sup>3</sup>" and "x3" are treated as the same.
export function normalizeText(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ") // strip HTML tags
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // strip punctuation/symbols (keep letters, numbers, spaces)
    .replace(/\s+/g, " ")
    .trim();
}

// Exact-duplicate fingerprint: normalized question text + the normalized
// options sorted (so reordered options still match). md5 is fine for dedup.
export function computeFingerprint(
  text: string,
  options: [string, string, string, string]
): string {
  const normText = normalizeText(text);
  const normOpts = options.map(normalizeText).sort().join("|");
  return crypto.createHash("md5").update(`${normText}||${normOpts}`).digest("hex");
}
