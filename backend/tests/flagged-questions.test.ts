/**
 * Flagged questions: the admin list of likely mis-keyed questions.
 *
 * A question is listed when at least N people chose an option and a wrong
 * option was chosen more often than the key. What is being checked here is
 * which attempts count — submitted ones, not an admin's test attempts, not a
 * contest that is still running — and that the rule and the ordering hold.
 *
 * Runs against the DATABASE_URL in backend/.env — the local docker-compose
 * Postgres during development. That database may hold other data (the seed,
 * for one), so every assertion looks only at this run's own fixtures, which
 * are tagged with a per-run marker and deleted afterwards.
 *
 *   npm test          (backend/)
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../src/lib/prisma";
import redis from "../src/lib/redis";
import adminRoutes from "../src/routes/admin";

const MARKER = `flagged-test-${randomUUID()}`;
const STUDENTS = 11;

type Choice = "A" | "B" | "C" | "D";
/** One entry per student, in order; undefined means that student skipped it. */
type Answers = (Choice | undefined)[];

const many = (choice: Choice, n: number): Choice[] => Array(n).fill(choice);

// Every fixture's key is C. Answers in the ended contest, per student.
const CONTEST_ANSWERS: Record<string, Answers> = {
  // 7 of 10 chose B: the textbook mis-keyed question. Student 11 skipped it.
  "mis-keyed": [...many("B", 7), "C", "C", "A"],
  // Low accuracy but the key still leads: hard, not mis-keyed.
  "hard": [...many("C", 4), ...many("A", 3), ...many("B", 3)],
  // A wrong option level with the key is not "more than" the key.
  "tie": [...many("B", 5), ...many("C", 5)],
  // Only three people answered. Listed or not depending on N.
  "few answers": many("B", 3),
  // Students mostly got it right; only admins' test attempts chose B.
  "admin only": [...many("C", 6)],
  // Answered in both a contest and a mock; both must count.
  "contest and mock": [...many("B", 3), "C"],
};
const MOCK_ANSWERS: Record<string, Answers> = { "contest and mock": many("B", 3) };
// All B, but the contest is still running, so none of it counts.
const LIVE_ANSWERS: Record<string, Answers> = { "live contest": many("B", 8) };

let server: Server;
let baseUrl = "";
let adminToken = "";
let studentToken = "";
const ids = new Map<string, string>();
const userIds: string[] = [];
const contestIds: string[] = [];
const mockIds: string[] = [];

async function send(method: string, path: string, body?: unknown, token = adminToken) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, text, body: text ? (JSON.parse(text) as any) : null };
}
const get = (path: string, token = adminToken) => send("GET", path, undefined, token);

/** This run's fixtures in the flagged list, keyed by fixture name, in the order returned. */
async function flagged(minAttempts: number) {
  const res = await get(`/admin/questions/flagged?minAttempts=${minAttempts}`);
  assert.equal(res.status, 200, res.text);
  const byId = new Map([...ids].map(([key, id]) => [id, key]));
  return (res.body.questions as any[]).filter((q) => byId.has(q.id)).map((q) => ({ key: byId.get(q.id)!, ...q }));
}

/** answers[student] = { questionId: choice }, built from per-question answer lists. */
function perStudent(table: Record<string, Answers>): Record<string, Choice>[] {
  const out = Array.from({ length: STUDENTS }, () => ({} as Record<string, Choice>));
  for (const [key, answers] of Object.entries(table)) {
    answers.forEach((choice, i) => { if (choice) out[i][ids.get(key)!] = choice; });
  }
  return out;
}

async function makeContest(status: "ENDED" | "LIVE", keys: string[]) {
  const contest = await prisma.contest.create({
    data: {
      title: `${MARKER} ${status.toLowerCase()} contest`,
      startTime: new Date(Date.now() - (status === "ENDED" ? 86_400_000 : 600_000)),
      durationMinutes: 60,
      status,
      contestQuestions: { create: keys.map((k, i) => ({ questionId: ids.get(k)!, displayOrder: i + 1 })) },
    },
    select: { id: true },
  });
  contestIds.push(contest.id);
  return contest.id;
}

describe("flagged questions", () => {
  before(async () => {
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set (backend/.env)");
    assert.ok(process.env.JWT_SECRET, "JWT_SECRET must be set (backend/.env)");

    const app = express();
    app.use(express.json());
    app.use("/admin", adminRoutes);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const admin = await prisma.user.create({
      data: { name: "Flagged Admin", email: `${MARKER}-admin@example.invalid`, role: "ADMIN", emailVerified: true },
    });
    userIds.push(admin.id);
    adminToken = jwt.sign({ id: admin.id, role: "ADMIN" }, process.env.JWT_SECRET!);

    const students = [];
    for (let i = 0; i < STUDENTS; i++) {
      const s = await prisma.user.create({
        data: { name: `Flagged Student ${i + 1}`, email: `${MARKER}-${i}@example.invalid`, emailVerified: true },
      });
      students.push(s);
      userIds.push(s.id);
    }
    studentToken = jwt.sign({ id: students[0].id, role: "STUDENT" }, process.env.JWT_SECRET!);

    // "edit target" sits in no paper; it is only here to be marked and edited.
    for (const key of [...Object.keys(CONTEST_ANSWERS), ...Object.keys(LIVE_ANSWERS), "edit target"]) {
      const q = await prisma.question.create({
        data: {
          text: `${MARKER} — ${key}`,
          optionA: "first", optionB: "second", optionC: "third", optionD: "fourth",
          correctOption: "C", subject: "QUANT",
        },
      });
      ids.set(key, q.id);
    }

    // Ended contest: every student submits, then an admin sits it as a test
    // attempt and chooses B for everything.
    const ended = await makeContest("ENDED", Object.keys(CONTEST_ANSWERS));
    for (const [i, answers] of perStudent(CONTEST_ANSWERS).entries()) {
      await prisma.participation.create({ data: { userId: students[i].id, contestId: ended, answers, submittedAt: new Date() } });
    }
    const allB = Object.fromEntries(Object.keys(CONTEST_ANSWERS).map((k) => [ids.get(k)!, "B"]));
    await prisma.participation.create({ data: { userId: admin.id, contestId: ended, answers: allB, isTest: true, submittedAt: new Date() } });

    // A contest still running: these submissions must not count yet.
    const live = await makeContest("LIVE", Object.keys(LIVE_ANSWERS));
    for (const [i, answers] of perStudent(LIVE_ANSWERS).entries()) {
      if (Object.keys(answers).length) {
        await prisma.participation.create({ data: { userId: students[i].id, contestId: live, answers, submittedAt: new Date() } });
      }
    }

    const mock = await prisma.mockTest.create({
      data: {
        title: `${MARKER} mock`, subject: "QUANT", durationMinutes: 15, isPublished: true,
        mockTestQuestions: { create: [{ questionId: ids.get("contest and mock")!, displayOrder: 1 }] },
      },
    });
    mockIds.push(mock.id);
    for (const [i, answers] of perStudent(MOCK_ANSWERS).entries()) {
      if (Object.keys(answers).length) {
        await prisma.mockAttempt.create({ data: { userId: students[i].id, mockTestId: mock.id, answers, submittedAt: new Date() } });
      }
    }
    await prisma.mockAttempt.create({ data: { userId: admin.id, mockTestId: mock.id, answers: { [ids.get("contest and mock")!]: "C" }, isTest: true, submittedAt: new Date() } });

    await prisma.questionReport.create({
      data: { questionId: ids.get("mis-keyed")!, userId: students[0].id, reason: "WRONG_ANSWER" },
    });
  });

  after(async () => {
    if (userIds.length) {
      await prisma.questionReport.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.participation.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.mockAttempt.deleteMany({ where: { userId: { in: userIds } } });
    }
    const questionIds = [...ids.values()];
    if (questionIds.length) {
      await prisma.contestQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.mockTestQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
    }
    if (contestIds.length) await prisma.contest.deleteMany({ where: { id: { in: contestIds } } });
    if (mockIds.length) await prisma.mockTest.deleteMany({ where: { id: { in: mockIds } } });
    if (questionIds.length) await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    server?.close();
    await prisma.$disconnect();
    redis.disconnect();
  });

  it("lists a question when a wrong option beats the key", async () => {
    const rows = await flagged(5);
    const row = rows.find((r) => r.key === "mis-keyed");
    assert.ok(row, "the mis-keyed question should be listed");
    assert.equal(row.correctOption, "C");
    assert.deepEqual(row.counts, { A: 1, B: 7, C: 2, D: 0 });
    assert.equal(row.attempts, 10);
    assert.equal(row.skipped, 1, "student 11 sat the paper and left it blank");
    assert.deepEqual(row.dominantWrong, { option: "B", count: 7, pct: 70 });
    assert.equal(row.correctPct, 20);
    assert.equal(row.openReports, 1);
    assert.equal(row.papers.length, 1);
    assert.equal(row.papers[0].type, "CONTEST");
  });

  it("does not list a hard question whose key still leads, or a tie", async () => {
    const keys = (await flagged(5)).map((r) => r.key);
    assert.ok(!keys.includes("hard"), "a hard question was flagged as mis-keyed");
    assert.ok(!keys.includes("tie"), "a tie is not a wrong option chosen more often than the key");
  });

  it("only lists questions with at least N attempts", async () => {
    assert.ok(!(await flagged(4)).some((r) => r.key === "few answers"), "3 attempts should not pass N = 4");
    assert.ok((await flagged(3)).some((r) => r.key === "few answers"), "3 attempts should pass N = 3");
  });

  it("ignores admin test attempts", async () => {
    const rows = await flagged(1);
    // The admin chose B on every question; had that counted, "admin only"
    // would show a B and "mis-keyed" would have 8 Bs.
    assert.ok(!rows.some((r) => r.key === "admin only"));
    assert.equal(rows.find((r) => r.key === "mis-keyed")!.counts.B, 7);
    assert.equal(rows.find((r) => r.key === "contest and mock")!.counts.C, 1);
  });

  it("ignores contests that have not ended", async () => {
    assert.ok(!(await flagged(1)).some((r) => r.key === "live contest"));
  });

  it("counts contests and mocks together", async () => {
    // 3 B in the contest + 3 B in the mock + 1 C: only reaches N = 7 if both count.
    const row = (await flagged(7)).find((r) => r.key === "contest and mock");
    assert.ok(row, "should be listed at N = 7 with answers from both papers");
    assert.deepEqual(row.counts, { A: 0, B: 6, C: 1, D: 0 });
    assert.deepEqual(row.papers.map((p: any) => p.type).sort(), ["CONTEST", "MOCK"]);
  });

  it("sorts by the share that chose the wrong option, highest first", async () => {
    const order = (await flagged(3)).map((r) => r.key);
    // 3/3 = 100%, then 6/7 ≈ 86%, then 7/10 = 70%.
    assert.deepEqual(order, ["few answers", "contest and mock", "mis-keyed"]);
  });

  it("rejects a bad N and non-admins", async () => {
    for (const bad of ["0", "-3", "2.5", "abc"]) {
      assert.equal((await get(`/admin/questions/flagged?minAttempts=${bad}`)).status, 400, `minAttempts=${bad}`);
    }
    assert.equal((await get("/admin/questions/flagged", studentToken)).status, 403);
  });

  it("marks a flagged question safe, keeps listing it with the mark, and unmarks it", async () => {
    const id = ids.get("mis-keyed")!;
    assert.equal((await flagged(5)).find((r) => r.key === "mis-keyed")!.markedSafe, null);

    assert.equal((await send("POST", `/admin/questions/${id}/safe`)).status, 200);
    const marked = (await flagged(5)).find((r) => r.key === "mis-keyed");
    assert.ok(marked, "a question marked safe is still returned, for the Marked safe filter");
    assert.equal(marked.markedSafe.by, "Flagged Admin");
    assert.ok(!Number.isNaN(Date.parse(marked.markedSafe.at)));

    assert.equal((await send("DELETE", `/admin/questions/${id}/safe`)).status, 200);
    assert.equal((await flagged(5)).find((r) => r.key === "mis-keyed")!.markedSafe, null);
  });

  it("only lets admins mark, and 404s an unknown question", async () => {
    const id = ids.get("mis-keyed")!;
    assert.equal((await send("POST", `/admin/questions/${id}/safe`, undefined, studentToken)).status, 403);
    assert.equal((await send("DELETE", `/admin/questions/${id}/safe`, undefined, studentToken)).status, 403);
    assert.equal((await send("POST", `/admin/questions/${randomUUID()}/safe`)).status, 404);
  });

  it("asks an admin whose account no longer exists to log in again", async () => {
    // A token from before a database reset: valid signature, deleted user.
    const stale = jwt.sign({ id: randomUUID(), role: "ADMIN" }, process.env.JWT_SECRET!);
    const res = await send("POST", `/admin/questions/${ids.get("mis-keyed")}/safe`, undefined, stale);
    assert.equal(res.status, 401);
    assert.match(res.body.error, /log in again/);
  });

  it("clears the mark when the text, options or key change, and only then", async () => {
    const id = ids.get("edit target")!;
    const markedSafeAt = async () =>
      (await prisma.question.findUnique({ where: { id }, select: { markedSafeAt: true } }))!.markedSafeAt;

    await send("POST", `/admin/questions/${id}/safe`);
    // Saving the editor resends every field. Unchanged values, or a change
    // to something the review was not about, keep the mark.
    assert.equal((await send("PUT", `/admin/questions/${id}`, { correctOption: "C", optionA: "first", solution: "<p>Why.</p>" })).status, 200);
    assert.ok(await markedSafeAt(), "an edit that changed nothing reviewed should keep the mark");

    assert.equal((await send("PUT", `/admin/questions/${id}`, { correctOption: "B" })).status, 200);
    assert.equal(await markedSafeAt(), null, "changing the key should clear the mark");

    await send("POST", `/admin/questions/${id}/safe`);
    assert.equal((await send("PUT", `/admin/questions/${id}`, { optionD: "a new fourth" })).status, 200);
    assert.equal(await markedSafeAt(), null, "changing an option should clear the mark");
  });

  it("finds one question by id, for the editor link", async () => {
    const res = await get(`/admin/questions?id=${ids.get("mis-keyed")}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.questions.map((q: any) => q.id), [ids.get("mis-keyed")]);
  });
});
