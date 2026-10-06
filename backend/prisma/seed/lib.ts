// Shared types and helpers for the seed's question generators.
import type { Difficulty, QuestionType, Subject } from "../../src/generated/prisma/enums";

export type Option = "A" | "B" | "C" | "D";
export const OPTIONS: Option[] = ["A", "B", "C", "D"];
export type Four = [string, string, string, string];

export interface Translation {
  text: string;
  options: Four;
  solution?: string;
  structuredData?: { statements: string[]; conclusions: string[] };
}

export interface SeedQuestion {
  key: string;
  subject: Subject;
  topic: string | null;
  difficulty: Difficulty;
  text: string;
  options: Four;
  correct: Option;
  solution?: string;
  type?: QuestionType;
  passage?: string;
  structuredData?: { statements: string[]; conclusions: string[] };
  hi?: Translation;
}

/** A generated question before it is given a key and subject. */
export type Draft = Omit<SeedQuestion, "key" | "subject">;

// ── Deterministic randomness ────────────────────────────────────────────────
// Seeded so every developer gets the same questions, answers, scores and ranks.

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = mulberry32(20260601);
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
export const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
export function shuffle<T>(xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Formatting ──────────────────────────────────────────────────────────────

export const p = (s: string) => `<p>${s}</p>`;
export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
export const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

// ── Options ─────────────────────────────────────────────────────────────────

/**
 * Places the right answer among three wrong ones at a seeded position.
 *
 * Works on any value so a question can carry an English and a Hindi label per
 * option and keep them in the same order — a translation may change how an
 * option reads, never which letter is correct.
 */
export function mcqOf<T>(right: T, wrong: T[], label: (t: T) => string): { items: T[]; correct: Option } {
  const seen = new Set([label(right)]);
  const distinct: T[] = [];
  for (const w of wrong) {
    if (seen.has(label(w))) continue;
    seen.add(label(w));
    distinct.push(w);
  }
  if (distinct.length < 3) throw new Error(`Need three distinct wrong options for "${label(right)}"`);
  const items = shuffle(distinct).slice(0, 3);
  const pos = Math.floor(rand() * 4);
  items.splice(pos, 0, right);
  return { items, correct: OPTIONS[pos] };
}

export function mcq(right: string, wrong: string[]): { options: Four; correct: Option } {
  const { items, correct } = mcqOf(right, wrong, (s) => s);
  return { options: items as Four, correct };
}

/** Wrong answers a step or two either side of a numeric answer. */
export function nearBy(n: number): number[] {
  const s = Math.max(1, Math.round(Math.abs(n) / 10));
  return [n - 2 * s, n - s, n + s, n + 2 * s, n + 3 * s].filter((x) => x > 0 && x !== n);
}

/**
 * A numeric question whose options read the same in both languages.
 * `hi` is the Hindi wording of the question, or null for English only.
 */
export function numeric(
  topic: string,
  difficulty: Difficulty,
  en: string,
  hi: string | null,
  right: string,
  wrong: string[],
  solution?: string
): Draft {
  const { options, correct } = mcq(right, wrong);
  return {
    topic,
    difficulty,
    text: p(en),
    options,
    correct,
    solution: solution ? p(solution) : undefined,
    hi: hi ? { text: p(hi), options } : undefined,
  };
}

/** Calls `make` until it has produced `count` distinct questions. */
export function unique(count: number, make: () => Draft): Draft[] {
  const out: Draft[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < count && tries < count * 50; tries++) {
    const d = make();
    // Syllogisms share one prompt; what tells them apart is the statements.
    const k = d.text + JSON.stringify(d.structuredData ?? null);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

/**
 * One question per item of a fact list, the wrong options drawn from the
 * other items' answers — the way a question setter builds "capital of"
 * questions from one table.
 */
export function family<T>(
  items: T[],
  topic: string,
  difficulty: Difficulty,
  question: (t: T) => string,
  answer: (t: T) => string
): Draft[] {
  return items.map((it) => {
    const right = answer(it);
    const { options, correct } = mcq(right, items.map(answer).filter((a) => a !== right));
    return { topic, difficulty, text: p(question(it)), options, correct };
  });
}

/** Interleaves several lists so that consecutive picks come from different ones. */
export function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}
