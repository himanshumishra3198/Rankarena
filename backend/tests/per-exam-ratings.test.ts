/// <reference types="node" />
/**
 * Ratings, one ladder per examination.
 *
 * A CAT result must not move an SSC rating and must not rank a candidate
 * against people who sat a different paper. These pin that, and equally pin
 * that the SSC ladder behaves exactly as it always did — that one has real
 * history in it, and is the thing this change could damage.
 *
 * Runs against the DATABASE_URL in backend/.env. Creates its own rows,
 * tagged with a per-run marker, and deletes every one of them afterwards.
 *
 *   npm test          (backend/)
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/prisma";
import redis from "../src/lib/redis";
import { computeContestRatings } from "../src/lib/settleContest";

const MARKER = `exam-rating-test-${randomUUID()}`;
const users: string[] = [];
const contests: string[] = [];
const questions: string[] = [];

async function makeUser(n: string) {
  const u = await prisma.user.create({
    data: { name: `${MARKER}-${n}`, email: `${MARKER}-${n}@example.invalid`, emailVerified: true },
    select: { id: true },
  });
  users.push(u.id);
  return u.id;
}

/** A settled contest on one exam, with the given finishing order. */
async function runContest(exam: "SSC_CGL" | "CAT", order: string[]) {
  const subject = exam === "CAT" ? "QA" : "QUANT";
  const q = await prisma.question.create({
    data: {
      text: `${MARKER} ${exam} ${randomUUID()}`, optionA: "a", optionB: "b", optionC: "c",
      optionD: "d", correctOption: "A", subject, difficulty: "MEDIUM", exam,
    },
    select: { id: true },
  });
  questions.push(q.id);

  const contest = await prisma.contest.create({
    data: {
      title: `${MARKER} ${exam}`, exam, status: "ENDED",
      startTime: new Date(Date.now() - 7_200_000), durationMinutes: 60,
      contestQuestions: { create: [{ questionId: q.id, displayOrder: 1 }] },
    },
    select: { id: true },
  });
  contests.push(contest.id);

  // Descending score, so the array order is the finishing order.
  await Promise.all(order.map((userId, i) =>
    prisma.participation.create({
      data: { userId, contestId: contest.id, score: 100 - i, submittedAt: new Date() },
    })));

  await computeContestRatings(contest.id);
  return contest.id;
}

const ratingFor = async (userId: string, exam: "SSC_CGL" | "CAT") =>
  (await prisma.userRating.findUnique({
    where: { userId_exam: { userId, exam } }, select: { rating: true },
  }))?.rating ?? null;

describe("a rating per examination", () => {
  let alice = ""; let bob = ""; let carol = "";

  before(async () => {
    assert.ok(process.env.DATABASE_URL);
    alice = await makeUser("alice");
    bob = await makeUser("bob");
    carol = await makeUser("carol");
  });

  after(async () => {
    await prisma.ratingHistory.deleteMany({ where: { contestId: { in: contests } } });
    await prisma.participation.deleteMany({ where: { contestId: { in: contests } } });
    await prisma.contestQuestion.deleteMany({ where: { contestId: { in: contests } } });
    await prisma.contest.deleteMany({ where: { id: { in: contests } } });
    await prisma.question.deleteMany({ where: { id: { in: questions } } });
    await prisma.userRating.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
    await redis.quit().catch(() => {});
  });

  it("starts a candidate at 1500 on an exam they have never sat", async () => {
    assert.equal(await ratingFor(alice, "CAT"), null, "no row before the first contest");
    await runContest("CAT", [alice, bob, carol]);
    // Winner of three: +50.
    assert.equal(await ratingFor(alice, "CAT"), 1550);
    assert.equal(await ratingFor(carol, "CAT"), 1450);
  });

  it("leaves the other exam's ladder untouched", async () => {
    // Alice has a CAT rating now and no SSC one at all.
    assert.equal(await ratingFor(alice, "SSC_CGL"), null);

    await runContest("SSC_CGL", [carol, bob, alice]);
    // Her SSC rating starts fresh at 1500 and drops for coming last —
    // it does not begin from the 1550 she earned on CAT.
    assert.equal(await ratingFor(alice, "SSC_CGL"), 1450);
    assert.equal(await ratingFor(alice, "CAT"), 1550, "the CAT ladder must not have moved");
    assert.equal(await ratingFor(carol, "SSC_CGL"), 1550);
    assert.equal(await ratingFor(carol, "CAT"), 1450, "nor this one");
  });

  it("compounds within one exam across contests", async () => {
    await runContest("CAT", [alice, bob, carol]);
    assert.equal(await ratingFor(alice, "CAT"), 1600, "1550 + 50");
  });

  it("files each rating change under the exam it came from", async () => {
    const rows = await prisma.ratingHistory.findMany({
      where: { userId: alice, contestId: { in: contests } },
      select: { exam: true },
    });
    const byExam = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.exam] = (acc[r.exam] ?? 0) + 1; return acc;
    }, {});
    assert.deepEqual(byExam, { CAT: 2, SSC_CGL: 1 });
  });

  it("keeps the display rating on the most recent result, whichever exam", async () => {
    const u = await prisma.user.findUnique({ where: { id: alice }, select: { rating: true } });
    // Her last contest was the second CAT one.
    assert.equal(u?.rating, 1600);
  });

  it("ranks a candidate only against people who sat the same exam", async () => {
    // Alice tops CAT; on SSC she is last of three.
    const catAbove = await prisma.userRating.count({
      where: { exam: "CAT", rating: { gt: (await ratingFor(alice, "CAT"))! }, userId: { in: users } },
    });
    const sscAbove = await prisma.userRating.count({
      where: { exam: "SSC_CGL", rating: { gt: (await ratingFor(alice, "SSC_CGL"))! }, userId: { in: users } },
    });
    assert.equal(catAbove, 0, "first on CAT");
    assert.ok(sscAbove >= 2, "behind at least two on SSC");
  });

  it("stays idempotent — settling twice does not rate a contest twice", async () => {
    const before = await ratingFor(bob, "CAT");
    await computeContestRatings(contests[contests.length - 1]);
    assert.equal(await ratingFor(bob, "CAT"), before);
  });
});
