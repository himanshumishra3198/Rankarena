import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { EXAM_KEYS, examSpec } from "../lib/exams";

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

  /**
   * What exists for each examination, so the front page can describe them
   * from the catalogue rather than from a copywriter's hopes.
   *
   * An exam with nothing published yet reports zeroes and the page says so.
   * Claiming a CAT catalogue that is not there would cost more than the
   * visit it won: somebody signs up, looks for the papers, and finds none.
   */
  const byExam = await Promise.all(
    EXAM_KEYS.map(async (exam) => ({
      exam,
      label: examSpec(exam).label,
      sections: examSpec(exam).sections.map((s) => s.short),
      mockTests: await prisma.mockTest.count({ where: { exam, isPublished: true } }),
      questions: await prisma.question.count({ where: { exam } }),
      // Only contests a candidate could actually sit. An empty shell
      // scheduled for next year is not something to advertise, and counting
      // it made the front page offer links into nothing.
      contests: await prisma.contest.count({
        where: { exam, contestQuestions: { some: {} } },
      }),
    })),
  );

  res.json({
    aspirants,
    mockTests,
    questions,
    contests,
    testsTaken: mockSubs + contestSubs,
    exams: byExam,
  });
});

export default router;
