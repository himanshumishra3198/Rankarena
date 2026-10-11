/// <reference types="node" />
/**
 * Passage sets: keeping them together, and putting a paper in order.
 *
 * Two things are pinned here. A contest shuffles its questions per candidate
 * so that neighbours do not see the same question at the same position —
 * that shuffle must move a passage set as one piece, or a candidate meets
 * question 4 and question 19 on the same comprehension and reads it twice.
 * And a paper's order has to be editable after the fact, which until now it
 * was not: displayOrder was written once on add and never again.
 *
 * Runs against the DATABASE_URL in backend/.env. Creates its own rows, tagged
 * with a per-run marker, and deletes every one of them afterwards.
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
import contestRoutes from "../src/routes/contests";

const MARKER = `passage-set-test-${randomUUID()}`;

let server: Server; let baseUrl = "";
let adminToken = ""; let adminId = "";
let contestId = ""; let passageId = "";
/** Three questions on one passage, then three standalone ones. */
const setQ: string[] = [];
const loneQ: string[] = [];
const students: { id: string; token: string }[] = [];

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const { token = adminToken, ...rest } = init;
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(rest.headers ?? {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}

describe("passage sets and paper order", () => {
  before(async () => {
    assert.ok(process.env.DATABASE_URL && process.env.JWT_SECRET);
    const app = express();
    app.use(express.json());
    app.use("/admin", adminRoutes);
    app.use("/contests", contestRoutes);
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const admin = await prisma.user.create({
      data: { name: `${MARKER}-admin`, email: `${MARKER}-admin@example.invalid`, role: "ADMIN", emailVerified: true },
      select: { id: true, role: true },
    });
    adminId = admin.id;
    adminToken = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET!);

    // Several students, because the shuffle is seeded per user and one
    // candidate could pass by luck.
    for (let i = 0; i < 8; i++) {
      const u = await prisma.user.create({
        data: { name: `${MARKER}-s${i}`, email: `${MARKER}-s${i}@example.invalid`, emailVerified: true },
        select: { id: true, role: true },
      });
      students.push({ id: u.id, token: jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET!) });
    }

    const passage = await prisma.passage.create({
      data: { title: `${MARKER} comprehension`, content: "A passage.", type: "TEXT" },
      select: { id: true },
    });
    passageId = passage.id;

    const mkQuestion = async (label: string, withPassage: boolean) => {
      const q = await prisma.question.create({
        data: {
          text: `${MARKER} ${label}`, optionA: "a", optionB: "b", optionC: "c", optionD: "d",
          correctOption: "A", subject: "ENGLISH", difficulty: "MEDIUM",
          ...(withPassage ? { passageId, questionType: "PASSAGE" as const } : {}),
        },
        select: { id: true },
      });
      return q.id;
    };
    for (let i = 1; i <= 3; i++) setQ.push(await mkQuestion(`set-${i}`, true));
    for (let i = 1; i <= 3; i++) loneQ.push(await mkQuestion(`lone-${i}`, false));

    // Interleaved on purpose: lone, set×3, lone, lone. If the shuffle moved
    // questions individually, the set would come apart.
    const ordered = [loneQ[0], setQ[0], setQ[1], setQ[2], loneQ[1], loneQ[2]];
    const contest = await prisma.contest.create({
      data: {
        title: `${MARKER} paper`,
        startTime: new Date(Date.now() - 60_000),
        durationMinutes: 60,
        status: "LIVE",
        contestQuestions: {
          create: ordered.map((questionId, i) => ({ questionId, displayOrder: i + 1 })),
        },
      },
      select: { id: true },
    });
    contestId = contest.id;

    for (const s of students) {
      await prisma.participation.create({ data: { userId: s.id, contestId } });
    }
  });

  after(async () => {
    await prisma.participation.deleteMany({ where: { contestId } });
    await prisma.contestQuestion.deleteMany({ where: { contestId } });
    await prisma.contest.deleteMany({ where: { id: contestId } });
    await prisma.question.deleteMany({ where: { id: { in: [...setQ, ...loneQ] } } });
    await prisma.passage.deleteMany({ where: { id: passageId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, ...students.map((s) => s.id)] } } });
    server?.close();
    await prisma.$disconnect();
    await redis.quit().catch(() => {});
  });

  describe("the shuffle moves a set as one piece", () => {
    it("keeps the passage questions adjacent for every candidate", async () => {
      for (const s of students) {
        const out = await call(`/contests/${contestId}/questions`, { token: s.token });
        assert.equal(out.status, 200, JSON.stringify(out.body));
        const ids: string[] = out.body.map((q: any) => q.id);
        const positions = setQ.map((id) => ids.indexOf(id)).sort((a, b) => a - b);
        assert.ok(positions.every((p) => p >= 0), "every set question must be served");
        assert.deepEqual(
          positions,
          [positions[0], positions[0] + 1, positions[0] + 2],
          `set was split for one candidate: positions ${positions.join(",")}`,
        );
      }
    });

    it("keeps the set in the order the admin arranged, not a shuffled one", async () => {
      for (const s of students) {
        const out = await call(`/contests/${contestId}/questions`, { token: s.token });
        const ids: string[] = out.body.map((q: any) => q.id);
        const within = ids.filter((id) => setQ.includes(id));
        assert.deepEqual(within, setQ, "a set must always read 1, 2, 3");
      }
    });

    it("still shuffles — the paper is not simply in displayOrder for everyone", async () => {
      const orders = new Set<string>();
      for (const s of students) {
        const out = await call(`/contests/${contestId}/questions`, { token: s.token });
        orders.add(out.body.map((q: any) => q.id).join(","));
      }
      assert.ok(orders.size > 1, "every candidate got an identical paper — the shuffle is gone");
    });

    it("serves every question exactly once", async () => {
      const out = await call(`/contests/${contestId}/questions`, { token: students[0].token });
      const ids: string[] = out.body.map((q: any) => q.id);
      assert.equal(ids.length, 6);
      assert.equal(new Set(ids).size, 6);
    });
  });

  describe("reordering a paper", () => {
    it("rewrites the order and serves it back", async () => {
      const reversed = [...loneQ, ...setQ].reverse();
      const out = await call(`/admin/contests/${contestId}/questions/order`, {
        method: "PATCH", body: JSON.stringify({ questionIds: reversed }),
      });
      assert.equal(out.status, 200, JSON.stringify(out.body));
      assert.equal(out.body.count, 6);

      const rows = await prisma.contestQuestion.findMany({
        where: { contestId }, orderBy: { displayOrder: "asc" }, select: { questionId: true },
      });
      assert.deepEqual(rows.map((r) => r.questionId), reversed);
    });

    it("refuses an order that omits a question, rather than half-applying it", async () => {
      const before = await prisma.contestQuestion.findMany({
        where: { contestId }, orderBy: { displayOrder: "asc" }, select: { questionId: true },
      });
      const out = await call(`/admin/contests/${contestId}/questions/order`, {
        method: "PATCH", body: JSON.stringify({ questionIds: [loneQ[0], setQ[0]] }),
      });
      assert.equal(out.status, 400);
      assert.match(String(out.body.error), /lists 2 questions but the paper has 6/);

      const after = await prisma.contestQuestion.findMany({
        where: { contestId }, orderBy: { displayOrder: "asc" }, select: { questionId: true },
      });
      assert.deepEqual(after.map((r) => r.questionId), before.map((r) => r.questionId), "order must be untouched");
    });

    it("refuses a question that is not on the paper", async () => {
      const out = await call(`/admin/contests/${contestId}/questions/order`, {
        method: "PATCH",
        body: JSON.stringify({ questionIds: [...loneQ, ...setQ.slice(0, 2), randomUUID()] }),
      });
      assert.equal(out.status, 400);
      assert.match(String(out.body.error), /Not on this paper/);
    });

    it("refuses a duplicate", async () => {
      const out = await call(`/admin/contests/${contestId}/questions/order`, {
        method: "PATCH",
        body: JSON.stringify({ questionIds: [loneQ[0], loneQ[0], ...setQ, loneQ[1], loneQ[2]] }),
      });
      assert.equal(out.status, 400);
      assert.match(String(out.body.error), /twice/);
    });
  });

  describe("the passage list tells two passages apart", () => {
    it("reports how many questions each one carries", async () => {
      const out = await call("/admin/passages");
      assert.equal(out.status, 200);
      const mine = out.body.find((p: any) => p.id === passageId);
      assert.ok(mine, "the passage should be listed");
      assert.equal(mine.questionCount, 3);
      assert.ok(mine.content, "the picker needs the body to show a preview");
    });
  });
});
