import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// Follow a user
router.post("/:userId", authenticate, async (req: AuthRequest, res: Response) => {
  const followingId = req.params.userId as string;
  const followerId = req.user!.id;

  if (followerId === followingId) {
    res.status(400).json({ error: "Cannot follow yourself" });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: followingId }, select: { id: true } });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId, followingId } },
    create: { followerId, followingId },
    update: {},
  });

  res.json({ following: true });
});

// Unfollow a user
router.delete("/:userId", authenticate, async (req: AuthRequest, res: Response) => {
  const followingId = req.params.userId as string;
  const followerId = req.user!.id;

  await prisma.follow.deleteMany({ where: { followerId, followingId } });

  res.json({ following: false });
});

// IDs of users I follow (used by frontend for friends leaderboard)
router.get("/following", authenticate, async (req: AuthRequest, res: Response) => {
  const follows = await prisma.follow.findMany({
    where: { followerId: req.user!.id },
    select: { followingId: true },
  });
  res.json(follows.map((f) => f.followingId));
});

export default router;
