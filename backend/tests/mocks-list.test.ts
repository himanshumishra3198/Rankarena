/**
 * The derived fields on GET /mocks.
 *
 * difficulty, attemptCount, accuracy and rank are not columns — they are
 * computed per request from the questions on the paper and the attempts
 * against it. That makes them easy to break silently from a long way away
 * (a changed enum, an isTest filter dropped), so they are pinned here.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../src/lib/prisma";
import mockRoutes from "../src/routes/mocks";

const MARKER = `mock-list-test-${randomUUID()}`;

let server: Server; let baseUrl = ""; let token = "";
let meId = ""; let rivalId = ""; let adminId = "";
let mockId = ""; const questionIds: string[] = [];

async function list() {
  const res = await fetch(`${baseUrl}/mocks`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json() as any[];
  return body.find((m) => m.id === mockId);
}

describe("mock list derived fields", () => {
  before(async () => {
    assert.ok(process.env.DATABASE_URL && process.env.JWT_SECRET);
    const app = express();
    app.use("/mocks", mockRoutes);
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const mk = (n: string) => prisma.user.create({
      data: { name: n, email: `${MARKER}-${n}@example.invalid` }, select: { id: true, role: true },
    });
    const [me, rival, admin] = await Promise.all([mk("me"), mk("rival"), mk("admin")]);
    meId = me.id; rivalId = rival.id; adminId = admin.id;
    token = jwt.sign({ id: me.id, role: me.role }, process.env.JWT_SECRET!);

    // Two HARD and one MEDIUM -> mean 2.67 -> the paper reads HARD.
    for (const d of ["HARD", "HARD", "MEDIUM"] as const) {
      const q = await prisma.question.create({
        data: {
          text: `${MARKER} ${d}`, optionA: "a", optionB: "b", optionC: "c", optionD: "d",
          correctOption: "A", subject: "QUANT", difficulty: d,
        },
        select: { id: true },
      });
      questionIds.push(q.id);
    }
    const mock = await prisma.mockTest.create({
      data: {
        title: `${MARKER} paper`, subject: "QUANT", durationMinutes: 10, isPublished: true,
        mockTestQuestions: { create: questionIds.map((questionId, i) => ({ questionId, displayOrder: i + 1 })) },
      },
      select: { id: true },
    });
    mockId = mock.id;

    const attempt = (userId: string, score: number, isTest = false) => prisma.mockAttempt.create({
      data: {
        userId, mockTestId: mockId, score, totalMarks: 6,
        correctCount: 3, wrongCount: 1, submittedAt: new Date(), isTest,
      },
    });
    await attempt(meId, 4);          // mine
    await attempt(rivalId, 6);       // beats me
    await attempt(adminId, 6, true); // an admin trying it out — must not count
  });

  after(async () => {
    await prisma.mockAttempt.deleteMany({ where: { mockTestId: mockId } });
    await prisma.mockTestQuestion.deleteMany({ where: { mockTestId: mockId } });
    await prisma.mockTest.deleteMany({ where: { id: mockId } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [meId, rivalId, adminId] } } });
    server?.close();
    await prisma.$disconnect();
  });

  it("derives difficulty from the questions on the paper", async () => {
    const m = await list();
    assert.equal(m.difficulty, "HARD");
    assert.deepEqual(m.difficultyMix, { EASY: 0, MEDIUM: 1, HARD: 2 });
  });

  it("counts real attempts and excludes admin test runs", async () => {
    // Three attempt rows exist; the isTest one is staff, not an aspirant.
    const m = await list();
    assert.equal(m.attemptCount, 2);
  });

  it("reports the caller's own accuracy and placing", async () => {
    const m = await list();
    assert.equal(m.attempted, true);
    assert.equal(m.lastScore, 4);
    assert.equal(m.accuracy, 75);            // 3 right of 4 answered
    assert.equal(m.rank, 2);                 // the rival's 6 beats my 4
    assert.equal(m.rankOutOf, 2);            // and the admin run is not in the field
  });
});
