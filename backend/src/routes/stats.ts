import { Router, Response } from "express";
import prisma from "../lib/prisma";

const router = Router();

// Public: headline platform stats for the landing page (social proof).
// No auth — cheap counts only.
router.get("/public", async (_req, res: Response) => {
  const [aspirants, mockTests, questions, contests, mockSubs, contestSubs] =
    await Promise.all([
      // Admin accounts are staff, not aspirants.
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.mockTest.count({ where: { isPublished: true } }),
      prisma.question.count(),
      prisma.contest.count(),
      prisma.mockAttempt.count({ where: { submittedAt: { not: null }, isTest: false } }),
      prisma.participation.count({ where: { submittedAt: { not: null }, isTest: false } }),
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
