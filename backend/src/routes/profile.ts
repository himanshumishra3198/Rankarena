import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

async function buildProfileData(userId: string) {
  const [user, ratingHistory, participations] = await Promise.all([
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
      select: { submittedAt: true },
      orderBy: { submittedAt: "asc" },
    }),
  ]);

  if (!user) return null;

  const heatmap: Record<string, number> = {};
  for (const p of participations) {
    const date = p.submittedAt!.toISOString().split("T")[0];
    heatmap[date] = (heatmap[date] ?? 0) + 1;
  }

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
      bestRank,
      maxRating,
      maxStreak,
      currentStreak,
    },
  };
}

// Own profile
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const data = await buildProfileData(userId);
  if (!data) { res.status(404).json({ error: "User not found" }); return; }
  // Add email only for own profile
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
