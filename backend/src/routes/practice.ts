import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { Prisma } from "../generated/prisma/client";
import { Language, Difficulty } from "../generated/prisma/enums";
import {
  parseLanguage, translationSelect, titleTranslationSelect, passageTranslationSelect, localizeQuestion,
} from "../lib/i18n";
import { excerptFromHtml } from "../lib/excerpt";
import { ONLY_SAFE_TO_REVEAL } from "../lib/questionSafety";
import { SUBJECTS, TOPICS_BY_SUBJECT, ALL_TOPICS, type Subject } from "../lib/topics";
import { revealAnswer } from "../lib/answers";

const router = Router();
router.use(authenticate);

// Selects a card in the language it is being read in. Mirrors the
// contests.ts/mocks.ts result routes: EN fetches no translation rows at all,
// any other language fetches only the one row for that language.
function cardSelect(language: Language) {
  return {
    id: true,
    text: true,
    imageUrl: true,
    questionType: true,
    optionA: true,
    optionB: true,
    optionC: true,
    optionD: true,
    correctOption: true,
    // Practice only ever serves questions whose paper has finished, so the
    // key is revealable here by design — see lib/questionSafety.ts.
    answerConfig: true,
    exam: true,
    subject: true,
    topic: true,
    difficulty: true,
    structuredData: true,
    solution: true,
    translations: translationSelect(language),
    passage: {
      select: {
        id: true, title: true, content: true, type: true, tableData: true,
        translations: passageTranslationSelect(language),
      },
    },
  } satisfies Prisma.QuestionSelect;
}

type Card = Prisma.QuestionGetPayload<{ select: ReturnType<typeof cardSelect> }>;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// GET /practice/recommendations?questionId=<uuid>&limit=5
//
// Suggests up to `limit` other questions to practise after a wrong answer,
// falling through subject+topic+difficulty -> subject+topic -> subject+difficulty
// -> subject-only (the last two tiers are also what cover an untagged
// question, since `topic` is optional). The endpoint only receives
// `questionId`, not which specific
// attempt is being reviewed, so "same test" exclusion is computed as every
// contest/mock this question has ever appeared in, not just the current one.
// That over-excludes for a reused question but never under-excludes, so a
// completed test's other questions never show up as a recommendation.
router.get("/recommendations", async (req: AuthRequest, res: Response) => {
  const questionId = req.query.questionId as string | undefined;
  if (!questionId) {
    res.status(400).json({ error: "questionId is required" });
    return;
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 10);

  const original = await prisma.question.findUnique({
    where: { id: questionId },
    select: { subject: true, topic: true, difficulty: true },
  });
  if (!original) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  // Recommendations reveal correctOption, so this endpoint is an answer-key
  // oracle unless access is tied to evidence the caller actually sat the
  // question. Login alone is not that evidence — it lets any account iterate
  // questionId and read the whole bank, including questions currently sitting
  // in a scheduled or live contest. A submitted attempt is: it can only exist
  // after the caller's own test window closed for them.
  const [contestAttempt, mockAttempt] = await Promise.all([
    prisma.participation.findFirst({
      where: {
        userId: req.user!.id,
        submittedAt: { not: null },
        contest: { contestQuestions: { some: { questionId } } },
      },
      select: { id: true, language: true },
    }),
    prisma.mockAttempt.findFirst({
      where: {
        userId: req.user!.id,
        submittedAt: { not: null },
        mockTest: { mockTestQuestions: { some: { questionId } } },
      },
      select: { id: true, language: true },
    }),
  ]);
  if (!contestAttempt && !mockAttempt) {
    res.status(403).json({ error: "You can only get recommendations for a question you have attempted." });
    return;
  }

  // The gate above guarantees one of these exists, so the paper was sat in a
  // known language; ?language= only matters if that assumption ever changes.
  const language = contestAttempt?.language ?? mockAttempt?.language ?? parseLanguage(req.query.language);

  const [contestSiblingTests, mockSiblingTests] = await Promise.all([
    prisma.contestQuestion.findMany({ where: { questionId }, select: { contestId: true } }),
    prisma.mockTestQuestion.findMany({ where: { questionId }, select: { mockTestId: true } }),
  ]);
  const [contestSiblings, mockSiblings] = await Promise.all([
    contestSiblingTests.length
      ? prisma.contestQuestion.findMany({
          where: { contestId: { in: contestSiblingTests.map((c) => c.contestId) } },
          select: { questionId: true },
        })
      : [],
    mockSiblingTests.length
      ? prisma.mockTestQuestion.findMany({
          where: { mockTestId: { in: mockSiblingTests.map((m) => m.mockTestId) } },
          select: { questionId: true },
        })
      : [],
  ]);
  const excluded = new Set<string>([
    questionId,
    ...contestSiblings.map((s) => s.questionId),
    ...mockSiblings.map((s) => s.questionId),
  ]);

  async function pickTier(where: Prisma.QuestionWhereInput, remaining: number): Promise<Card[]> {
    if (remaining <= 0) return [];
    const rows = await prisma.question.findMany({
      where: { ...where, ...ONLY_SAFE_TO_REVEAL, id: { notIn: [...excluded] } },
      select: cardSelect(language),
      take: remaining * 3,
    });
    return shuffle(rows).slice(0, remaining);
  }

  let results: Card[] = [];

  if (original.topic) {
    const tier1 = await pickTier(
      { subject: original.subject, topic: original.topic, difficulty: original.difficulty },
      limit - results.length
    );
    tier1.forEach((r) => excluded.add(r.id));
    results.push(...tier1);
  }

  if (original.topic && results.length < limit) {
    const tier2 = await pickTier(
      { subject: original.subject, topic: original.topic },
      limit - results.length
    );
    tier2.forEach((r) => excluded.add(r.id));
    results.push(...tier2);
  }

  // Falling straight from "same topic" to "anything in this subject" is close
  // to random on a bank this size — a percentages question wrong could come
  // back with a mensuration recommendation. Matching on difficulty first at
  // least keeps the suggestion at the right level for an untagged question,
  // or a tagged one whose topic doesn't have enough siblings.
  if (results.length < limit) {
    const tier3 = await pickTier(
      { subject: original.subject, difficulty: original.difficulty },
      limit - results.length
    );
    tier3.forEach((r) => excluded.add(r.id));
    results.push(...tier3);
  }

  if (results.length < limit) {
    const tier4 = await pickTier({ subject: original.subject }, limit - results.length);
    results.push(...tier4);
  }

  const bookmarked = new Set(
    (
      await prisma.bookmark.findMany({
        where: { userId: req.user!.id, questionId: { in: results.map((r) => r.id) } },
        select: { questionId: true },
      })
    ).map((b) => b.questionId)
  );

  res.json({
    subject: original.subject,
    topic: original.topic,
    questions: results.map((r) => ({
      ...localizeQuestion(r, language), ...revealAnswer(r), bookmarked: bookmarked.has(r.id),
    })),
  });
});

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

/** Which past paper a problem came from, for the "From" column. */
interface ProblemSource {
  type: "CONTEST" | "MOCK";
  id: string;
  title: string;
}

/**
 * Where each of these questions was released.
 *
 * A reused question belongs to several papers; the newest finished contest
 * wins, because that is the one a candidate is most likely to remember
 * sitting. A question released only by a published mock names the mock.
 * Both lists are already narrowed to finished papers, so nothing here can
 * name a contest that has not run.
 */
async function resolveSources(questionIds: string[]): Promise<Map<string, ProblemSource>> {
  if (questionIds.length === 0) return new Map();

  const [contestLinks, mockLinks] = await Promise.all([
    prisma.contestQuestion.findMany({
      where: { questionId: { in: questionIds }, contest: { status: "ENDED" } },
      select: { questionId: true, contest: { select: { id: true, title: true, startTime: true } } },
    }),
    prisma.mockTestQuestion.findMany({
      where: { questionId: { in: questionIds }, mockTest: { isPublished: true } },
      select: { questionId: true, mockTest: { select: { id: true, title: true } } },
    }),
  ]);

  const sources = new Map<string, ProblemSource>();
  const newest = new Map<string, number>();
  for (const link of contestLinks) {
    const at = link.contest.startTime.getTime();
    if ((newest.get(link.questionId) ?? -Infinity) >= at) continue;
    newest.set(link.questionId, at);
    sources.set(link.questionId, { type: "CONTEST", id: link.contest.id, title: link.contest.title });
  }
  for (const link of mockLinks) {
    if (sources.has(link.questionId)) continue;
    sources.set(link.questionId, { type: "MOCK", id: link.mockTest.id, title: link.mockTest.title });
  }
  return sources;
}

/**
 * A one-line label for a question in a list.
 *
 * Questions have no title — they are a body of rich text — so the row is
 * labelled with the opening of the question itself, the way a problemset
 * names a problem. Two kinds of question have no usable text of their own: a
 * comprehension or data-set question, which is named after its passage, and a
 * syllogism, whose text lives in `structuredData`.
 */
function problemTitle(q: {
  text: string;
  structuredData: Prisma.JsonValue;
  passage: { title: string } | null;
}): string {
  const fromText = excerptFromHtml(q.text, 150);
  if (fromText) return fromText;

  const statements = (q.structuredData as { statements?: string[] } | null)?.statements;
  if (statements?.length) return excerptFromHtml(statements.join(" "), 150);

  if (q.passage?.title) return q.passage.title;
  return "Untitled question";
}

/** Reads `subject`, `topic` and `difficulty` off a request, or explains itself. */
function parseFilters(req: AuthRequest):
  | { ok: true; subject?: Subject; topic?: string; difficulty?: Difficulty }
  | { ok: false; error: string } {
  const rawSubject = typeof req.query.subject === "string" ? req.query.subject.trim().toUpperCase() : "";
  if (rawSubject && !(SUBJECTS as readonly string[]).includes(rawSubject)) {
    return { ok: false, error: `Unknown subject. Expected one of: ${SUBJECTS.join(", ")}.` };
  }
  const subject = (rawSubject || undefined) as Subject | undefined;

  const rawDifficulty = typeof req.query.difficulty === "string" ? req.query.difficulty.trim().toUpperCase() : "";
  if (rawDifficulty && !(DIFFICULTIES as readonly string[]).includes(rawDifficulty)) {
    return { ok: false, error: `Unknown difficulty. Expected one of: ${DIFFICULTIES.join(", ")}.` };
  }
  const difficulty = (rawDifficulty || undefined) as Difficulty | undefined;

  // Validated rather than passed through: an unknown topic would silently
  // return an empty page, which reads as "nothing to practise here" when it
  // is really a typo or a stale link.
  const topic = typeof req.query.topic === "string" && req.query.topic.trim() ? req.query.topic.trim() : undefined;
  if (topic && !(subject ? TOPICS_BY_SUBJECT[subject].includes(topic) : ALL_TOPICS.includes(topic))) {
    return { ok: false, error: subject ? `Unknown topic for ${subject}.` : "Unknown topic." };
  }

  return { ok: true, subject, topic, difficulty };
}

/**
 * `source=contest:<id>` / `source=mock:<id>` — one past paper's problems.
 *
 * Narrowing only. The paper still has to clear ONLY_SAFE_TO_REVEAL, so
 * naming a live contest here returns nothing rather than its questions.
 */
function sourceFilter(value: unknown): Prisma.QuestionWhereInput {
  if (typeof value !== "string") return {};
  const [kind, id] = value.split(":");
  if (!id) return {};
  if (kind === "contest") return { contestQuestions: { some: { contestId: id } } };
  if (kind === "mock") return { mockTestQuestions: { some: { mockTestId: id } } };
  return {};
}

// GET /practice/filters
//
// What the problemset is allowed to offer. Counted through the same filter
// the problems themselves come through, so a choice that is offered always
// has something behind it — listing all 49 syllabus topics, or every contest
// ever scheduled, would mean most choices lead to an empty page.
router.get("/filters", async (_req: AuthRequest, res: Response) => {
  const [groups, contestCounts, mockCounts] = await Promise.all([
    prisma.question.groupBy({
      by: ["subject", "topic", "difficulty"],
      where: ONLY_SAFE_TO_REVEAL,
      _count: { _all: true },
    }),
    prisma.contestQuestion.groupBy({
      by: ["contestId"],
      where: { question: ONLY_SAFE_TO_REVEAL, contest: { status: "ENDED" } },
      _count: { _all: true },
    }),
    prisma.mockTestQuestion.groupBy({
      by: ["mockTestId"],
      where: { question: ONLY_SAFE_TO_REVEAL, mockTest: { isPublished: true } },
      _count: { _all: true },
    }),
  ]);

  interface Bucket {
    count: number;
    /** Questions with no topic tag: reachable under "all topics", not on their own. */
    untagged: number;
    difficulties: Record<string, number>;
    topics: Map<string, number>;
  }
  const bySubject = new Map<string, Bucket>();

  for (const g of groups) {
    const n = g._count._all;
    let bucket = bySubject.get(g.subject);
    if (!bucket) {
      bucket = { count: 0, untagged: 0, difficulties: { EASY: 0, MEDIUM: 0, HARD: 0 }, topics: new Map() };
      bySubject.set(g.subject, bucket);
    }
    bucket.count += n;
    bucket.difficulties[g.difficulty] += n;
    if (g.topic) bucket.topics.set(g.topic, (bucket.topics.get(g.topic) ?? 0) + n);
    else bucket.untagged += n;
  }

  // Syllabus order rather than count order: the list should read like the
  // syllabus someone is revising from. A topic that no longer appears in
  // topics.ts — renamed after its questions were tagged — is listed after the
  // canonical ones instead of being dropped, because those questions are
  // still perfectly practisable.
  const subjects = SUBJECTS.filter((s) => bySubject.has(s)).map((s) => {
    const bucket = bySubject.get(s)!;
    const canonical = TOPICS_BY_SUBJECT[s].filter((t) => bucket.topics.has(t));
    const renamed = [...bucket.topics.keys()].filter((t) => !TOPICS_BY_SUBJECT[s].includes(t)).sort();
    return {
      subject: s,
      count: bucket.count,
      untagged: bucket.untagged,
      difficulties: bucket.difficulties,
      topics: [...canonical, ...renamed].map((t) => ({ topic: t, count: bucket.topics.get(t)! })),
    };
  });

  const [contests, mocks] = await Promise.all([
    contestCounts.length
      ? prisma.contest.findMany({
          where: { id: { in: contestCounts.map((c) => c.contestId) } },
          select: { id: true, title: true, startTime: true },
          orderBy: { startTime: "desc" },
        })
      : [],
    mockCounts.length
      ? prisma.mockTest.findMany({
          where: { id: { in: mockCounts.map((m) => m.mockTestId) } },
          select: { id: true, title: true, subject: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);
  const contestCount = new Map(contestCounts.map((c) => [c.contestId, c._count._all]));
  const mockCount = new Map(mockCounts.map((m) => [m.mockTestId, m._count._all]));

  res.json({
    total: subjects.reduce((n, s) => n + s.count, 0),
    subjects,
    sources: {
      contests: contests.map((c) => ({
        value: `contest:${c.id}`, title: c.title, date: c.startTime, count: contestCount.get(c.id) ?? 0,
      })),
      mocks: mocks.map((m) => ({
        value: `mock:${m.id}`, title: m.title, subject: m.subject, count: mockCount.get(m.id) ?? 0,
      })),
    },
  });
});

// GET /practice/problems?subject=&topic=&difficulty=&source=&q=&page=&limit=&language=
//
// The problemset: one page of the archive, as a list.
//
// It carries no answer keys. A row is a label, a subject, a topic, a
// difficulty and where the problem came from — enough to choose what to open
// and nothing more. The correct option and the solution live behind
// /practice/problems/:id, one question at a time, which is the difference
// between a page somebody reads and a page somebody scrapes.
//
// Ordered by subject, then topic, then difficulty, then id. Every part of
// that is stable, which is what makes page 3 mean the same thing twice and a
// link to it worth keeping.
router.get("/problems", async (req: AuthRequest, res: Response) => {
  const filters = parseFilters(req);
  if (!filters.ok) {
    res.status(400).json({ error: filters.error });
    return;
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || PAGE_SIZE_DEFAULT, 1), PAGE_SIZE_MAX);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const language = parseLanguage(req.query.language);
  const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

  const where: Prisma.QuestionWhereInput = {
    ...ONLY_SAFE_TO_REVEAL,
    ...(filters.subject ? { subject: filters.subject } : {}),
    ...(filters.topic ? { topic: filters.topic } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...sourceFilter(req.query.source),
    // Searches the English text only. A Hindi reader searching in Hindi finds
    // nothing rather than something wrong, which is the better of the two
    // until translations are indexed.
    ...(search ? { text: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      select: {
        id: true,
        text: true,
        subject: true,
        topic: true,
        difficulty: true,
        questionType: true,
        structuredData: true,
        // Not returned — only asked so the row can say whether opening the
        // problem will come with a written explanation.
        solution: true,
        passage: { select: { title: true } },
        translations: titleTranslationSelect(language),
      },
      orderBy: [{ subject: "asc" }, { topic: "asc" }, { difficulty: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const ids = rows.map((r) => r.id);
  const [sources, bookmarked] = await Promise.all([
    resolveSources(ids),
    prisma.bookmark
      .findMany({ where: { userId: req.user!.id, questionId: { in: ids } }, select: { questionId: true } })
      .then((bs) => new Set(bs.map((b) => b.questionId))),
  ]);

  res.json({
    total,
    page,
    pageSize: limit,
    pageCount: Math.max(Math.ceil(total / limit), 1),
    problems: rows.map((r) => {
      const translated = r.translations?.[0];
      return {
        id: r.id,
        title: problemTitle({ ...r, text: translated?.text ?? r.text }),
        subject: r.subject,
        topic: r.topic,
        difficulty: r.difficulty,
        questionType: r.questionType,
        hasSolution: !!r.solution,
        // English is the source, never a fallback, so it is always "translated".
        translated: language === "EN" || !!translated,
        bookmarked: bookmarked.has(r.id),
        source: sources.get(r.id) ?? null,
      };
    }),
  });
});

// GET /practice/problems/:id?language=
//
// One problem, with the answer and the solution.
//
// The same filter as the list, applied again rather than assumed: the list
// is not a gate, it is a view, and an id from anywhere else — a guess, an
// old link, a row that was practisable last week — arrives here directly.
// A question the archive does not hold is a 404 and not a 403, because
// "this question exists but you may not see it" is itself worth knowing when
// what you are probing for is next week's paper.
router.get("/problems/:id", async (req: AuthRequest, res: Response) => {
  const language = parseLanguage(req.query.language);
  const id = req.params.id as string;

  const question = await prisma.question.findFirst({
    where: { AND: [{ id }, ONLY_SAFE_TO_REVEAL] },
    select: cardSelect(language),
  });
  if (!question) {
    res.status(404).json({ error: "No such practice problem." });
    return;
  }

  const [sources, bookmark] = await Promise.all([
    resolveSources([id]),
    prisma.bookmark.findUnique({
      where: { userId_questionId: { userId: req.user!.id, questionId: id } },
      select: { id: true },
    }),
  ]);

  res.json({
    ...localizeQuestion(question, language),
    ...revealAnswer(question),
    bookmarked: !!bookmark,
    source: sources.get(id) ?? null,
  });
});

/** The pool a daily challenge may be drawn from. */
const DAILY_SUBJECTS = ["QUANT", "REASONING"] as const;

/**
 * Today's date in IST, as YYYY-MM-DD.
 *
 * The challenge has to roll over at a time that means "a new day" to the
 * people sitting it. UTC midnight is 5:30am in India — halfway through the
 * early-morning study slot — so the day is cut in Asia/Kolkata instead.
 */
function istDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** FNV-1a over the date, so one day maps to one stable offset. */
function seedFor(day: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// GET /practice/daily?language=
//
// One question a day, the same one for everybody.
//
// Chosen by hashing the IST date into an offset over the eligible pool
// rather than stored in a table: the pick is then reproducible from the
// date alone, needs no migration and no nightly job, and cannot drift if a
// cron misses a night. The cost is that the pool changing reshuffles which
// question a past date maps to — acceptable for something with no score
// attached to it, and the reason this does not pretend to keep a history.
//
// It draws from the same ONLY_SAFE_TO_REVEAL archive as everything else
// here. A challenge hands out an answer key, so picking at random from the
// whole bank would eventually put a question from an unsat contest on the
// front page of the site.
router.get("/daily", async (req: AuthRequest, res: Response) => {
  const language = parseLanguage(req.query.language);
  const day = istDay();

  const where: Prisma.QuestionWhereInput = {
    ...ONLY_SAFE_TO_REVEAL,
    subject: { in: [...DAILY_SUBJECTS] },
  };

  const total = await prisma.question.count({ where });
  if (total === 0) {
    res.json({ day, question: null });
    return;
  }

  const question = await prisma.question.findFirst({
    where,
    select: cardSelect(language),
    // Ordered by id so the offset means the same thing on every request.
    orderBy: { id: "asc" },
    skip: seedFor(day) % total,
  });
  if (!question) {
    res.json({ day, question: null });
    return;
  }

  const bookmark = await prisma.bookmark.findUnique({
    where: { userId_questionId: { userId: req.user!.id, questionId: question.id } },
    select: { id: true },
  });

  res.json({
    day,
    poolSize: total,
    question: { ...localizeQuestion(question, language), ...revealAnswer(question), bookmarked: !!bookmark },
  });
});

export default router;
