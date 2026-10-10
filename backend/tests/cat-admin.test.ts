/// <reference types="node" />
/**
 * CAT support, end to end through the real routes.
 *
 * Covers the three things that would be expensive to get wrong: that an
 * exam's sections and answer formats are actually enforced on write, that a
 * CAT paper is scored by the same marker as an SSC one, and that a
 * multiple-select or type-in key does not reach the candidate sitting the
 * paper.
 *
 * Also pins backward compatibility: a client that knows nothing about exams
 * must still create SSC CGL questions exactly as it did before.
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
import mockRoutes from "../src/routes/mocks";

const MARKER = `cat-admin-test-${randomUUID()}`;

let server: Server; let baseUrl = "";
let adminToken = ""; let studentToken = "";
let adminId = ""; let studentId = "";
let tagId = ""; let mockId = "";
const madeQuestions: string[] = [];

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const { token = adminToken, ...rest } = init;
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(rest.headers ?? {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}

/** A complete, valid CAT single-choice payload, for overriding field by field. */
function catQuestion(over: Record<string, unknown> = {}) {
  return {
    exam: "CAT", subject: "QA", text: `${MARKER} ${randomUUID()}`,
    optionA: "1", optionB: "2", optionC: "3", optionD: "4",
    correctOption: "A", difficulty: "MEDIUM",
    ...over,
  };
}

async function create(payload: Record<string, unknown>) {
  const out = await call("/admin/questions", { method: "POST", body: JSON.stringify(payload) });
  if (out.status === 201) madeQuestions.push(out.body.id);
  return out;
}

describe("CAT examination support", () => {
  before(async () => {
    assert.ok(process.env.DATABASE_URL && process.env.JWT_SECRET);
    const app = express();
    app.use(express.json());
    app.use("/admin", adminRoutes);
    app.use("/mocks", mockRoutes);
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const admin = await prisma.user.create({
      data: { name: `${MARKER}-admin`, email: `${MARKER}-admin@example.invalid`, role: "ADMIN", emailVerified: true },
      select: { id: true, role: true },
    });
    const student = await prisma.user.create({
      data: { name: `${MARKER}-student`, email: `${MARKER}-student@example.invalid`, emailVerified: true },
      select: { id: true, role: true },
    });
    adminId = admin.id; studentId = student.id;
    adminToken = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET!);
    studentToken = jwt.sign({ id: student.id, role: student.role }, process.env.JWT_SECRET!);

    const tag = await call("/admin/tags", {
      method: "POST",
      body: JSON.stringify({ name: `${MARKER} Geometry`, category: "TOPIC", exam: "CAT" }),
    });
    assert.equal(tag.status, 201, JSON.stringify(tag.body));
    tagId = tag.body.id;
  });

  after(async () => {
    await prisma.mockAttempt.deleteMany({ where: { mockTestId: mockId } });
    await prisma.mockTestQuestion.deleteMany({ where: { mockTestId: mockId } });
    await prisma.mockTest.deleteMany({ where: { id: mockId } });
    await prisma.questionTag.deleteMany({ where: { questionId: { in: madeQuestions } } });
    await prisma.question.deleteMany({ where: { id: { in: madeQuestions } } });
    await prisma.tag.deleteMany({ where: { id: tagId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, studentId] } } });
    server?.close();
    await prisma.$disconnect();
    // The admin routes pull in the redis client; an open connection keeps the
    // test process alive long after the assertions have finished.
    await redis.quit().catch(() => {});
  });

  describe("an exam decides what is legal", () => {
    it("accepts a CAT question filed under a CAT section", async () => {
      const out = await create(catQuestion({ subject: "VARC" }));
      assert.equal(out.status, 201, JSON.stringify(out.body));
      assert.equal(out.body.exam, "CAT");
    });

    it("refuses a CAT question filed under an SSC section", async () => {
      const out = await create(catQuestion({ subject: "GK" }));
      assert.equal(out.status, 400);
      assert.match(String(out.body.error), /not a section of CAT/);
    });

    it("refuses an SSC question filed under a CAT section", async () => {
      const out = await create(catQuestion({ exam: "SSC_CGL", subject: "QA", topic: null }));
      assert.equal(out.status, 400);
      assert.match(String(out.body.error), /not a section of SSC CGL/);
    });

    it("refuses a type-in question on SSC, which has no such format", async () => {
      const out = await create(catQuestion({
        exam: "SSC_CGL", subject: "QUANT", topic: "Percentage",
        questionType: "TITA", answerConfig: { kind: "NUMERIC", accepted: ["5"] },
      }));
      assert.equal(out.status, 400);
      assert.match(String(out.body.error), /cannot be of type TITA/);
    });
  });

  describe("answer keys", () => {
    it("stores a multiple-select key and clears the single-choice one", async () => {
      const out = await create(catQuestion({
        questionType: "MSQ", correctOption: "A", answerConfig: { correct: ["C", "A"] },
      }));
      assert.equal(out.status, 201, JSON.stringify(out.body));
      assert.equal(out.body.correctOption, null, "a stale letter must not survive");
      assert.deepEqual(out.body.answerConfig.correct, ["A", "C"], "stored sorted");
    });

    it("refuses a numeric type-in whose accepted answer is not a number", async () => {
      const out = await create(catQuestion({
        questionType: "TITA", correctOption: null,
        answerConfig: { kind: "NUMERIC", accepted: ["twelve"] },
      }));
      assert.equal(out.status, 400);
      assert.match(String(out.body.error), /not a number/);
    });

    it("lets a type-in question have no options, and requires them otherwise", async () => {
      const ok = await create(catQuestion({
        questionType: "TITA", correctOption: null, optionA: "", optionB: "", optionC: "", optionD: "",
        answerConfig: { kind: "NUMERIC", accepted: ["12"] },
      }));
      assert.equal(ok.status, 201, JSON.stringify(ok.body));

      const bad = await create(catQuestion({ optionC: "" }));
      assert.equal(bad.status, 400);
      assert.match(String(bad.body.error), /Option C cannot be blank/);
    });

    it("switching a question to multiple-select clears the letter it carried", async () => {
      const made = await create(catQuestion({ correctOption: "B" }));
      assert.equal(made.status, 201);
      const out = await call(`/admin/questions/${made.body.id}`, {
        method: "PUT",
        body: JSON.stringify({ questionType: "MSQ", answerConfig: { correct: ["A", "B"] } }),
      });
      assert.equal(out.status, 200, JSON.stringify(out.body));
      assert.equal(out.body.correctOption, null);
      assert.deepEqual(out.body.answerConfig.correct, ["A", "B"]);
    });

    it("refuses an edit that would leave a question unmarkable", async () => {
      const made = await create(catQuestion());
      // Switching to multiple-select without supplying a key.
      const out = await call(`/admin/questions/${made.body.id}`, {
        method: "PUT", body: JSON.stringify({ questionType: "MSQ" }),
      });
      assert.equal(out.status, 400);
      assert.match(String(out.body.error), /at least one correct option/);
    });
  });

  describe("tags", () => {
    it("attaches tags on create and returns them", async () => {
      const out = await create(catQuestion({ tagIds: [tagId] }));
      assert.equal(out.status, 201, JSON.stringify(out.body));
      assert.deepEqual(out.body.tags.map((t: any) => t.id), [tagId]);
    });

    it("refuses a tag that does not exist, rather than saving an untagged question", async () => {
      const out = await create(catQuestion({ tagIds: [randomUUID()] }));
      assert.equal(out.status, 400);
      assert.match(String(out.body.error), /No such tag/);
    });

    it("filters the question bank by tag, and by exam", async () => {
      const tagged = await call(`/admin/questions?tagIds=${tagId}`);
      assert.equal(tagged.status, 200);
      assert.ok(tagged.body.questions.length >= 1);
      assert.ok(
        tagged.body.questions.every((q: any) => q.tags.some((t: any) => t.id === tagId)),
        "every row must carry the tag asked for",
      );

      const cat = await call("/admin/questions?exam=CAT&subject=VARC");
      assert.ok(cat.body.questions.every((q: any) => q.exam === "CAT" && q.subject === "VARC"));
    });

    it("deactivates a tag in use instead of stripping it off questions", async () => {
      const out = await call(`/admin/tags/${tagId}`, { method: "DELETE" });
      assert.equal(out.status, 200);
      assert.equal(out.body.deactivated, true, "a tag in use must survive");
      assert.ok(out.body.questionCount >= 1);
      // Put it back for the remaining assertions and the teardown.
      await call(`/admin/tags/${tagId}`, { method: "PUT", body: JSON.stringify({ active: true }) });
    });

    it("refuses a duplicate tag and names the one that already exists", async () => {
      const out = await call("/admin/tags", {
        method: "POST",
        body: JSON.stringify({ name: `${MARKER}   geometry`, category: "TOPIC", exam: "CAT" }),
      });
      assert.equal(out.status, 409);
      assert.equal(out.body.duplicate.id, tagId);
    });
  });

  describe("existing SSC behaviour is untouched", () => {
    it("creates an SSC question from a payload that says nothing about exams", async () => {
      const out = await create({
        subject: "QUANT", topic: "Percentage", text: `${MARKER} legacy ${randomUUID()}`,
        optionA: "1", optionB: "2", optionC: "3", optionD: "4", correctOption: "C",
      });
      assert.equal(out.status, 201, JSON.stringify(out.body));
      assert.equal(out.body.exam, "SSC_CGL", "must default, not fail");
      assert.equal(out.body.correctOption, "C");
      assert.equal(out.body.answerConfig, null);
    });

    it("still refuses a topic that is not in the subject's syllabus", async () => {
      const out = await create({
        subject: "QUANT", topic: "Astrophysics", text: `${MARKER} ${randomUUID()}`,
        optionA: "1", optionB: "2", optionC: "3", optionD: "4", correctOption: "A",
      });
      assert.equal(out.status, 400);
      assert.match(JSON.stringify(out.body.error), /not a topic of QUANT/);
    });
  });

  describe("sitting a CAT paper", () => {
    let msqId = ""; let titaId = ""; let mcqId = "";

    before(async () => {
      const msq = await create(catQuestion({
        questionType: "MSQ", correctOption: null, answerConfig: { correct: ["A", "C"] },
      }));
      const tita = await create(catQuestion({
        questionType: "TITA", correctOption: null, optionA: "", optionB: "", optionC: "", optionD: "",
        answerConfig: { kind: "NUMERIC", accepted: ["12"], tolerance: 0 },
      }));
      const mcq = await create(catQuestion({ correctOption: "B" }));
      msqId = msq.body.id; titaId = tita.body.id; mcqId = mcq.body.id;

      const mock = await prisma.mockTest.create({
        data: {
          title: `${MARKER} CAT paper`, exam: "CAT", subject: "QA",
          durationMinutes: 40, negativeMarks: 1, isPublished: true,
          mockTestQuestions: {
            create: [msqId, titaId, mcqId].map((questionId, i) => ({
              questionId, displayOrder: i + 1, marks: 3, negativeMarks: 1,
            })),
          },
        },
        select: { id: true },
      });
      mockId = mock.id;
    });

    it("does not hand the candidate the answer key", async () => {
      const out = await call(`/mocks/${mockId}`, { token: studentToken });
      assert.equal(out.status, 200, JSON.stringify(out.body));
      const raw = JSON.stringify(out.body);
      assert.equal(raw.includes("answerConfig"), false, "the key must not be in the payload");
      assert.equal(raw.includes("correctOption"), false);

      const tita = out.body.questions.find((q: any) => q.id === titaId);
      assert.equal(tita.inputKind, "NUMERIC", "the keyboard hint is allowed through");
      assert.equal(out.body.exam, "CAT");
    });

    it("marks every format, and applies no penalty to a type-in", async () => {
      // MSQ exactly right (+3), TITA wrong (0 — CAT does not penalise it),
      // single-choice wrong (-1). Total 2.
      const out = await call(`/mocks/${mockId}/submit`, {
        method: "POST", token: studentToken,
        body: JSON.stringify({ answers: { [msqId]: ["C", "A"], [titaId]: "13", [mcqId]: "D" } }),
      });
      assert.equal(out.status, 200, JSON.stringify(out.body));
      assert.equal(Number(out.body.score), 2);
      assert.equal(out.body.correct, 1);
      assert.equal(out.body.wrong, 2);
      assert.equal(out.body.skipped, 0);
    });

    it("scores a fully correct CAT paper at full marks", async () => {
      const out = await call(`/mocks/${mockId}/submit`, {
        method: "POST", token: studentToken,
        body: JSON.stringify({ answers: { [msqId]: ["A", "C"], [titaId]: "12.0", [mcqId]: "B" } }),
      });
      assert.equal(out.status, 200);
      assert.equal(Number(out.body.score), 9);
      assert.equal(out.body.correct, 3);
    });

    it("reveals each format's key once the paper is over", async () => {
      const out = await call(`/mocks/${mockId}/result`, { token: studentToken });
      assert.equal(out.status, 200, JSON.stringify(out.body));
      const byId = new Map(out.body.questions.map((q: any) => [q.id, q]));
      assert.deepEqual((byId.get(msqId) as any).correctOptions, ["A", "C"]);
      assert.deepEqual((byId.get(titaId) as any).acceptedAnswers, ["12"]);
      assert.equal((byId.get(mcqId) as any).correctOption, "B");
    });
  });

  describe("papers belong to an exam", () => {
    it("refuses a mock test whose section is not in its exam", async () => {
      const out = await call("/admin/mocks", {
        method: "POST",
        body: JSON.stringify({ title: `${MARKER} bad`, exam: "CAT", subject: "GK", durationMinutes: 30 }),
      });
      assert.equal(out.status, 400);
      assert.match(String(out.body.error), /not a section of CAT/);
    });

    it("refuses contest section limits that name another exam's sections", async () => {
      const out = await call("/admin/contests", {
        method: "POST",
        body: JSON.stringify({
          title: `${MARKER} bad`, exam: "CAT",
          startTime: new Date(Date.now() + 86_400_000).toISOString(),
          durationMinutes: 120, sectionLimits: { VARC: 24, GK: 20 },
        }),
      });
      assert.equal(out.status, 400);
      assert.match(String(out.body.error), /GK is not a section of CAT/);
    });
  });
});
