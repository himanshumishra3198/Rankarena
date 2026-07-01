import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// IDs of the user's bookmarked questions (for toggling state on result pages).
router.get("/ids", async (req: AuthRequest, res: Response) => {
  const rows = await prisma.bookmark.findMany({
    where: { userId: req.user!.id },
    select: { questionId: true },
  });
  res.json(rows.map((r) => r.questionId));
});

// Full list of bookmarked questions (with answers + solution) for revision.
router.get("/", async (req: AuthRequest, res: Response) => {
  const rows = await prisma.bookmark.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: {
      question: {
        select: {
          id: true, text: true, questionType: true, imageUrl: true,
          optionA: true, optionB: true, optionC: true, optionD: true,
          correctOption: true, subject: true, difficulty: true,
          structuredData: true, solution: true,
          passage: { select: { id: true, title: true, content: true, type: true, tableData: true } },
        },
      },
    },
  });
  res.json(rows.map((r) => ({ bookmarkedAt: r.createdAt, ...r.question })));
});

// Toggle a bookmark for a question. Returns { bookmarked: boolean }.
router.post("/:questionId", async (req: AuthRequest, res: Response) => {
  const questionId = req.params.questionId as string;
  const userId = req.user!.id;

  const existing = await prisma.bookmark.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });
  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    res.json({ bookmarked: false });
    return;
  }
  const q = await prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
  if (!q) { res.status(404).json({ error: "Question not found" }); return; }
  await prisma.bookmark.create({ data: { userId, questionId } });
  res.json({ bookmarked: true });
});

export default router;
