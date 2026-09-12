import prisma from "./prisma";
import redis from "./redis";
import {
  sendContestAnnouncedEmail,
  sendContestStartingEmail,
  REMINDER_LEAD_MS,
  type ContestMailData,
} from "./contestMail";

/**
 * Contest announcements and start reminders.
 *
 * Two sends, both driven by a sweep rather than by the request that caused
 * them:
 *
 *  - A contest is scheduled → everyone hears about it, once.
 *  - A contest starts within the hour → everyone registered for it is nudged,
 *    once.
 *
 * Doing this on a sweep rather than inline is what makes it survivable. An
 * admin creating a contest should not wait on a mail loop, and a process that
 * dies halfway through one must not lose the rest of the recipients or start
 * again from the top. Both jobs are therefore expressed as "what still needs
 * doing?" against durable state: `contests.announced_at` for the broadcast,
 * and the notification rows themselves for the reminder.
 *
 * Idempotency is enforced by the database, not by this code. The migration
 * adds a partial unique index on (user, type, contest), so a duplicate row is
 * impossible however many workers run this at once. Email follows the row: we
 * only write to people whose notification we just created, so a second pass
 * has nobody left to write to.
 */

const LOCK_KEY = "contest-notify:lock";
const LOCK_MS = 55_000;

function mailData(c: {
  id: string; title: string; startTime: Date; durationMinutes: number;
  negativeMarks: unknown; _count?: { contestQuestions: number };
}): ContestMailData {
  return {
    id: c.id, title: c.title, startTime: c.startTime,
    durationMinutes: c.durationMinutes, negativeMarks: Number(c.negativeMarks),
    questionCount: c._count?.contestQuestions,
  };
}

/**
 * Create the notification rows, and return the people whose row this call
 * actually wrote — which is exactly the set to email.
 *
 * The set comes back from the insert rather than from the list we sent in.
 * `skipDuplicates` drops a colliding row silently, so a row we assumed was
 * written is not evidence that it was; anyone emailed on that assumption gets
 * emailed again on the next pass, forever. Taking the ids the database
 * returns makes "notified" and "emailed" the same fact, whatever the
 * constraints underneath happen to be.
 *
 * The pre-read is not a correctness check — the unique index is — only a way
 * to skip the insert entirely on the common pass where there is nothing new.
 */
async function claimRecipients(
  contestId: string,
  type: "CONTEST_ANNOUNCED" | "CONTEST_STARTING",
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const already = await prisma.notification.findMany({
    where: { contestId, type, userId: { in: userIds } },
    select: { userId: true },
  });
  const seen = new Set(already.map((n) => n.userId));
  const fresh = userIds.filter((id) => !seen.has(id));
  if (fresh.length === 0) return new Set();

  const created = await prisma.notification.createManyAndReturn({
    data: fresh.map((userId) => ({ userId, type, contestId })),
    skipDuplicates: true,
    select: { userId: true },
  });
  if (created.length < fresh.length) {
    console.warn(
      `[contest-notify] ${fresh.length - created.length} of ${fresh.length} rows ` +
        `were dropped for contest ${contestId} (${type}) — check the notification indexes`,
    );
  }
  return new Set(created.map((n) => n.userId));
}

/** Everyone who can be emailed: confirmed address, has not opted out. */
async function mailableUsers(where: object = {}) {
  return prisma.user.findMany({
    where: { emailVerified: true, contestEmails: true, ...where },
    select: { id: true, name: true, email: true },
  });
}

/**
 * Announce contests that have not been announced.
 *
 * Only ones still in the future: a contest created retroactively, or one whose
 * announcement failed for long enough that it has already run, should not be
 * mailed out as news.
 */
export async function announceNewContests(): Promise<void> {
  const now = new Date();
  const pending = await prisma.contest.findMany({
    where: { announcedAt: null, startTime: { gt: now }, status: { not: "ENDED" } },
    include: { _count: { select: { contestQuestions: true } } },
    orderBy: { startTime: "asc" },
    take: 5,
  });

  for (const c of pending) {
    const users = await mailableUsers();
    const fresh = await claimRecipients(c.id, "CONTEST_ANNOUNCED", users.map((u) => u.id));

    for (const u of users) {
      if (!fresh.has(u.id)) continue;
      await sendContestAnnouncedEmail(u.email, u.id, u.name, mailData(c));
    }

    // Stamped after the sends, so a crash mid-broadcast leaves it pending and
    // the next pass picks up whoever is left — the notification rows already
    // written keep those people from being mailed twice.
    await prisma.contest.update({ where: { id: c.id }, data: { announcedAt: new Date() } });
    console.info(`[contest-notify] announced "${c.title}" to ${fresh.size} of ${users.length}`);
  }
}

/**
 * Remind people registered for a contest starting within the hour.
 *
 * Nothing goes out once the contest has started: a reminder that arrives
 * mid-paper is noise, and one that arrives after it ended is worse.
 */
export async function remindUpcomingContests(): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + REMINDER_LEAD_MS);

  const soon = await prisma.contest.findMany({
    where: { startTime: { gt: now, lte: horizon }, status: { not: "ENDED" } },
    include: { _count: { select: { contestQuestions: true } } },
  });

  for (const c of soon) {
    const registered = await prisma.participation.findMany({
      where: { contestId: c.id, isTest: false },
      select: { userId: true },
    });
    if (registered.length === 0) continue;

    const users = await mailableUsers({ id: { in: registered.map((p) => p.userId) } });
    const fresh = await claimRecipients(c.id, "CONTEST_STARTING", users.map((u) => u.id));

    for (const u of users) {
      if (!fresh.has(u.id)) continue;
      await sendContestStartingEmail(u.email, u.id, u.name, mailData(c));
    }
    if (fresh.size > 0) {
      console.info(`[contest-notify] reminded ${fresh.size} for "${c.title}"`);
    }
  }
}

/**
 * One pass of both jobs, behind a short Redis lock.
 *
 * The lock is for tidiness, not safety — it stops two API containers doing the
 * same work in the same minute. Correctness comes from the unique index
 * underneath, which is what lets this be re-run at any time without thought.
 */
export async function runContestNotifications(): Promise<void> {
  let holdsLock = false;
  try {
    holdsLock = (await redis.set(LOCK_KEY, "1", "PX", LOCK_MS, "NX")) === "OK";
    if (!holdsLock) return;
    await announceNewContests();
    await remindUpcomingContests();
  } catch (err) {
    console.error("[contest-notify] pass failed:", err);
  } finally {
    if (holdsLock) await redis.del(LOCK_KEY).catch(() => {});
  }
}

/** Every minute, plus one pass shortly after boot so a restart is not a gap. */
export function startContestNotifier(): void {
  setTimeout(() => { void runContestNotifications(); }, 10_000);
  setInterval(() => { void runContestNotifications(); }, 60_000);
}
