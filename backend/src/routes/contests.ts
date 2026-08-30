import { Router, Response } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";
import redis from "../lib/redis";
import { authenticate, requireVerifiedEmail, AuthRequest } from "../middleware/auth";
import { Prisma } from "../generated/prisma/client";
import { Language } from "../generated/prisma/enums";
import { finalizeContest } from "../lib/finalizeContest";
import {
  parseLanguage, translationSelect, passageTranslationSelect, localizeQuestion, DEFAULT_LANGUAGE,
} from "../lib/i18n";

const router = Router();

// List contests — active (SCHEDULED/LIVE) + recent past (ENDED), with hasJoined for auth users
router.get("/", async (req, res: Response) => {
  // Optional JWT decode — doesn't reject unauthenticated requests
  let userId: string | null = null;
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
      userId = payload.id;
    } catch {}
  }

  const contestSelect = {
    id: true, title: true, startTime: true, durationMinutes: true,
    negativeMarks: true, status: true,
    _count: { select: { participations: { where: { isTest: false } } } },
  } as const;

  const [active, past] = await Promise.all([
    prisma.contest.findMany({
      where: { status: { in: ["SCHEDULED", "LIVE"] } },
      orderBy: { startTime: "asc" },
      select: contestSelect,
    }),
    prisma.contest.findMany({
      where: { status: "ENDED" },
      orderBy: { startTime: "desc" },
      take: 20,
      select: contestSelect,
    }),
  ]);

  // Re-split by wall-clock time: a SCHEDULED/LIVE contest whose end time has
  // already passed should be treated as ended regardless of its DB status.
  const nowMs = Date.now();
  const effectivelyActive = active.filter(c => {
    const endMs = new Date(c.startTime).getTime() + c.durationMinutes * 60_000;
    return nowMs < endMs;
  });
  const effectivelyEnded = active.filter(c => {
    const endMs = new Date(c.startTime).getTime() + c.durationMinutes * 60_000;
    return nowMs >= endMs;
  });

  // Merge time-elapsed active contests into past, keep sorted by startTime desc
  const allPast = [...effectivelyEnded, ...past]
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 20);

  const allContests = [...effectivelyActive, ...allPast];

  // Fetch which contests the user has joined / submitted in one query
  let joinedIds = new Set<string>();
  let submittedIds = new Set<string>();
  if (userId && allContests.length > 0) {
    const participations = await prisma.participation.findMany({
      where: { userId, contestId: { in: allContests.map((c) => c.id) } },
      select: { contestId: true, submittedAt: true },
    });
    joinedIds = new Set(participations.map((p) => p.contestId));
    submittedIds = new Set(
      participations.filter((p) => p.submittedAt !== null).map((p) => p.contestId)
    );
  }

  const withJoined = (c: (typeof active)[number]) => ({
    ...c,
    hasJoined: joinedIds.has(c.id),
    hasSubmitted: submittedIds.has(c.id),
  });

  res.json({ active: effectivelyActive.map(withJoined), past: allPast.map(withJoined) });
});

// Contest detail
router.get("/:id", async (req, res: Response) => {
  const id = req.params.id as string;
  const contest = await prisma.contest.findUnique({
    where: { id },
    include: {
      _count: { select: { contestQuestions: true, participations: { where: { isTest: false } } } },
    },
  });
  if (!contest) {
    res.status(404).json({ error: "Contest not found" });
    return;
  }

  // Optional JWT decode — doesn't reject unauthenticated requests, same as the
  // list above. The room needs to know whether the caller has already
  // submitted, and it cannot ask /result: the answer key is embargoed until
  // the contest ends, so that endpoint refuses a submitted candidate for the
  // whole time the room is still reachable.
  let userId: string | null = null;
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      userId = (jwt.verify(token, process.env.JWT_SECRET!) as { id: string }).id;
    } catch {}
  }

  let hasJoined = false;
  let hasSubmitted = false;
  if (userId) {
    const p = await prisma.participation.findUnique({
      where: { userId_contestId: { userId, contestId: id } },
      select: { submittedAt: true },
    });
    hasJoined = !!p;
    hasSubmitted = !!p?.submittedAt;
  }

  res.json({ ...contest, hasJoined, hasSubmitted });
});

// Join contest
router.post("/:id/join", authenticate, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    res.status(404).json({ error: "Contest not found" });
    return;
  }
  if (contest.status === "ENDED") {
    res.status(400).json({ error: "Contest has ended" });
    return;
  }

  // Admin attempts are test runs: recorded in full for the admin's own
  // review, but excluded from every leaderboard, rating and public count.
  const isTest = req.user!.role === "ADMIN";

  const language = parseLanguage(req.body?.language);

  const participation = await prisma.participation.upsert({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
    // Language is set on the way in and deliberately not updated on re-join:
    // a paper already in progress must not change language underneath the
    // candidate. Retaking (which clears the attempt) picks it up afresh.
    create: { userId: req.user!.id, contestId, isTest, language },
    update: { isTest },
  });

  res.status(201).json(participation);
});

/**
 * Reset the caller's own attempt so they can take the contest again.
 *
 * Admin-only, and only ever touches the caller's row. Contests are
 * single-attempt by design — a second run would be meaningless against a
 * leaderboard — so rather than letting a submission be silently overwritten,
 * a retake is an explicit action that clears the previous attempt first.
 */
router.post("/:id/retake", authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "Only admins can retake a contest" });
    return;
  }
  const contestId = req.params.id as string;

  const participation = await prisma.participation.findUnique({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
    select: { id: true },
  });
  if (!participation) {
    res.status(404).json({ error: "You have not joined this contest" });
    return;
  }

  await prisma.participation.update({
    where: { id: participation.id },
    data: {
      answers: Prisma.JsonNull,
      draftAnswers: Prisma.JsonNull,
      timeSpent: Prisma.JsonNull,
      markedForReview: Prisma.JsonNull,
      score: 0,
      submittedAt: null,
      startedAt: new Date(),
      // Re-assert the flag: whatever happens, a retake is a test run.
      isTest: true,
    },
  });

  // Defensive: a test attempt is never added to the leaderboard, but a user
  // promoted to admin after submitting would still have an entry there.
  await redis.zrem(`contest:${contestId}:leaderboard`, req.user!.id);

  res.json({ ok: true });
});

// Fetch questions (shuffled per user, no correct answers)
router.get("/:id/questions", authenticate, async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const participation = await prisma.participation.findUnique({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
  });
  if (!participation) {
    res.status(403).json({ error: "Join the contest first" });
    return;
  }

  // Served in whatever language the attempt was opened in, so a reload
  // mid-exam cannot silently switch the paper under the candidate.
  const attempt = await prisma.participation.findUnique({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
    select: { language: true },
  });
  const language = attempt?.language ?? DEFAULT_LANGUAGE;

  const cqs = await prisma.contestQuestion.findMany({
    where: { contestId },
    include: {
      question: {
        select: {
          id: true, text: true, questionType: true,
          optionA: true, optionB: true, optionC: true, optionD: true,
          subject: true, difficulty: true, imageUrl: true,
          structuredData: true,
          translations: translationSelect(language),
          passage: {
            select: {
              id: true, title: true, content: true, type: true, tableData: true,
              translations: passageTranslationSelect(language),
            },
          },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  // Which languages each question actually exists in. The localized payload
  // cannot answer this — it carries one language by design — and the
  // instructions sheet has to state per section whether Hindi is on offer
  // rather than promising it for a paper that was never translated.
  const translated = await prisma.questionTranslation.findMany({
    where: { questionId: { in: cqs.map((cq) => cq.questionId) } },
    select: { questionId: true, language: true },
  });
  const byQuestion = new Map<string, Language[]>();
  for (const t of translated) {
    byQuestion.set(t.questionId, [...(byQuestion.get(t.questionId) ?? []), t.language]);
  }

  const seed = req.user!.id;
  const questions = cqs
    .map((cq) => ({
      ...localizeQuestion({ ...cq.question, marks: cq.marks, negativeMarks: cq.negativeMarks }, language),
      availableLanguages: [DEFAULT_LANGUAGE, ...(byQuestion.get(cq.questionId) ?? [])],
    }))
    .sort((a, b) => simpleHash(seed + a.id) - simpleHash(seed + b.id));

  res.json(questions);
});

// Autosave draft answers
router.patch("/:id/draft", authenticate, async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const answersSchema = z.record(z.string(), z.enum(["A", "B", "C", "D"]));
  const parsed = answersSchema.safeParse(req.body.answers);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid answers format" });
    return;
  }

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    res.status(404).json({ error: "Contest not found" });
    return;
  }

  const deadline = new Date(contest.startTime.getTime() + contest.durationMinutes * 60000);
  if (new Date() > deadline) {
    res.status(400).json({ error: "Contest has ended" });
    return;
  }

  const participation = await prisma.participation.findUnique({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
  });
  if (!participation) {
    res.status(403).json({ error: "Join the contest first" });
    return;
  }
  if (participation.submittedAt) {
    res.status(400).json({ error: "Already submitted" });
    return;
  }

  await prisma.participation.update({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
    data: { draftAnswers: parsed.data },
  });

  res.json({ ok: true });
});

// Fetch saved draft (on page load / refresh)
router.get("/:id/draft", authenticate, async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const participation = await prisma.participation.findUnique({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
    select: { draftAnswers: true, submittedAt: true },
  });
  if (!participation) {
    res.status(403).json({ error: "Join the contest first" });
    return;
  }
  if (participation.submittedAt) {
    res.status(400).json({ error: "Already submitted" });
    return;
  }
  res.json({ answers: participation.draftAnswers ?? {} });
});

// Final submit
router.post("/:id/submit", authenticate, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const answersSchema = z.record(z.string(), z.enum(["A", "B", "C", "D"]));
  const parsed = answersSchema.safeParse(req.body.answers);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid answers format" });
    return;
  }
  const timeSpentParsed = z.record(z.string(), z.number()).safeParse(req.body.timeSpent);
  const timeSpent = timeSpentParsed.success ? timeSpentParsed.data : null;
  const markedParsed = z.array(z.string()).safeParse(req.body.markedForReview);
  const markedForReview = markedParsed.success ? markedParsed.data : null;

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    res.status(404).json({ error: "Contest not found" });
    return;
  }

  const participation = await prisma.participation.findUnique({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
  });
  if (!participation) {
    res.status(403).json({ error: "Join the contest first" });
    return;
  }
  if (participation.submittedAt) {
    res.status(400).json({ error: "Already submitted" });
    return;
  }

  // Score server-side
  const cqs = await prisma.contestQuestion.findMany({
    where: { contestId },
    include: { question: { select: { id: true, correctOption: true } } },
  });

  let score = 0;
  const submittedAnswers = parsed.data;

  for (const cq of cqs) {
    const given = submittedAnswers[cq.questionId];
    if (!given) continue;
    if (given === cq.question.correctOption) {
      score += Number(cq.marks);
    } else {
      score -= Number(cq.negativeMarks);
    }
  }
  score = Math.max(0, score);

  const submittedAt = new Date();

  const isTest = req.user!.role === "ADMIN";

  await prisma.participation.update({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
    data: {
      answers: submittedAnswers,
      draftAnswers: Prisma.JsonNull,
      timeSpent: timeSpent ?? Prisma.JsonNull,
      markedForReview: markedForReview ?? Prisma.JsonNull,
      score,
      submittedAt,
      isTest,
    },
  });

  // Test attempts never enter the shared leaderboard. Keeping them out of
  // Redis is what stops them shifting everyone else's rank and the totals
  // derived from ZCARD.
  if (!isTest) {
    // Encode the tiebreaker: earlier submission wins at equal score.
    const redisScore = score * 1e10 - submittedAt.getTime();
    await redis.zadd(`contest:${contestId}:leaderboard`, redisScore, req.user!.id);
  }

  res.json({ score });
});

// Real-time leaderboard — ?filter=friends shows only followed users + self
router.get("/:id/leaderboard", authenticate, async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const limit = Math.min(Number(req.query.limit) || 10, 100);
  const friendsFilter = req.query.filter === "friends";
  const myId = req.user!.id;

  await finalizeContest(contestId).catch((err) =>
    console.error(`Finalizing contest ${contestId} failed:`, err)
  );

  // For friends filter we need all entries, otherwise just top-N
  const fetchSize = friendsFilter ? 1000 : limit;

  const [allEntries, userRank] = await Promise.all([
    redis.zrevrange(`contest:${contestId}:leaderboard`, 0, fetchSize - 1, "WITHSCORES"),
    redis.zrevrank(`contest:${contestId}:leaderboard`, myId),
  ]);

  // Redis holds a composite sort key — `score * 1e10 - submittedAt` — not a
  // score. It orders correctly, because the smallest score step (0.5) is worth
  // 5e9 in the key while a whole contest's spread of submission times is a few
  // million milliseconds, so the score term always dominates and the timestamp
  // only breaks ties. It does not survive being read back as a number: a
  // present-day timestamp is around 1.8e12, so dividing the key by 1e10 gave
  // every candidate a score near −179 that drifted as the epoch advanced.
  //
  // The ordering is taken from Redis and the numbers from Postgres, which is
  // where the real score lives.
  const allParsed: { userId: string }[] = [];
  for (let i = 0; i < allEntries.length; i += 2) {
    allParsed.push({ userId: allEntries[i] });
  }

  let ranked: { rank: number; userId: string }[];

  if (friendsFilter) {
    const follows = await prisma.follow.findMany({
      where: { followerId: myId },
      select: { followingId: true },
    });
    const friendSet = new Set([...follows.map((f) => f.followingId), myId]);

    // Filter then re-rank; maintain Redis ordering so tiebreaker is preserved
    const filtered = allParsed.filter((e) => friendSet.has(e.userId));
    ranked = filtered.map((e, i) => ({ rank: i + 1, ...e }));

    // Always include self even if not submitted
    if (!ranked.some((e) => e.userId === myId) && userRank !== null) {
      ranked.push({ rank: ranked.length + 1, userId: myId });
    }
  } else {
    ranked = allParsed.slice(0, limit).map((e, i) => ({ rank: i + 1, ...e }));

    // Always include self if not in top-N
    const inTop = userRank !== null && userRank < limit;
    if (!inTop && userRank !== null) {
      ranked.push({ rank: userRank + 1, userId: myId });
    }
  }

  const userIds = [...new Set(ranked.map((e) => e.userId))];
  const [users, scores] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, rating: true },
    }),
    prisma.participation.findMany({
      where: { contestId, userId: { in: userIds } },
      select: { userId: true, score: true },
    }),
  ]);
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const scoreMap = new Map(scores.map((s) => [s.userId, Number(s.score)]));

  res.json(
    ranked.map((e) => ({
      ...e,
      score: scoreMap.get(e.userId) ?? 0,
      name: userMap[e.userId]?.name ?? "Unknown",
      rating: userMap[e.userId]?.rating ?? 0,
      isCurrentUser: e.userId === myId,
    }))
  );
});

// Set the language for an attempt that has not been submitted yet.
//
// Separate from join because join happens on the contest list, while the
// choice is made on the instructions screen a moment later. Refused once the
// paper is submitted: the review has to read as the exam did.
router.post("/:id/language", authenticate, async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const language = parseLanguage(req.body?.language);

  const attempt = await prisma.participation.findUnique({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
    select: { submittedAt: true },
  });
  if (!attempt) { res.status(403).json({ error: "Join the contest first" }); return; }
  if (attempt.submittedAt) { res.status(400).json({ error: "Already submitted" }); return; }

  await prisma.participation.update({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
    data: { language },
  });
  res.json({ language });
});

// Result + answer key (after contest ends)
router.get("/:id/result", authenticate, async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;

  // Close out anyone still open past the contest's end before reading. There
  // is no scheduler in this deployment, so the first request after a contest
  // finishes is what settles it — and it settles every attempt at once, not
  // just the caller's, so ranks do not depend on who happened to look first.
  await finalizeContest(contestId).catch((err) =>
    console.error(`Finalizing contest ${contestId} failed:`, err)
  );

  const [participation, contest] = await Promise.all([
    prisma.participation.findUnique({
      where: { userId_contestId: { userId: req.user!.id, contestId } },
      select: { answers: true, score: true, submittedAt: true, markedForReview: true, isTest: true, language: true },
    }),
    prisma.contest.findUnique({
      where: { id: contestId },
      select: { title: true, startTime: true, durationMinutes: true, negativeMarks: true, sectionLimits: true },
    }),
  ]);
  if (!participation?.submittedAt) {
    res.status(400).json({ error: "Not submitted yet" });
    return;
  }

  // Don't expose correct answers while the contest is still running.
  //
  // Admins are exempt: their attempts are test runs that never reach a
  // leaderboard or rating, and waiting out a three-hour window to check that a
  // paper renders correctly makes the feature useless. Nothing is disclosed
  // that they can't already read in the admin panel, where the answer key
  // lives in plain sight.
  const contestEndMs = contest
    ? new Date(contest.startTime).getTime() + contest.durationMinutes * 60_000
    : 0;
  const contestLive = Date.now() < contestEndMs;
  if (contestLive && req.user!.role !== "ADMIN") {
    res.status(400).json({ error: "Answer key is available after the contest ends." });
    return;
  }

  // Defaults to the language the paper was sat in, but the review — unlike the
  // exam — may be read in either. Nothing about scoring depends on it.
  const resultLanguage = req.query.language
    ? parseLanguage(req.query.language)
    : participation.language ?? DEFAULT_LANGUAGE;

  const cqs = await prisma.contestQuestion.findMany({
    where: { contestId },
    include: {
      question: {
        select: {
          id: true, text: true, imageUrl: true, questionType: true,
          optionA: true, optionB: true, optionC: true, optionD: true,
          correctOption: true, subject: true, difficulty: true,
          structuredData: true, solution: true,
          translations: translationSelect(resultLanguage),
          passage: {
            select: {
              id: true, title: true, content: true, type: true, tableData: true,
              translations: passageTranslationSelect(resultLanguage),
            },
          },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  const [rank, total, ratingHistory, allParticipations] = await Promise.all([
    redis.zrevrank(`contest:${contestId}:leaderboard`, req.user!.id),
    redis.zcard(`contest:${contestId}:leaderboard`),
    prisma.ratingHistory.findUnique({
      where: { userId_contestId: { userId: req.user!.id, contestId } },
      select: { oldRating: true, newRating: true, rank: true },
    }),
    prisma.participation.findMany({
      where: { contestId, submittedAt: { not: null }, isTest: false },
      select: { timeSpent: true },
    }),
  ]);

  // Aggregate per-question average time across all submitted participations
  const timeAcc: Record<string, { sum: number; count: number }> = {};
  for (const p of allParticipations) {
    if (!p.timeSpent || typeof p.timeSpent !== "object") continue;
    for (const [qId, secs] of Object.entries(p.timeSpent as Record<string, number>)) {
      if (typeof secs !== "number") continue;
      if (!timeAcc[qId]) timeAcc[qId] = { sum: 0, count: 0 };
      timeAcc[qId].sum += secs;
      timeAcc[qId].count++;
    }
  }
  const avgTimePerQuestion: Record<string, number> = {};
  for (const [qId, { sum, count }] of Object.entries(timeAcc)) {
    avgTimePerQuestion[qId] = Math.round(sum / count);
  }

  const questions = cqs.map((cq) => localizeQuestion({
    ...cq.question,
    marks: Number(cq.marks),
    negativeMarks: Number(cq.negativeMarks),
  }, resultLanguage));

  const totalMaxMarks = cqs.reduce((sum, cq) => sum + Number(cq.marks), 0);

  res.json({
    score: participation.score,
    // A test attempt is never added to the Redis leaderboard, so zrevrank
    // returns null and the rank is reported as absent rather than invented.
    rank: rank !== null ? rank + 1 : null,
    isTest: participation.isTest,
    totalParticipants: total,
    submittedAt: participation.submittedAt,
    answers: participation.answers,
    markedForReview: participation.markedForReview ?? [],
    questions,
    totalMaxMarks,
    contestTitle: contest?.title ?? '',
    durationMinutes: contest?.durationMinutes ?? 0,
    sectionLimits: contest?.sectionLimits ?? null,
    ratingChange: ratingHistory
      ? {
          oldRating: ratingHistory.oldRating,
          newRating: ratingHistory.newRating,
          delta: ratingHistory.newRating - ratingHistory.oldRating,
        }
      : null,
    avgTimePerQuestion,
  });
});

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export default router;
