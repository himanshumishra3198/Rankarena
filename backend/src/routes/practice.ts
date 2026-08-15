import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { Prisma } from "../generated/prisma/client";

const router = Router();
router.use(authenticate);

const CARD_SELECT = {
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
  passage: { select: { id: true, title: true, content: true, type: true, tableData: true } },
} satisfies Prisma.QuestionSelect;

type Card = Prisma.QuestionGetPayload<{ select: typeof CARD_SELECT }>;

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
// falling through subject+topic+difficulty -> subject+topic -> subject-only
// (the last tier is also what covers untagged questions, since `topic` is
// optional). The endpoint only receives `questionId`, not which specific
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
      where: { ...where, id: { notIn: [...excluded] } },
      select: CARD_SELECT,
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

  if (results.length < limit) {
    const tier3 = await pickTier({ subject: original.subject }, limit - results.length);
    results.push(...tier3);
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
    questions: results.map((r) => ({ ...r, bookmarked: bookmarked.has(r.id) })),
  });
});

export default router;
