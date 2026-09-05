import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { settleEndedContests } from "../lib/settleContest";

const router = Router();

async function buildProfileData(userId: string) {
  // The profile is where a stale rating is noticed, so settle anything
  // overdue before reading it rather than showing 1500 and an empty graph
  // until someone happens to open a contest result. Throttled, and a no-op
  // once everything overdue is marked ENDED.
  await settleEndedContests();

  const [user, ratingHistory, participations, mockAttempts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, rating: true, createdAt: true },
    }),
    prisma.ratingHistory.findMany({
      where: { userId },
      include: { contest: { select: { title: true, startTime: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.participation.findMany({
      where: { userId, submittedAt: { not: null } },
      select: { contestId: true, submittedAt: true, answers: true },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.mockAttempt.findMany({
      where: { userId, submittedAt: { not: null } },
      select: {
        submittedAt: true, correctCount: true, wrongCount: true,
        mockTestId: true, answers: true,
      },
    }),
  ]);

  if (!user) return null;

  // Heatmap: date → number of problems solved that day (contests + mocks).
  // A day only appears if at least one problem was actually attempted, so it
  // reflects a problem-solving streak, not just tests taken.
  const heatmap: Record<string, number> = {};
  let totalSolved = 0;
  for (const p of participations) {
    const answered = Object.keys((p.answers as Record<string, string>) ?? {}).length;
    if (answered <= 0) continue;
    const date = p.submittedAt!.toISOString().split("T")[0];
    heatmap[date] = (heatmap[date] ?? 0) + answered;
    totalSolved += answered;
  }
  for (const a of mockAttempts) {
    const solved = a.correctCount + a.wrongCount;
    if (solved <= 0) continue;
    const date = a.submittedAt!.toISOString().split("T")[0];
    heatmap[date] = (heatmap[date] ?? 0) + solved;
    totalSolved += solved;
  }

  // ── Accuracy, by subject and by topic ──────────────────────────────────
  //
  // Walks contests and mocks together. It used to count contests only, which
  // meant the subject bars ignored every mock a candidate had ever sat while
  // the heatmap right above them counted those same questions — two numbers
  // on one page disagreeing about the same work.
  //
  // Topic is the level the answer actually lives at. `subject` is four
  // buckets, so "61% at Quant" says nothing you can act on; topics/lib has 49
  // entries, and knowing you are 32% on Simple & Compound Interest tells you
  // what to open next. Questions with no topic tag are counted in the subject
  // totals and skipped for topics — an "Untagged" row is not a study plan.
  const subjectStats: Record<string, { correct: number; wrong: number; skipped: number }> = {};
  const topicStats: Record<string, { subject: string; correct: number; wrong: number; skipped: number }> = {};
  let totalCorrect = 0, totalWrong = 0, totalSkipped = 0;

  type QMeta = { subject: string; topic: string | null; correctOption: string };

  function record(meta: QMeta, given: string | undefined) {
    const verdict = !given ? "skipped" : given === meta.correctOption ? "correct" : "wrong";

    if (!subjectStats[meta.subject]) subjectStats[meta.subject] = { correct: 0, wrong: 0, skipped: 0 };
    subjectStats[meta.subject][verdict]++;

    if (meta.topic) {
      if (!topicStats[meta.topic]) {
        topicStats[meta.topic] = { subject: meta.subject, correct: 0, wrong: 0, skipped: 0 };
      }
      topicStats[meta.topic][verdict]++;
    }

    if (verdict === "correct") totalCorrect++;
    else if (verdict === "wrong") totalWrong++;
    else totalSkipped++;
  }

  const questionSelect = { subject: true, topic: true, correctOption: true } as const;

  const contestIds = [...new Set(participations.map((p) => p.contestId))];
  const mockIds = [...new Set(mockAttempts.map((a) => a.mockTestId))];

  const [contestQuestions, mockQuestions] = await Promise.all([
    contestIds.length > 0
      ? prisma.contestQuestion.findMany({
          where: { contestId: { in: contestIds } },
          select: { contestId: true, questionId: true, question: { select: questionSelect } },
        })
      : [],
    mockIds.length > 0
      ? prisma.mockTestQuestion.findMany({
          where: { mockTestId: { in: mockIds } },
          select: { mockTestId: true, questionId: true, question: { select: questionSelect } },
        })
      : [],
  ]);

  // testId -> questionId -> metadata, so each attempt is scored against the
  // paper it was actually sat on.
  function groupByTest<T extends { questionId: string; question: QMeta }>(
    rows: T[],
    testIdOf: (row: T) => string,
  ) {
    const byTest = new Map<string, Map<string, QMeta>>();
    for (const row of rows) {
      const id = testIdOf(row);
      if (!byTest.has(id)) byTest.set(id, new Map());
      byTest.get(id)!.set(row.questionId, row.question);
    }
    return byTest;
  }

  const cqByContest = groupByTest(contestQuestions, (r) => r.contestId);
  const mqByMock = groupByTest(mockQuestions, (r) => r.mockTestId);

  for (const p of participations) {
    const answers = (p.answers as Record<string, string>) ?? {};
    for (const [qId, meta] of cqByContest.get(p.contestId) ?? []) record(meta, answers[qId]);
  }
  for (const a of mockAttempts) {
    const answers = (a.answers as Record<string, string>) ?? {};
    for (const [qId, meta] of mqByMock.get(a.mockTestId) ?? []) record(meta, answers[qId]);
  }

  // Streak computation
  const sortedDates = Object.keys(heatmap).sort();
  let maxStreak = 0, currentStreak = 0;

  if (sortedDates.length > 0) {
    let streak = 1;
    maxStreak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
      streak = diffDays === 1 ? streak + 1 : 1;
      if (streak > maxStreak) maxStreak = streak;
    }
    const todayStr = new Date().toISOString().split("T")[0];
    const lastDate = sortedDates[sortedDates.length - 1];
    const daysAgo = Math.round(
      (new Date(todayStr).getTime() - new Date(lastDate).getTime()) / 86_400_000
    );
    if (daysAgo <= 1) {
      currentStreak = 1;
      for (let i = sortedDates.length - 1; i > 0; i--) {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        if (Math.round((curr.getTime() - prev.getTime()) / 86_400_000) === 1) currentStreak++;
        else break;
      }
    }
  }

  const bestRank = ratingHistory.length > 0 ? Math.min(...ratingHistory.map((r) => r.rank)) : null;
  const maxRating = ratingHistory.length > 0 ? Math.max(...ratingHistory.map((r) => r.newRating)) : user.rating;

  const [followerCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);

  return {
    user: { ...user, createdAt: user.createdAt.toISOString(), followerCount, followingCount },
    ratingHistory: ratingHistory.map((r) => ({
      contestId: r.contestId,
      contestTitle: r.contest.title,
      date: r.contest.startTime.toISOString(),
      oldRating: r.oldRating,
      newRating: r.newRating,
      rank: r.rank,
      totalParticipants: r.totalParticipants,
    })),
    heatmap,
    stats: {
      totalContests: participations.length,
      totalMocks: mockAttempts.length,
      totalSolved,
      activeDays: Object.keys(heatmap).length,
      bestRank, maxRating, maxStreak, currentStreak,
    },
    subjectStats,
    topicStats: Object.entries(topicStats).map(([topic, v]) => ({ topic, ...v })),
    verdictTotals: { correct: totalCorrect, wrong: totalWrong, skipped: totalSkipped, total: totalCorrect + totalWrong + totalSkipped },
  };
}

// Own profile
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const data = await buildProfileData(userId);
  if (!data) { res.status(404).json({ error: "User not found" }); return; }
  const email = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  res.json({ ...data, user: { ...data.user, email: email?.email } });
});

// Public profile for any user
router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.params.id as string;
  const viewerId = req.user!.id;
  const data = await buildProfileData(userId);
  if (!data) { res.status(404).json({ error: "User not found" }); return; }
  const isFollowing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
  });
  res.json({ ...data, isFollowing: !!isFollowing, isOwnProfile: userId === viewerId });
});

export default router;
