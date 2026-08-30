import prisma from "./prisma";
import redis from "./redis";
import { Prisma } from "../generated/prisma/client";

/**
 * Score the attempts left open when a contest's time ran out.
 *
 * Submitting is a click, and the auto-submit that fires when the clock hits
 * zero only exists inside the exam room. A candidate whose browser crashed,
 * whose connection dropped, or who simply closed the tab at minute 55 was
 * never submitted — so they had no result, no leaderboard row and no rating,
 * even though the server had been autosaving their answers the whole time.
 * The work was on disk and nothing ever looked at it.
 *
 * This finalises those attempts from their saved draft, exactly as a real
 * submission would have: same scoring, same Redis entry, timestamped at the
 * moment the contest closed rather than whenever this happens to run.
 *
 * Two rules keep it honest:
 *
 *  - Nothing happens until the contest is genuinely over. Finalising a live
 *    paper would lock a candidate out mid-exam.
 *  - An attempt with no draft answers is left alone. Registering for a contest
 *    and never opening it is not a zero — it is an absence, and scoring it
 *    would put a rating penalty on someone who never sat the paper.
 *
 * Idempotent: every write is conditional on the attempt still being open, so
 * concurrent callers cannot double-apply.
 */
export async function finalizeContest(contestId: string): Promise<void> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { startTime: true, durationMinutes: true },
  });
  if (!contest) return;

  const endsAt = new Date(contest.startTime.getTime() + contest.durationMinutes * 60_000);
  if (Date.now() < endsAt.getTime()) return;

  const open = await prisma.participation.findMany({
    where: { contestId, submittedAt: null },
    select: { id: true, userId: true, draftAnswers: true, isTest: true },
  });
  if (open.length === 0) return;

  const attempted = open.filter((p) => {
    const d = p.draftAnswers as Record<string, string> | null;
    return d && Object.keys(d).length > 0;
  });
  if (attempted.length === 0) return;

  const cqs = await prisma.contestQuestion.findMany({
    where: { contestId },
    select: { questionId: true, marks: true, negativeMarks: true, question: { select: { correctOption: true } } },
  });

  for (const p of attempted) {
    const answers = (p.draftAnswers ?? {}) as Record<string, string>;

    let score = 0;
    for (const cq of cqs) {
      const given = answers[cq.questionId];
      if (!given) continue;
      if (given === cq.question.correctOption) score += Number(cq.marks);
      else score -= Number(cq.negativeMarks);
    }
    score = Math.max(0, score);

    // Conditional on the attempt still being open, so a second caller — or the
    // candidate submitting at the same moment — cannot overwrite a real
    // submission with a stale draft.
    const written = await prisma.participation.updateMany({
      where: { id: p.id, submittedAt: null },
      data: {
        answers: answers as Prisma.InputJsonValue,
        draftAnswers: Prisma.JsonNull,
        score,
        submittedAt: endsAt,
      },
    });
    if (written.count === 0) continue;

    if (!p.isTest) {
      // Same encoding the submit route uses: score first, earlier submission
      // wins a tie. Everyone finalised here shares the contest's end time, so
      // between them the tie falls back to score alone.
      await redis
        .zadd(`contest:${contestId}:leaderboard`, score * 1e10 - endsAt.getTime(), p.userId)
        .catch(() => {
          // A missing leaderboard entry is recoverable — the score is in
          // Postgres and the row can be rebuilt. Losing the score because
          // Redis was down would not be.
        });
    }
  }
}
