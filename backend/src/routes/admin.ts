import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { Prisma } from "../generated/prisma/client";
import { LANGUAGES, DEFAULT_LANGUAGE } from "../lib/i18n";
import redis from "../lib/redis";
import { computeFingerprint } from "../lib/fingerprint";
import { isValidTopic } from "../lib/topics";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";

const router = Router();

// Convert a parsed question payload into Prisma-safe create/update data.
// Handles JSON-null (structuredData) and nullable passageId correctly.
function toQuestionData(d: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of ["questionType", "text", "optionA", "optionB", "optionC",
    "optionD", "correctOption", "subject", "difficulty"] as const) {
    if (d[k] !== undefined) out[k] = d[k];
  }
  if (d.imageUrl !== undefined) out.imageUrl = d.imageUrl ?? null;
  // Empty string from an unselected dropdown means "untagged", same as null.
  if (d.topic !== undefined) out.topic = d.topic ? d.topic : null;
  if (d.passageId !== undefined) out.passageId = d.passageId ?? null;
  if (d.solution !== undefined) out.solution = d.solution ?? null;
  if (d.structuredData !== undefined) {
    out.structuredData = d.structuredData ?? Prisma.JsonNull;
  }
  return out;
}

// Compute a question's exact-duplicate fingerprint from a payload.
function fingerprintOf(d: Record<string, any>): string {
  return computeFingerprint(d.text ?? "", [d.optionA ?? "", d.optionB ?? "", d.optionC ?? "", d.optionD ?? ""]);
}
router.use(authenticate, requireAdmin);

// ── Contests ─────────────────────────────────────────────

const sectionLimitsSchema = z.record(
  z.enum(["QUANT", "REASONING", "ENGLISH", "GK"]),
  z.number().int().min(1)
).optional();

const contestSchema = z.object({
  title: z.string().min(1),
  startTime: z.iso.datetime(),
  durationMinutes: z.number().int().min(1).max(1440),
  negativeMarks: z.number().min(0).default(0.5),
  sectionLimits: sectionLimitsSchema,
});

// List all contests (admin sees all statuses)
router.get("/contests", async (_req, res: Response) => {
  const contests = await prisma.contest.findMany({
    orderBy: { startTime: "desc" },
  });
  res.json(contests);
});

router.post("/contests", async (req: AuthRequest, res: Response) => {
  const parsed = contestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const contest = await prisma.contest.create({ data: parsed.data });
  res.status(201).json(contest);
});

router.put("/contests/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = contestSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const contest = await prisma.contest.update({ where: { id }, data: parsed.data });
  res.json(contest);
});

router.delete("/contests/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) {
    res.status(404).json({ error: "Contest not found" });
    return;
  }
  // Delete child records before the contest (no cascade in schema)
  await prisma.$transaction([
    prisma.ratingHistory.deleteMany({ where: { contestId: id } }),
    prisma.participation.deleteMany({ where: { contestId: id } }),
    prisma.contestQuestion.deleteMany({ where: { contestId: id } }),
    prisma.contest.delete({ where: { id } }),
  ]);
  await redis.del(`contest:${id}:leaderboard`);
  res.json({ ok: true });
});

const statusSchema = z.object({
  status: z.enum(["SCHEDULED", "LIVE", "ENDED"]),
});

router.post("/contests/:id/status", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const contest = await prisma.contest.update({
    where: { id },
    data: { status: parsed.data.status },
  });

  if (parsed.data.status === "ENDED") {
    computeContestRatings(id).catch((err) =>
      console.error(`Rating computation failed for contest ${id}:`, err)
    );
  }

  res.json(contest);
});

async function computeContestRatings(contestId: string) {
  // Idempotency: skip if ratings already recorded
  const existing = await prisma.ratingHistory.count({ where: { contestId } });
  if (existing > 0) return;

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
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, rating: true },
  });
  const ratingMap = new Map(users.map((u) => [u.id, u.rating]));

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
        oldRating: u.oldRating,
        newRating: u.newRating,
        rank: u.rank,
        totalParticipants: n,
      })),
      skipDuplicates: true,
    });
    for (const u of updates) {
      await tx.user.update({ where: { id: u.userId }, data: { rating: u.newRating } });
    }
  });
}

// Restart an ended contest at a new start time (clears all participation data)
router.post("/contests/:id/restart", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = z.object({ startTime: z.iso.datetime() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "startTime is required (ISO 8601)" });
    return;
  }

  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) {
    res.status(404).json({ error: "Contest not found" });
    return;
  }
  if (contest.status !== "ENDED") {
    res.status(400).json({ error: "Only ENDED contests can be restarted" });
    return;
  }

  // Wipe all participation data and rating history so users can take it fresh
  await prisma.$transaction([
    prisma.participation.deleteMany({ where: { contestId: id } }),
    prisma.ratingHistory.deleteMany({ where: { contestId: id } }),
  ]);

  // Clear Redis leaderboard
  await redis.del(`contest:${id}:leaderboard`);

  const updated = await prisma.contest.update({
    where: { id },
    data: { startTime: new Date(parsed.data.startTime), status: "SCHEDULED" },
  });

  res.json(updated);
});

// ── Passages ──────────────────────────────────────────────

const passageSchema = z.object({
  title: z.string().default(""),
  content: z.string().default(""),
  type: z.enum(["TEXT", "TABLE"]).default("TEXT"),
  tableData: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }).optional().nullable(),
});

// Build Prisma-safe passage data (handles JSON-null for tableData)
function toPassageData(d: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of ["title", "content", "type"] as const) {
    if (d[k] !== undefined) out[k] = d[k];
  }
  if (d.tableData !== undefined) {
    out.tableData = d.tableData ?? Prisma.JsonNull;
  }
  return out;
}

router.get("/passages", async (_req, res: Response) => {
  const passages = await prisma.passage.findMany({ orderBy: { createdAt: "desc" } });
  res.json(passages);
});

router.post("/passages", async (req: AuthRequest, res: Response) => {
  const parsed = passageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  if (parsed.data.type === "TEXT" && !parsed.data.content.trim()) {
    res.status(400).json({ error: "Passage text is required for reading passages." });
    return;
  }
  if (parsed.data.type === "TABLE" && !parsed.data.tableData) {
    res.status(400).json({ error: "Table data is required for table passages." });
    return;
  }
  const passage = await prisma.passage.create({
    data: toPassageData(parsed.data) as Prisma.PassageUncheckedCreateInput,
  });
  res.status(201).json(passage);
});

router.put("/passages/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = passageSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const passage = await prisma.passage.update({
    where: { id },
    data: toPassageData(parsed.data) as Prisma.PassageUncheckedUpdateInput,
  });
  res.json(passage);
});

router.delete("/passages/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  await prisma.passage.delete({ where: { id } });
  res.json({ ok: true });
});

// ── Questions ─────────────────────────────────────────────

const questionSchema = z.object({
  questionType: z.enum(["STANDARD", "SYLLOGISM", "PASSAGE", "TABLE"]).default("STANDARD"),
  text: z.string().min(1),
  imageUrl: z.url().max(500).optional().nullable(),
  optionA: z.string().min(1),
  optionB: z.string().min(1),
  optionC: z.string().min(1),
  optionD: z.string().min(1),
  correctOption: z.enum(["A", "B", "C", "D"]),
  subject: z.enum(["QUANT", "REASONING", "ENGLISH", "GK"]),
  // Optional. Checked against the subject's topic list in the handlers, where
  // the effective subject is known (an edit may change only one of the two).
  topic: z.string().max(120).optional().nullable(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  passageId: z.string().uuid().optional().nullable(),
  structuredData: z.record(z.string(), z.any()).optional().nullable(),
  solution: z.string().max(20000).optional().nullable(),
  // Non-default languages, keyed by language code. English stays in the base
  // fields above — it is the source, not a translation of anything.
  //
  // A language present but blank means "remove this translation", so an admin
  // can clear a bad one without a separate endpoint. Partial entries are
  // rejected: half a translated question is worse than none, because the
  // candidate gets Hindi stem with English options and no way to tell why.
  translations: z
    .record(
      z.enum(["HI"]),
      z.object({
        text: z.string().default(""),
        optionA: z.string().default(""),
        optionB: z.string().default(""),
        optionC: z.string().default(""),
        optionD: z.string().default(""),
        solution: z.string().max(20000).optional().nullable(),
        structuredData: z.record(z.string(), z.any()).optional().nullable(),
      }),
    )
    .optional(),
});


/**
 * Turns the admin's translations map into rows to write and languages to drop.
 *
 * Validation lives here rather than in the zod schema because "complete or
 * absent" is a rule about the group of fields, not any one of them: a Hindi
 * stem with English options would render as a broken hybrid mid-exam, so a
 * partial entry is refused outright.
 */
function splitTranslations(
  input: Record<string, { text: string; optionA: string; optionB: string; optionC: string; optionD: string; solution?: string | null; structuredData?: unknown }> | undefined,
): { writes: Array<{ language: string; data: Record<string, unknown> }>; deletes: string[]; error?: string } {
  const writes: Array<{ language: string; data: Record<string, unknown> }> = [];
  const deletes: string[] = [];
  if (!input) return { writes, deletes };

  for (const [language, t] of Object.entries(input)) {
    const required = [t.text, t.optionA, t.optionB, t.optionC, t.optionD].map((v) => (v ?? "").trim());
    const filled = required.filter(Boolean).length;
    if (filled === 0) { deletes.push(language); continue; }
    if (filled < required.length) {
      return { writes, deletes, error: `The ${language} translation is incomplete — the question text and all four options are required.` };
    }
    writes.push({
      language,
      data: {
        text: required[0], optionA: required[1], optionB: required[2],
        optionC: required[3], optionD: required[4],
        solution: t.solution?.trim() || null,
        structuredData: (t.structuredData ?? null) as Prisma.InputJsonValue | null,
      },
    });
  }
  return { writes, deletes };
}

router.post("/questions", async (req: AuthRequest, res: Response) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  if (!isValidTopic(parsed.data.subject, parsed.data.topic)) {
    res.status(400).json({ error: `"${parsed.data.topic}" is not a topic of ${parsed.data.subject}.` });
    return;
  }

  // Block exact duplicates
  const fingerprint = fingerprintOf(parsed.data);
  const existing = await prisma.question.findFirst({
    where: { fingerprint },
    select: { id: true, text: true },
  });
  if (existing) {
    res.status(409).json({
      error: "This question already exists in the bank (exact duplicate).",
      duplicate: existing,
    });
    return;
  }

  const { writes, error } = splitTranslations(parsed.data.translations);
  if (error) { res.status(400).json({ error }); return; }

  const question = await prisma.question.create({
    data: {
      ...toQuestionData(parsed.data),
      fingerprint,
      // The fingerprint is computed from the English text only, so a
      // translation can never make two distinct questions look identical.
      translations: writes.length
        ? { create: writes.map((w) => ({ ...w.data, language: w.language as never })) }
        : undefined,
    } as Prisma.QuestionUncheckedCreateInput,
    include: { translations: { select: { language: true } } },
  });
  res.status(201).json(question);
});

// Similar (near-duplicate) questions via trigram similarity.
router.get("/questions/similar", async (req: AuthRequest, res: Response) => {
  const text = (req.query.text as string | undefined)?.trim();
  const subject = req.query.subject as string | undefined;
  if (!text || text.length < 8) { res.json([]); return; }

  // similarity() from pg_trgm; 0.3 is a sensible "worth a look" threshold.
  const rows = subject
    ? await prisma.$queryRaw<Array<{ id: string; text: string; subject: string; score: number }>>`
        SELECT id, text, subject::text AS subject, similarity(text, ${text}) AS score
        FROM questions
        WHERE subject = ${subject}::"Subject" AND similarity(text, ${text}) > 0.3
        ORDER BY score DESC LIMIT 5`
    : await prisma.$queryRaw<Array<{ id: string; text: string; subject: string; score: number }>>`
        SELECT id, text, subject::text AS subject, similarity(text, ${text}) AS score
        FROM questions
        WHERE similarity(text, ${text}) > 0.3
        ORDER BY score DESC LIMIT 5`;

  res.json(rows.map((r) => ({ ...r, score: Math.round(Number(r.score) * 100) })));
});

// Question bank listing: filters, free-text search, optional pagination.
//
// Paging is opt-in via ?page — without it the whole filtered set comes back,
// which is what the contest and mock builders rely on to populate their
// pickers. The response shape is the same either way.
router.get("/questions", async (req: AuthRequest, res: Response) => {
  const subject = req.query.subject as string | undefined;
  const difficulty = req.query.difficulty as string | undefined;
  const topic = req.query.topic as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();

  const paged = req.query.page !== undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(5, Number(req.query.perPage) || 25));

  // Search spans the question and all four options, so an admin can find a
  // question by a phrase in the stem or by an answer they remember.
  const searchWhere = search
    ? {
        OR: (["text", "optionA", "optionB", "optionC", "optionD"] as const).map((field) => ({
          [field]: { contains: search, mode: "insensitive" as const },
        })),
      }
    : {};

  const where = {
    ...(subject ? { subject: subject as any } : {}),
    ...(difficulty ? { difficulty: difficulty as any } : {}),
    // "__none" filters to questions nobody has tagged yet.
    ...(topic ? (topic === "__none" ? { topic: null } : { topic }) : {}),
    ...searchWhere,
  };

  const [total, questions] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      // Full translations, because the same rows populate the editor when a
      // question is opened — one round trip rather than a fetch per edit.
      include: { passage: true, translations: true },
      orderBy: { subject: "asc" },
      ...(paged ? { skip: (page - 1) * perPage, take: perPage } : {}),
    }),
  ]);

  res.json({
    questions: questions.map((q) => ({
      ...q,
      // English is always present — it is the base row, not a translation.
      // Precomputed so the list can render a status column without the client
      // having to know that the base row counts as a language.
      languages: [DEFAULT_LANGUAGE, ...q.translations.map((t) => t.language)],
    })),
    total,
    page: paged ? page : 1,
    perPage: paged ? perPage : total,
  });
});

router.put("/questions/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = questionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  // A partial edit may change the subject, the topic, or only one of them, so
  // validate the pair that the question will actually end up with. Moving a
  // question to a new subject silently clears a topic that doesn't exist
  // there, rather than rejecting the edit or leaving a mismatched tag behind.
  if (parsed.data.subject !== undefined || parsed.data.topic !== undefined) {
    const current = await prisma.question.findUnique({
      where: { id },
      select: { subject: true, topic: true },
    });
    if (!current) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    const nextSubject = parsed.data.subject ?? current.subject;
    const nextTopic = parsed.data.topic !== undefined ? parsed.data.topic : current.topic;

    if (parsed.data.topic !== undefined && !isValidTopic(nextSubject, nextTopic)) {
      res.status(400).json({ error: `"${nextTopic}" is not a topic of ${nextSubject}.` });
      return;
    }
    if (parsed.data.topic === undefined && !isValidTopic(nextSubject, nextTopic)) {
      (parsed.data as Record<string, any>).topic = null;
    }
  }

  const data = toQuestionData(parsed.data) as Prisma.QuestionUncheckedUpdateInput;
  // Recompute fingerprint if text/options changed; block if it collides
  // with a *different* existing question.
  const p = parsed.data as Record<string, any>;
  if (p.text !== undefined || p.optionA !== undefined || p.optionB !== undefined ||
      p.optionC !== undefined || p.optionD !== undefined) {
    const current = await prisma.question.findUnique({ where: { id } });
    if (current) {
      const fingerprint = computeFingerprint(
        p.text ?? current.text,
        [p.optionA ?? current.optionA, p.optionB ?? current.optionB,
         p.optionC ?? current.optionC, p.optionD ?? current.optionD]
      );
      const clash = await prisma.question.findFirst({
        where: { fingerprint, id: { not: id } },
        select: { id: true, text: true },
      });
      if (clash) {
        res.status(409).json({ error: "Another question with the same content already exists.", duplicate: clash });
        return;
      }
      (data as any).fingerprint = fingerprint;
    }
  }

  const { writes, deletes, error } = splitTranslations(p.translations);
  if (error) { res.status(400).json({ error }); return; }
  // `translations` is not a column, so it must not reach the update payload.
  delete (data as Record<string, unknown>).translations;

  // One transaction: a half-applied edit would leave a question whose Hindi
  // text no longer matches its English one.
  const question = await prisma.$transaction(async (tx) => {
    const updated = await tx.question.update({ where: { id }, data });
    if (deletes.length) {
      await tx.questionTranslation.deleteMany({
        where: { questionId: id, language: { in: deletes as never[] } },
      });
    }
    for (const w of writes) {
      await tx.questionTranslation.upsert({
        where: { questionId_language: { questionId: id, language: w.language as never } },
        create: { questionId: id, language: w.language as never, ...(w.data as object) } as never,
        update: w.data as never,
      });
    }
    return tx.question.findUnique({
      where: { id },
      include: { translations: { select: { language: true } } },
    });
  });
  res.json(question);
});

router.delete("/questions/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  await prisma.question.delete({ where: { id } });
  res.json({ ok: true });
});

// ── Contest <-> Questions ─────────────────────────────────

const addQuestionSchema = z.object({
  questionId: z.uuid(),
  displayOrder: z.number().int().min(1),
  marks: z.number().min(0.1).default(2),
  negativeMarks: z.number().min(0).default(0.5),
});

// List questions in a contest (with full question data)
router.get("/contests/:id/questions", async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const cqs = await prisma.contestQuestion.findMany({
    where: { contestId },
    include: { question: true },
    orderBy: { displayOrder: "asc" },
  });
  res.json(cqs);
});

router.post("/contests/:id/questions", async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const parsed = addQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const cq = await prisma.contestQuestion.create({
    data: { contestId, ...parsed.data },
  });
  res.status(201).json(cq);
});

router.delete("/contests/:id/questions/:qid", async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const questionId = req.params.qid as string;
  await prisma.contestQuestion.delete({
    where: { contestId_questionId: { contestId, questionId } },
  });
  res.json({ ok: true });
});

const bulkQuestionSchema = z.array(
  questionSchema.extend({
    marks: z.number().min(0.1).default(2),
    negativeMarks: z.number().min(0).default(0.5),
  })
).min(1);

router.post("/contests/:id/questions/bulk", async (req: AuthRequest, res: Response) => {
  const contestId = req.params.id as string;
  const parsed = bulkQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  // Find current max display order for this contest
  const lastCq = await prisma.contestQuestion.findFirst({
    where: { contestId },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });
  let nextOrder = (lastCq?.displayOrder ?? 0) + 1;

  // Skip exact duplicates: against the DB and within the batch itself.
  const fingerprints = parsed.data.map((q) => fingerprintOf(q));
  const existing = await prisma.question.findMany({
    where: { fingerprint: { in: fingerprints } },
    select: { fingerprint: true },
  });
  const seen = new Set(existing.map((e) => e.fingerprint));

  const toCreate: typeof parsed.data = [];
  let skipped = 0;
  parsed.data.forEach((q, i) => {
    const fp = fingerprints[i];
    if (seen.has(fp)) { skipped++; return; }
    seen.add(fp);
    toCreate.push(q);
  });

  const results = await prisma.$transaction(
    toCreate.map(({ marks, negativeMarks, ...qData }) =>
      prisma.question.create({
        data: {
          ...toQuestionData(qData),
          fingerprint: fingerprintOf(qData),
          contestQuestions: {
            create: {
              contestId,
              displayOrder: nextOrder++,
              marks,
              negativeMarks,
            },
          },
        } as Prisma.QuestionCreateInput,
      })
    )
  );

  res.status(201).json({ created: results.length, skipped });
});

// ── Mock Tests (sectional practice) ───────────────────────

const mockTestSchema = z.object({
  title: z.string().min(1),
  subject: z.enum(["QUANT", "REASONING", "ENGLISH", "GK"]),
  durationMinutes: z.number().int().min(1).max(600),
  negativeMarks: z.number().min(0).default(0.5),
  isPublished: z.boolean().default(false),
});

// List all mock tests with question + attempt counts
router.get("/mocks", async (_req, res: Response) => {
  const mocks = await prisma.mockTest.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { mockTestQuestions: true, attempts: true } } },
  });
  res.json(mocks);
});

router.post("/mocks", async (req: AuthRequest, res: Response) => {
  const parsed = mockTestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const mock = await prisma.mockTest.create({ data: parsed.data });
  res.status(201).json(mock);
});

router.put("/mocks/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = mockTestSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const mock = await prisma.mockTest.update({ where: { id }, data: parsed.data });
  res.json(mock);
});

router.delete("/mocks/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  // Cascade handles mock_test_questions and mock_attempts
  await prisma.mockTest.delete({ where: { id } });
  res.json({ ok: true });
});

// Questions in a mock (with full question data)
router.get("/mocks/:id/questions", async (req: AuthRequest, res: Response) => {
  const mockTestId = req.params.id as string;
  const mtqs = await prisma.mockTestQuestion.findMany({
    where: { mockTestId },
    include: { question: { include: { passage: true } } },
    orderBy: { displayOrder: "asc" },
  });
  res.json(mtqs);
});

const addMockQuestionSchema = z.object({
  questionId: z.uuid(),
  marks: z.number().min(0.1).default(2),
  negativeMarks: z.number().min(0).default(0.5),
});

router.post("/mocks/:id/questions", async (req: AuthRequest, res: Response) => {
  const mockTestId = req.params.id as string;
  const parsed = addMockQuestionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }

  const last = await prisma.mockTestQuestion.findFirst({
    where: { mockTestId },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });
  const displayOrder = (last?.displayOrder ?? 0) + 1;

  try {
    const mtq = await prisma.mockTestQuestion.create({
      data: { mockTestId, displayOrder, ...parsed.data },
    });
    res.status(201).json(mtq);
  } catch {
    res.status(400).json({ error: "Question already added to this mock test." });
  }
});

router.delete("/mocks/:id/questions/:qid", async (req: AuthRequest, res: Response) => {
  const mockTestId = req.params.id as string;
  const questionId = req.params.qid as string;
  await prisma.mockTestQuestion.delete({
    where: { mockTestId_questionId: { mockTestId, questionId } },
  });
  res.json({ ok: true });
});

// ── Question Reports (student flags) ──────────────────────

// Triage queue — defaults to OPEN reports, grouped with the reported question.
router.get("/reports", async (req: AuthRequest, res: Response) => {
  const status = (req.query.status as string | undefined) ?? "OPEN";
  const where = status === "ALL" ? {} : { status: status as any };
  const [reports, openCount] = await Promise.all([
    prisma.questionReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { id: true, name: true } },
        question: {
          select: {
            id: true, text: true, imageUrl: true, subject: true, difficulty: true,
            optionA: true, optionB: true, optionC: true, optionD: true,
            correctOption: true, solution: true, questionType: true, structuredData: true,
            passage: { select: { id: true, title: true, content: true, type: true, tableData: true } },
          },
        },
      },
    }),
    prisma.questionReport.count({ where: { status: "OPEN" } }),
  ]);
  res.json({ reports, openCount });
});

const reportStatusSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]),
});

// Update a report's status (resolve after fixing the question, or dismiss).
router.patch("/reports/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = reportStatusSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const report = await prisma.questionReport.update({
    where: { id },
    data: {
      status: parsed.data.status,
      resolvedAt: parsed.data.status === "OPEN" ? null : new Date(),
    },
  });
  res.json(report);
});

export default router;
