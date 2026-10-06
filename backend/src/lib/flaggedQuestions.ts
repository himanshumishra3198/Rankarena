import prisma from "./prisma";

/**
 * Questions whose answer key the candidates disagree with.
 *
 * A question is flagged when at least `minAttempts` people chose an option
 * and some wrong option was chosen more often than the key. That is the
 * signature of a mis-keyed question — "71% chose B, key says C" — and it is
 * what separates one from a question that is merely hard, where answers
 * spread out and the key, though low, still leads.
 *
 * What counts:
 *  - Submitted attempts only, and never an admin's test attempt (`isTest`).
 *  - Contests only once they have ENDED. A running contest's answers are
 *    still arriving, and listing its questions would show an unfinished
 *    paper's answers to anyone with the admin panel open.
 *  - Mocks always: a mock attempt only exists once it is submitted.
 *  - Chosen options only. A skipped question tells you nothing about its key,
 *    so skips count towards neither `minAttempts` nor the percentages; they
 *    are reported alongside for context.
 *
 * Questions an admin has marked safe are still returned, with the mark, so
 * the page can show them under their own filter rather than losing them.
 *
 * Computed on demand. Answers live as JSON on each attempt, so the counting
 * is one aggregate in Postgres rather than every attempt loaded into Node.
 */

const CHOICES = ["A", "B", "C", "D"] as const;
type Choice = (typeof CHOICES)[number];
type Counts = Record<Choice, number>;

export interface FlaggedQuestion {
  id: string;
  text: string;
  imageUrl: string | null;
  subject: string;
  topic: string | null;
  difficulty: string;
  questionType: string;
  structuredData: unknown;
  passageTitle: string | null;
  options: Record<Choice, string>;
  correctOption: Choice;
  /** People who chose an option. What `minAttempts` is compared against. */
  attempts: number;
  /** People who sat a paper containing the question and left it blank. */
  skipped: number;
  counts: Counts;
  /** The most-chosen wrong option, chosen by more people than the key. */
  dominantWrong: { option: Choice; count: number; pct: number };
  correctPct: number;
  /** The ended contests and mocks the question appears in. */
  papers: { type: "CONTEST" | "MOCK"; id: string; title: string }[];
  openReports: number;
  /** Set when an admin reviewed the question and decided the key is right. */
  markedSafe: { at: Date; by: string | null } | null;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/** Per-question option counts over every attempt that counts, for questions with at least `minAttempts`. */
async function countChoices(minAttempts: number): Promise<Map<string, Counts>> {
  // The CASE guards jsonb_each_text, which throws on anything but an object.
  // It has to sit inside the call: a WHERE clause is not guaranteed to run
  // before the lateral function does.
  const rows = await prisma.$queryRaw<{ question_id: string; a: number; b: number; c: number; d: number }[]>`
    WITH chosen AS (
      SELECT ans.key AS question_id, ans.value AS choice
      FROM participations p
      JOIN contests c ON c.id = p.contest_id
      CROSS JOIN LATERAL jsonb_each_text(
        CASE WHEN jsonb_typeof(p.answers) = 'object' THEN p.answers ELSE '{}'::jsonb END
      ) AS ans
      WHERE p.submitted_at IS NOT NULL AND p.is_test = false AND c.status = 'ENDED'
      UNION ALL
      SELECT ans.key, ans.value
      FROM mock_attempts m
      CROSS JOIN LATERAL jsonb_each_text(
        CASE WHEN jsonb_typeof(m.answers) = 'object' THEN m.answers ELSE '{}'::jsonb END
      ) AS ans
      WHERE m.submitted_at IS NOT NULL AND m.is_test = false
    )
    SELECT question_id,
           count(*) FILTER (WHERE choice = 'A')::int AS a,
           count(*) FILTER (WHERE choice = 'B')::int AS b,
           count(*) FILTER (WHERE choice = 'C')::int AS c,
           count(*) FILTER (WHERE choice = 'D')::int AS d
    FROM chosen
    WHERE choice IN ('A', 'B', 'C', 'D')
    GROUP BY question_id
    HAVING count(*) >= ${minAttempts}
  `;
  return new Map(rows.map((r) => [r.question_id, { A: r.a, B: r.b, C: r.c, D: r.d }]));
}

export async function findFlaggedQuestions(minAttempts: number): Promise<FlaggedQuestion[]> {
  const counted = await countChoices(minAttempts);
  if (counted.size === 0) return [];

  const questions = await prisma.question.findMany({
    where: { id: { in: [...counted.keys()] } },
    select: {
      id: true, text: true, imageUrl: true, subject: true, topic: true, difficulty: true,
      questionType: true, structuredData: true, correctOption: true,
      optionA: true, optionB: true, optionC: true, optionD: true,
      passage: { select: { title: true } },
      markedSafeAt: true,
      markedSafeBy: { select: { name: true } },
    },
  });

  const flagged = questions.flatMap((q) => {
    const counts = counted.get(q.id)!;
    const key = q.correctOption as Choice;
    const attempts = CHOICES.reduce((sum, c) => sum + counts[c], 0);
    // Ties go to the earlier letter, so the result does not depend on row order.
    const top = CHOICES.filter((c) => c !== key).reduce((best, c) => (counts[c] > counts[best] ? c : best));
    if (counts[top] <= counts[key]) return [];
    return [{ q, counts, key, attempts, top }];
  });
  if (flagged.length === 0) return [];

  const ids = flagged.map((f) => f.q.id);
  const [contestLinks, mockLinks, reports] = await Promise.all([
    prisma.contestQuestion.findMany({
      where: { questionId: { in: ids }, contest: { status: "ENDED" } },
      select: { questionId: true, contest: { select: { id: true, title: true } } },
    }),
    prisma.mockTestQuestion.findMany({
      where: { questionId: { in: ids } },
      select: { questionId: true, mockTest: { select: { id: true, title: true } } },
    }),
    prisma.questionReport.groupBy({
      by: ["questionId"],
      where: { questionId: { in: ids }, status: "OPEN" },
      _count: { _all: true },
    }),
  ]);

  // How many counted attempts each paper has, to work out who left a
  // question blank: everyone who sat a paper containing it, minus those who
  // chose an option.
  const [contestSitters, mockSitters] = await Promise.all([
    prisma.participation.groupBy({
      by: ["contestId"],
      where: { contestId: { in: [...new Set(contestLinks.map((l) => l.contest.id))] }, submittedAt: { not: null }, isTest: false },
      _count: { _all: true },
    }),
    prisma.mockAttempt.groupBy({
      by: ["mockTestId"],
      where: { mockTestId: { in: [...new Set(mockLinks.map((l) => l.mockTest.id))] }, submittedAt: { not: null }, isTest: false },
      _count: { _all: true },
    }),
  ]);
  const sat = new Map<string, number>([
    ...contestSitters.map((s) => [s.contestId, s._count._all] as [string, number]),
    ...mockSitters.map((s) => [s.mockTestId, s._count._all] as [string, number]),
  ]);
  const openReports = new Map(reports.map((r) => [r.questionId, r._count._all]));

  return flagged
    .map(({ q, counts, key, attempts, top }): FlaggedQuestion => {
      const papers = [
        ...contestLinks.filter((l) => l.questionId === q.id).map((l) => ({ type: "CONTEST" as const, ...l.contest })),
        ...mockLinks.filter((l) => l.questionId === q.id).map((l) => ({ type: "MOCK" as const, ...l.mockTest })),
      ];
      const sitters = papers.reduce((sum, paper) => sum + (sat.get(paper.id) ?? 0), 0);
      return {
        id: q.id,
        text: q.text,
        imageUrl: q.imageUrl,
        subject: q.subject,
        topic: q.topic,
        difficulty: q.difficulty,
        questionType: q.questionType,
        structuredData: q.structuredData,
        passageTitle: q.passage?.title ?? null,
        options: { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD },
        correctOption: key,
        attempts,
        // Can only go negative if a question was removed from a paper after
        // people had answered it.
        skipped: Math.max(0, sitters - attempts),
        counts,
        dominantWrong: { option: top, count: counts[top], pct: pct(counts[top], attempts) },
        correctPct: pct(counts[key], attempts),
        papers,
        openReports: openReports.get(q.id) ?? 0,
        markedSafe: q.markedSafeAt ? { at: q.markedSafeAt, by: q.markedSafeBy?.name ?? null } : null,
      };
    })
    // Most decisive disagreement first; with equal shares, the one more
    // people answered is the stronger signal.
    .sort((a, b) =>
      b.dominantWrong.count / b.attempts - a.dominantWrong.count / a.attempts ||
      b.attempts - a.attempts ||
      a.id.localeCompare(b.id)
    );
}
