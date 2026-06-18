import crypto from "crypto";

// Normalize text so trivial differences (case, whitespace, punctuation)
// collapse to the same string. Kept deliberately simple and deterministic.
export function normalizeText(s: string): string {
  return s
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
