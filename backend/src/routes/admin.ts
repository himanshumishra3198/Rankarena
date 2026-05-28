import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import redis from "../lib/redis";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate, requireAdmin);

// ── Contests ─────────────────────────────────────────────

const sectionLimitsSchema = z.record(
  z.enum(["QUANT", "REASONING", "ENGLISH", "GK"]),
  z.number().int().min(1)
).optional();

const contestSchema = z.object({
  title: z.string().min(1),
  startTime: z.string().datetime(),
  durationMinutes: z.number().int().min(1),
  negativeMarks: z.number().min(0).default(0.5),
  sectionLimits: sectionLimitsSchema,
});

// List all contests (admin sees all statuses)
router.get("/contests", async (_req, res: Response) => {
  const contests = await prisma.contest.findMany({
    orderBy: { startTime: "desc" },
  });
  res.json(contests);
});

router.post("/contests", async (req: AuthRequest, res: Response) => {
  const parsed = contestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const contest = await prisma.contest.create({ data: parsed.data });
  res.status(201).json(contest);
});

router.put("/contests/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = contestSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const contest = await prisma.contest.update({ where: { id }, data: parsed.data });
  res.json(contest);
});

router.delete("/contests/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  await prisma.contest.delete({ where: { id } });
  res.json({ ok: true });
});

const statusSchema = z.object({
  status: z.enum(["SCHEDULED", "LIVE", "ENDED"]),
});

router.post("/contests/:id/status", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const contest = await prisma.contest.update({
    where: { id },
    data: { status: parsed.data.status },
  });
  res.json(contest);
});

// Restart an ended contest at a new start time (clears all participation data)
router.post("/contests/:id/restart", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = z.object({ startTime: z.string().datetime() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "startTime is required (ISO 8601)" });
    return;
  }

  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) {
    res.status(404).json({ error: "Contest not found" });
    return;
  }
  if (contest.status !== "ENDED") {
    res.status(400).json({ error: "Only ENDED contests can be restarted" });
    return;
  }

  // Wipe all participation data and rating history so users can take it fresh
  await prisma.$transaction([
    prisma.participation.deleteMany({ where: { contestId: id } }),
    prisma.ratingHistory.deleteMany({ where: { contestId: id } }),
  ]);

  // Clear Redis leaderboard
  await redis.del(`contest:${id}:leaderboard`);

  const updated = await prisma.contest.update({
    where: { id },
    data: { startTime: new Date(parsed.data.startTime), status: "SCHEDULED" },
  });

  res.json(updated);
});

// ── Questions ─────────────────────────────────────────────

const questionSchema = z.object({
  text: z.string().min(1),
  imageUrl: z.string().optional(),
  optionA: z.string().min(1),
  optionB: z.string().min(1),
  optionC: z.string().min(1),
  optionD: z.string().min(1),
  correctOption: z.enum(["A", "B", "C", "D"]),
  subject: z.enum(["QUANT", "REASONING", "ENGLISH", "GK"]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
});

router.post("/questions", async (req: AuthRequest, res: Response) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const question = await prisma.question.create({ data: parsed.data });
  res.status(201).json(question);
});

router.get("/questions", async (req: AuthRequest, res: Response) => {
  const subject = req.query.subject as string | undefined;
  const difficulty = req.query.difficulty as string | undefined;
  const questions = await prisma.question.findMany({
    where: {
      ...(subject ? { subject: subject as any } : {}),
      ...(difficulty ? { difficulty: difficulty as any } : {}),
    },
    orderBy: { subject: "asc" },
  });
  res.json(questions);
});

router.put("/questions/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = questionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const question = await prisma.question.update({ where: { id }, data: parsed.data });
  res.json(question);
});

router.delete("/questions/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  await prisma.question.delete({ where: { id } });
  res.json({ ok: true });
});

// ── Contest <-> Questions ─────────────────────────────────

const addQuestionSchema = z.object({
  questionId: z.string().uuid(),
  displayOrder: z.number().int().min(1),
  marks: z.number().default(2),
  negativeMarks: z.number().default(0.5),
});

// List questions in a contest (with full question data)
router.get("/contests/:id/questions", async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const cqs = await prisma.contestQuestion.findMany({
    where: { contestId },
    include: { question: true },
    orderBy: { displayOrder: "asc" },
  });
  res.json(cqs);
});

router.post("/contests/:id/questions", async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const parsed = addQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const cq = await prisma.contestQuestion.create({
    data: { contestId, ...parsed.data },
  });
  res.status(201).json(cq);
});

router.delete("/contests/:id/questions/:qid", async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const questionId = req.params.qid as string;
  await prisma.contestQuestion.delete({
    where: { contestId_questionId: { contestId, questionId } },
  });
  res.json({ ok: true });
});

const bulkQuestionSchema = z.array(
  questionSchema.extend({
    marks: z.number().default(2),
    negativeMarks: z.number().default(0.5),
  })
).min(1);

router.post("/contests/:id/questions/bulk", async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const parsed = bulkQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Find current max display order for this contest
  const lastCq = await prisma.contestQuestion.findFirst({
    where: { contestId },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });
  let nextOrder = (lastCq?.displayOrder ?? 0) + 1;

  const results = await prisma.$transaction(
    parsed.data.map(({ marks, negativeMarks, ...qData }) =>
      prisma.question.create({
        data: {
          ...qData,
          contestQuestions: {
            create: {
              contestId,
              displayOrder: nextOrder++,
              marks,
              negativeMarks,
            },
          },
        },
      })
    )
  );

  res.status(201).json({ created: results.length });
});

export default router;
