import { Language } from "../generated/prisma/enums";

/**
 * Presenting a question in the language a candidate chose.
 *
 * English is the default and lives in the base columns on `questions` and
 * `passages`. Every other language is a row in `question_translations` /
 * `passage_translations`. Nothing here is Hindi-specific: adding a language
 * means a new enum member and rows, not new code paths.
 *
 * What a translation may carry is deliberately limited to what a reader sees.
 * The correct option, subject, difficulty and marks stay on the question, so a
 * Hindi candidate and an English one are answering the same paper and can be
 * ranked against each other — the presentation differs, the exam does not.
 */

export const DEFAULT_LANGUAGE: Language = "EN";
export const LANGUAGES: Language[] = ["EN", "HI"];

export function parseLanguage(value: unknown): Language {
  const v = String(value ?? "").toUpperCase();
  return (LANGUAGES as string[]).includes(v) ? (v as Language) : DEFAULT_LANGUAGE;
}

/** The select needed to resolve a question into one language. */
export function translationSelect(language: Language) {
  // Filtered in the query rather than in JS: for EN we fetch nothing at all,
  // and for any other language only the one row we are about to use — never
  // every translation of every question.
  return language === DEFAULT_LANGUAGE
    ? undefined
    : ({
        where: { language },
        select: {
          text: true, optionA: true, optionB: true, optionC: true, optionD: true,
          solution: true, structuredData: true,
        },
        take: 1,
      } as const);
}

export function passageTranslationSelect(language: Language) {
  return language === DEFAULT_LANGUAGE
    ? undefined
    : ({
        where: { language },
        select: { title: true, content: true, tableData: true },
        take: 1,
      } as const);
}

interface BaseQuestion {
  text: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  solution?: string | null;
  structuredData?: unknown;
  translations?: {
    text: string;
    optionA: string; optionB: string; optionC: string; optionD: string;
    solution?: string | null;
    structuredData?: unknown;
  }[];
  passage?: {
    title: string; content: string; tableData?: unknown;
    translations?: { title: string; content: string; tableData?: unknown }[];
  } | null;
}

/**
 * Swaps the readable fields for the chosen language and drops the raw
 * translation rows from the payload.
 *
 * `translated` is false when the requested language has no row, and the
 * English text is returned instead. Falling back rather than blanking is
 * deliberate: a candidate mid-exam is better served by a question they might
 * still be able to read than by an empty card, and the flag lets the client
 * say so plainly.
 */
export function localizeQuestion<T extends BaseQuestion>(
  question: T,
  language: Language,
): Omit<T, "translations"> & { language: Language; translated: boolean } {
  const { translations, passage, ...rest } = question as BaseQuestion & Record<string, unknown>;
  const t = translations?.[0];

  const localizedPassage = passage
    ? (() => {
        const { translations: pts, ...pRest } = passage;
        const pt = pts?.[0];
        return {
          ...pRest,
          title: pt?.title ?? pRest.title,
          content: pt?.content ?? pRest.content,
          tableData: pt?.tableData ?? pRest.tableData,
          translated: !!pt,
        };
      })()
    : passage;

  const out = {
    ...rest,
    ...(t
      ? {
          text: t.text,
          optionA: t.optionA, optionB: t.optionB, optionC: t.optionC, optionD: t.optionD,
          // A translated question with no translated solution keeps the
          // English one rather than losing the explanation entirely.
          solution: t.solution ?? question.solution ?? null,
          structuredData: t.structuredData ?? question.structuredData ?? null,
        }
      : {}),
    passage: localizedPassage,
    language,
    // English is always "translated" — it is the source, not a fallback.
    translated: language === DEFAULT_LANGUAGE || !!t,
  };
  return out as unknown as Omit<T, "translations"> & { language: Language; translated: boolean };
}

export function localizeQuestions<T extends BaseQuestion>(questions: T[], language: Language) {
  return questions.map((q) => localizeQuestion(q, language));
}
