import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { Prisma } from "../generated/prisma/client";
import { Language } from "../generated/prisma/enums";
import { parseLanguage, translationSelect, passageTranslationSelect, localizeQuestion } from "../lib/i18n";

const router = Router();
router.use(authenticate);

// Selects a card in the language the review is happening in. Mirrors the
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

// A candidate is only recommendable once its content is finalized: a
// question still sitting in a scheduled or live contest would otherwise be
// suggestible as "practice" for a completely different question, handing out
// its answer before that contest has run. The same logic applies to a mock
// test an admin hasn't published yet. A question with no contest/mock
// membership at all is unaffected — NOT on an empty `some` is vacuously true.
const ONLY_SAFE_TO_RECOMMEND = {
  NOT: [
    { contestQuestions: { some: { contest: { status: { not: "ENDED" } } } } },
    { mockTestQuestions: { some: { mockTest: { isPublished: false } } } },
  ],
} satisfies Prisma.QuestionWhereInput;

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
      where: { ...where, ...ONLY_SAFE_TO_RECOMMEND, id: { notIn: [...excluded] } },
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
    questions: results.map((r) => ({ ...localizeQuestion(r, language), bookmarked: bookmarked.has(r.id) })),
  });
});

export default router;
