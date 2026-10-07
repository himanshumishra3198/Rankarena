/**
 * Local development seed.
 *
 * Fills an empty database with synthetic data shaped like the real thing:
 * SSC CGL style contests of 100 questions (25 per subject, 60 minutes), a
 * rapid contest, sectional and rapid mocks per subject, and attempts on them.
 * It covers every state the app branches on — contests that have ended, one
 * running now and one still to come; published and unpublished mocks; tagged
 * and untagged questions; English and Hindi; passages, data tables and
 * syllogisms; submitted, open and admin test attempts.
 *
 * Everything is made up. Nothing is copied from production, which holds real
 * people's emails and password hashes.
 *
 * Every paper gets its own questions — no question appears in two papers — so
 * "which paper did this come from" always has one answer, and the questions
 * of the live and upcoming contests and the unpublished mock are guaranteed
 * to be unreleased.
 *
 * Ended contests are written as they would be the moment their window closed
 * and then settled by the app's own settleContest(), so ranks, ratings and
 * the Redis leaderboard come from the code that produces them in production.
 *
 * Dates are relative to when the seed runs. The live contest started five
 * minutes before seeding and lasts an hour; re-seed to get a fresh one.
 *
 *   npm run db:seed     (backend/, empty database)
 *   npm run db:reset    (backend/, wipes the local database, then seeds)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../../src/lib/prisma";
import redis from "../../src/lib/redis";
import { settleContest } from "../../src/lib/settleContest";
import { computeFingerprint, normalizeText } from "../../src/lib/fingerprint";
import { Prisma } from "../../src/generated/prisma/client";
import type { Language, Subject } from "../../src/generated/prisma/enums";
import { between, interleave, OPTIONS, pick, rand, type Draft, type Option, type SeedQuestion } from "./lib";
import { FIXED_QUESTIONS, PASSAGES } from "./fixed";
import { quantFamilies } from "./quant";
import { reasoningFamilies } from "./reasoning";
import { englishFamilies } from "./english";
import { gkFamilies } from "./gk";

const PASSWORD = "password123";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Section order of the SSC CGL Tier 1 paper. */
const SUBJECTS: Subject[] = ["REASONING", "GK", "QUANT", "ENGLISH"];
const SUBJECT_NAMES: Record<Subject, string> = {
  REASONING: "Logical Reasoning",
  GK: "General Awareness",
  QUANT: "Quantitative Aptitude",
  ENGLISH: "English Language",
};

// ── Papers ──────────────────────────────────────────────────────────────────

interface PaperPlan {
  key: string;
  title: string;
  minutes: number;
  /** Questions per subject. A mock has one subject, a contest all four. */
  sections: Partial<Record<Subject, number>>;
  /** Hand-written questions this paper must contain, placed first in their section. */
  pinned: string[];
}

const everySubject = (n: number) => Object.fromEntries(SUBJECTS.map((s) => [s, n])) as Record<Subject, number>;

const CONTESTS: PaperPlan[] = [
  { key: "contest-1", title: "SSC CGL Contest 1", minutes: 60, sections: everySubject(25), pinned: ["q-pct-20-of-150", "e-rc-upi-1", "e-rc-upi-2", "e-rc-upi-3"] },
  { key: "contest-2", title: "SSC CGL Contest 2", minutes: 60, sections: everySubject(25), pinned: ["q-pct-25-of-80-miskeyed", "q-di-total-a", "q-di-growth-b"] },
  { key: "rapid-1", title: "Rapid Contest 1", minutes: 24, sections: everySubject(10), pinned: [] },
  { key: "contest-3", title: "SSC CGL Contest 3", minutes: 60, sections: everySubject(25), pinned: ["q-pct-30-of-150-live", "q-si-8000-live", "r-live-ranking", "e-live-syn", "g-live-history"] },
  { key: "contest-4", title: "SSC CGL Contest 4", minutes: 60, sections: everySubject(25), pinned: ["q-loss-upcoming", "r-upcoming-direction", "e-upcoming-ows", "g-upcoming-science"] },
];

/** Hand-written questions with no topic, kept in released papers. */
const UNTAGGED: Record<Subject, string> = {
  REASONING: "r-series-untagged", GK: "g-canberra-untagged", QUANT: "q-lcm-untagged", ENGLISH: "e-ant-untagged",
};

const MOCKS: (PaperPlan & { subject: Subject; published: boolean })[] = [
  ...SUBJECTS.flatMap((s) => [
    { key: `${s}-1`, title: `${SUBJECT_NAMES[s]} Sectional Test - 1`, subject: s, minutes: 15, sections: { [s]: 25 }, published: true,
      pinned: [UNTAGGED[s], ...(s === "ENGLISH" ? ["e-rc-1", "e-rc-2", "e-rc-3"] : [])] },
    { key: `${s}-2`, title: `${SUBJECT_NAMES[s]} Sectional Test - 2`, subject: s, minutes: 15, sections: { [s]: 25 }, published: true, pinned: [] },
    { key: `${s}-rapid`, title: `${SUBJECT_NAMES[s]} Rapid Mock`, subject: s, minutes: 6, sections: { [s]: 10 }, published: true, pinned: [] },
  ]),
  // Unpublished: its questions must never reach practice.
  { key: "REASONING-3", title: "Logical Reasoning Sectional Test - 3", subject: "REASONING", minutes: 15, sections: { REASONING: 25 }, published: false,
    pinned: ["r-draft-analogy", "r-draft-coding"] },
];

/** Questions left in the bank, in no paper — unreleased, as new questions are. */
const BANK_EXTRAS_PER_SUBJECT = 10;

// ── People ──────────────────────────────────────────────────────────────────

const STUDENTS = [
  { name: "Aarav Sharma", skill: 0.85, language: "EN" },
  { name: "Priya Patel", skill: 0.75, language: "EN" },
  { name: "Rohan Verma", skill: 0.65, language: "HI" },
  { name: "Ananya Iyer", skill: 0.6, language: "EN" },
  { name: "Vikram Singh", skill: 0.5, language: "EN" },
  { name: "Sneha Gupta", skill: 0.45, language: "HI" },
  { name: "Karan Mehta", skill: 0.35, language: "EN" },
  { name: "Divya Nair", skill: 0.3, language: "EN" },
] as const;

// ── Safety ──────────────────────────────────────────────────────────────────

function assertLocalDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed with NODE_ENV=production.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy backend/.env.example to backend/.env.");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(`Refusing to seed a non-local database (host "${host}"). The seed is for local development only.`);
  }
}

// ── Building the bank ───────────────────────────────────────────────────────

/** Two questions are the same if they ask the same thing and expect the same answer. */
function sameness(q: Draft): string {
  const right = q.options[OPTIONS.indexOf(q.correct)];
  return [normalizeText(q.text), JSON.stringify(q.structuredData ?? null), normalizeText(right)].join("|");
}

function buildBank() {
  const fixed = new Map(FIXED_QUESTIONS.map((q) => [q.key, q]));
  const pinned = new Set([...CONTESTS, ...MOCKS].flatMap((paper) => paper.pinned));
  const seen = new Set(FIXED_QUESTIONS.map(sameness));

  const generators: Record<Subject, () => Draft[][]> = {
    QUANT: quantFamilies, REASONING: reasoningFamilies, ENGLISH: englishFamilies, GK: gkFamilies,
  };

  // Per subject, the questions available to unpinned slots, interleaved so
  // that a paper filled from the front gets a spread of topics.
  const pools = {} as Record<Subject, SeedQuestion[]>;
  for (const subject of SUBJECTS) {
    const freeFixed = FIXED_QUESTIONS.filter((q) => q.subject === subject && !pinned.has(q.key));
    const generated = generators[subject]().map((fam) =>
      fam.filter((d) => {
        const k = sameness(d);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
    );
    let n = 0;
    // Topic tags are optional in the admin form and real banks have gaps, so
    // about one generated question in twelve is left untagged.
    const tagged = generated.map((fam) =>
      fam.map((d): SeedQuestion => {
        const key = `${subject.toLowerCase()}-${++n}`;
        return { ...d, subject, key, topic: n % 12 === 0 ? null : d.topic };
      })
    );
    pools[subject] = interleave([freeFixed, ...tagged]);
  }
  return { fixed, pools };
}

function planPapers(fixed: Map<string, SeedQuestion>, pools: Record<Subject, SeedQuestion[]>) {
  const cursor = Object.fromEntries(SUBJECTS.map((s) => [s, 0])) as Record<Subject, number>;
  const papers = new Map<string, SeedQuestion[]>();

  for (const paper of [...CONTESTS, ...MOCKS]) {
    const questions: SeedQuestion[] = [];
    for (const subject of SUBJECTS) {
      const size = paper.sections[subject];
      if (!size) continue;
      const section = paper.pinned.map((k) => fixed.get(k)!).filter((q) => q.subject === subject);
      while (section.length < size) {
        const next = pools[subject][cursor[subject]++];
        if (!next) throw new Error(`Ran out of ${subject} questions filling "${paper.title}". Add more to the generators.`);
        section.push(next);
      }
      questions.push(...section);
    }
    papers.set(paper.key, questions);
  }

  const extras = SUBJECTS.flatMap((s) => pools[s].slice(cursor[s], cursor[s] + BANK_EXTRAS_PER_SUBJECT));
  return { papers, extras };
}

// ── Attempts ────────────────────────────────────────────────────────────────

type QIds = Map<string, { id: string; correct: Option }>;

/** One candidate's answers to a paper, given how good they are. */
function answerPaper(questions: SeedQuestion[], ids: QIds, skill: number, minutes: number) {
  const answers: Record<string, Option> = {};
  const timeSpent: Record<string, number> = {};
  const avg = (minutes * 60) / questions.length;
  for (const q of questions) {
    const { id, correct } = ids.get(q.key)!;
    timeSpent[id] = between(Math.round(avg * 0.4), Math.round(avg * 1.1));
    if (rand() < 0.1) continue; // skipped

    if (q.key === "q-pct-25-of-80-miskeyed") {
      // Almost everyone gets the real answer (B), which the key marks wrong.
      answers[id] = rand() < 0.8 ? "B" : pick(["A", "C", "D"]);
      continue;
    }
    answers[id] = rand() < skill ? correct : pick(OPTIONS.filter((o) => o !== correct));
  }
  return { answers, timeSpent };
}

/** Same scoring as the submit routes: +marks, −negativeMarks, floored at 0. */
function score(questions: SeedQuestion[], ids: QIds, answers: Record<string, Option>, marks = 2, negative = 0.5) {
  let s = 0, correct = 0, wrong = 0, skipped = 0;
  for (const q of questions) {
    const { id, correct: key } = ids.get(q.key)!;
    const given = answers[id];
    if (!given) { skipped++; continue; }
    if (given === key) { s += marks; correct++; } else { s -= negative; wrong++; }
  }
  return { score: Math.max(0, s), totalMarks: questions.length * marks, correct, wrong, skipped };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  assertLocalDatabase();

  if ((await prisma.user.count()) > 0) {
    console.error(
      "The database already has data, and the seed only fills an empty one.\n" +
      "To wipe the local database and seed it again, run:  npm run db:reset"
    );
    process.exitCode = 1;
    return;
  }

  // Leaderboards live in Redis, keyed by contest id. A reset wipes Postgres
  // but not Redis, so clear the old keys rather than leave orphans behind.
  const staleKeys = await redis.keys("contest:*:leaderboard");
  if (staleKeys.length) await redis.del(...staleKeys);

  const { fixed, pools } = buildBank();
  const { papers, extras } = planPapers(fixed, pools);
  const paper = (key: string) => papers.get(key)!;

  const now = Date.now();
  const at = (offsetMs: number) => new Date(now + offsetMs);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // Users
  const admin = await prisma.user.create({
    data: { name: "Admin", email: "admin@rankarena.local", passwordHash, role: "ADMIN", emailVerified: true },
  });
  const students: { id: string }[] = [];
  for (const [i, s] of STUDENTS.entries()) {
    students.push(
      await prisma.user.create({
        data: {
          name: s.name, email: `student${i + 1}@rankarena.local`, passwordHash, emailVerified: true,
          createdAt: at(-30 * DAY + i * HOUR),
        },
      })
    );
  }

  // Passages
  const passageIds = new Map<string, string>();
  for (const [key, ps] of Object.entries(PASSAGES)) {
    const row = await prisma.passage.create({
      data: {
        title: ps.title, content: ps.content, type: ps.type,
        tableData: ps.tableData ?? Prisma.JsonNull,
        translations: ps.hi
          ? { create: { language: "HI", title: ps.hi.title, content: ps.hi.content, tableData: ps.hi.tableData } }
          : undefined,
      },
    });
    passageIds.set(key, row.id);
  }

  // Questions: every one placed in a paper, plus a few left in the bank.
  const qIds: QIds = new Map();
  for (const q of [...[...papers.values()].flat(), ...extras]) {
    if (qIds.has(q.key)) continue;
    const row = await prisma.question.create({
      data: {
        questionType: q.type ?? "STANDARD",
        text: q.text,
        optionA: q.options[0], optionB: q.options[1], optionC: q.options[2], optionD: q.options[3],
        correctOption: q.correct,
        subject: q.subject,
        topic: q.topic,
        difficulty: q.difficulty,
        solution: q.solution ?? null,
        structuredData: q.structuredData ?? Prisma.JsonNull,
        passageId: q.passage ? passageIds.get(q.passage)! : null,
        fingerprint: computeFingerprint(q.text, q.options),
        translations: q.hi
          ? {
              create: {
                language: "HI", text: q.hi.text,
                optionA: q.hi.options[0], optionB: q.hi.options[1], optionC: q.hi.options[2], optionD: q.hi.options[3],
                solution: q.hi.solution ?? null,
                structuredData: q.hi.structuredData ?? Prisma.JsonNull,
              },
            }
          : undefined,
      },
    });
    qIds.set(q.key, { id: row.id, correct: q.correct });
  }

  const paperQuestions = (key: string) => paper(key).map((q, i) => ({ questionId: qIds.get(q.key)!.id, displayOrder: i + 1 }));

  // Contests. The ended ones are written as LIVE with their window already
  // closed; settleContest() below turns them into ENDED the way the app does.
  // announcedAt is set on all of them so the notifier does not try to mail
  // everyone on first boot — locally that only prints, but noisily.
  const contestTimes: Record<string, { start: Date; status: "LIVE" | "SCHEDULED"; announced: Date }> = {
    "contest-1": { start: at(-14 * DAY), status: "LIVE", announced: at(-16 * DAY) },
    "contest-2": { start: at(-7 * DAY), status: "LIVE", announced: at(-9 * DAY) },
    "rapid-1": { start: at(-2 * DAY), status: "LIVE", announced: at(-3 * DAY) },
    "contest-3": { start: at(-5 * MINUTE), status: "LIVE", announced: at(-1 * DAY) },
    "contest-4": { start: at(2 * DAY), status: "SCHEDULED", announced: at(-1 * HOUR) },
  };
  const contests = new Map<string, { id: string; startTime: Date; plan: PaperPlan }>();
  for (const plan of CONTESTS) {
    const t = contestTimes[plan.key];
    const row = await prisma.contest.create({
      data: {
        title: plan.title, startTime: t.start, durationMinutes: plan.minutes, status: t.status, announcedAt: t.announced,
        contestQuestions: { create: paperQuestions(plan.key) },
      },
    });
    contests.set(plan.key, { id: row.id, startTime: row.startTime, plan });
  }

  // Mocks
  const mocks = new Map<string, { id: string; plan: PaperPlan }>();
  for (const plan of MOCKS) {
    const row = await prisma.mockTest.create({
      data: {
        title: plan.title, subject: plan.subject, durationMinutes: plan.minutes, isPublished: plan.published,
        mockTestQuestions: { create: paperQuestions(plan.key) },
      },
    });
    mocks.set(plan.key, { id: row.id, plan });
  }

  // Contest attempts
  async function submitContest(key: string, user: { id: string }, skill: number, language: Language, submittedAt: Date, isTest = false) {
    const c = contests.get(key)!;
    const qs = paper(key);
    const { answers, timeSpent } = answerPaper(qs, qIds, skill, c.plan.minutes);
    const { score: s } = score(qs, qIds, answers);
    await prisma.participation.create({
      data: {
        userId: user.id, contestId: c.id, isTest, language, answers, timeSpent, score: s,
        draftAnswers: Prisma.JsonNull, markedForReview: Prisma.JsonNull,
        startedAt: c.startTime, submittedAt,
      },
    });
    if (!isTest) await redis.zadd(`contest:${c.id}:leaderboard`, s * 1e10 - submittedAt.getTime(), user.id);
  }

  for (const [key, takers] of [["contest-1", 6], ["contest-2", 8], ["rapid-1", 8]] as const) {
    const c = contests.get(key)!;
    for (let i = 0; i < takers; i++) {
      const finishedAt = new Date(c.startTime.getTime() + between(Math.round(c.plan.minutes * 0.6), c.plan.minutes - 1) * MINUTE);
      await submitContest(key, students[i], STUDENTS[i].skill, STUDENTS[i].language, finishedAt);
    }
    // An admin trying the paper out: visible in review, excluded from ranks.
    await submitContest(key, admin, 1, "EN", new Date(c.startTime.getTime() + Math.round(c.plan.minutes / 3) * MINUTE), true);
  }
  // A student who never pressed submit in contest 1. Settling scores this from
  // the draft, as it would for a closed tab in production.
  {
    const c = contests.get("contest-1")!;
    const { answers } = answerPaper(paper("contest-1"), qIds, STUDENTS[6].skill, c.plan.minutes);
    await prisma.participation.create({
      data: { userId: students[6].id, contestId: c.id, draftAnswers: answers, startedAt: c.startTime },
    });
  }

  // Oldest first: rating changes compound, as in settleEndedContests().
  for (const key of ["contest-1", "contest-2", "rapid-1"]) await settleContest(contests.get(key)!.id);

  // Live contest: one student partway through, one registered but not started.
  {
    const c = contests.get("contest-3")!;
    const { answers } = answerPaper(paper("contest-3").slice(0, 15), qIds, STUDENTS[0].skill, 9);
    await prisma.participation.create({ data: { userId: students[0].id, contestId: c.id, draftAnswers: answers, startedAt: c.startTime } });
    await prisma.participation.create({ data: { userId: students[1].id, contestId: c.id, startedAt: at(-2 * MINUTE) } });
  }
  // Upcoming contest: registered.
  for (const s of students.slice(0, 3)) {
    await prisma.participation.create({ data: { userId: s.id, contestId: contests.get("contest-4")!.id } });
  }

  // Mock attempts
  async function submitMock(key: string, user: { id: string }, skill: number, language: Language, daysAgo: number, isTest = false) {
    const m = mocks.get(key)!;
    const qs = paper(key);
    const { answers, timeSpent } = answerPaper(qs, qIds, skill, m.plan.minutes);
    const r = score(qs, qIds, answers);
    const submittedAt = at(-daysAgo * DAY);
    await prisma.mockAttempt.create({
      data: {
        userId: user.id, mockTestId: m.id, isTest, language, answers, timeSpent,
        score: r.score, totalMarks: r.totalMarks, correctCount: r.correct, wrongCount: r.wrong, skippedCount: r.skipped,
        markedForReview: [], startedAt: new Date(submittedAt.getTime() - m.plan.minutes * MINUTE), submittedAt,
      },
    });
  }
  for (const s of SUBJECTS) {
    // The English section is sat in English whatever the candidate's language.
    const lang = (i: number): Language => (s === "ENGLISH" ? "EN" : STUDENTS[i].language);
    for (let i = 0; i < 6; i++) await submitMock(`${s}-1`, students[i], STUDENTS[i].skill, lang(i), 10 - i);
    for (let i = 0; i < 3; i++) await submitMock(`${s}-2`, students[i], STUDENTS[i].skill, lang(i), 4 - i);
    for (let i = 0; i < 4; i++) await submitMock(`${s}-rapid`, students[i], STUDENTS[i].skill, lang(i), 1 + i * 0.25);
  }
  await submitMock("QUANT-1", admin, 1, "EN", 9, true);

  // Reports: the mis-keyed question has been flagged; one older report is closed.
  const c1 = contests.get("contest-1")!, c2 = contests.get("contest-2")!;
  const miskeyed = qIds.get("q-pct-25-of-80-miskeyed")!.id;
  await prisma.questionReport.createMany({
    data: [
      { questionId: miskeyed, userId: students[1].id, reason: "WRONG_ANSWER", details: "25% of 80 is 20, not 25.", source: `contest:${c2.id}` },
      { questionId: miskeyed, userId: students[4].id, reason: "WRONG_ANSWER", source: `contest:${c2.id}` },
      {
        questionId: qIds.get(paper("contest-1")[30].key)!.id, userId: students[2].id, reason: "TYPO", details: "Option C has a typo.",
        source: `contest:${c1.id}`, status: "RESOLVED", resolvedAt: at(-12 * DAY),
      },
    ],
  });

  // Bookmarks, follows
  await prisma.bookmark.createMany({
    data: [5, 40, 70].map((i) => ({ userId: students[0].id, questionId: qIds.get(paper("contest-1")[i].key)!.id })),
  });
  await prisma.follow.createMany({
    data: [
      { followerId: students[0].id, followingId: students[1].id },
      { followerId: students[0].id, followingId: students[2].id },
      { followerId: students[1].id, followingId: students[0].id },
    ],
  });
  await prisma.notification.create({ data: { userId: students[1].id, type: "FOLLOW", actorId: students[0].id } });

  // Community
  await prisma.article.create({
    data: {
      authorId: admin.id, type: "ANNOUNCEMENT", pinned: true,
      title: "Welcome to RankArena",
      body: "<p>A full SSC CGL contest every week, and sectional mocks that are always open for practice.</p>",
    },
  });
  const technique = await prisma.article.create({
    data: {
      authorId: students[1].id, type: "TECHNIQUE", score: 1, commentCount: 2,
      title: "Successive percentage change in one line",
      body: "<p>For changes of a% and b%, the net change is a + b + ab/100. A 20% rise then a 20% fall is 20 − 20 − 4 = −4%.</p>",
    },
  });
  await prisma.articleVote.create({ data: { articleId: technique.id, userId: students[0].id, value: 1 } });
  const comment = await prisma.articleComment.create({
    data: { articleId: technique.id, authorId: students[0].id, body: "<p>This saved me a minute on the last test.</p>" },
  });
  await prisma.articleComment.create({
    data: { articleId: technique.id, authorId: students[1].id, parentId: comment.id, body: "<p>Glad it helped!</p>" },
  });

  console.log(`
Seeded ${qIds.size} questions (${extras.length} of them in no paper yet), ${CONTESTS.length} contests,
${MOCKS.length} mocks, ${students.length} students and 1 admin.

  Admin panel   http://localhost:5174   admin@rankarena.local    / ${PASSWORD}
  Student app   http://localhost:5173   student1@rankarena.local / ${PASSWORD}
                                        (student1 … student${students.length}, same password)
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
