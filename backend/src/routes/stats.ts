import { Router, Response } from "express";
import prisma from "../lib/prisma";

const router = Router();

// Public: headline platform stats for the landing page (social proof).
// No auth — cheap counts only.
router.get("/public", async (_req, res: Response) => {
  const [aspirants, mockTests, questions, contests, mockSubs, contestSubs] =
    await Promise.all([
      prisma.user.count(),
      prisma.mockTest.count({ where: { isPublished: true } }),
      prisma.question.count(),
      prisma.contest.count(),
      prisma.mockAttempt.count({ where: { submittedAt: { not: null } } }),
      prisma.participation.count({ where: { submittedAt: { not: null } } }),
    ]);

  res.json({
    aspirants,
    mockTests,
    questions,
    contests,
    testsTaken: mockSubs + contestSubs,
  });
});

export default router;
