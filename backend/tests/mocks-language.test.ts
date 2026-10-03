/**
 * The language a mock paper is served in.
 *
 * A mock has no server-side state until it is submitted, so the MockAttempt
 * row records the language the paper was *finished* in, not the one it is
 * being sat in. GET /mocks/:id used to prefer that row over `?language=`,
 * which pinned every retake to the language of the previous submission: the
 * picker in the exam room moved, the paper did not.
 *
 * These tests fix the two halves in place — the room follows the request,
 * the review follows the attempt — because the bug was a plausible-looking
 * one line and the comment above it argued for the wrong behaviour.
 *
 * Runs against the DATABASE_URL in backend/.env (local docker-compose
 * Postgres). Creates its own rows, tagged with a per-run marker, and deletes
 * every one of them afterwards.
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
import mockRoutes from "../src/routes/mocks";

const MARKER = `mock-lang-test-${randomUUID()}`;
const EN_TEXT = `${MARKER} — English question`;
const HI_TEXT = `${MARKER} — हिंदी प्रश्न`;

let server: Server;
let baseUrl: string;
let token: string;
let userId = "";
let mockId = "";
let questionId = "";

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) as any : null };
}

/** The one question on the paper, as the room would render it. */
async function paperIn(query: string) {
  const res = await get(`/mocks/${mockId}${query}`);
  assert.equal(res.status, 200, `paper fetch failed: ${JSON.stringify(res.body)}`);
  const q = res.body.questions.find((x: any) => x.id === questionId);
  assert.ok(q, "the fixture question should be on the paper");
  return q;
}

/** Writes the submitted attempt row, the way POST /:id/submit would. */
function recordAttempt(language: "EN" | "HI") {
  return prisma.mockAttempt.upsert({
    where: { userId_mockTestId: { userId, mockTestId: mockId } },
    create: { userId, mockTestId: mockId, language, submittedAt: new Date() },
    update: { language, submittedAt: new Date() },
  });
}

describe("mock paper language", () => {
  before(async () => {
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set (backend/.env)");
    assert.ok(process.env.JWT_SECRET, "JWT_SECRET must be set (backend/.env)");

    const app = express();
    app.use(express.json());
    app.use("/mocks", mockRoutes);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const user = await prisma.user.create({
      data: { name: "Mock Lang Test", email: `${MARKER}@example.invalid`, emailVerified: true },
      select: { id: true, role: true },
    });
    userId = user.id;
    token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!);

    const question = await prisma.question.create({
      data: {
        text: EN_TEXT,
        optionA: "A", optionB: "B", optionC: "C", optionD: "D",
        correctOption: "C", subject: "REASONING", difficulty: "MEDIUM",
        translations: {
          create: {
            language: "HI", text: HI_TEXT,
            optionA: "क", optionB: "ख", optionC: "ग", optionD: "घ",
          },
        },
      },
      select: { id: true },
    });
    questionId = question.id;

    const mock = await prisma.mockTest.create({
      data: {
        title: `${MARKER} paper`, subject: "REASONING",
        durationMinutes: 15, isPublished: true,
        mockTestQuestions: { create: { questionId, displayOrder: 1 } },
      },
      select: { id: true },
    });
    mockId = mock.id;
  });

  after(async () => {
    if (userId) await prisma.mockAttempt.deleteMany({ where: { userId } });
    if (mockId) await prisma.mockTestQuestion.deleteMany({ where: { mockTestId: mockId } });
    if (mockId) await prisma.mockTest.deleteMany({ where: { id: mockId } });
    // The HI translation cascades with its question.
    if (questionId) await prisma.question.deleteMany({ where: { id: questionId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    server?.close();
    await prisma.$disconnect();
  });

  it("serves the language asked for on a first sitting", async () => {
    assert.equal((await paperIn("?language=HI")).text, HI_TEXT);
    assert.equal((await paperIn("?language=EN")).text, EN_TEXT);
  });

  it("defaults to English when nothing is asked for", async () => {
    // The room's first fetch sends no language param, so this default is what
    // the client's "already in English" short-circuit relies on.
    const q = await paperIn("");
    assert.equal(q.text, EN_TEXT);
    assert.equal(q.language, "EN");
  });

  it("still follows the request after the mock has been submitted in Hindi", async () => {
    // The regression. A finished attempt in Hindi must not pin the retake:
    // this is exactly the state a user is in when they sit the paper again.
    await recordAttempt("HI");
    const q = await paperIn("?language=EN");
    assert.equal(q.text, EN_TEXT, "a Hindi attempt pinned the retake to Hindi");
    assert.equal(q.language, "EN");
    assert.equal(q.translated, true);
  });

  it("still follows the request after the mock has been submitted in English", async () => {
    // The mirror image, so the fix cannot be "always English".
    await recordAttempt("EN");
    assert.equal((await paperIn("?language=HI")).text, HI_TEXT);
  });

  it("lets the paper be switched back and forth mid-sitting", async () => {
    await recordAttempt("HI");
    for (const [lang, expected] of [["EN", EN_TEXT], ["HI", HI_TEXT], ["EN", EN_TEXT]] as const) {
      assert.equal((await paperIn(`?language=${lang}`)).text, expected, `switch to ${lang} did not take`);
    }
  });

  it("keeps the review defaulting to the language the paper was sat in", async () => {
    // The other half: the attempt's language is still what the *review*
    // opens in, and the reader can override it. Guards against the fix being
    // over-applied to the result route.
    await recordAttempt("HI");
    const sat = await get(`/mocks/${mockId}/result`);
    assert.equal(sat.status, 200);
    assert.equal(sat.body.questions.find((q: any) => q.id === questionId).text, HI_TEXT);

    const overridden = await get(`/mocks/${mockId}/result?language=EN`);
    assert.equal(overridden.body.questions.find((q: any) => q.id === questionId).text, EN_TEXT);
  });
});
