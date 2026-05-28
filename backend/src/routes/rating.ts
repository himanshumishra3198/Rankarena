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

// Global rating leaderboard
router.get("/leaderboard", async (_req, res: Response) => {
  const users = await prisma.user.findMany({
    where: { role: "STUDENT" },
    orderBy: { rating: "desc" },
    take: 100,
    select: { id: true, name: true, rating: true },
  });
  res.json(users.map((u, i) => ({ rank: i + 1, ...u })));
});

export default router;
