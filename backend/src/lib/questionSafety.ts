import { Prisma } from "../generated/prisma/client";

/**
 * The questions whose answer key may be handed to a signed-in user.
 *
 * Every endpoint that returns `correctOption` or `solution` outside a
 * finished paper has to go through this filter. A question still sitting in a
 * scheduled or live contest would otherwise be readable — answer and all —
 * before that contest has run, and the same goes for a mock test an admin
 * has not published yet. A question with no contest/mock membership at all is
 * unaffected: NOT over an empty `some` is vacuously true.
 *
 * `contest.status` is what decides a contest, not the clock. That lags in one
 * direction only — a contest whose window has closed stays LIVE until the
 * settle sweep marks it ENDED — so the filter errs towards hiding a question
 * that is already safe, never towards revealing one that is not.
 *
 * Worth knowing when building a paper: a question that has been out in the
 * open cannot be taken back. Practice serves anything this filter allows, so
 * putting a previously-free question into a new contest hands its answer to
 * anyone who browsed that topic. Contest papers want questions that have
 * never been anywhere else.
 */
export const ONLY_SAFE_TO_REVEAL = {
  NOT: [
    { contestQuestions: { some: { contest: { status: { not: "ENDED" } } } } },
    { mockTestQuestions: { some: { mockTest: { isPublished: false } } } },
  ],
} satisfies Prisma.QuestionWhereInput;
