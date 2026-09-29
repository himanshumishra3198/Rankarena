/**
 * Free practice: what the bank is allowed to hand out.
 *
 * GET /practice/questions gives a signed-in caller the correct option and the
 * written solution for anything it returns. /recommendations can at least ask
 * for evidence that the caller already sat the question; browsing cannot, so
 * ONLY_SAFE_TO_REVEAL is the only thing standing between the endpoint and the
 * answer key of a contest that has not run yet. That makes the filter worth a
 * test of its own rather than a reading of the `where` clause — what is being
 * checked here is Prisma's `NOT`/`some` semantics against a real database,
 * which is exactly the part that could be quietly wrong.
 *
 * Runs against the DATABASE_URL in backend/.env — the local docker-compose
 * Postgres during development. It creates its own rows, tagged with a
 * per-run marker, and deletes every one of them afterwards.
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
import practiceRoutes from "../src/routes/practice";

const MARKER = `practice-test-${randomUUID()}`;

// Every fixture sits in one cell of the filter grid, so a single query with
// all three filters set sees all of them and nothing else has to be guessed.
const SUBJECT = "QUANT";
const TOPIC = "Percentage";
const DIFFICULTY = "MEDIUM";

/** Fixture key -> whether practice is allowed to serve it. */
const EXPECTED: Record<string, boolean> = {
  "no test at all": true,
  "ended contest": true,
  "published mock": true,
  "live contest": false,
  "scheduled contest": false,
  "unpublished mock": false,
  // A question can sit in several papers at once. One unfinished paper is
  // enough to withhold it, however many finished ones it is also in.
  "ended contest + live contest": false,
  "published mock + unpublished mock": false,
};

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
/** Fixture key -> question id. */
const ids = new Map<string, string>();
const contestIds: string[] = [];
const mockIds: string[] = [];

interface PracticeQuestion {
  id: string;
  text: string;
  correctOption: string;
  subject: string;
  topic: string | null;
  difficulty: string;
  solution: string | null;
  bookmarked: boolean;
  language: string;
  translated: boolean;
}
interface PracticePage {
  total: number;
  nextCursor: string | null;
  questions: PracticeQuestion[];
}

async function get(path: string, opts: { auth?: boolean } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: opts.auth === false ? {} : { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() as any };
}

/**
 * Every question the endpoint will serve for a filter, followed to the end.
 * The bank holds far more than one page, and "never served" is only a claim
 * worth making about the whole run.
 */
async function fetchAll(query: string): Promise<PracticeQuestion[]> {
  const all: PracticeQuestion[] = [];
  let cursor: string | null = null;
  // The bank is a few hundred questions; anything beyond this many pages of
  // 20 means the cursor stopped advancing.
  for (let page = 0; page < 200; page++) {
    const res = await get(`${query}&limit=20${cursor ? `&cursor=${cursor}` : ""}`);
    assert.equal(res.status, 200, `page ${page}: ${JSON.stringify(res.body)}`);
    const body = res.body as PracticePage;
    all.push(...body.questions);
    if (!body.nextCursor) return all;
    cursor = body.nextCursor;
  }
  throw new Error("pagination did not terminate");
}

async function makeQuestion(key: string) {
  const q = await prisma.question.create({
    data: {
      text: `${MARKER} — ${key}`,
      optionA: "A", optionB: "B", optionC: "C", optionD: "D",
      correctOption: "C",
      subject: SUBJECT, topic: TOPIC, difficulty: DIFFICULTY,
      solution: "Because.",
    },
    select: { id: true },
  });
  ids.set(key, q.id);
  return q.id;
}

async function makeContest(status: "SCHEDULED" | "LIVE" | "ENDED", questionIds: string[]) {
  const contest = await prisma.contest.create({
    data: {
      title: `${MARKER} ${status.toLowerCase()} contest`,
      startTime: new Date(status === "SCHEDULED" ? Date.now() + 86_400_000 : Date.now() - 86_400_000),
      durationMinutes: 60,
      status,
    },
    select: { id: true },
  });
  contestIds.push(contest.id);
  await prisma.contestQuestion.createMany({
    data: questionIds.map((questionId, i) => ({ contestId: contest.id, questionId, displayOrder: i + 1 })),
  });
}

async function makeMock(isPublished: boolean, questionIds: string[]) {
  const mock = await prisma.mockTest.create({
    data: {
      title: `${MARKER} ${isPublished ? "published" : "draft"} mock`,
      subject: SUBJECT,
      durationMinutes: 30,
      isPublished,
    },
    select: { id: true },
  });
  mockIds.push(mock.id);
  await prisma.mockTestQuestion.createMany({
    data: questionIds.map((questionId, i) => ({ mockTestId: mock.id, questionId, displayOrder: i + 1 })),
  });
}

describe("GET /practice/questions", () => {
  /** The topic's count before any fixture existed, read back from /filters. */
  let baselineTopicCount = 0;

  before(async () => {
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set (backend/.env)");
    assert.ok(process.env.JWT_SECRET, "JWT_SECRET must be set (backend/.env)");

    const app = express();
    app.use(express.json());
    app.use("/practice", practiceRoutes);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const user = await prisma.user.create({
      data: { name: "Practice Test", email: `${MARKER}@example.invalid`, emailVerified: true },
      select: { id: true, role: true },
    });
    userId = user.id;
    token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!);

    const filters = await get("/practice/filters");
    baselineTopicCount = filters.body.subjects
      .find((s: any) => s.subject === SUBJECT)?.topics
      .find((t: any) => t.topic === TOPIC)?.count ?? 0;

    for (const key of Object.keys(EXPECTED)) await makeQuestion(key);

    await makeContest("ENDED", [ids.get("ended contest")!, ids.get("ended contest + live contest")!]);
    await makeContest("LIVE", [ids.get("live contest")!, ids.get("ended contest + live contest")!]);
    await makeContest("SCHEDULED", [ids.get("scheduled contest")!]);
    await makeMock(true, [ids.get("published mock")!, ids.get("published mock + unpublished mock")!]);
    await makeMock(false, [ids.get("unpublished mock")!, ids.get("published mock + unpublished mock")!]);
  });

  after(async () => {
    const questionIds = [...ids.values()];
    if (questionIds.length) {
      await prisma.contestQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.mockTestQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
    }
    if (contestIds.length) await prisma.contest.deleteMany({ where: { id: { in: contestIds } } });
    if (mockIds.length) await prisma.mockTest.deleteMany({ where: { id: { in: mockIds } } });
    // Translations cascade with their question.
    if (questionIds.length) await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    server?.close();
    await prisma.$disconnect();
  });

  it("serves questions no unfinished paper depends on, and withholds the rest", async () => {
    const served = await fetchAll(`/practice/questions?subject=${SUBJECT}&topic=${encodeURIComponent(TOPIC)}&difficulty=${DIFFICULTY}`);
    const servedIds = new Set(served.map((q) => q.id));

    for (const [key, allowed] of Object.entries(EXPECTED)) {
      assert.equal(
        servedIds.has(ids.get(key)!),
        allowed,
        allowed
          ? `"${key}" should be practisable but was withheld`
          : `"${key}" was served — its answer key leaked out of an unfinished paper`
      );
    }
  });

  it("withholds them on an unfiltered browse too, not just this topic", async () => {
    // The filters narrow the result set; they are not what makes it safe. An
    // unfiltered run is the same claim over the whole bank.
    const served = await fetchAll("/practice/questions?");
    const servedIds = new Set(served.map((q) => q.id));
    for (const [key, allowed] of Object.entries(EXPECTED)) {
      if (!allowed) {
        assert.ok(!servedIds.has(ids.get(key)!), `"${key}" was served by an unfiltered browse`);
      }
    }
  });

  it("does not count withheld questions in the filter list", async () => {
    // Three of the eight fixtures are practisable; a count that moved by more
    // than that is advertising questions the browse will never hand over.
    const filters = await get("/practice/filters");
    const count = filters.body.subjects
      .find((s: any) => s.subject === SUBJECT)?.topics
      .find((t: any) => t.topic === TOPIC)?.count ?? 0;
    assert.equal(count - baselineTopicCount, 3);
  });

  it("hands over the answer and the solution", async () => {
    // The point of the mode: you attempt one question and find out at once.
    const res = await get(`/practice/questions?subject=${SUBJECT}&topic=${encodeURIComponent(TOPIC)}&difficulty=${DIFFICULTY}&limit=20`);
    const free = (res.body as PracticePage).questions.find((q) => q.id === ids.get("no test at all"));
    // The fixture may be on a later page; ask for it directly if so.
    const q = free ?? (await fetchAll(`/practice/questions?subject=${SUBJECT}&topic=${encodeURIComponent(TOPIC)}&difficulty=${DIFFICULTY}`))
      .find((c) => c.id === ids.get("no test at all"));
    assert.ok(q, "the free fixture should be practisable");
    assert.equal(q!.correctOption, "C");
    assert.equal(q!.solution, "Because.");
    assert.equal(q!.bookmarked, false);
  });

  it("writes nothing down", async () => {
    // "Practice never affects ratings or leaderboards" is held up by there
    // being no record of a practice attempt at all — nothing a rating or a
    // leaderboard could be computed from.
    const before = await Promise.all([
      prisma.participation.count({ where: { userId } }),
      prisma.mockAttempt.count({ where: { userId } }),
      prisma.ratingHistory.count({ where: { userId } }),
    ]);
    await fetchAll(`/practice/questions?subject=${SUBJECT}`);
    const after = await Promise.all([
      prisma.participation.count({ where: { userId } }),
      prisma.mockAttempt.count({ where: { userId } }),
      prisma.ratingHistory.count({ where: { userId } }),
    ]);
    assert.deepEqual(after, before);
    assert.deepEqual(after, [0, 0, 0]);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { rating: true } });
    assert.equal(user!.rating, 1500);
  });

  it("serves the question in the language asked for, falling back to English", async () => {
    const id = ids.get("no test at all")!;
    await prisma.questionTranslation.create({
      data: {
        questionId: id, language: "HI",
        text: `${MARKER} — हिंदी`, optionA: "क", optionB: "ख", optionC: "ग", optionD: "घ",
        solution: "क्योंकि।",
      },
    });

    const hindi = (await fetchAll(`/practice/questions?subject=${SUBJECT}&topic=${encodeURIComponent(TOPIC)}&difficulty=${DIFFICULTY}&language=HI`))
      .find((q) => q.id === id);
    assert.ok(hindi);
    assert.equal(hindi!.language, "HI");
    assert.equal(hindi!.translated, true);
    assert.match(hindi!.text, /हिंदी/);

    // An untranslated question in the same run reads in English and says so,
    // rather than coming back blank.
    const untranslated = (await fetchAll(`/practice/questions?subject=${SUBJECT}&topic=${encodeURIComponent(TOPIC)}&difficulty=${DIFFICULTY}&language=HI`))
      .find((q) => q.id === ids.get("published mock"));
    assert.ok(untranslated);
    assert.equal(untranslated!.translated, false);
    assert.match(untranslated!.text, /published mock/);
  });

  it("pages through a filter without repeating or skipping", async () => {
    const all = await fetchAll(`/practice/questions?subject=${SUBJECT}`);
    assert.equal(new Set(all.map((q) => q.id)).size, all.length, "a question came back on two pages");
    const first = await get(`/practice/questions?subject=${SUBJECT}&limit=20`);
    assert.equal((first.body as PracticePage).total, all.length, "`total` disagrees with what paging returns");
  });

  it("rejects filters that are not in the syllabus", async () => {
    assert.equal((await get("/practice/questions?subject=HISTORY")).status, 400);
    assert.equal((await get("/practice/questions?difficulty=IMPOSSIBLE")).status, 400);
    assert.equal((await get("/practice/questions?topic=Percentages")).status, 400);
    // A real topic, but not one this subject has.
    assert.equal((await get("/practice/questions?subject=GK&topic=Percentage")).status, 400);
  });

  it("is closed to callers without a token", async () => {
    assert.equal((await get("/practice/questions", { auth: false })).status, 401);
    assert.equal((await get("/practice/filters", { auth: false })).status, 401);
  });
});
