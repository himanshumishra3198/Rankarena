import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { Prisma } from "../generated/prisma/client";
import { LANGUAGES, DEFAULT_LANGUAGE } from "../lib/i18n";
import redis from "../lib/redis";
import { computeFingerprint } from "../lib/fingerprint";
import { isValidTopic } from "../lib/topics";
import { DEFAULT_EXAM, EXAMS, examSections, examSpec, isExamQuestionType, isExamSection, parseExam, parseExamOrNull } from "../lib/exams";
import { parseAnswerConfig } from "../lib/answers";
import type { Exam, QuestionType, Subject } from "../generated/prisma/enums";
import { TAG_INCLUDE, ensureTags, flattenTags, missingTagIds, parseTagCategory, setQuestionTags, slugify, TAG_CATEGORIES } from "../lib/tags";
import { computeContestRatings } from "../lib/settleContest";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";

const router = Router();

// Convert a parsed question payload into Prisma-safe create/update data.
// Handles JSON-null (structuredData) and nullable passageId correctly.
function toQuestionData(d: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of ["questionType", "text", "optionA", "optionB", "optionC",
    "optionD", "subject", "difficulty", "exam"] as const) {
    if (d[k] !== undefined) out[k] = d[k];
  }
  // Both halves of the answer key are written together by the validator
  // below, so that a question can never keep a stale `correctOption` from
  // before it was switched to multiple-select.
  if (d.correctOption !== undefined) out.correctOption = d.correctOption ?? null;
  if (d.answerConfig !== undefined) {
    out.answerConfig = d.answerConfig ?? Prisma.JsonNull;
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

/**
 * Drops the fields a client did not actually send.
 *
 * `schema.partial()` does not remove a field's `.default()` in zod, so a
 * body that omits `questionType` still parses as STANDARD. Passed straight to
 * an update that means an edit to a question's text silently resets its type
 * to STANDARD and its difficulty to MEDIUM — and, now that questions carry
 * one, moves a CAT question to SSC CGL.
 *
 * The request body is the authority on what was sent, so every partial
 * update is filtered through here before it becomes an update payload.
 */
function onlySent<T extends object>(parsed: T, body: unknown): Partial<T> {
  const sent = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (Object.prototype.hasOwnProperty.call(sent, k)) out[k] = v;
  }
  return out as Partial<T>;
}

// Compute a question's exact-duplicate fingerprint from a payload.
function fingerprintOf(d: Record<string, any>): string {
  return computeFingerprint(d.text ?? "", [d.optionA ?? "", d.optionB ?? "", d.optionC ?? "", d.optionD ?? ""]);
}
router.use(authenticate, requireAdmin);

// ── Contests ─────────────────────────────────────────────

// Every section of every exam. Which of them are legal on a given paper
// depends on that paper's exam and is checked by `checkSectionLimits`.
// `partialRecord`, not `record`: in zod 4 a record keyed by an enum requires
// every member of that enum to be present, so a plain record here would mean
// a CAT paper had to name SSC's four sections as well as its own three.
const sectionLimitsSchema = z.partialRecord(
  z.enum(["QUANT", "REASONING", "ENGLISH", "GK", "VARC", "DILR", "QA"]),
  z.number().int().min(1)
).optional();

const contestSchema = z.object({
  title: z.string().min(1),
  exam: z.enum(["SSC_CGL", "CAT"]).default("SSC_CGL"),
  startTime: z.iso.datetime(),
  durationMinutes: z.number().int().min(1).max(1440),
  negativeMarks: z.number().min(0).default(0.5),
  sectionLimits: sectionLimitsSchema,
});

/**
 * Refuses section limits that name a section the exam does not have.
 *
 * Without this a CAT paper could be given a GK section, which would then ask
 * the question bank for SSC questions and quietly produce a paper no CAT
 * candidate was prepared for.
 */
function checkSectionLimits(exam: Exam, limits: Record<string, number> | undefined): string | null {
  if (!limits) return null;
  const legal = examSections(exam) as string[];
  const stray = Object.keys(limits).filter((k) => !legal.includes(k));
  if (stray.length) {
    return `${stray.join(", ")} ${stray.length === 1 ? "is not a section" : "are not sections"} of ${examSpec(exam).label}.`;
  }
  return null;
}

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
  const limitError = checkSectionLimits(parsed.data.exam, parsed.data.sectionLimits);
  if (limitError) { res.status(400).json({ error: limitError }); return; }

  const contest = await prisma.contest.create({ data: parsed.data });
  res.status(201).json(contest);
});

router.put("/contests/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const raw = contestSchema.partial().safeParse(req.body);
  if (!raw.success) {
    res.status(400).json({ error: raw.error.issues });
    return;
  }
  const parsed = { data: onlySent(raw.data, req.body) };

  const existing = await prisma.contest.findUnique({
    where: { id },
    select: { startTime: true, durationMinutes: true, exam: true, sectionLimits: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Contest not found" });
    return;
  }

  // Checked against the pair the contest will end up with: changing only the
  // exam has to be rejected if the sections already on the paper do not
  // belong to the new one.
  const nextExam = parsed.data.exam ?? existing.exam;
  const nextLimits = parsed.data.sectionLimits !== undefined
    ? parsed.data.sectionLimits
    : (existing.sectionLimits as Record<string, number> | null) ?? undefined;
  const limitError = checkSectionLimits(nextExam, nextLimits);
  if (limitError) { res.status(400).json({ error: limitError }); return; }

  // Moving a contest has to move its status with it. `status` is derived from
  // the schedule, but it is stored, so an edit that changed only the start
  // time left it behind: rescheduling a finished contest into the future kept
  // it ENDED, and the join route refuses an ENDED contest — locking everyone
  // out of a contest that had not run yet.
  const data: Record<string, unknown> = { ...parsed.data };
  const startTime = parsed.data.startTime ? new Date(parsed.data.startTime) : existing.startTime;
  const durationMinutes = parsed.data.durationMinutes ?? existing.durationMinutes;
  const rescheduled =
    startTime.getTime() !== existing.startTime.getTime() ||
    durationMinutes !== existing.durationMinutes;

  if (rescheduled) {
    const now = Date.now();
    const endsAt = startTime.getTime() + durationMinutes * 60_000;
    data.status = now < startTime.getTime() ? "SCHEDULED" : now < endsAt ? "LIVE" : "ENDED";
  }

  const contest = await prisma.contest.update({ where: { id }, data });
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
  const raw = passageSchema.partial().safeParse(req.body);
  if (!raw.success) { res.status(400).json({ error: raw.error.issues }); return; }
  const parsed = { data: onlySent(raw.data, req.body) };
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
  questionType: z.enum(["STANDARD", "SYLLOGISM", "PASSAGE", "TABLE", "MSQ", "TITA"]).default("STANDARD"),
  // Which examination the question is written for. Defaulted rather than
  // required so that every existing admin client, which does not send it,
  // keeps creating SSC CGL questions exactly as before.
  exam: z.enum(["SSC_CGL", "CAT"]).default("SSC_CGL"),
  text: z.string().min(1),
  imageUrl: z.url().max(500).optional().nullable(),
  // A type-in question has no options, so these may be blank. Whether they
  // are required is a function of the question type and is enforced by
  // `validateAnswerShape` below, where the type is known.
  optionA: z.string().default(""),
  optionB: z.string().default(""),
  optionC: z.string().default(""),
  optionD: z.string().default(""),
  // Single-choice only. Multiple-select and type-in questions carry their
  // key in `answerConfig` instead.
  correctOption: z.enum(["A", "B", "C", "D"]).optional().nullable(),
  // Shape depends on the type and is parsed by `parseAnswerConfig`, which is
  // also what scoring reads it back through.
  answerConfig: z.record(z.string(), z.any()).optional().nullable(),
  // Normalized labels, replacing the free-text topic for new exams. Ids, so
  // that renaming a tag does not touch the questions carrying it.
  tagIds: z.array(z.string().uuid()).max(30).optional(),
  subject: z.enum(["QUANT", "REASONING", "ENGLISH", "GK", "VARC", "DILR", "QA"]),
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

/**
 * The rules that involve more than one field, and so cannot live in the zod
 * schema.
 *
 * An exam decides which sections and which answer formats are legal, and the
 * answer format decides whether the four options are required and where the
 * key is stored. Checked in one place for create and edit alike, because the
 * two paths disagreeing is how a question gets saved that can never be
 * marked correct.
 */
function validateQuestionShape(d: {
  exam: Exam;
  subject: Subject;
  questionType: QuestionType;
  optionA: string; optionB: string; optionC: string; optionD: string;
  correctOption?: string | null;
  answerConfig?: unknown;
}): { ok: false; error: string } | { ok: true; correctOption: string | null; answerConfig: unknown } {
  const spec = examSpec(d.exam);

  if (!isExamSection(d.exam, d.subject)) {
    return { ok: false, error: `${d.subject} is not a section of ${spec.label}. Its sections are ${examSections(d.exam).join(", ")}.` };
  }
  if (!isExamQuestionType(d.exam, d.questionType)) {
    return { ok: false, error: `${spec.label} questions cannot be of type ${d.questionType}.` };
  }

  // Everything except type-in is answered by picking from the four options,
  // so all four have to be there.
  if (d.questionType !== "TITA") {
    const blank = (["optionA", "optionB", "optionC", "optionD"] as const)
      .filter((k) => !(d[k] ?? "").trim())
      .map((k) => k.slice(-1));
    if (blank.length) {
      return { ok: false, error: `Option ${blank.join(", ")} cannot be blank on a ${d.questionType} question.` };
    }
  }

  const key = parseAnswerConfig(d.questionType, d.correctOption, d.answerConfig);
  if (!key.ok) return { ok: false, error: key.error ?? "The answer key is not valid." };
  return { ok: true, correctOption: key.value!.correctOption, answerConfig: key.value!.answerConfig };
}

router.post("/questions", async (req: AuthRequest, res: Response) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const shape = validateQuestionShape(parsed.data as never);
  if (!shape.ok) { res.status(400).json({ error: shape.error }); return; }
  parsed.data.correctOption = shape.correctOption as never;
  (parsed.data as Record<string, unknown>).answerConfig = shape.answerConfig;

  // SSC questions are still filed under a topic from the hard-coded syllabus
  // list. Newer exams use tags instead, so there is nothing to check against.
  if (parsed.data.exam === "SSC_CGL" && !isValidTopic(parsed.data.subject as never, parsed.data.topic)) {
    res.status(400).json({ error: `"${parsed.data.topic}" is not a topic of ${parsed.data.subject}.` });
    return;
  }

  const tagIds = parsed.data.tagIds ?? [];
  const unknownTags = await missingTagIds(tagIds);
  if (unknownTags.length) {
    res.status(400).json({ error: `No such tag: ${unknownTags.join(", ")}.` });
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
      ...(tagIds.length ? { tags: { create: tagIds.map((tagId) => ({ tagId })) } } : {}),
      fingerprint,
      // The fingerprint is computed from the English text only, so a
      // translation can never make two distinct questions look identical.
      translations: writes.length
        ? { create: writes.map((w) => ({ ...w.data, language: w.language as never })) }
        : undefined,
    } as Prisma.QuestionUncheckedCreateInput,
    include: { translations: { select: { language: true } }, tags: TAG_INCLUDE },
  });
  res.status(201).json({ ...question, tags: flattenTags(question.tags) });
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
  // Absent means "every exam", so the bank still opens on everything for a
  // client that does not know about exams.
  const exam = parseExamOrNull(req.query.exam);
  const questionType = req.query.questionType as string | undefined;

  // Repeated ?tagIds=, or one comma-separated value — both are what a URL
  // built by hand and one built by URLSearchParams look like.
  const tagIds = [req.query.tagIds, req.query.tagId]
    .flatMap((v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]))
    .flatMap((v) => String(v).split(","))
    .map((v) => v.trim())
    .filter(Boolean);

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
    ...(exam ? { exam } : {}),
    ...(subject ? { subject: subject as any } : {}),
    ...(difficulty ? { difficulty: difficulty as any } : {}),
    ...(questionType ? { questionType: questionType as any } : {}),
    // "__none" filters to questions nobody has tagged yet.
    ...(topic ? (topic === "__none" ? { topic: null } : { topic }) : {}),
    // AND rather than OR: picking two tags narrows to questions carrying
    // both, which is what a filter panel implies and what makes stacking
    // "Geometry" + "Hard" useful.
    ...(tagIds.length
      ? { AND: tagIds.map((tagId) => ({ tags: { some: { tagId } } })) }
      : {}),
    ...searchWhere,
  };

  const [total, questions] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      // Full translations, because the same rows populate the editor when a
      // question is opened — one round trip rather than a fetch per edit.
      include: { passage: true, translations: true, tags: TAG_INCLUDE },
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
      tags: flattenTags(q.tags),
    })),
    total,
    page: paged ? page : 1,
    perPage: paged ? perPage : total,
  });
});

router.put("/questions/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const raw = questionSchema.partial().safeParse(req.body);
  if (!raw.success) {
    res.status(400).json({ error: raw.error.issues });
    return;
  }
  const parsed = { data: onlySent(raw.data, req.body) };

  // An edit is validated as the question it will produce, not as the patch
  // that produces it: a request that changes only the type still has to end
  // up with an answer key that fits that type, and the fields it leaves
  // alone are the ones already stored.
  const current = await prisma.question.findUnique({ where: { id } });
  if (!current) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const pick = <K extends keyof typeof current>(k: K) =>
    (parsed.data as Record<string, unknown>)[k as string] !== undefined
      ? ((parsed.data as Record<string, unknown>)[k as string] as (typeof current)[K])
      : current[k];

  const next = {
    exam: pick("exam"),
    subject: pick("subject"),
    questionType: pick("questionType"),
    optionA: pick("optionA") ?? "",
    optionB: pick("optionB") ?? "",
    optionC: pick("optionC") ?? "",
    optionD: pick("optionD") ?? "",
    correctOption: pick("correctOption"),
    answerConfig: pick("answerConfig"),
  };

  const shape = validateQuestionShape(next as never);
  if (!shape.ok) { res.status(400).json({ error: shape.error }); return; }
  // Written unconditionally, so switching a question from single-choice to
  // multiple-select clears the letter it used to carry instead of leaving a
  // key that two different code paths could each believe.
  (parsed.data as Record<string, unknown>).correctOption = shape.correctOption;
  (parsed.data as Record<string, unknown>).answerConfig = shape.answerConfig;

  // Moving a question to a new subject silently clears a topic that doesn't
  // exist there, rather than rejecting the edit or leaving a mismatched tag
  // behind. Only SSC files questions by topic; newer exams use tags.
  if (next.exam === "SSC_CGL") {
    const nextTopic = parsed.data.topic !== undefined ? parsed.data.topic : current.topic;
    if (parsed.data.topic !== undefined && !isValidTopic(next.subject as never, nextTopic)) {
      res.status(400).json({ error: `"${nextTopic}" is not a topic of ${next.subject}.` });
      return;
    }
    if (parsed.data.topic === undefined && !isValidTopic(next.subject as never, nextTopic)) {
      (parsed.data as Record<string, any>).topic = null;
    }
  }

  if (parsed.data.tagIds !== undefined) {
    const unknownTags = await missingTagIds(parsed.data.tagIds);
    if (unknownTags.length) {
      res.status(400).json({ error: `No such tag: ${unknownTags.join(", ")}.` });
      return;
    }
  }

  const data = toQuestionData(parsed.data) as Prisma.QuestionUncheckedUpdateInput;
  // Recompute fingerprint if text/options changed; block if it collides
  // with a *different* existing question.
  const p = parsed.data as Record<string, any>;
  if (p.text !== undefined || p.optionA !== undefined || p.optionB !== undefined ||
      p.optionC !== undefined || p.optionD !== undefined) {
    {
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
  // Neither of these is a column on `questions`, so they must not reach the
  // update payload — tags are a join table, written below.
  delete (data as Record<string, unknown>).translations;
  delete (data as Record<string, unknown>).tagIds;

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
      include: { translations: { select: { language: true } }, tags: TAG_INCLUDE },
    });
  });

  // Outside the transaction above: the tag set is independent of the question
  // body, and a failure here leaves the edit applied rather than rolling back
  // a correct translation because a label did not stick.
  if (parsed.data.tagIds !== undefined) {
    await setQuestionTags(id, parsed.data.tagIds);
  }

  const withTags = parsed.data.tagIds !== undefined
    ? await prisma.question.findUnique({
        where: { id },
        include: { translations: { select: { language: true } }, tags: TAG_INCLUDE },
      })
    : question;
  res.json({ ...withTags, tags: flattenTags(withTags?.tags) });
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
    // Translations included because the admin form edits them from here. Without
    // them the Hindi fields load empty and saving wipes the translation.
    include: { question: { include: { passage: true, translations: true } } },
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

// ── Mock Tests (sectional practice) ───────────────────────

const mockTestSchema = z.object({
  title: z.string().min(1),
  exam: z.enum(["SSC_CGL", "CAT"]).default("SSC_CGL"),
  subject: z.enum(["QUANT", "REASONING", "ENGLISH", "GK", "VARC", "DILR", "QA"]),
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
  if (!isExamSection(parsed.data.exam, parsed.data.subject)) {
    res.status(400).json({
      error: `${parsed.data.subject} is not a section of ${examSpec(parsed.data.exam).label}.`,
    });
    return;
  }
  const mock = await prisma.mockTest.create({ data: parsed.data });
  res.status(201).json(mock);
});

router.put("/mocks/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const raw = mockTestSchema.partial().safeParse(req.body);
  if (!raw.success) { res.status(400).json({ error: raw.error.issues }); return; }
  const parsed = { data: onlySent(raw.data, req.body) };

  if (parsed.data.exam !== undefined || parsed.data.subject !== undefined) {
    const current = await prisma.mockTest.findUnique({
      where: { id }, select: { exam: true, subject: true },
    });
    if (!current) { res.status(404).json({ error: "Mock test not found" }); return; }
    const nextExam = parsed.data.exam ?? current.exam;
    const nextSubject = parsed.data.subject ?? current.subject;
    if (!isExamSection(nextExam, nextSubject)) {
      res.status(400).json({
        error: `${nextSubject} is not a section of ${examSpec(nextExam).label}.`,
      });
      return;
    }
  }

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
    include: { question: { include: { passage: true, translations: true } } },
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
            // An admin reviewing a report on a multiple-select or type-in
            // question needs to see the key it is being reported for.
            exam: true, answerConfig: true,
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

// ── Examinations ─────────────────────────────────────────

/**
 * What the admin panel needs to know about each examination.
 *
 * Served rather than duplicated in the client, so adding an exam is one
 * entry in src/lib/exams.ts and not a matching edit in two codebases that
 * can drift. The panel reads sections, legal answer formats and the defaults
 * for a new paper from here.
 */
router.get("/exams", async (_req, res: Response) => {
  res.json({
    exams: Object.values(EXAMS).map((e) => ({
      key: e.key,
      label: e.label,
      sections: e.sections,
      questionTypes: e.questionTypes,
      defaults: e.defaults,
      noPenaltyTypes: e.noPenaltyTypes,
    })),
    defaultExam: DEFAULT_EXAM,
    tagCategories: TAG_CATEGORIES,
  });
});

// ── Tags ─────────────────────────────────────────────────

router.get("/tags", async (req: AuthRequest, res: Response) => {
  const exam = parseExamOrNull(req.query.exam);
  const category = parseTagCategory(req.query.category);
  const search = (req.query.search as string | undefined)?.trim();
  // Retired tags are hidden by default but still fetchable, so an admin can
  // see what an old question is carrying and reinstate it.
  const includeInactive = req.query.includeInactive === "true";

  const tags = await prisma.tag.findMany({
    where: {
      // A tag with no exam applies to all of them, so an exam filter has to
      // keep those as well as the ones named for this exam.
      ...(exam ? { OR: [{ exam }, { exam: null }] } : {}),
      ...(category ? { category } : {}),
      ...(includeInactive ? {} : { active: true }),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { questions: true } } },
  });

  res.json(tags.map((t) => ({ ...t, questionCount: t._count.questions, _count: undefined })));
});

const tagSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(["TOPIC", "SUBTOPIC", "DIFFICULTY", "SKILL", "QUESTION_TYPE", "CUSTOM"]).default("TOPIC"),
  exam: z.enum(["SSC_CGL", "CAT"]).optional().nullable(),
  active: z.boolean().default(true),
});

router.post("/tags", async (req: AuthRequest, res: Response) => {
  const parsed = tagSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }

  const slug = slugify(parsed.data.name);
  if (!slug) {
    res.status(400).json({ error: "A tag needs at least one letter or digit in its name." });
    return;
  }

  const clash = await prisma.tag.findUnique({
    where: { category_slug: { category: parsed.data.category, slug } },
    select: { id: true, name: true },
  });
  if (clash) {
    // 409 with the existing row, so the client can select it instead of
    // showing an error the admin can do nothing about.
    res.status(409).json({ error: `"${clash.name}" already exists.`, duplicate: clash });
    return;
  }

  const tag = await prisma.tag.create({
    data: { ...parsed.data, slug, exam: parsed.data.exam ?? null },
  });
  res.status(201).json(tag);
});

router.put("/tags/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const raw = tagSchema.partial().safeParse(req.body);
  if (!raw.success) { res.status(400).json({ error: raw.error.issues }); return; }
  const parsed = { data: onlySent(raw.data, req.body) };

  const current = await prisma.tag.findUnique({ where: { id } });
  if (!current) { res.status(404).json({ error: "Tag not found" }); return; }

  // Renaming re-slugs, which is the whole point of normalising: the questions
  // carrying this tag are untouched because they reference its id.
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.name !== undefined) {
    const slug = slugify(parsed.data.name);
    if (!slug) {
      res.status(400).json({ error: "A tag needs at least one letter or digit in its name." });
      return;
    }
    const category = parsed.data.category ?? current.category;
    const clash = await prisma.tag.findFirst({
      where: { category, slug, id: { not: id } },
      select: { id: true, name: true },
    });
    if (clash) {
      res.status(409).json({ error: `"${clash.name}" already uses that name.`, duplicate: clash });
      return;
    }
    data.slug = slug;
  }

  const tag = await prisma.tag.update({ where: { id }, data });
  res.json(tag);
});

/**
 * Retires a tag, or deletes it outright if nothing carries it.
 *
 * Deleting a tag in use would silently strip a label off every question
 * holding it and break any saved filter, so one that is in use is
 * deactivated instead: it stops being offered on new questions and stays
 * attached to the old ones.
 */
router.delete("/tags/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const used = await prisma.questionTag.count({ where: { tagId: id } });
  if (used > 0) {
    const tag = await prisma.tag.update({ where: { id }, data: { active: false } });
    res.json({ ok: true, deactivated: true, questionCount: used, tag });
    return;
  }
  await prisma.tag.delete({ where: { id } });
  res.json({ ok: true, deactivated: false });
});

export default router;
