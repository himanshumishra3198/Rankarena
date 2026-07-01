import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

const reportSchema = z.object({
  questionId: z.string().uuid(),
  reason: z.enum(["WRONG_ANSWER", "TYPO", "UNCLEAR", "MULTIPLE_CORRECT", "OTHER"]),
  details: z.string().max(1000).optional().nullable(),
  source: z.string().max(120).optional().nullable(),
});

// Student flags a question (wrong answer, typo, etc.). One open report per
// user+question — re-submitting updates the existing open one instead of piling up.
router.post("/", async (req: AuthRequest, res: Response) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { questionId, reason, details, source } = parsed.data;

  const question = await prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const existing = await prisma.questionReport.findFirst({
    where: { questionId, userId: req.user!.id, status: "OPEN" },
    select: { id: true },
  });

  if (existing) {
    await prisma.questionReport.update({
      where: { id: existing.id },
      data: { reason, details: details ?? null, source: source ?? null },
    });
  } else {
    await prisma.questionReport.create({
      data: { questionId, userId: req.user!.id, reason, details: details ?? null, source: source ?? null },
    });
  }

  res.status(201).json({ ok: true });
});

export default router;
