import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { Prisma } from "../generated/prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// List published mock tests (grouped client-side by subject). Includes the
// current user's best attempt summary and the question count.
router.get("/", async (req: AuthRequest, res: Response) => {
  const mocks = await prisma.mockTest.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { mockTestQuestions: true } } },
  });

  const attempts = await prisma.mockAttempt.findMany({
    where: { userId: req.user!.id, submittedAt: { not: null } },
    select: { mockTestId: true, score: true, totalMarks: true },
  });
  const attemptMap = new Map(attempts.map((a) => [a.mockTestId, a]));

  const result = mocks.map((m) => {
    const a = attemptMap.get(m.id);
    return {
      id: m.id,
      title: m.title,
      subject: m.subject,
      durationMinutes: m.durationMinutes,
      negativeMarks: Number(m.negativeMarks),
      questionCount: m._count.mockTestQuestions,
      attempted: !!a,
      lastScore: a ? Number(a.score) : null,
      lastTotal: a ? Number(a.totalMarks) : null,
    };
  });
  res.json(result);
});

// Fetch a mock's metadata + questions (no correct answers).
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const mock = await prisma.mockTest.findUnique({ where: { id } });
  if (!mock || !mock.isPublished) {
    res.status(404).json({ error: "Mock test not found" });
    return;
  }

  const mtqs = await prisma.mockTestQuestion.findMany({
    where: { mockTestId: id },
    include: {
      question: {
        select: {
          id: true, text: true, questionType: true,
          optionA: true, optionB: true, optionC: true, optionD: true,
          subject: true, difficulty: true, imageUrl: true, structuredData: true,
          passage: { select: { id: true, title: true, content: true, type: true, tableData: true } },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  const questions = mtqs.map((mtq) => ({
    ...mtq.question,
    marks: Number(mtq.marks),
    negativeMarks: Number(mtq.negativeMarks),
  }));

  res.json({
    id: mock.id,
    title: mock.title,
    subject: mock.subject,
    durationMinutes: mock.durationMinutes,
    negativeMarks: Number(mock.negativeMarks),
    questions,
  });
});

// Submit a mock attempt — scored server-side, retakeable (upsert).
router.post("/:id/submit", async (req: AuthRequest, res: Response) => {
  const mockTestId = req.params.id as string;
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

  const mock = await prisma.mockTest.findUnique({ where: { id: mockTestId } });
  if (!mock || !mock.isPublished) {
    res.status(404).json({ error: "Mock test not found" });
    return;
  }

  const mtqs = await prisma.mockTestQuestion.findMany({
    where: { mockTestId },
    include: { question: { select: { id: true, correctOption: true } } },
  });

  const answers = parsed.data;
  let score = 0, totalMarks = 0, correct = 0, wrong = 0, skipped = 0;
  for (const mtq of mtqs) {
    totalMarks += Number(mtq.marks);
    const given = answers[mtq.questionId];
    if (!given) { skipped++; continue; }
    if (given === mtq.question.correctOption) {
      score += Number(mtq.marks);
      correct++;
    } else {
      score -= Number(mtq.negativeMarks);
      wrong++;
    }
  }
  score = Math.max(0, score);

  const submittedAt = new Date();
  const data = {
    score, totalMarks, correctCount: correct, wrongCount: wrong, skippedCount: skipped,
    answers, timeSpent: timeSpent ?? Prisma.JsonNull,
    markedForReview: markedForReview ?? Prisma.JsonNull, submittedAt,
  };

  await prisma.mockAttempt.upsert({
    where: { userId_mockTestId: { userId: req.user!.id, mockTestId } },
    create: { userId: req.user!.id, mockTestId, ...data },
    update: { ...data, startedAt: new Date() },
  });

  res.json({ score, totalMarks, correct, wrong, skipped });
});

// Result: attempt + full questions with correct answers for review.
router.get("/:id/result", async (req: AuthRequest, res: Response) => {
  const mockTestId = req.params.id as string;
  const attempt = await prisma.mockAttempt.findUnique({
    where: { userId_mockTestId: { userId: req.user!.id, mockTestId } },
  });
  if (!attempt || !attempt.submittedAt) {
    res.status(404).json({ error: "No submission found" });
    return;
  }

  const mock = await prisma.mockTest.findUnique({ where: { id: mockTestId } });
  const mtqs = await prisma.mockTestQuestion.findMany({
    where: { mockTestId },
    include: {
      question: {
        select: {
          id: true, text: true, questionType: true, imageUrl: true,
          optionA: true, optionB: true, optionC: true, optionD: true,
          correctOption: true, subject: true, difficulty: true, structuredData: true,
          solution: true,
          passage: { select: { id: true, title: true, content: true, type: true, tableData: true } },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  const questions = mtqs.map((mtq) => ({
    ...mtq.question,
    marks: Number(mtq.marks),
    negativeMarks: Number(mtq.negativeMarks),
  }));

  // ── Rank / percentile + per-question aggregates across all submitted attempts ──
  const allAttempts = await prisma.mockAttempt.findMany({
    where: { mockTestId, submittedAt: { not: null } },
    select: { userId: true, score: true, answers: true, timeSpent: true },
  });

  const totalTakers = allAttempts.length;
  const myScore = Number(attempt.score);
  // Rank = 1 + number of attempts with a strictly higher score.
  const higher = allAttempts.filter((a) => Number(a.score) > myScore).length;
  const rank = higher + 1;
  // Percentile = % of takers you scored at least as well as (excluding yourself).
  const percentile = totalTakers > 1
    ? Math.round((allAttempts.filter((a) => Number(a.score) < myScore).length / (totalTakers - 1)) * 1000) / 10
    : 100;

  // Per-question: how many answered, how many correct, total time (for averages).
  const correctMap = new Map(mtqs.map((m) => [m.questionId, m.question.correctOption]));
  const qStats: Record<string, { answered: number; correct: number; timeSum: number; timeCount: number }> = {};
  for (const m of mtqs) qStats[m.questionId] = { answered: 0, correct: 0, timeSum: 0, timeCount: 0 };
  for (const a of allAttempts) {
    const ans = (a.answers ?? {}) as Record<string, string>;
    const ts = (a.timeSpent ?? {}) as Record<string, number>;
    for (const qid of Object.keys(qStats)) {
      const given = ans[qid];
      if (given) {
        qStats[qid].answered++;
        if (given === correctMap.get(qid)) qStats[qid].correct++;
      }
      const t = ts[qid];
      if (typeof t === "number" && t > 0) { qStats[qid].timeSum += t; qStats[qid].timeCount++; }
    }
  }
  const questionStats: Record<string, { correctPct: number; avgTime: number }> = {};
  for (const qid of Object.keys(qStats)) {
    const s = qStats[qid];
    questionStats[qid] = {
      correctPct: s.answered > 0 ? Math.round((s.correct / s.answered) * 100) : 0,
      avgTime: s.timeCount > 0 ? Math.round(s.timeSum / s.timeCount) : 0,
    };
  }

  // Top scorers (leaderboard for this mock) — highest score, earliest submit wins ties.
  const topRows = await prisma.mockAttempt.findMany({
    where: { mockTestId, submittedAt: { not: null } },
    orderBy: [{ score: "desc" }, { submittedAt: "asc" }],
    take: 10,
    select: { userId: true, score: true, user: { select: { name: true } } },
  });
  const topScorers = topRows.map((t, i) => ({
    rank: i + 1,
    name: t.user.name,
    score: Number(t.score),
    isCurrentUser: t.userId === req.user!.id,
  }));

  res.json({
    mockTitle: mock?.title ?? "",
    subject: mock?.subject ?? "",
    durationMinutes: mock?.durationMinutes ?? 0,
    score: Number(attempt.score),
    totalMarks: Number(attempt.totalMarks),
    correct: attempt.correctCount,
    wrong: attempt.wrongCount,
    skipped: attempt.skippedCount,
    answers: attempt.answers ?? {},
    timeSpent: attempt.timeSpent ?? {},
    markedForReview: attempt.markedForReview ?? [],
    submittedAt: attempt.submittedAt,
    rank,
    totalTakers,
    percentile,
    topScorers,
    questionStats,
    questions,
  });
});

export default router;
