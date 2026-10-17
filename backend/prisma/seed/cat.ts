/**
 * CAT sample data: two contests, sectional mocks and the attempts on them.
 *
 * Built on the same rules as the SSC data in index.ts — every paper gets its
 * own questions, and the scheduled contest and the unpublished mock hold
 * questions found nowhere else — plus what CAT adds: sections VARC, DILR and
 * QA in that order, +3 / −1 marking with no penalty on type-in (TITA)
 * questions, passage sets of four kept together on the paper, a few
 * multiple-select questions in practice mocks only, and tags instead of the
 * SSC topic string.
 *
 * Marks, penalties and the answer-key checks come from src/lib, not from
 * copies here, so the seed cannot drift from what the app actually does.
 * Attempts are scored with the app's own evaluate().
 */
import prisma from "../../src/lib/prisma";
import redis from "../../src/lib/redis";
import { settleContest } from "../../src/lib/settleContest";
import { computeFingerprint } from "../../src/lib/fingerprint";
import { evaluate, markableOf, parseAnswerConfig } from "../../src/lib/answers";
import { examSpec } from "../../src/lib/exams";
import { seedTagVocabulary } from "../../src/scripts/seedTags";
import { Prisma } from "../../src/generated/prisma/client";
import type { QuestionType, Subject } from "../../src/generated/prisma/enums";
import { between, interleave, OPTIONS, pick, rand, type CatDraft, type CatQuestion, type CatSet, type Four, type SeedPassage } from "./lib";
import { catOddOneOut, catParaJumbles, catParaSummaries, catRcSets } from "./cat-varc";
import { catDilrSets } from "./cat-dilr";
import { catQaFamilies, catQaMsq } from "./cat-qa";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const CAT = examSpec("CAT");
const MARKS = CAT.defaults.marks;
const NEGATIVE = CAT.defaults.negativeMarks;

type Section = CatQuestion["subject"];

interface Paper {
  key: string;
  title: string;
  minutes: number;
  questions: CatQuestion[];
}

// ── Building the papers ─────────────────────────────────────────────────────

function planPapers() {
  const rc = catRcSets(), jumbles = catParaJumbles(), odd = catOddOneOut(), summaries = catParaSummaries();
  const dilr = catDilrSets();
  const qa = interleave(catQaFamilies());
  const msq = catQaMsq();

  const passages = new Map<string, SeedPassage>();
  let n = 0;
  const one = (subject: Section, d: CatDraft, passage?: string): CatQuestion =>
    ({ ...d, subject, passage, key: `cat-${subject.toLowerCase()}-${++n}` });
  const set = (subject: Section, s: CatSet): CatQuestion[] => {
    const key = `cat-${subject.toLowerCase()}-set-${passages.size + 1}`;
    passages.set(key, s.passage);
    return s.questions.map((d) => one(subject, d, key));
  };
  const take = <T>(xs: T[], count: number): T[] => {
    if (xs.length < count) throw new Error("Ran out of CAT seed questions. Add more to the cat-*.ts files.");
    return xs.splice(0, count);
  };

  // Eight a section: a reading passage, two para jumbles, an odd one out and
  // a summary; two DILR sets of four; eight QA questions.
  const varc = () => [
    ...set("VARC", take(rc, 1)[0]),
    ...take(jumbles, 2).map((d) => one("VARC", d)),
    one("VARC", take(odd, 1)[0]),
    one("VARC", take(summaries, 1)[0]),
  ];
  const dilrSection = () => take(dilr, 2).flatMap((s) => set("DILR", s));
  const qaSection = (count: number) => take(qa, count).map((d) => one("QA", d));

  const contest1 = [...varc(), ...dilrSection(), ...qaSection(8)];
  const varcMock = varc();
  const dilrMock = dilrSection();
  // One multiple-select question, and one question left untagged, as real
  // banks have gaps.
  const qaMock = [...qaSection(7), one("QA", take(msq, 1)[0])];
  qaMock[2] = { ...qaMock[2], topic: null, subtopic: undefined, skill: undefined };
  const qaDraft = qaSection(6);
  const contest2 = [...varc(), ...dilrSection(), ...qaSection(8)];
  // Left in the bank, in no paper.
  const extras = [
    ...jumbles.map((d) => one("VARC", d)), ...odd.map((d) => one("VARC", d)), ...summaries.map((d) => one("VARC", d)),
    ...dilr.flatMap((s) => set("DILR", s)),
    ...qaSection(3), ...msq.map((d) => one("QA", d)),
  ];

  const contests: Paper[] = [
    { key: "cat-1", title: "CAT Contest 1", minutes: 45, questions: contest1 },
    { key: "cat-2", title: "CAT Contest 2", minutes: 45, questions: contest2 },
  ];
  const mocks: (Paper & { subject: Subject; published: boolean })[] = [
    { key: "VARC-1", title: "CAT VARC Sectional Test - 1", subject: "VARC", minutes: 15, published: true, questions: varcMock },
    { key: "DILR-1", title: "CAT DILR Sectional Test - 1", subject: "DILR", minutes: 15, published: true, questions: dilrMock },
    { key: "QA-1", title: "CAT QA Sectional Test - 1", subject: "QA", minutes: 15, published: true, questions: qaMock },
    // Unpublished: its questions must never reach practice.
    { key: "QA-2", title: "CAT QA Sectional Test - 2", subject: "QA", minutes: 12, published: false, questions: qaDraft },
  ];
  return { passages, contests, mocks, extras };
}

// ── Attempts ────────────────────────────────────────────────────────────────

type Answer = string | string[];
type Stored = { id: string; questionType: QuestionType; correctOption: string | null; answerConfig: unknown };
type QIds = Map<string, Stored>;

/** A plausible wrong answer in the question's own format. */
function wrongAnswer(q: CatQuestion): Answer {
  if (q.msq) {
    // Dropping one right option, or swapping it for a wrong one: both are
    // marked wrong under all-or-nothing marking.
    return q.msq.length > 1 ? q.msq.slice(1) : [pick(OPTIONS.filter((o) => o !== q.msq![0]))];
  }
  if (q.tita) {
    const right = q.tita.accepted[0];
    if (q.topic === "Para Jumbles" || /^[1-4]{4}$/.test(right)) {
      const d = right.split("");
      [d[0], d[1]] = [d[1], d[0]];
      return d.join("");
    }
    if (q.topic === "Odd Sentence Out") return String(pick([1, 2, 3, 4, 5].filter((x) => String(x) !== right)));
    return String(Number(right) + pick([-2, -1, 1, 2, 3]));
  }
  return pick(OPTIONS.filter((o) => o !== q.correct));
}

function rightAnswer(q: CatQuestion): Answer {
  if (q.msq) return [...q.msq];
  if (q.tita) return q.tita.accepted[0];
  return q.correct!;
}

/** One candidate's answers to a paper. Type-in questions are skipped more and got right less. */
function answerPaper(questions: CatQuestion[], ids: QIds, skill: number, minutes: number) {
  const answers: Record<string, Answer> = {};
  const timeSpent: Record<string, number> = {};
  const avg = (minutes * 60) / questions.length;
  for (const q of questions) {
    const { id } = ids.get(q.key)!;
    timeSpent[id] = between(Math.round(avg * 0.4), Math.round(avg * 1.2));
    if (rand() < (q.tita ? 0.25 : 0.12)) continue;
    answers[id] = rand() < (q.tita ? skill * 0.85 : skill) ? rightAnswer(q) : wrongAnswer(q);
  }
  return { answers, timeSpent };
}

/** Scored by the app's own marker, so TITA's missing penalty and MSQ's all-or-nothing rule apply as they do live. */
function score(questions: CatQuestion[], ids: QIds, answers: Record<string, Answer>) {
  let s = 0, correct = 0, wrong = 0, skipped = 0;
  for (const q of questions) {
    const stored = ids.get(q.key)!;
    const v = evaluate(markableOf({ ...stored, exam: "CAT" }, MARKS, NEGATIVE), answers[stored.id]);
    s += v.awarded;
    if (!v.answered) skipped++;
    else if (v.correct) correct++;
    else wrong++;
  }
  return { score: Math.max(0, s), totalMarks: questions.length * MARKS, correct, wrong, skipped };
}

// ── Seeding ─────────────────────────────────────────────────────────────────

interface Context {
  admin: { id: string };
  students: { id: string }[];
  skills: readonly number[];
  /** A moment relative to when the seed started. */
  at: (offsetMs: number) => Date;
}

export async function seedCat({ admin, students, skills, at }: Context) {
  const { passages, contests: contestPlans, mocks: mockPlans, extras } = planPapers();

  // The tag vocabulary production is seeded with on deploy. CAT questions are
  // filed under it instead of a topic string.
  await seedTagVocabulary();
  const tagRows = await prisma.tag.findMany({ select: { id: true, name: true, category: true } });
  const tagId = (category: string, name: string) => {
    const t = tagRows.find((r) => r.category === category && r.name === name);
    if (!t) throw new Error(`No ${category} tag named "${name}". Add it to src/scripts/seedTags.ts or fix the seed.`);
    return t.id;
  };

  const passageIds = new Map<string, string>();
  for (const [key, ps] of passages) {
    const row = await prisma.passage.create({
      data: { title: ps.title, content: ps.content, type: ps.type, tableData: ps.tableData ?? Prisma.JsonNull },
    });
    passageIds.set(key, row.id);
  }

  const qIds: QIds = new Map();
  for (const q of [...contestPlans, ...mockPlans].flatMap((paper) => paper.questions).concat(extras)) {
    // The admin form's own validation, so every seeded key is one an admin
    // could have saved.
    const key = parseAnswerConfig(q.type, q.correct, q.msq ? { correct: q.msq } : q.tita);
    if (!key.ok) throw new Error(`Seed question ${q.key} has an invalid answer key: ${key.error}`);
    const options: Four = q.options ?? ["", "", "", ""];
    const tags = [
      q.topic && tagId("TOPIC", q.topic),
      q.subtopic && tagId("SUBTOPIC", q.subtopic),
      q.skill && tagId("SKILL", q.skill),
    ].filter((t): t is string => !!t);

    const row = await prisma.question.create({
      data: {
        exam: "CAT",
        subject: q.subject,
        questionType: q.type,
        text: q.text,
        optionA: options[0], optionB: options[1], optionC: options[2], optionD: options[3],
        correctOption: key.value!.correctOption,
        answerConfig: (key.value!.answerConfig as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
        difficulty: q.difficulty,
        solution: q.solution ?? null,
        passageId: q.passage ? passageIds.get(q.passage)! : null,
        fingerprint: computeFingerprint(q.text, options),
        tags: { create: tags.map((id) => ({ tagId: id })) },
      },
    });
    qIds.set(q.key, { id: row.id, questionType: q.type, correctOption: row.correctOption, answerConfig: row.answerConfig });
  }

  const paperQuestions = (paper: Paper) =>
    paper.questions.map((q, i) => ({ questionId: qIds.get(q.key)!.id, displayOrder: i + 1, marks: MARKS, negativeMarks: NEGATIVE }));

  // Contests. sectionLimits is left unset, as on the SSC contests, so the
  // room splits the time equally between the three sections.
  const contestTimes: Record<string, { start: Date; status: "LIVE" | "SCHEDULED"; announced: Date }> = {
    // Written as LIVE with its window closed; settleContest() ends it.
    "cat-1": { start: at(-1 * DAY), status: "LIVE", announced: at(-3 * DAY) },
    "cat-2": { start: at(3 * DAY), status: "SCHEDULED", announced: at(-2 * HOUR) },
  };
  const contests = new Map<string, { id: string; startTime: Date; plan: Paper }>();
  for (const plan of contestPlans) {
    const t = contestTimes[plan.key];
    const row = await prisma.contest.create({
      data: {
        title: plan.title, exam: "CAT", startTime: t.start, durationMinutes: plan.minutes, negativeMarks: NEGATIVE,
        status: t.status, announcedAt: t.announced,
        contestQuestions: { create: paperQuestions(plan) },
      },
    });
    contests.set(plan.key, { id: row.id, startTime: row.startTime, plan });
  }

  const mocks = new Map<string, { id: string; plan: Paper }>();
  for (const plan of mockPlans) {
    const row = await prisma.mockTest.create({
      data: {
        title: plan.title, exam: "CAT", subject: plan.subject, durationMinutes: plan.minutes, negativeMarks: NEGATIVE,
        isPublished: plan.published,
        mockTestQuestions: { create: paperQuestions(plan) },
      },
    });
    mocks.set(plan.key, { id: row.id, plan });
  }

  // Contest 1: six students and an admin test run, then settled. It is the
  // most recent ended contest, so settling it last keeps ratings in order.
  const c1 = contests.get("cat-1")!;
  async function submitContest(user: { id: string }, skill: number, submittedAt: Date, isTest = false) {
    const { answers, timeSpent } = answerPaper(c1.plan.questions, qIds, skill, c1.plan.minutes);
    const { score: s } = score(c1.plan.questions, qIds, answers);
    await prisma.participation.create({
      data: {
        userId: user.id, contestId: c1.id, isTest, language: "EN", answers, timeSpent, score: s,
        draftAnswers: Prisma.JsonNull, markedForReview: Prisma.JsonNull,
        startedAt: c1.startTime, submittedAt,
      },
    });
    if (!isTest) await redis.zadd(`contest:${c1.id}:leaderboard`, s * 1e10 - submittedAt.getTime(), user.id);
  }
  for (let i = 0; i < 6; i++) {
    const minutes = between(Math.round(c1.plan.minutes * 0.6), c1.plan.minutes - 1);
    await submitContest(students[i], skills[i], new Date(c1.startTime.getTime() + minutes * MINUTE));
  }
  await submitContest(admin, 1, new Date(c1.startTime.getTime() + 15 * MINUTE), true);
  await settleContest(c1.id);

  // Contest 2: registered, not yet started.
  for (const i of [0, 1, 3]) {
    await prisma.participation.create({ data: { userId: students[i].id, contestId: contests.get("cat-2")!.id } });
  }

  // Mock attempts. CAT is sat in English whatever the candidate's language.
  async function submitMock(key: string, i: number, daysAgo: number) {
    const m = mocks.get(key)!;
    const { answers, timeSpent } = answerPaper(m.plan.questions, qIds, skills[i], m.plan.minutes);
    const r = score(m.plan.questions, qIds, answers);
    const submittedAt = at(-daysAgo * DAY);
    await prisma.mockAttempt.create({
      data: {
        userId: students[i].id, mockTestId: m.id, language: "EN", answers, timeSpent,
        score: r.score, totalMarks: r.totalMarks, correctCount: r.correct, wrongCount: r.wrong, skippedCount: r.skipped,
        markedForReview: [], startedAt: new Date(submittedAt.getTime() - m.plan.minutes * MINUTE), submittedAt,
      },
    });
  }
  for (let i = 0; i < 4; i++) await submitMock("VARC-1", i, 6 - i);
  for (let i = 0; i < 3; i++) await submitMock("DILR-1", i, 5 - i);
  for (let i = 0; i < 5; i++) await submitMock("QA-1", i, 4 - i * 0.5);

  // A bookmark on a type-in DILR question and a reading passage, and an open
  // report on a type-in QA question.
  const firstOf = (pred: (q: CatQuestion) => boolean) => qIds.get(c1.plan.questions.find(pred)!.key)!.id;
  await prisma.bookmark.createMany({
    data: [
      firstOf((q) => q.subject === "DILR" && q.type === "TITA"),
      firstOf((q) => q.topic === "Reading Comprehension"),
    ].map((questionId) => ({ userId: students[0].id, questionId })),
  });
  await prisma.questionReport.create({
    data: {
      questionId: firstOf((q) => q.subject === "QA" && q.type === "TITA"), userId: students[3].id,
      reason: "UNCLEAR", details: "Should a type-in answer be rounded, or entered exactly?", source: `contest:${c1.id}`,
    },
  });

  return { questions: qIds.size, extras: extras.length, contests: contestPlans.length, mocks: mockPlans.length };
}
