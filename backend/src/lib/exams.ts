import type { Exam, QuestionType, Subject } from "../generated/prisma/enums";

/**
 * What distinguishes one examination from another.
 *
 * The platform was built for SSC CGL, which meant four sections, four
 * options and one correct answer were baked in at every layer. Adding CAT
 * meant choosing between forking those layers per exam or describing the
 * differences as data. This file is that data: a section list, a set of legal
 * answer formats and the marking conventions, per exam.
 *
 * Everything that used to assume SSC reads this instead, so a third exam is a
 * new entry here plus its enum members — not a new code path through
 * scoring, validation, the question bank or the exam room.
 */

export interface SectionSpec {
  key: Subject;
  /** Full name, as a candidate would see it on the paper. */
  label: string;
  /** Column heading and chip text, where the full name will not fit. */
  short: string;
}

export interface ExamSpec {
  key: Exam;
  label: string;
  /** The order candidates meet the sections in, and sections unlock in. */
  sections: SectionSpec[];
  /** Answer formats an admin may choose when writing for this exam. */
  questionTypes: QuestionType[];
  /** What a fresh paper for this exam is pre-filled with. */
  defaults: {
    marks: number;
    negativeMarks: number;
    durationMinutes: number;
    /** Questions per section on a full-length paper. */
    sectionLimits: Partial<Record<Subject, number>>;
  };
  /**
   * CAT applies no penalty to a question with no options to guess between,
   * which is the one marking rule that genuinely differs between the two
   * exams rather than just being configured differently.
   */
  noPenaltyTypes: QuestionType[];
}

const SSC_SINGLE_CHOICE: QuestionType[] = ["STANDARD", "SYLLOGISM", "PASSAGE", "TABLE"];

export const EXAMS: Record<Exam, ExamSpec> = {
  SSC_CGL: {
    key: "SSC_CGL",
    label: "SSC CGL",
    sections: [
      { key: "REASONING", label: "General Intelligence & Reasoning", short: "Reasoning" },
      { key: "GK", label: "General Awareness", short: "GK" },
      { key: "QUANT", label: "Quantitative Aptitude", short: "Quant" },
      { key: "ENGLISH", label: "English Comprehension", short: "English" },
    ],
    questionTypes: SSC_SINGLE_CHOICE,
    defaults: {
      marks: 2,
      negativeMarks: 0.5,
      durationMinutes: 60,
      sectionLimits: { REASONING: 25, GK: 25, QUANT: 25, ENGLISH: 25 },
    },
    noPenaltyTypes: [],
  },
  CAT: {
    key: "CAT",
    label: "CAT",
    sections: [
      { key: "VARC", label: "Verbal Ability & Reading Comprehension", short: "VARC" },
      { key: "DILR", label: "Data Interpretation & Logical Reasoning", short: "DILR" },
      { key: "QA", label: "Quantitative Ability", short: "QA" },
    ],
    // CAT papers are mostly single-choice, with passage sets throughout VARC
    // and DILR, and a minority of TITA questions in every section. MSQ is not
    // on the current CAT pattern but is supported here because the question
    // bank is also used for practice, where it is useful.
    questionTypes: [...SSC_SINGLE_CHOICE, "MSQ", "TITA"],
    defaults: {
      marks: 3,
      negativeMarks: 1,
      // 40 minutes a section, as the real paper is sectionally timed.
      durationMinutes: 120,
      sectionLimits: { VARC: 24, DILR: 22, QA: 22 },
    },
    noPenaltyTypes: ["TITA"],
  },
};

export const EXAM_KEYS = Object.keys(EXAMS) as Exam[];
export const DEFAULT_EXAM: Exam = "SSC_CGL";

export function parseExam(value: unknown): Exam {
  const v = String(value ?? "").toUpperCase();
  return (EXAM_KEYS as string[]).includes(v) ? (v as Exam) : DEFAULT_EXAM;
}

/** Null when the value is absent or not an exam, for optional filters. */
export function parseExamOrNull(value: unknown): Exam | null {
  if (value === undefined || value === null || value === "") return null;
  const v = String(value).toUpperCase();
  return (EXAM_KEYS as string[]).includes(v) ? (v as Exam) : null;
}

export function examSpec(exam: Exam): ExamSpec {
  return EXAMS[exam] ?? EXAMS[DEFAULT_EXAM];
}

export function examSections(exam: Exam): Subject[] {
  return examSpec(exam).sections.map((s) => s.key);
}

/**
 * Whether a section belongs to an exam.
 *
 * The guard that keeps the two syllabuses from mixing: a CAT question cannot
 * be filed under GK, and an SSC paper cannot ask for a VARC section, even
 * though both are members of the same `Subject` enum.
 */
export function isExamSection(exam: Exam, subject: Subject | string): boolean {
  return (examSections(exam) as string[]).includes(String(subject));
}

export function isExamQuestionType(exam: Exam, type: QuestionType | string): boolean {
  return (examSpec(exam).questionTypes as string[]).includes(String(type));
}

/** The exam a section belongs to, for labelling a question whose exam is implied. */
export function examOfSection(subject: Subject | string): Exam | null {
  for (const exam of EXAM_KEYS) {
    if (isExamSection(exam, subject)) return exam;
  }
  return null;
}

export function sectionLabel(subject: Subject | string): string {
  for (const exam of EXAM_KEYS) {
    const hit = examSpec(exam).sections.find((s) => s.key === subject);
    if (hit) return hit.label;
  }
  return String(subject);
}

export function sectionShort(subject: Subject | string): string {
  for (const exam of EXAM_KEYS) {
    const hit = examSpec(exam).sections.find((s) => s.key === subject);
    if (hit) return hit.short;
  }
  return String(subject);
}
