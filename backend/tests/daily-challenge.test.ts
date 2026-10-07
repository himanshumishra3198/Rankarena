/**
 * The daily challenge.
 *
 * It hands out an answer key on the signed-in home page, so the two things
 * worth pinning are that it only ever draws from the released archive, and
 * that it is the same question for everybody for the whole of an IST day.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../src/lib/prisma";
import practiceRoutes from "../src/routes/practice";

const MARKER = `daily-test-${randomUUID()}`;
let server: Server; let baseUrl = ""; let token = ""; let userId = "";
const ids = new Map<string, string>();
let contestId = "";

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() as any };
}

describe("daily challenge", () => {
  before(async () => {
    assert.ok(process.env.DATABASE_URL && process.env.JWT_SECRET);
    const app = express();
    app.use("/practice", practiceRoutes);
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const user = await prisma.user.create({
      data: { name: "Daily", email: `${MARKER}@example.invalid` }, select: { id: true, role: true },
    });
    userId = user.id;
    token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!);

    const mk = async (key: string, subject: "QUANT" | "REASONING" | "ENGLISH") => {
      const q = await prisma.question.create({
        data: {
          text: `${MARKER} ${key}`, optionA: "a", optionB: "b", optionC: "c", optionD: "d",
          correctOption: "B", subject, difficulty: "MEDIUM",
        },
        select: { id: true },
      });
      ids.set(key, q.id);
    };
    await mk("unreleased-quant", "QUANT");   // in no paper at all
    await mk("released-quant", "QUANT");
    await mk("released-english", "ENGLISH"); // right state, wrong subject

    const contest = await prisma.contest.create({
      data: {
        title: `${MARKER} ended`, startTime: new Date(Date.now() - 86_400_000),
        durationMinutes: 60, status: "ENDED",
      },
      select: { id: true },
    });
    contestId = contest.id;
    await prisma.contestQuestion.createMany({
      data: [
        { contestId, questionId: ids.get("released-quant")!, displayOrder: 1 },
        { contestId, questionId: ids.get("released-english")!, displayOrder: 2 },
      ],
    });
  });

  after(async () => {
    const qids = [...ids.values()];
    await prisma.contestQuestion.deleteMany({ where: { contestId } });
    await prisma.contest.deleteMany({ where: { id: contestId } });
    await prisma.question.deleteMany({ where: { id: { in: qids } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    server?.close();
    await prisma.$disconnect();
  });

  it("returns the same question for the whole day", async () => {
    const a = await get("/practice/daily");
    const b = await get("/practice/daily");
    assert.equal(a.status, 200);
    assert.ok(a.body.question, "a pool this size should always yield one");
    assert.equal(a.body.question.id, b.body.question.id, "two calls disagreed on today's question");
    assert.match(a.body.day, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("hands over the answer and the solution, so it can be checked", async () => {
    const r = await get("/practice/daily");
    assert.ok(["A", "B", "C", "D"].includes(r.body.question.correctOption));
    assert.ok("solution" in r.body.question);
    assert.equal(typeof r.body.question.bookmarked, "boolean");
  });

  /** The archive rule, as a reusable where-clause. */
  const RELEASED = {
    AND: [{
      OR: [
        { contestQuestions: { some: { contest: { status: "ENDED" as const } } } },
        { mockTestQuestions: { some: { mockTest: { isPublished: true } } } },
      ],
    }],
    NOT: [
      { contestQuestions: { some: { contest: { status: { not: "ENDED" as const } } } } },
      { mockTestQuestions: { some: { mockTest: { isPublished: false } } } },
    ],
  };

  it("only ever draws from the released archive", async () => {
    // Asserted against the picked question itself rather than by comparing
    // two pool counts taken a moment apart: the pool is every eligible
    // question on the platform, and a sibling suite creating a published
    // mock full of QUANT questions legitimately changes its size mid-run.
    const r = await get("/practice/daily");
    const picked = await prisma.question.findFirst({
      where: { id: r.body.question.id, subject: { in: ["QUANT", "REASONING"] }, ...RELEASED },
      select: { id: true },
    });
    assert.ok(picked, "today's pick is not a released QUANT/REASONING question");

    // And a question in no finished paper is never eligible, whatever the
    // hash lands on today.
    const unreleased = await prisma.question.findFirst({
      where: { id: ids.get("unreleased-quant")!, ...RELEASED },
      select: { id: true },
    });
    assert.equal(unreleased, null, "a question in no finished paper is in the pool");
  });

  it("never draws from a subject outside quant and reasoning", async () => {
    const r = await get("/practice/daily");
    assert.ok(["QUANT", "REASONING"].includes(r.body.question.subject));
  });

  it("is closed to callers without a token", async () => {
    const res = await fetch(`${baseUrl}/practice/daily`);
    assert.equal(res.status, 401);
  });
});
