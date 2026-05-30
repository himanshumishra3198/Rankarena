import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// User's current rating + history
router.get("/users/:id/rating", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, rating: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const history = await prisma.ratingHistory.findMany({
    where: { userId: id },
    orderBy: { createdAt: "asc" },
    select: {
      oldRating: true,
      newRating: true,
      rank: true,
      totalParticipants: true,
      createdAt: true,
      contest: { select: { id: true, title: true } },
    },
  });

  res.json({ ...user, history });
});

// Global rating leaderboard — ?period=week|month|all (default: all)
router.get("/leaderboard", async (req, res: Response) => {
  const period = (req.query.period as string) || "all";

  let dateFilter: Date | undefined;
  if (period === "week")  dateFilter = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  if (period === "month") dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  if (dateFilter) {
    const users = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        ratingHistory: { some: { createdAt: { gte: dateFilter } } },
      },
      select: {
        id: true,
        name: true,
        rating: true,
        ratingHistory: {
          where: { createdAt: { gte: dateFilter } },
          select: { oldRating: true, newRating: true },
        },
      },
      orderBy: { rating: "desc" },
      take: 100,
    });

    res.json(
      users.map((u, i) => ({
        rank: i + 1,
        id: u.id,
        name: u.name,
        rating: u.rating,
        ratingChange: u.ratingHistory.reduce(
          (sum, h) => sum + (Number(h.newRating) - Number(h.oldRating)),
          0
        ),
      }))
    );
    return;
  }

  const users = await prisma.user.findMany({
    where: { role: "STUDENT" },
    orderBy: { rating: "desc" },
    take: 100,
    select: { id: true, name: true, rating: true },
  });
  res.json(users.map((u, i) => ({ rank: i + 1, ...u, ratingChange: null })));
});

export default router;
