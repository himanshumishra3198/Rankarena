import prisma from "./prisma";

/**
 * Notification creation. Every rule about when a notification is or isn't
 * generated lives here rather than being scattered through the route handlers.
 *
 * Two rules apply throughout:
 *  - Nobody is notified about their own action.
 *  - Repeating an action updates the existing notification rather than adding
 *    another, so toggling a vote off and on can't flood someone's bell.
 *
 * Failures are swallowed by the callers: a notification is a side effect, and
 * it must never turn a successful follow or vote into an error response.
 */

/**
 * Upsert by hand.
 *
 * Prisma can't take a compound unique containing nullable columns in a `where`
 * clause, and two of the three target columns are always null. So: try to
 * update a matching row, and create one only if nothing matched.
 * `skipDuplicates` covers the race where two requests both find nothing.
 */
async function upsertNotification(
  match: {
    userId: string;
    actorId: string | null;
    type: "FOLLOW" | "ARTICLE_VOTE" | "COMMENT_VOTE" | "ANNOUNCEMENT";
    articleId: string | null;
    commentId: string | null;
  },
  extra: { voteValue?: number | null } = {}
) {
  // Bumping createdAt and clearing `read` resurfaces it: a re-follow or a
  // flipped vote is news again, not a row the user already dismissed.
  const { count } = await prisma.notification.updateMany({
    where: match,
    data: { ...extra, read: false, createdAt: new Date() },
  });
  if (count > 0) return;

  await prisma.notification.createMany({
    data: [{ ...match, ...extra }],
    skipDuplicates: true,
  });
}

/** Someone followed you. */
export async function notifyFollow(followerId: string, followedId: string) {
  if (followerId === followedId) return;

  await upsertNotification({
    userId: followedId,
    actorId: followerId,
    type: "FOLLOW",
    articleId: null,
    commentId: null,
  });
}

/**
 * Someone voted on your article or comment.
 *
 * `value` is the vote's new direction. Clearing a vote (0) removes the
 * notification: being told about a vote that no longer exists is noise.
 */
export async function notifyVote(opts: {
  kind: "article" | "comment";
  targetId: string;
  authorId: string;
  actorId: string;
  value: number;
}) {
  const { kind, targetId, authorId, actorId, value } = opts;
  if (authorId === actorId) return;

  const match = {
    userId: authorId,
    actorId,
    type: (kind === "article" ? "ARTICLE_VOTE" : "COMMENT_VOTE") as
      | "ARTICLE_VOTE"
      | "COMMENT_VOTE",
    articleId: kind === "article" ? targetId : null,
    commentId: kind === "comment" ? targetId : null,
  };

  if (value === 0) {
    await prisma.notification.deleteMany({ where: match });
    return;
  }

  await upsertNotification(match, { voteValue: value });
}

/**
 * An admin published an announcement — everyone except the author hears about
 * it. Written with createMany + skipDuplicates so re-running is harmless, and
 * in batches so a large user base doesn't build one enormous statement.
 */
export async function notifyAnnouncement(articleId: string, authorId: string) {
  const BATCH = 500;
  let cursor: string | undefined;

  for (;;) {
    const users = await prisma.user.findMany({
      where: { id: { not: authorId } },
      select: { id: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (users.length === 0) break;

    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: "ANNOUNCEMENT" as const,
        articleId,
      })),
      skipDuplicates: true,
    });

    if (users.length < BATCH) break;
    cursor = users[users.length - 1].id;
  }
}
