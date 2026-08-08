import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

/**
 * The bell badge. Kept separate from the list so the navbar can poll something
 * cheap — it only counts, and the (user_id, read) index covers it.
 */
router.get("/unread-count", async (req: AuthRequest, res: Response) => {
  const count = await prisma.notification.count({
    where: { userId: req.user!.id, read: false },
  });
  res.json({ count });
});

// Recent notifications, newest first, with everything the UI needs to render
// a line of text and a link — resolved here so the client makes one request.
router.get("/", async (req: AuthRequest, res: Response) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const rows = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { id: true, name: true, rating: true } } },
  });

  // Resolve titles in two queries rather than per row.
  const articleIds = [...new Set(rows.map((r) => r.articleId).filter(Boolean))] as string[];
  const commentIds = [...new Set(rows.map((r) => r.commentId).filter(Boolean))] as string[];

  const [articles, comments] = await Promise.all([
    articleIds.length
      ? prisma.article.findMany({
          where: { id: { in: articleIds } },
          select: { id: true, title: true },
        })
      : [],
    commentIds.length
      ? prisma.articleComment.findMany({
          where: { id: { in: commentIds } },
          select: { id: true, articleId: true, body: true, deleted: true },
        })
      : [],
  ]);
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const commentById = new Map(comments.map((c) => [c.id, c]));

  res.json(
    rows.map((n) => {
      const article = n.articleId ? articleById.get(n.articleId) : null;
      const comment = n.commentId ? commentById.get(n.commentId) : null;
      // A comment notification links to the article the comment lives on.
      const linkArticleId = article?.id ?? comment?.articleId ?? null;

      return {
        id: n.id,
        type: n.type,
        read: n.read,
        createdAt: n.createdAt,
        voteValue: n.voteValue,
        actor: n.actor,
        articleId: linkArticleId,
        articleTitle: article?.title ?? null,
        commentPreview:
          comment && !comment.deleted ? comment.body.slice(0, 80) : null,
      };
    })
  );
});

// Mark everything read — what opening the bell does.
router.post("/read-all", async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
});

// Mark one read, scoped to the caller so an id from elsewhere does nothing.
router.post("/:id/read", async (req: AuthRequest, res: Response) => {
  const { count } = await prisma.notification.updateMany({
    where: { id: req.params.id as string, userId: req.user!.id },
    data: { read: true },
  });
  if (count === 0) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
