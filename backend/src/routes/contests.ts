import { Router, Response } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";
import redis from "../lib/redis";
import { authenticate, AuthRequest } from "../middleware/auth";
import { Prisma } from "../generated/prisma/client";

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
    _count: { select: { participations: true } },
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

  const allContests = [...active, ...past];

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

  res.json({ active: active.map(withJoined), past: past.map(withJoined) });
});

// Contest detail
router.get("/:id", async (req, res: Response) => {
  const id = req.params.id as string;
  const contest = await prisma.contest.findUnique({
    where: { id },
    include: {
      _count: { select: { contestQuestions: true, participations: true } },
    },
  });
  if (!contest) {
    res.status(404).json({ error: "Contest not found" });
    return;
  }
  res.json(contest);
});

// Join contest
router.post("/:id/join", authenticate, async (req: AuthRequest, res: Response) => {
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

  const participation = await prisma.participation.upsert({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
    create: { userId: req.user!.id, contestId },
    update: {},
  });

  res.status(201).json(participation);
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

  const cqs = await prisma.contestQuestion.findMany({
    where: { contestId },
    include: {
      question: {
        select: {
          id: true, text: true,
          optionA: true, optionB: true, optionC: true, optionD: true,
          subject: true, difficulty: true,
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  const seed = req.user!.id;
  const questions = cqs
    .map((cq) => ({ ...cq.question, marks: cq.marks, negativeMarks: cq.negativeMarks }))
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
router.post("/:id/submit", authenticate, async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const answersSchema = z.record(z.string(), z.enum(["A", "B", "C", "D"]));
  const parsed = answersSchema.safeParse(req.body.answers);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid answers format" });
    return;
  }
  const timeSpentParsed = z.record(z.string(), z.number()).safeParse(req.body.timeSpent);
  const timeSpent = timeSpentParsed.success ? timeSpentParsed.data : null;

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

  await prisma.participation.update({
    where: { userId_contestId: { userId: req.user!.id, contestId } },
    data: {
      answers: submittedAnswers,
      draftAnswers: Prisma.JsonNull,
      timeSpent: timeSpent ?? Prisma.JsonNull,
      score,
      submittedAt,
    },
  });

  // Update Redis leaderboard — encode tiebreaker (earlier submission = higher rank for same score)
  const redisScore = score * 1e10 - submittedAt.getTime();
  await redis.zadd(`contest:${contestId}:leaderboard`, redisScore, req.user!.id);

  res.json({ score });
});

// Real-time leaderboard
router.get("/:id/leaderboard", authenticate, async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const limit = Math.min(Number(req.query.limit) || 10, 100);

  const [entries, userRank] = await Promise.all([
    redis.zrevrange(`contest:${contestId}:leaderboard`, 0, limit - 1, "WITHSCORES"),
    redis.zrevrank(`contest:${contestId}:leaderboard`, req.user!.id),
  ]);

  const ranked: { rank: number; userId: string; score: number }[] = [];
  for (let i = 0; i < entries.length; i += 2) {
    const userId = entries[i];
    const redisScore = Number(entries[i + 1]);
    const score = Math.floor(redisScore / 1e10);
    ranked.push({ rank: ranked.length + 1, userId, score });
  }

  // If current user is not in top-N, fetch their entry too
  const currentUserInTop = userRank !== null && userRank < limit;
  if (!currentUserInTop && userRank !== null) {
    const myScore = await redis.zscore(`contest:${contestId}:leaderboard`, req.user!.id);
    if (myScore !== null) {
      ranked.push({ rank: userRank + 1, userId: req.user!.id, score: Math.floor(Number(myScore) / 1e10) });
    }
  }

  // Fetch user names in one query
  const userIds = [...new Set(ranked.map((e) => e.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, rating: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  res.json(
    ranked.map((e) => ({
      ...e,
      name: userMap[e.userId]?.name ?? "Unknown",
      rating: userMap[e.userId]?.rating ?? 0,
      isCurrentUser: e.userId === req.user!.id,
    }))
  );
});

// Result + answer key (after contest ends)
router.get("/:id/result", authenticate, async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const [participation, contest] = await Promise.all([
    prisma.participation.findUnique({
      where: { userId_contestId: { userId: req.user!.id, contestId } },
      select: { answers: true, score: true, submittedAt: true },
    }),
    prisma.contest.findUnique({
      where: { id: contestId },
      select: { title: true, durationMinutes: true, negativeMarks: true, sectionLimits: true },
    }),
  ]);
  if (!participation?.submittedAt) {
    res.status(400).json({ error: "Not submitted yet" });
    return;
  }

  const cqs = await prisma.contestQuestion.findMany({
    where: { contestId },
    include: {
      question: {
        select: {
          id: true, text: true, imageUrl: true,
          optionA: true, optionB: true, optionC: true, optionD: true,
          correctOption: true, subject: true, difficulty: true,
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
      where: { contestId, submittedAt: { not: null } },
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

  const questions = cqs.map((cq) => ({
    ...cq.question,
    marks: Number(cq.marks),
    negativeMarks: Number(cq.negativeMarks),
  }));

  const totalMaxMarks = cqs.reduce((sum, cq) => sum + Number(cq.marks), 0);

  res.json({
    score: participation.score,
    rank: rank !== null ? rank + 1 : null,
    totalParticipants: total,
    submittedAt: participation.submittedAt,
    answers: participation.answers,
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
