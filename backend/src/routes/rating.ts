import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { Prisma } from "../generated/prisma/client";
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
/**
 * The ranking, paginated.
 *
 * Rank comes from a window function rather than the row's position in the
 * page, which is what makes search work: looking somebody up has to report
 * where they sit in the whole field, not where they landed in a filtered
 * list of one. RANK() also settles ties the same way everywhere — equal
 * ratings share a place and the next rank skips — so the frontend never has
 * to invent a tie-break of its own.
 *
 * `offset` is accepted alongside `page` so a caller can ask for a window
 * around a known rank ("the six people nearest me") without arithmetic on
 * page boundaries.
 */
router.get("/leaderboard", async (req, res: Response) => {
  const period = (req.query.period as string) || "all";
  const since =
    period === "week" ? new Date(Date.now() - 7 * 86_400_000)
    : period === "month" ? new Date(Date.now() - 30 * 86_400_000)
    : null;

  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = req.query.offset !== undefined
    ? Math.max(Number(req.query.offset) || 0, 0)
    : (page - 1) * limit;

  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
  const minRating = Number(req.query.minRating) || 0;

  // Only students are ranked; a period narrows the field to people who were
  // actually rated inside it, which is what makes a weekly board weekly.
  const periodFilter = since
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM rating_history rh WHERE rh.user_id = u.id AND rh.created_at >= ${since})`
    : Prisma.empty;
  const searchFilter = q ? Prisma.sql`AND r.name ILIKE ${"%" + q + "%"}` : Prisma.empty;
  const ratingFilter = minRating > 0 ? Prisma.sql`AND r.rating >= ${minRating}` : Prisma.empty;
  const changeWindow = since
    ? Prisma.sql`AND rh.created_at >= ${since}`
    : Prisma.empty;

  const ranked = Prisma.sql`
    WITH base AS (
      SELECT u.id, u.name, u.rating
      FROM users u
      WHERE u.role = 'STUDENT' ${periodFilter}
    ),
    ranked AS (
      SELECT b.*, RANK() OVER (ORDER BY b.rating DESC) AS rank FROM base b
    )
  `;

  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<{
      id: string; name: string; rating: number; rank: bigint;
      contests: number; best_rank: number | null; change: number | null;
    }[]>`
      ${ranked}
      SELECT r.id, r.name, r.rating, r.rank,
        (SELECT COUNT(*) FROM rating_history rh WHERE rh.user_id = r.id)::int AS contests,
        (SELECT MIN(rh.rank) FROM rating_history rh WHERE rh.user_id = r.id)::int AS best_rank,
        (SELECT COALESCE(SUM(rh.new_rating - rh.old_rating), 0)
           FROM rating_history rh
          WHERE rh.user_id = r.id ${changeWindow})::int AS change
      FROM ranked r
      WHERE TRUE ${searchFilter} ${ratingFilter}
      ORDER BY r.rank ASC, r.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `,
    prisma.$queryRaw<{ matched: bigint; ranked_total: bigint }[]>`
      ${ranked}
      SELECT
        (SELECT COUNT(*) FROM ranked r WHERE TRUE ${searchFilter} ${ratingFilter})::bigint AS matched,
        (SELECT COUNT(*) FROM ranked)::bigint AS ranked_total
    `,
  ]);

  const matched = Number(totals[0]?.matched ?? 0);
  const rankedTotal = Number(totals[0]?.ranked_total ?? 0);

  res.json({
    entries: rows.map((r) => ({
      rank: Number(r.rank),
      id: r.id,
      name: r.name,
      rating: r.rating,
      // Over the chosen window: the whole of their history for "all time",
      // just this week's or month's movement otherwise.
      ratingChange: r.change,
      contests: r.contests,
      bestRank: r.best_rank,
    })),
    total: matched,
    rankedTotal,
    page, pageSize: limit, offset,
    pageCount: Math.max(Math.ceil(matched / limit), 1),
  });
});

/**
 * How many rated students sit in each tier.
 *
 * The bands are the ones in the client's tiers.ts, passed in by the caller
 * so there is still only one place that defines them. Anything that does not
 * parse is ignored rather than silently bucketed somewhere wrong.
 */
router.get("/distribution", async (req, res: Response) => {
  const raw = typeof req.query.bands === "string" ? req.query.bands : "";
  const bands = raw
    .split(",")
    .map((b) => b.split(":").map(Number))
    .filter((p) => p.length === 2 && p.every((n) => Number.isFinite(n)))
    .map(([min, max]) => ({ min, max }));

  if (bands.length === 0) {
    res.status(400).json({ error: "bands is required, as min:max pairs" });
    return;
  }

  const counts = await Promise.all(
    bands.map((b) =>
      prisma.user.count({
        where: { role: "STUDENT", rating: { gte: b.min, lt: b.max } },
      }),
    ),
  );
  const total = await prisma.user.count({ where: { role: "STUDENT" } });

  res.json({ total, buckets: bands.map((b, i) => ({ ...b, count: counts[i] })) });
});

export default router;
