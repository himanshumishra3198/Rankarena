import prisma from "./prisma";
import { finalizeContest } from "./finalizeContest";

/**
 * Closing the books on a contest: score the stragglers, rank everyone, apply
 * the rating change, and mark it ended.
 *
 * This used to happen in exactly one place — the admin panel's "End contest"
 * button. Nothing else called it, and there is no scheduler in this
 * deployment, so a contest that simply ran out of time was never settled. In
 * production every contest was still sitting at status SCHEDULED with its end
 * time long past, `rating_history` was empty across the whole platform, and
 * every account still read 1500 no matter how many contests it had sat.
 *
 * So it is triggered by reads instead: opening a result, a leaderboard, a
 * contest list or a profile settles anything overdue. Whoever gets there first
 * settles it for everyone, which is what keeps ranks consistent — the
 * alternative, rating each candidate as they happen to look, would hand out
 * ranks that depend on browsing order.
 *
 * Idempotent at every step, so the races that come with read-triggering are
 * harmless: `finalizeContest` writes only to attempts still open, the rating
 * pass returns early once history exists, and the status update is a no-op the
 * second time.
 */
export async function settleContest(contestId: string): Promise<void> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { startTime: true, durationMinutes: true, status: true },
  });
  if (!contest) return;

  const endsAt = contest.startTime.getTime() + contest.durationMinutes * 60_000;
  if (Date.now() < endsAt) return;

  // Score anyone whose attempt was still open when the clock ran out. Must
  // come before ranking: the rating delta divides by the participant count, so
  // leaving them out would also shift everyone else's rating.
  await finalizeContest(contestId);
  await computeContestRatings(contestId);

  if (contest.status !== "ENDED") {
    await prisma.contest.update({ where: { id: contestId }, data: { status: "ENDED" } });
  }
}

/**
 * Rank the submitted attempts and apply the rating change.
 *
 * Exported so the admin panel can still settle a contest early — ending one
 * ahead of its scheduled finish is a deliberate act, not something a read
 * should do.
 */
export async function computeContestRatings(contestId: string): Promise<void> {
  // Idempotency: skip if ratings already recorded
  const existing = await prisma.ratingHistory.count({ where: { contestId } });
  if (existing > 0) return;

  // Which ladder this contest moves. A CAT result must not touch an SSC
  // rating: the two are different fields sitting different papers, and a
  // number that mixes them ranks nobody against anybody.
  const paper = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { exam: true },
  });
  const exam = paper?.exam ?? "SSC_CGL";

  // Test attempts are excluded before ranking, not after. The delta formula
  // divides by the participant count, so leaving an admin in the set would
  // change n and shift the rating of every genuine participant.
  const participations = await prisma.participation.findMany({
    where: { contestId, submittedAt: { not: null }, isTest: false },
    select: { userId: true, score: true, submittedAt: true },
    orderBy: [{ score: "desc" }, { submittedAt: "asc" }],
  });

  const n = participations.length;
  if (n === 0) return;

  const userIds = participations.map((p) => p.userId);
  // Starting ratings come from this exam's ladder. A candidate who has never
  // sat this exam has no row yet and starts where everyone does.
  const existingRatings = await prisma.userRating.findMany({
    where: { exam, userId: { in: userIds } },
    select: { userId: true, rating: true },
  });
  const ratingMap = new Map(existingRatings.map((r) => [r.userId, r.rating]));

  const updates = participations.map((p, i) => {
    const rank = i + 1;
    const oldRating = ratingMap.get(p.userId) ?? 1500;
    // Linear delta: +50 for first, 0 for median, -50 for last
    const delta = n > 1 ? Math.round(((n - 2 * rank + 1) / (n - 1)) * 50) : 0;
    const newRating = Math.max(100, oldRating + delta);
    return { userId: p.userId, rank, oldRating, newRating };
  });

  await prisma.$transaction(async (tx) => {
    await tx.ratingHistory.createMany({
      data: updates.map((u) => ({
        userId: u.userId,
        contestId,
        exam,
        oldRating: u.oldRating,
        newRating: u.newRating,
        rank: u.rank,
        totalParticipants: n,
      })),
      skipDuplicates: true,
    });
    for (const u of updates) {
      // The ladder this contest belongs to.
      await tx.userRating.upsert({
        where: { userId_exam: { userId: u.userId, exam } },
        create: { userId: u.userId, exam, rating: u.newRating },
        update: { rating: u.newRating },
      });
      // And the one number shown beside a name in a comment or a follower
      // list. It tracks the most recent result, whichever exam that was —
      // "where this candidate currently stands" rather than a second ladder
      // that would need its own explanation.
      await tx.user.update({ where: { id: u.userId }, data: { rating: u.newRating } });
    }
  });
}

// The sweep below runs on ordinary page loads, so it is throttled rather than
// left to fire on every request. Once a contest is settled its status becomes
// ENDED and it drops out of the query, so the steady state is one cheap
// indexed lookup returning nothing.
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Settle every contest whose time has passed and which has not been settled.
 *
 * Ordered oldest first: rating deltas compound, so a backlog has to be applied
 * in the order the contests actually happened or the ratings come out wrong.
 */
export async function settleEndedContests(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  try {
    const candidates = await prisma.contest.findMany({
      where: { status: { not: "ENDED" } },
      select: { id: true, startTime: true, durationMinutes: true },
      orderBy: { startTime: "asc" },
    });

    for (const c of candidates) {
      if (now < c.startTime.getTime() + c.durationMinutes * 60_000) continue;
      await settleContest(c.id);
    }
  } catch (err) {
    // A sweep is opportunistic — the page that triggered it still renders.
    console.error("Settling ended contests failed:", err);
    lastSweep = 0;
  }
}
