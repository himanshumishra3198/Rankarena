import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticate, optionalAuth, AuthRequest } from "../middleware/auth";
import { makeExcerpt } from "../lib/excerpt";

const router = Router();

// Reads are public so guests can browse the home feed and article pages.
// Every write route below re-applies `authenticate` explicitly.
router.use(optionalAuth);

const ARTICLE_TYPES = ["GENERAL", "ANNOUNCEMENT", "TECHNIQUE", "EDITORIAL"] as const;

const articleSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(50000),
  type: z.enum(ARTICLE_TYPES).default("GENERAL"),
});

const commentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  parentId: z.string().uuid().optional().nullable(),
});

// -1, 0 (clear) or 1. The client sends the button that was pressed; the server
// decides whether that means set, flip, or unvote.
const voteSchema = z.object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) });

const authorSelect = { id: true, name: true, rating: true, role: true } as const;

/** Author or admin may edit/delete. */
function canModify(req: AuthRequest, authorId: string) {
  if (!req.user) return false;
  return req.user.id === authorId || req.user.role === "ADMIN";
}

/**
 * Apply a vote to an article or comment and keep the denormalized `score`
 * column in step, both inside one transaction so a crash can't leave the
 * cached score disagreeing with the vote rows.
 *
 * Pressing the arrow you already chose clears the vote (Codeforces toggle).
 * Returns the new score and the caller's resulting vote.
 */
async function applyVote(opts: {
  kind: "article" | "comment";
  targetId: string;
  userId: string;
  value: -1 | 0 | 1;
}): Promise<{ score: number; myVote: number }> {
  const { kind, targetId, userId, value } = opts;

  return prisma.$transaction(async (tx) => {
    const voteTable = kind === "article" ? tx.articleVote : tx.commentVote;
    const where =
      kind === "article"
        ? { articleId_userId: { articleId: targetId, userId } }
        : { commentId_userId: { commentId: targetId, userId } };

    const existing = await (voteTable as any).findUnique({ where });
    const previous: number = existing?.value ?? 0;

    // Re-pressing the same arrow clears it.
    const next = value === 0 || previous === value ? 0 : value;
    const delta = next - previous;

    if (next === 0 && existing) {
      await (voteTable as any).delete({ where: { id: existing.id } });
    } else if (next !== 0 && existing) {
      await (voteTable as any).update({ where: { id: existing.id }, data: { value: next } });
    } else if (next !== 0) {
      const data =
        kind === "article"
          ? { articleId: targetId, userId, value: next }
          : { commentId: targetId, userId, value: next };
      await (voteTable as any).create({ data });
    }

    let score = 0;
    if (delta !== 0) {
      const target =
        kind === "article"
          ? await tx.article.update({
              where: { id: targetId },
              data: { score: { increment: delta } },
              select: { score: true },
            })
          : await tx.articleComment.update({
              where: { id: targetId },
              data: { score: { increment: delta } },
              select: { score: true },
            });
      score = target.score;
    } else {
      const target =
        kind === "article"
          ? await tx.article.findUnique({ where: { id: targetId }, select: { score: true } })
          : await tx.articleComment.findUnique({ where: { id: targetId }, select: { score: true } });
      score = target?.score ?? 0;
    }

    return { score, myVote: next };
  });
}

/* ----------------------------- contributors ------------------------------ */

// Top contributors for the home sidebar.
//
// Articles only. Ranking on votes alone (the Codeforces definition) needs a
// large voting population to mean anything and hid authors whose posts hadn't
// been voted on yet. Counting comments too went the other way, letting someone
// who had only ever left a comment onto a board meant for people who write.
// So: writing an article is what makes you a contributor, and votes on those
// articles add to the score.
const ARTICLE_POINTS = 2;

router.get("/contributors", async (_req, res: Response) => {
  const articleAgg = await prisma.article.groupBy({
    by: ["authorId"],
    _sum: { score: true },
    _count: { _all: true },
  });

  // Authors only — groupBy already excludes anyone with no articles.
  // Negative totals drop off, since this is meant to be a positive board.
  const ranked = articleAgg
    .map((row) => ({
      authorId: row.authorId,
      contribution: row._count._all * ARTICLE_POINTS + (row._sum.score ?? 0),
    }))
    .filter((r) => r.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);

  if (ranked.length === 0) {
    res.json([]);
    return;
  }

  const users = await prisma.user.findMany({
    where: { id: { in: ranked.map((r) => r.authorId) } },
    select: { id: true, name: true, rating: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  res.json(
    ranked
      .map((r, i) => {
        const user = byId.get(r.authorId);
        return user ? { rank: i + 1, ...user, contribution: r.contribution } : null;
      })
      .filter(Boolean)
  );
});

/* ------------------------------- articles -------------------------------- */

// List articles. sort=new (default) | top; optional type filter; paginated.
router.get("/articles", async (req: AuthRequest, res: Response) => {
  const sort = req.query.sort === "top" ? "top" : "new";
  const type = ARTICLE_TYPES.includes(req.query.type as any) ? (req.query.type as string) : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 20;

  const where = type ? { type: type as any } : {};

  const [total, rows] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      // Pinned announcements ride at the top of every sort, like Codeforces.
      orderBy:
        sort === "top"
          ? [{ pinned: "desc" }, { score: "desc" }, { createdAt: "desc" }]
          : [{ pinned: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: { author: { select: authorSelect } },
    }),
  ]);

  // The caller's own votes, so the list can highlight arrows without N queries.
  // Guests have none, so skip the query entirely.
  const myVotes = rows.length && req.user
    ? await prisma.articleVote.findMany({
        where: { userId: req.user.id, articleId: { in: rows.map((r) => r.id) } },
        select: { articleId: true, value: true },
      })
    : [];
  const voteMap = new Map(myVotes.map((v) => [v.articleId, v.value]));

  res.json({
    page,
    perPage,
    total,
    articles: rows.map((a) => ({
      id: a.id,
      title: a.title,
      // Markdown syntax stripped: the feed renders this as plain text, and a
      // truncated slice of raw Markdown would show unclosed ** and half-links.
      excerpt: makeExcerpt(a.body, 300),
      // Computed here because the excerpt is truncated — the client can't
      // derive a reading time from what it receives.
      readingMinutes: Math.max(1, Math.round(a.body.trim().split(/\s+/).length / 200)),
      type: a.type,
      pinned: a.pinned,
      score: a.score,
      commentCount: a.commentCount,
      createdAt: a.createdAt,
      author: a.author,
      myVote: voteMap.get(a.id) ?? 0,
    })),
  });
});

router.get("/articles/:id", async (req: AuthRequest, res: Response) => {
  const article = await prisma.article.findUnique({
    where: { id: req.params.id as string },
    include: { author: { select: authorSelect } },
  });
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  const myVote = req.user
    ? await prisma.articleVote.findUnique({
        where: { articleId_userId: { articleId: article.id, userId: req.user.id } },
        select: { value: true },
      })
    : null;
  res.json({ ...article, myVote: myVote?.value ?? 0, canModify: canModify(req, article.authorId) });
});

router.post("/articles", authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = articleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  // Only admins may post official announcements.
  if (parsed.data.type === "ANNOUNCEMENT" && req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "Only admins can post announcements" });
    return;
  }
  const article = await prisma.article.create({
    data: { ...parsed.data, authorId: req.user!.id },
    include: { author: { select: authorSelect } },
  });
  res.status(201).json(article);
});

router.patch("/articles/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.article.findUnique({
    where: { id: req.params.id as string },
    select: { id: true, authorId: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  if (!canModify(req, existing.authorId)) {
    res.status(403).json({ error: "Not your article" });
    return;
  }
  const parsed = articleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  if (parsed.data.type === "ANNOUNCEMENT" && req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "Only admins can post announcements" });
    return;
  }
  const article = await prisma.article.update({
    where: { id: existing.id },
    data: parsed.data,
    include: { author: { select: authorSelect } },
  });
  res.json(article);
});

router.delete("/articles/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.article.findUnique({
    where: { id: req.params.id as string },
    select: { id: true, authorId: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  if (!canModify(req, existing.authorId)) {
    res.status(403).json({ error: "Not your article" });
    return;
  }
  // Comments and votes cascade at the DB level.
  await prisma.article.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

// Admins pin an article to the top of the list (contest announcements).
router.post("/articles/:id/pin", authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const existing = await prisma.article.findUnique({
    where: { id: req.params.id as string },
    select: { id: true, pinned: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  const article = await prisma.article.update({
    where: { id: existing.id },
    data: { pinned: !existing.pinned },
    select: { pinned: true },
  });
  res.json(article);
});

router.post("/articles/:id/vote", authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = voteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const article = await prisma.article.findUnique({
    where: { id: req.params.id as string },
    select: { id: true, authorId: true },
  });
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  if (article.authorId === req.user!.id) {
    res.status(403).json({ error: "You cannot vote on your own article" });
    return;
  }
  const result = await applyVote({
    kind: "article",
    targetId: article.id,
    userId: req.user!.id,
    value: parsed.data.value,
  });
  res.json(result);
});

/* ------------------------------- comments -------------------------------- */

// Flat list of a thread's comments, oldest first. The client nests them on
// parentId — cheaper than recursive SQL and threads here stay small.
router.get("/articles/:id/comments", async (req: AuthRequest, res: Response) => {
  const articleId = req.params.id as string;
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true } });
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }

  const comments = await prisma.articleComment.findMany({
    where: { articleId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: authorSelect } },
  });

  const myVotes = comments.length && req.user
    ? await prisma.commentVote.findMany({
        where: { userId: req.user.id, commentId: { in: comments.map((c) => c.id) } },
        select: { commentId: true, value: true },
      })
    : [];
  const voteMap = new Map(myVotes.map((v) => [v.commentId, v.value]));

  res.json(
    comments.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      // A soft-deleted comment keeps its place in the tree but shows nothing.
      body: c.deleted ? "" : c.body,
      deleted: c.deleted,
      score: c.score,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: c.deleted ? null : c.author,
      myVote: voteMap.get(c.id) ?? 0,
      canModify: !c.deleted && canModify(req, c.authorId),
    }))
  );
});

router.post("/articles/:id/comments", authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const articleId = req.params.id as string;
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true } });
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }

  // A reply's parent must live on this same article, or a crafted parentId
  // could graft a comment onto an unrelated thread.
  if (parsed.data.parentId) {
    const parent = await prisma.articleComment.findUnique({
      where: { id: parsed.data.parentId },
      select: { articleId: true },
    });
    if (!parent || parent.articleId !== articleId) {
      res.status(400).json({ error: "Parent comment not found on this article" });
      return;
    }
  }

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.articleComment.create({
      data: {
        articleId,
        authorId: req.user!.id,
        parentId: parsed.data.parentId ?? null,
        body: parsed.data.body,
      },
      include: { author: { select: authorSelect } },
    });
    await tx.article.update({ where: { id: articleId }, data: { commentCount: { increment: 1 } } });
    return created;
  });

  res.status(201).json({ ...comment, myVote: 0, canModify: true });
});

router.patch("/comments/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.articleComment.findUnique({
    where: { id: req.params.id as string },
    select: { id: true, authorId: true, deleted: true },
  });
  if (!existing || existing.deleted) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  if (!canModify(req, existing.authorId)) {
    res.status(403).json({ error: "Not your comment" });
    return;
  }
  const parsed = z.object({ body: z.string().trim().min(1).max(5000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const comment = await prisma.articleComment.update({
    where: { id: existing.id },
    data: { body: parsed.data.body },
    include: { author: { select: authorSelect } },
  });
  res.json(comment);
});

// Soft delete: blank the body but keep the row so replies stay reachable.
router.delete("/comments/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.articleComment.findUnique({
    where: { id: req.params.id as string },
    select: { id: true, authorId: true, articleId: true, deleted: true },
  });
  if (!existing || existing.deleted) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  if (!canModify(req, existing.authorId)) {
    res.status(403).json({ error: "Not your comment" });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.articleComment.update({
      where: { id: existing.id },
      data: { deleted: true, body: "" },
    });
    await tx.article.update({
      where: { id: existing.articleId },
      data: { commentCount: { decrement: 1 } },
    });
  });
  res.json({ ok: true });
});

router.post("/comments/:id/vote", authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = voteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const comment = await prisma.articleComment.findUnique({
    where: { id: req.params.id as string },
    select: { id: true, authorId: true, deleted: true },
  });
  if (!comment || comment.deleted) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  if (comment.authorId === req.user!.id) {
    res.status(403).json({ error: "You cannot vote on your own comment" });
    return;
  }
  const result = await applyVote({
    kind: "comment",
    targetId: comment.id,
    userId: req.user!.id,
    value: parsed.data.value,
  });
  res.json(result);
});

export default router;
