import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { Prisma } from "../generated/prisma/client";
import {
  parseLanguage, translationSelect, passageTranslationSelect, localizeQuestion, DEFAULT_LANGUAGE,
} from "../lib/i18n";
import { authenticate, requireVerifiedEmail, AuthRequest } from "../middleware/auth";
import { MARKABLE_SELECT, evaluate, judge, markableOf, revealAnswer, stripAnswerKey, submittedAnswersSchema } from "../lib/answers";

const router = Router();

/**
 * A mock's difficulty, read off the questions actually on it.
 *
 * MockTest has no difficulty column and should not grow one: the paper's
 * level is a property of its contents, so storing it separately would be a
 * second source of truth that drifts the moment a question is swapped.
 * EASY/MEDIUM/HARD weigh 1/2/3 and the mean picks the band.
 */
function bandOf(mix: { EASY: number; MEDIUM: number; HARD: number }) {
  const n = mix.EASY + mix.MEDIUM + mix.HARD;
  if (n === 0) return null;
  const mean = (mix.EASY + mix.MEDIUM * 2 + mix.HARD * 3) / n;
  return mean < 1.67 ? "EASY" : mean < 2.34 ? "MEDIUM" : "HARD";
}

/** Difficulty mix per published mock, in one pass over the join table. */
async function difficultyByMock() {
  const rows = await prisma.mockTestQuestion.findMany({
    where: { mockTest: { isPublished: true } },
    select: { mockTestId: true, question: { select: { difficulty: true } } },
  });
  const mix = new Map<string, { EASY: number; MEDIUM: number; HARD: number }>();
  for (const r of rows) {
    let m = mix.get(r.mockTestId);
    if (!m) { m = { EASY: 0, MEDIUM: 0, HARD: 0 }; mix.set(r.mockTestId, m); }
    m[r.question.difficulty] += 1;
  }
  return mix;
}

/**
 * How many people have sat each mock.
 *
 * `isTest` attempts are an admin trying the product and are excluded here
 * for the same reason they are excluded from every leaderboard.
 */
async function attemptCountByMock() {
  const rows = await prisma.mockAttempt.groupBy({
    by: ["mockTestId"],
    where: { submittedAt: { not: null }, isTest: false },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.mockTestId, r._count._all]));
}

// Public: list published mock tests (metadata only, no per-user attempt data).
// Lets logged-out visitors browse mocks on the landing page before signing up.
router.get("/public", async (_req, res: Response) => {
  const mocks = await prisma.mockTest.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { mockTestQuestions: true } } },
  });
  const [mix, attemptCounts] = await Promise.all([difficultyByMock(), attemptCountByMock()]);

  res.json(
    mocks.map((m) => ({
      id: m.id,
      title: m.title,
      subject: m.subject,
      durationMinutes: m.durationMinutes,
      negativeMarks: Number(m.negativeMarks),
      questionCount: m._count.mockTestQuestions,
      difficulty: bandOf(mix.get(m.id) ?? { EASY: 0, MEDIUM: 0, HARD: 0 }),
      difficultyMix: mix.get(m.id) ?? { EASY: 0, MEDIUM: 0, HARD: 0 },
      attemptCount: attemptCounts.get(m.id) ?? 0,
      // A guest has no attempt of their own; the shape stays the same so the
      // card component does not need to know who is asking.
      attempted: false,
      lastScore: null,
      lastTotal: null,
    }))
  );
});

router.use(authenticate);

// List published mock tests (grouped client-side by subject). Includes the
// current user's best attempt summary and the question count.
router.get("/", async (req: AuthRequest, res: Response) => {
  const mocks = await prisma.mockTest.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { mockTestQuestions: true } } },
  });

  const [attempts, mix, attemptCounts] = await Promise.all([
    prisma.mockAttempt.findMany({
      where: { userId: req.user!.id, submittedAt: { not: null } },
      select: {
        mockTestId: true, score: true, totalMarks: true,
        correctCount: true, wrongCount: true, submittedAt: true,
      },
    }),
    difficultyByMock(),
    attemptCountByMock(),
  ]);
  const attemptMap = new Map(attempts.map((a) => [a.mockTestId, a]));

  /**
   * Where the caller placed on each mock they have sat.
   *
   * Only the papers they actually attempted are ranked, so this reads a
   * handful of rows rather than every attempt on the platform. Rank is
   * "how many people beat this score, plus one" — ties share a place, which
   * is how the contest standings behave too.
   */
  const ranked = new Map<string, { rank: number; outOf: number }>();
  const sat = [...attemptMap.keys()];
  if (sat.length) {
    const field = await prisma.mockAttempt.findMany({
      where: { mockTestId: { in: sat }, submittedAt: { not: null }, isTest: false },
      select: { mockTestId: true, score: true },
    });
    const byMock = new Map<string, number[]>();
    for (const row of field) {
      byMock.set(row.mockTestId, [...(byMock.get(row.mockTestId) ?? []), Number(row.score)]);
    }
    for (const [mockTestId, mine] of attemptMap) {
      const scores = byMock.get(mockTestId);
      if (!scores?.length) continue;
      const better = scores.filter((v) => v > Number(mine.score)).length;
      ranked.set(mockTestId, { rank: better + 1, outOf: scores.length });
    }
  }

  const result = mocks.map((m) => {
    const a = attemptMap.get(m.id);
    const place = ranked.get(m.id);
    const answered = a ? a.correctCount + a.wrongCount : 0;
    return {
      id: m.id,
      title: m.title,
      subject: m.subject,
      durationMinutes: m.durationMinutes,
      negativeMarks: Number(m.negativeMarks),
      questionCount: m._count.mockTestQuestions,
      difficulty: bandOf(mix.get(m.id) ?? { EASY: 0, MEDIUM: 0, HARD: 0 }),
      difficultyMix: mix.get(m.id) ?? { EASY: 0, MEDIUM: 0, HARD: 0 },
      attemptCount: attemptCounts.get(m.id) ?? 0,
      attempted: !!a,
      // Named "last", not "best": the attempt row is upserted on every
      // submit, so a retake overwrites the previous one and no history of
      // earlier scores survives to take a maximum of.
      lastScore: a ? Number(a.score) : null,
      lastTotal: a ? Number(a.totalMarks) : null,
      lastSubmittedAt: a?.submittedAt ?? null,
      accuracy: answered > 0 ? Math.round((a!.correctCount / answered) * 100) : null,
      rank: place?.rank ?? null,
      rankOutOf: place?.outOf ?? null,
    };
  });
  res.json(result);
});

// Fetch a mock's metadata + questions (no correct answers).
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const mock = await prisma.mockTest.findUnique({ where: { id } });

  // The paper is served in whatever language is asked for, every time.
  //
  // This used to prefer the language on the caller's MockAttempt row, on the
  // theory that the row records the language the paper was started in. It
  // does not. A mock has no server-side state until it is submitted, so that
  // row exists only once the test has been *finished* at least once — which
  // made every retake permanently pinned to the language of the previous
  // submission. The picker would change, the paper would not.
  //
  // Contests are the other way round and keep their pinning: a Participation
  // is created on join, before the paper is sat, so there the row really does
  // hold the language in progress and POST /contests/:id/language moves it.
  // The mock attempt's language is for the review, which GET /:id/result
  // reads for itself.
  const language = parseLanguage(req.query.language);
  if (!mock || !mock.isPublished) {
    res.status(404).json({ error: "Mock test not found" });
    return;
  }

  const mtqs = await prisma.mockTestQuestion.findMany({
    where: { mockTestId: id },
    include: {
      question: {
        select: {
          id: true, text: true, questionType: true, exam: true,
          optionA: true, optionB: true, optionC: true, optionD: true,
          // Selected only so `stripAnswerKey` can derive which keyboard a
          // type-in question wants. It is removed before the response — it
          // holds the answers.
          answerConfig: true,
          subject: true, difficulty: true, imageUrl: true, structuredData: true,
          translations: translationSelect(language),
          passage: {
            select: {
              id: true, title: true, content: true, type: true, tableData: true,
              translations: passageTranslationSelect(language),
            },
          },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  const questions = mtqs.map((mtq) => stripAnswerKey(localizeQuestion({
    ...mtq.question,
    marks: Number(mtq.marks),
    negativeMarks: Number(mtq.negativeMarks),
  }, language)));

  res.json({
    id: mock.id,
    title: mock.title,
    subject: mock.subject,
    exam: mock.exam,
    durationMinutes: mock.durationMinutes,
    negativeMarks: Number(mock.negativeMarks),
    questions,
  });
});

// Submit a mock attempt — scored server-side, retakeable (upsert).
router.post("/:id/submit", requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
  const mockTestId = req.params.id as string;
  const parsed = submittedAnswersSchema.safeParse(req.body.answers);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid answers format" });
    return;
  }
  const timeSpentParsed = z.record(z.string(), z.number()).safeParse(req.body.timeSpent);
  const timeSpent = timeSpentParsed.success ? timeSpentParsed.data : null;
  const markedParsed = z.array(z.string()).safeParse(req.body.markedForReview);
  const markedForReview = markedParsed.success ? markedParsed.data : null;

  const mock = await prisma.mockTest.findUnique({ where: { id: mockTestId } });
  if (!mock || !mock.isPublished) {
    res.status(404).json({ error: "Mock test not found" });
    return;
  }

  const mtqs = await prisma.mockTestQuestion.findMany({
    where: { mockTestId },
    include: { question: { select: MARKABLE_SELECT } },
  });

  const answers = parsed.data;
  let score = 0, totalMarks = 0, correct = 0, wrong = 0, skipped = 0;
  for (const mtq of mtqs) {
    totalMarks += Number(mtq.marks);
    const verdict = evaluate(markableOf(mtq.question, mtq.marks, mtq.negativeMarks), answers[mtq.questionId]);
    score += verdict.awarded;
    if (!verdict.answered) skipped++;
    else if (verdict.correct) correct++;
    else wrong++;
  }
  score = Math.max(0, score);

  const submittedAt = new Date();
  const data = {
    score, totalMarks, correctCount: correct, wrongCount: wrong, skippedCount: skipped,
    answers, timeSpent: timeSpent ?? Prisma.JsonNull,
    markedForReview: markedForReview ?? Prisma.JsonNull, submittedAt,
  };

  // Admin runs are test attempts: kept for the admin's own review, excluded
  // from rank, percentile, the mock leaderboard and the public counters.
  const isTest = req.user!.role === "ADMIN";

  const submitLanguage = parseLanguage(req.body?.language);

  await prisma.mockAttempt.upsert({
    where: { userId_mockTestId: { userId: req.user!.id, mockTestId } },
    // Recorded on submit so the review renders in the language the paper was
    // actually sat in, even though a mock has no separate "join" step.
    create: { userId: req.user!.id, mockTestId, isTest, language: submitLanguage, ...data },
    update: { ...data, isTest, language: submitLanguage, startedAt: new Date() },
  });

  res.json({ score, totalMarks, correct, wrong, skipped });
});

// Result: attempt + full questions with correct answers for review.
router.get("/:id/result", async (req: AuthRequest, res: Response) => {
  const mockTestId = req.params.id as string;
  const attempt = await prisma.mockAttempt.findUnique({
    where: { userId_mockTestId: { userId: req.user!.id, mockTestId } },
  });
  // Defaults to the language the paper was sat in; the reader may switch.
  const resultLanguage = req.query.language
    ? parseLanguage(req.query.language)
    : attempt?.language ?? DEFAULT_LANGUAGE;

  if (!attempt || !attempt.submittedAt) {
    res.status(404).json({ error: "No submission found" });
    return;
  }

  const mock = await prisma.mockTest.findUnique({ where: { id: mockTestId } });
  const mtqs = await prisma.mockTestQuestion.findMany({
    where: { mockTestId },
    include: {
      question: {
        select: {
          id: true, text: true, questionType: true, imageUrl: true,
          optionA: true, optionB: true, optionC: true, optionD: true,
          correctOption: true, subject: true, difficulty: true, structuredData: true,
          solution: true, exam: true, answerConfig: true,
          translations: translationSelect(resultLanguage),
          passage: {
            select: {
              id: true, title: true, content: true, type: true, tableData: true,
              translations: passageTranslationSelect(resultLanguage),
            },
          },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  // The review screen is allowed the key — the paper is over. MSQ and TITA
  // have no single correct letter, so `revealAnswer` supplies the shapes the
  // client needs alongside `correctOption`, which stays for single-choice.
  const questions = mtqs.map((mtq) => ({
    ...localizeQuestion({
      ...mtq.question,
      marks: Number(mtq.marks),
      negativeMarks: Number(mtq.negativeMarks),
    }, resultLanguage),
    ...revealAnswer(mtq.question),
  }));

  // ── Rank / percentile + per-question aggregates across all submitted attempts ──
  const allAttempts = await prisma.mockAttempt.findMany({
    where: { mockTestId, submittedAt: { not: null }, isTest: false },
    select: { userId: true, score: true, answers: true, timeSpent: true },
  });

  const totalTakers = allAttempts.length;
  const myScore = Number(attempt.score);
  // A test attempt isn't in the ranked set, so it has no rank or percentile —
  // reported as null rather than a position it never actually held.
  const higher = allAttempts.filter((a) => Number(a.score) > myScore).length;
  const rank = attempt.isTest ? null : higher + 1;
  const percentile = attempt.isTest
    ? null
    : totalTakers > 1
      ? Math.round((allAttempts.filter((a) => Number(a.score) < myScore).length / (totalTakers - 1)) * 1000) / 10
      : 100;

  // Per-question: how many answered, how many correct, total time (for averages).
  // Judged rather than compared, so the "how many got this right" figure
  // under a multiple-select question is not permanently zero.
  const markableMap = new Map(mtqs.map((m) => [m.questionId, m.question]));
  const qStats: Record<string, { answered: number; correct: number; timeSum: number; timeCount: number }> = {};
  for (const m of mtqs) qStats[m.questionId] = { answered: 0, correct: 0, timeSum: 0, timeCount: 0 };
  for (const a of allAttempts) {
    const ans = (a.answers ?? {}) as Record<string, unknown>;
    const ts = (a.timeSpent ?? {}) as Record<string, number>;
    for (const qid of Object.keys(qStats)) {
      const q = markableMap.get(qid);
      const verdict = q ? judge(q, ans[qid]) : { answered: false, correct: false };
      if (verdict.answered) {
        qStats[qid].answered++;
        if (verdict.correct) qStats[qid].correct++;
      }
      const t = ts[qid];
      if (typeof t === "number" && t > 0) { qStats[qid].timeSum += t; qStats[qid].timeCount++; }
    }
  }
  const questionStats: Record<string, { correctPct: number; avgTime: number }> = {};
  for (const qid of Object.keys(qStats)) {
    const s = qStats[qid];
    questionStats[qid] = {
      correctPct: s.answered > 0 ? Math.round((s.correct / s.answered) * 100) : 0,
      avgTime: s.timeCount > 0 ? Math.round(s.timeSum / s.timeCount) : 0,
    };
  }

  // Top scorers (leaderboard for this mock) — highest score, earliest submit wins ties.
  const topRows = await prisma.mockAttempt.findMany({
    where: { mockTestId, submittedAt: { not: null }, isTest: false },
    orderBy: [{ score: "desc" }, { submittedAt: "asc" }],
    take: 10,
    select: { userId: true, score: true, user: { select: { name: true } } },
  });
  const topScorers = topRows.map((t, i) => ({
    rank: i + 1,
    name: t.user.name,
    score: Number(t.score),
    isCurrentUser: t.userId === req.user!.id,
  }));

  res.json({
    mockTitle: mock?.title ?? "",
    subject: mock?.subject ?? "",
    durationMinutes: mock?.durationMinutes ?? 0,
    score: Number(attempt.score),
    totalMarks: Number(attempt.totalMarks),
    correct: attempt.correctCount,
    wrong: attempt.wrongCount,
    skipped: attempt.skippedCount,
    answers: attempt.answers ?? {},
    timeSpent: attempt.timeSpent ?? {},
    markedForReview: attempt.markedForReview ?? [],
    submittedAt: attempt.submittedAt,
    isTest: attempt.isTest,
    rank,
    totalTakers,
    percentile,
    topScorers,
    questionStats,
    questions,
  });
});

export default router;
