import { z } from "zod";
import type { Exam, QuestionType } from "../generated/prisma/enums";
import { examSpec } from "./exams";

/**
 * What a correct answer is, and whether a candidate gave one.
 *
 * This is the one place that knows how each answer format is marked. Both
 * assessment routes call `evaluate()` rather than comparing anything
 * themselves, because they used to each hold their own copy of
 * `given === correctOption` and a second copy is how contests and mocks come
 * to disagree about what a right answer is.
 *
 * Single-choice questions keep their key in `questions.correct_option`,
 * exactly as before. MSQ and TITA keep theirs in `questions.answer_config`,
 * whose shapes are parsed here and nowhere else.
 */

export const OPTIONS = ["A", "B", "C", "D"] as const;
export type Option = (typeof OPTIONS)[number];

export const SINGLE_CHOICE_TYPES: QuestionType[] = ["STANDARD", "SYLLOGISM", "PASSAGE", "TABLE"];

export function isSingleChoice(type: QuestionType): boolean {
  return (SINGLE_CHOICE_TYPES as string[]).includes(type);
}

/** Several correct options, selected together. */
export interface MsqConfig {
  correct: Option[];
  /**
   * Off by default, which is all-or-nothing marking: the selection has to be
   * exactly right. With it on, a subset of the correct options scores pro
   * rata, and picking any wrong option still scores nothing.
   */
  partial: boolean;
}

/** No options at all — the candidate types the answer. */
export interface TitaConfig {
  kind: "NUMERIC" | "TEXT";
  /**
   * Every spelling that counts as right. More than one because "0.5" and
   * ".5" are the same number typed two ways, and a one-word answer may have
   * an accepted variant.
   */
  accepted: string[];
  /** NUMERIC only: absolute tolerance, for answers that do not divide evenly. */
  tolerance: number;
}

export type AnswerConfig = MsqConfig | TitaConfig;

export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

/**
 * Validates an admin-supplied answer key against the question's format.
 *
 * Strict on purpose. A malformed key is a question that can never be marked
 * right, and the only moment that is cheap to fix is before it is saved —
 * once it is on a live paper, the damage is a wrong score for everybody who
 * sat it.
 */
export function parseAnswerConfig(
  type: QuestionType,
  correctOption: unknown,
  raw: unknown,
): ParseResult<{ correctOption: string | null; answerConfig: AnswerConfig | null }> {
  if (isSingleChoice(type)) {
    const v = String(correctOption ?? "").toUpperCase();
    if (!(OPTIONS as readonly string[]).includes(v)) {
      return { ok: false, error: "Pick which of the four options is correct." };
    }
    return { ok: true, value: { correctOption: v, answerConfig: null } };
  }

  const cfg = (raw ?? {}) as Record<string, unknown>;

  if (type === "MSQ") {
    const list = Array.isArray(cfg["correct"]) ? (cfg["correct"] as unknown[]) : [];
    const correct = [...new Set(list.map((x) => String(x).toUpperCase()))].filter((x) =>
      (OPTIONS as readonly string[]).includes(x),
    ) as Option[];
    if (correct.length < 1) {
      return { ok: false, error: "A multiple-select question needs at least one correct option." };
    }
    if (correct.length === OPTIONS.length) {
      return { ok: false, error: "All four options cannot be correct — there would be nothing to choose." };
    }
    // Sorted so that two keys listing the same options compare equal, and so
    // the stored order never depends on the order the admin clicked them.
    correct.sort();
    return {
      ok: true,
      value: { correctOption: null, answerConfig: { correct, partial: cfg["partial"] === true } },
    };
  }

  if (type === "TITA") {
    const kind = String(cfg["kind"] ?? "NUMERIC").toUpperCase() === "TEXT" ? "TEXT" : "NUMERIC";
    const list = Array.isArray(cfg["accepted"]) ? (cfg["accepted"] as unknown[]) : [];
    const accepted = [...new Set(list.map((x) => String(x).trim()).filter(Boolean))];
    if (accepted.length < 1) {
      return { ok: false, error: "A type-in question needs at least one accepted answer." };
    }
    if (kind === "NUMERIC") {
      const bad = accepted.find((a) => !Number.isFinite(Number(a)));
      if (bad !== undefined) {
        return { ok: false, error: `"${bad}" is not a number. Switch the answer to text, or correct it.` };
      }
    }
    const tolRaw = Number(cfg["tolerance"] ?? 0);
    const tolerance = kind === "NUMERIC" && Number.isFinite(tolRaw) && tolRaw > 0 ? tolRaw : 0;
    return { ok: true, value: { correctOption: null, answerConfig: { kind, accepted, tolerance } } };
  }

  return { ok: false, error: `Unsupported question type "${type}".` };
}

/** What a candidate submits for one question. */
export type SubmittedAnswer = string | string[];

/**
 * Narrows raw JSON to an answer, or null if it is not one.
 *
 * Accepts a bare string and an array of strings, which is what makes stored
 * attempts from before MSQ existed still readable: they are all bare strings,
 * and nothing about them needs rewriting.
 */
export function asSubmittedAnswer(raw: unknown): SubmittedAnswer | null {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) return raw as string[];
  return null;
}

/** True when the candidate left the question alone — scored zero, not wrong. */
export function isBlank(answer: SubmittedAnswer | null | undefined): boolean {
  if (answer === null || answer === undefined) return true;
  if (Array.isArray(answer)) return answer.length === 0;
  return answer.trim() === "";
}

export interface Markable {
  questionType: QuestionType;
  exam: Exam;
  correctOption: string | null;
  answerConfig: unknown;
  marks: number;
  negativeMarks: number;
}

export interface Verdict {
  answered: boolean;
  correct: boolean;
  /** Signed: the marks to add, already negative where a penalty applies. */
  awarded: number;
}

const SKIPPED: Verdict = { answered: false, correct: false, awarded: 0 };

/** Case- and space-insensitive, and blind to a leading + or trailing zeroes. */
function textMatches(given: string, accepted: string[]): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const g = norm(given);
  return accepted.some((a) => norm(a) === g);
}

function numberMatches(given: string, accepted: string[], tolerance: number): boolean {
  const g = Number(given.trim());
  if (!Number.isFinite(g)) return false;
  return accepted.some((a) => {
    const want = Number(a);
    if (!Number.isFinite(want)) return false;
    // A zero tolerance still has to survive binary floating point: 0.1+0.2
    // typed as 0.3 is a right answer, and an exact compare would reject it.
    const slack = tolerance > 0 ? tolerance : Math.max(Math.abs(want), 1) * 1e-9;
    return Math.abs(g - want) <= slack;
  });
}

/**
 * Marks one answer.
 *
 * The penalty is suppressed for formats the exam does not penalise — CAT
 * applies none to TITA, where there are no options to guess between. That is
 * read from the exam rather than hard-coded so SSC's marking is untouched.
 */
export function evaluate(q: Markable, raw: unknown): Verdict {
  const given = asSubmittedAnswer(raw);
  if (given === null || isBlank(given)) return SKIPPED;

  const penalty = examSpec(q.exam).noPenaltyTypes.includes(q.questionType) ? 0 : q.negativeMarks;
  // `-penalty` would be negative zero where there is no penalty, which is
  // equal to zero everywhere except Object.is — including in a test assertion
  // and in a strict comparison against a stored score.
  const wrong: Verdict = { answered: true, correct: false, awarded: penalty === 0 ? 0 : -penalty };
  const right: Verdict = { answered: true, correct: true, awarded: q.marks };

  if (isSingleChoice(q.questionType)) {
    // An array where one option is expected is a malformed client, not a
    // right answer — marked wrong rather than thrown, because a submission
    // mid-contest must not fail on one bad field.
    if (Array.isArray(given)) return wrong;
    return given === q.correctOption ? right : wrong;
  }

  const cfg = q.answerConfig as AnswerConfig | null;
  // A question whose key never saved is unmarkable. Scoring it zero either
  // way is the only honest outcome: nobody is penalised for an answer the
  // platform cannot check.
  if (!cfg) return SKIPPED;

  if (q.questionType === "MSQ") {
    const want = (cfg as MsqConfig).correct ?? [];
    const got = [...new Set(Array.isArray(given) ? given : [given])].map((s) => s.toUpperCase());
    const hits = got.filter((g) => want.includes(g as Option)).length;
    const misses = got.length - hits;

    if (misses === 0 && hits === want.length) return right;
    if ((cfg as MsqConfig).partial && misses === 0 && hits > 0) {
      // Pro rata, and never negative — a partially right answer that scored
      // less than a blank one would make answering irrational.
      return { answered: true, correct: false, awarded: (q.marks * hits) / want.length };
    }
    return wrong;
  }

  if (q.questionType === "TITA") {
    const t = cfg as TitaConfig;
    const text = Array.isArray(given) ? (given[0] ?? "") : given;
    const hit =
      t.kind === "NUMERIC"
        ? numberMatches(text, t.accepted, t.tolerance)
        : textMatches(text, t.accepted);
    return hit ? right : wrong;
  }

  return SKIPPED;
}

/**
 * What a candidate may be shown of the key once a paper is revealable.
 * MSQ and TITA have no single letter, so a review screen needs this instead
 * of reading `correctOption` and finding null.
 */
export function revealAnswer(q: {
  questionType: QuestionType;
  correctOption: string | null;
  answerConfig: unknown;
}): { correctOption: string | null; correctOptions: string[] | null; acceptedAnswers: string[] | null } {
  if (isSingleChoice(q.questionType)) {
    return { correctOption: q.correctOption, correctOptions: null, acceptedAnswers: null };
  }
  const cfg = q.answerConfig as AnswerConfig | null;
  if (q.questionType === "MSQ") {
    return { correctOption: null, correctOptions: (cfg as MsqConfig)?.correct ?? [], acceptedAnswers: null };
  }
  if (q.questionType === "TITA") {
    return { correctOption: null, correctOptions: null, acceptedAnswers: (cfg as TitaConfig)?.accepted ?? [] };
  }
  return { correctOption: null, correctOptions: null, acceptedAnswers: null };
}

/**
 * Correctness alone, where the score is not wanted.
 *
 * A profile's per-topic breakdown counts right, wrong and skipped without
 * caring what the question was worth, and selecting marks it will not use
 * would mean joining the paper tables for nothing. Marking is still done by
 * `evaluate` so the two can never disagree about what counts as right.
 */
export function judge(
  q: Omit<Markable, "marks" | "negativeMarks">,
  raw: unknown,
): { answered: boolean; correct: boolean } {
  const { answered, correct } = evaluate({ ...q, marks: 1, negativeMarks: 0 }, raw);
  return { answered, correct };
}

/** The question columns marking needs — for a paper row's `include`. */
export const MARKABLE_SELECT = {
  id: true,
  questionType: true,
  exam: true,
  correctOption: true,
  answerConfig: true,
} as const;

/**
 * Pairs a question's answer key with what the paper pays for it.
 *
 * Marks live on the join row, not the question: the same question can be
 * worth 2 on an SSC mock and 3 on a CAT paper, and marking has to use the
 * paper's figure. Decimals arrive from Prisma as objects, so they are
 * coerced here rather than at each of the two call sites.
 */
export function markableOf(
  question: {
    questionType: QuestionType;
    exam: Exam;
    correctOption: string | null;
    answerConfig: unknown;
  },
  marks: unknown,
  negativeMarks: unknown,
): Markable {
  return {
    questionType: question.questionType,
    exam: question.exam,
    correctOption: question.correctOption,
    answerConfig: question.answerConfig,
    marks: Number(marks),
    negativeMarks: Number(negativeMarks),
  };
}

/**
 * What a submission body may contain.
 *
 * Deliberately looser than the old `z.enum(["A","B","C","D"])`: an answer is
 * now a letter, a list of letters, or typed text, and which of those is legal
 * depends on the question rather than on the request. The length caps are
 * there to bound the payload, not to check the answer — validating each field
 * against its question would mean rejecting an entire submission because one
 * answer looked odd, and losing a finished paper is far worse than marking
 * one question wrong. `evaluate` marks anything malformed as wrong.
 */
export const submittedAnswersSchema = z.record(
  z.string(),
  z.union([z.string().max(200), z.array(z.string().max(200)).max(8)]),
);

/**
 * Removes the answer key from a question on its way to a candidate.
 *
 * Both halves of the key have to go: `correctOption` for single-choice and
 * `answerConfig`, which for MSQ and TITA literally lists the right answers.
 * A paper in progress that shipped either one would hand the answers to
 * anyone reading the network tab.
 *
 * `inputKind` is what survives, and only for type-in questions: whether to
 * put a number pad or a keyboard in front of the candidate is not a hint,
 * and without it a mobile candidate types a numeric answer on a text
 * keyboard. Stripping lives in one function rather than at each select so
 * that a route added later cannot forget half of it.
 */
export function stripAnswerKey<T extends Record<string, unknown>>(
  q: T,
): Omit<T, "answerConfig" | "correctOption"> & { inputKind: "NUMERIC" | "TEXT" | null } {
  const { answerConfig, correctOption, ...rest } = q;
  void correctOption;
  const inputKind =
    q["questionType"] === "TITA"
      ? ((answerConfig as TitaConfig | null)?.kind ?? "NUMERIC")
      : null;
  return { ...rest, inputKind } as Omit<T, "answerConfig" | "correctOption"> & {
    inputKind: "NUMERIC" | "TEXT" | null;
  };
}
