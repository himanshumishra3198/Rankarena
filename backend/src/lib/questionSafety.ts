import { Prisma } from "../generated/prisma/client";

/**
 * The questions whose answer key may be handed to a signed-in user.
 *
 * Every endpoint that returns `correctOption` or `solution` outside a
 * finished paper has to go through this filter. It is the archive rule, the
 * one Codeforces' problemset runs on: a question is released by the paper it
 * was written for finishing, and until that happens it does not exist as far
 * as practice is concerned.
 *
 * Two halves, and both are load-bearing.
 *
 * Released — the question has been sat by somebody under exam conditions: it
 * is in a contest that has ENDED, or in a mock test an admin has published.
 * A question in neither is not "unused", it is *unreleased*: it is sitting in
 * the bank waiting to go into a paper, and the most likely paper is a future
 * contest. Serving it would hand out an answer key for a contest nobody has
 * sat yet, which is the same leak as serving a scheduled one, just further
 * ahead. This half is why "it's in no contest" is a reason to withhold a
 * question rather than a reason it is safe.
 *
 * Still unfinished — the question is also in a contest that has not ended, or
 * in a mock that is not published. One unfinished paper withholds it however
 * many finished ones it is also in, because reusing a question does not
 * un-leak the paper it is currently sitting in.
 *
 * `contest.status` is what decides a contest, not the clock. That lags in one
 * direction only — a contest whose window has closed stays LIVE until the
 * settle sweep marks it ENDED — so the filter errs towards hiding a question
 * that is already safe, never towards revealing one that is not.
 */
export const ONLY_SAFE_TO_REVEAL = {
  AND: [
    {
      OR: [
        { contestQuestions: { some: { contest: { status: "ENDED" } } } },
        { mockTestQuestions: { some: { mockTest: { isPublished: true } } } },
      ],
    },
    {
      // Prisma's NOT over a list is a NOR: every condition must be false.
      NOT: [
        { contestQuestions: { some: { contest: { status: { not: "ENDED" } } } } },
        { mockTestQuestions: { some: { mockTest: { isPublished: false } } } },
      ],
    },
  ],
} satisfies Prisma.QuestionWhereInput;
