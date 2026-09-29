import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { Prisma } from "../generated/prisma/client";
import { Language, Difficulty } from "../generated/prisma/enums";
import { parseLanguage, translationSelect, passageTranslationSelect, localizeQuestion } from "../lib/i18n";
import { ONLY_SAFE_TO_REVEAL } from "../lib/questionSafety";
import { SUBJECTS, TOPICS_BY_SUBJECT, ALL_TOPICS, type Subject } from "../lib/topics";

const router = Router();
router.use(authenticate);

// Selects a card in the language it is being read in. Mirrors the
// contests.ts/mocks.ts result routes: EN fetches no translation rows at all,
// any other language fetches only the one row for that language.
function cardSelect(language: Language) {
  return {
    id: true,
    text: true,
    imageUrl: true,
    questionType: true,
    optionA: true,
    optionB: true,
    optionC: true,
    optionD: true,
    correctOption: true,
    subject: true,
    topic: true,
    difficulty: true,
    structuredData: true,
    solution: true,
    translations: translationSelect(language),
    passage: {
      select: {
        id: true, title: true, content: true, type: true, tableData: true,
        translations: passageTranslationSelect(language),
      },
    },
  } satisfies Prisma.QuestionSelect;
}

type Card = Prisma.QuestionGetPayload<{ select: ReturnType<typeof cardSelect> }>;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// GET /practice/recommendations?questionId=<uuid>&limit=5
//
// Suggests up to `limit` other questions to practise after a wrong answer,
// falling through subject+topic+difficulty -> subject+topic -> subject+difficulty
// -> subject-only (the last two tiers are also what cover an untagged
// question, since `topic` is optional). The endpoint only receives
// `questionId`, not which specific
// attempt is being reviewed, so "same test" exclusion is computed as every
// contest/mock this question has ever appeared in, not just the current one.
// That over-excludes for a reused question but never under-excludes, so a
// completed test's other questions never show up as a recommendation.
router.get("/recommendations", async (req: AuthRequest, res: Response) => {
  const questionId = req.query.questionId as string | undefined;
  if (!questionId) {
    res.status(400).json({ error: "questionId is required" });
    return;
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 10);

  const original = await prisma.question.findUnique({
    where: { id: questionId },
    select: { subject: true, topic: true, difficulty: true },
  });
  if (!original) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  // Recommendations reveal correctOption, so this endpoint is an answer-key
  // oracle unless access is tied to evidence the caller actually sat the
  // question. Login alone is not that evidence — it lets any account iterate
  // questionId and read the whole bank, including questions currently sitting
  // in a scheduled or live contest. A submitted attempt is: it can only exist
  // after the caller's own test window closed for them.
  const [contestAttempt, mockAttempt] = await Promise.all([
    prisma.participation.findFirst({
      where: {
        userId: req.user!.id,
        submittedAt: { not: null },
        contest: { contestQuestions: { some: { questionId } } },
      },
      select: { id: true, language: true },
    }),
    prisma.mockAttempt.findFirst({
      where: {
        userId: req.user!.id,
        submittedAt: { not: null },
        mockTest: { mockTestQuestions: { some: { questionId } } },
      },
      select: { id: true, language: true },
    }),
  ]);
  if (!contestAttempt && !mockAttempt) {
    res.status(403).json({ error: "You can only get recommendations for a question you have attempted." });
    return;
  }

  // The gate above guarantees one of these exists, so the paper was sat in a
  // known language; ?language= only matters if that assumption ever changes.
  const language = contestAttempt?.language ?? mockAttempt?.language ?? parseLanguage(req.query.language);

  const [contestSiblingTests, mockSiblingTests] = await Promise.all([
    prisma.contestQuestion.findMany({ where: { questionId }, select: { contestId: true } }),
    prisma.mockTestQuestion.findMany({ where: { questionId }, select: { mockTestId: true } }),
  ]);
  const [contestSiblings, mockSiblings] = await Promise.all([
    contestSiblingTests.length
      ? prisma.contestQuestion.findMany({
          where: { contestId: { in: contestSiblingTests.map((c) => c.contestId) } },
          select: { questionId: true },
        })
      : [],
    mockSiblingTests.length
      ? prisma.mockTestQuestion.findMany({
          where: { mockTestId: { in: mockSiblingTests.map((m) => m.mockTestId) } },
          select: { questionId: true },
        })
      : [],
  ]);
  const excluded = new Set<string>([
    questionId,
    ...contestSiblings.map((s) => s.questionId),
    ...mockSiblings.map((s) => s.questionId),
  ]);

  async function pickTier(where: Prisma.QuestionWhereInput, remaining: number): Promise<Card[]> {
    if (remaining <= 0) return [];
    const rows = await prisma.question.findMany({
      where: { ...where, ...ONLY_SAFE_TO_REVEAL, id: { notIn: [...excluded] } },
      select: cardSelect(language),
      take: remaining * 3,
    });
    return shuffle(rows).slice(0, remaining);
  }

  let results: Card[] = [];

  if (original.topic) {
    const tier1 = await pickTier(
      { subject: original.subject, topic: original.topic, difficulty: original.difficulty },
      limit - results.length
    );
    tier1.forEach((r) => excluded.add(r.id));
    results.push(...tier1);
  }

  if (original.topic && results.length < limit) {
    const tier2 = await pickTier(
      { subject: original.subject, topic: original.topic },
      limit - results.length
    );
    tier2.forEach((r) => excluded.add(r.id));
    results.push(...tier2);
  }

  // Falling straight from "same topic" to "anything in this subject" is close
  // to random on a bank this size — a percentages question wrong could come
  // back with a mensuration recommendation. Matching on difficulty first at
  // least keeps the suggestion at the right level for an untagged question,
  // or a tagged one whose topic doesn't have enough siblings.
  if (results.length < limit) {
    const tier3 = await pickTier(
      { subject: original.subject, difficulty: original.difficulty },
      limit - results.length
    );
    tier3.forEach((r) => excluded.add(r.id));
    results.push(...tier3);
  }

  if (results.length < limit) {
    const tier4 = await pickTier({ subject: original.subject }, limit - results.length);
    results.push(...tier4);
  }

  const bookmarked = new Set(
    (
      await prisma.bookmark.findMany({
        where: { userId: req.user!.id, questionId: { in: results.map((r) => r.id) } },
        select: { questionId: true },
      })
    ).map((b) => b.questionId)
  );

  res.json({
    subject: original.subject,
    topic: original.topic,
    questions: results.map((r) => ({ ...localizeQuestion(r, language), bookmarked: bookmarked.has(r.id) })),
  });
});

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

// GET /practice/filters
//
// What the browse page is allowed to offer. Counted through the same safety
// filter the questions themselves come through, so a filter that is offered
// always has something behind it — listing all 49 syllabus topics here would
// mean most choices lead to an empty page.
router.get("/filters", async (_req: AuthRequest, res: Response) => {
  const groups = await prisma.question.groupBy({
    by: ["subject", "topic", "difficulty"],
    where: ONLY_SAFE_TO_REVEAL,
    _count: { _all: true },
  });

  interface Bucket {
    count: number;
    /** Questions with no topic tag: reachable under "any topic", not on their own. */
    untagged: number;
    difficulties: Record<string, number>;
    topics: Map<string, number>;
  }
  const bySubject = new Map<string, Bucket>();

  for (const g of groups) {
    const n = g._count._all;
    let bucket = bySubject.get(g.subject);
    if (!bucket) {
      bucket = { count: 0, untagged: 0, difficulties: { EASY: 0, MEDIUM: 0, HARD: 0 }, topics: new Map() };
      bySubject.set(g.subject, bucket);
    }
    bucket.count += n;
    bucket.difficulties[g.difficulty] += n;
    if (g.topic) bucket.topics.set(g.topic, (bucket.topics.get(g.topic) ?? 0) + n);
    else bucket.untagged += n;
  }

  // Syllabus order rather than count order: the list should read like the
  // syllabus someone is revising from. A topic that no longer appears in
  // topics.ts — renamed after its questions were tagged — is listed after the
  // canonical ones instead of being dropped, because those questions are
  // still perfectly practisable.
  const subjects = SUBJECTS.filter((s) => bySubject.has(s)).map((s) => {
    const bucket = bySubject.get(s)!;
    const canonical = TOPICS_BY_SUBJECT[s].filter((t) => bucket.topics.has(t));
    const renamed = [...bucket.topics.keys()].filter((t) => !TOPICS_BY_SUBJECT[s].includes(t)).sort();
    return {
      subject: s,
      count: bucket.count,
      untagged: bucket.untagged,
      difficulties: bucket.difficulties,
      topics: [...canonical, ...renamed].map((t) => ({ topic: t, count: bucket.topics.get(t)! })),
    };
  });

  res.json({ total: subjects.reduce((n, s) => n + s.count, 0), subjects });
});

// GET /practice/questions?subject=&topic=&difficulty=&limit=&cursor=&language=
//
// The question bank, browsable — the only door into it that isn't a finished
// test. Answers and solutions come with each card, because the point is to
// attempt one question and find out immediately.
//
// Two things hold this up.
//
// ONLY_SAFE_TO_REVEAL is the whole of the protection. /recommendations can
// also lean on the caller having submitted an attempt covering the question;
// browsing has no such evidence to ask for, by definition, so that filter is
// load-bearing on its own and is tested directly in tests/practice.test.ts.
//
// Nothing here is written down. No attempt row, no score, no rating: practice
// cannot reach a leaderboard because it produces nothing that could. The page
// keeps its own tally in the browser. Topic accuracy on the profile ignores
// practice for the same reason it has to — those percentages come from
// submitted papers, where the answer was hidden and there was one attempt at
// it; folding in a mode that shows you the answer and lets you retry would
// turn a study plan into a number nobody can act on.
router.get("/questions", async (req: AuthRequest, res: Response) => {
  const rawSubject = typeof req.query.subject === "string" ? req.query.subject.trim().toUpperCase() : "";
  if (rawSubject && !(SUBJECTS as readonly string[]).includes(rawSubject)) {
    res.status(400).json({ error: `Unknown subject. Expected one of: ${SUBJECTS.join(", ")}.` });
    return;
  }
  const subject = (rawSubject || undefined) as Subject | undefined;

  const rawDifficulty = typeof req.query.difficulty === "string" ? req.query.difficulty.trim().toUpperCase() : "";
  if (rawDifficulty && !(DIFFICULTIES as readonly string[]).includes(rawDifficulty)) {
    res.status(400).json({ error: `Unknown difficulty. Expected one of: ${DIFFICULTIES.join(", ")}.` });
    return;
  }
  const difficulty = (rawDifficulty || undefined) as Difficulty | undefined;

  // Validated rather than passed through: an unknown topic would silently
  // return an empty page, which reads as "nothing to practise here" when it
  // is really a typo or a stale bookmark.
  const topic = typeof req.query.topic === "string" && req.query.topic.trim() ? req.query.topic.trim() : undefined;
  if (topic && !(subject ? TOPICS_BY_SUBJECT[subject].includes(topic) : ALL_TOPICS.includes(topic))) {
    res.status(400).json({
      error: subject ? `Unknown topic for ${subject}.` : "Unknown topic.",
    });
    return;
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 20);
  const cursor = typeof req.query.cursor === "string" && req.query.cursor.trim() ? req.query.cursor.trim() : undefined;
  const language = parseLanguage(req.query.language);

  const where: Prisma.QuestionWhereInput = {
    ...ONLY_SAFE_TO_REVEAL,
    ...(subject ? { subject } : {}),
    ...(topic ? { topic } : {}),
    ...(difficulty ? { difficulty } : {}),
  };

  // Ordered by id — a uuid, so the sequence is arbitrary but the same every
  // time. Stable is the point: it makes a cursor a resumable place in the
  // topic ("14 of 43"), where reshuffling per request would hand back
  // questions already done and never finish. Written as `id > cursor` rather
  // than Prisma's `cursor` option so that a stale id — a question deleted
  // since the page was last open — pages on instead of failing the request.
  const [total, rows] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where: cursor ? { ...where, id: { gt: cursor } } : where,
      select: cardSelect(language),
      orderBy: { id: "asc" },
      take: limit,
    }),
  ]);

  const bookmarked = new Set(
    (
      await prisma.bookmark.findMany({
        where: { userId: req.user!.id, questionId: { in: rows.map((r) => r.id) } },
        select: { questionId: true },
      })
    ).map((b) => b.questionId)
  );

  res.json({
    total,
    // A full page might be the last one; the follow-up request that comes
    // back empty is what ends the run.
    nextCursor: rows.length === limit ? rows[rows.length - 1]!.id : null,
    questions: rows.map((r) => ({ ...localizeQuestion(r, language), bookmarked: bookmarked.has(r.id) })),
  });
});

export default router;
