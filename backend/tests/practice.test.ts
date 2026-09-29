/**
 * Free practice: what the archive is allowed to hand out.
 *
 * GET /practice/problems/:id gives a signed-in caller the correct option and
 * the written solution. /recommendations can at least ask for evidence that
 * the caller already sat the question; browsing an archive cannot, so
 * ONLY_SAFE_TO_REVEAL is the only thing standing between the endpoint and the
 * answer key of a paper nobody has sat. That makes the filter worth a test of
 * its own rather than a reading of the `where` clause — what is being checked
 * here is Prisma's AND/OR/NOT semantics against a real database, which is
 * exactly the part that could be quietly wrong.
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
const SOLUTION = `${MARKER} the written solution`;

// Every fixture sits in one cell of the filter grid, so a single query with
// all three filters set sees all of them and nothing else has to be guessed.
const SUBJECT = "QUANT";
const TOPIC = "Percentage";
const DIFFICULTY = "MEDIUM";

/**
 * Fixture key -> whether practice is allowed to serve it.
 *
 * Released by a finished paper and held by no unfinished one. The first
 * entry is the one people find surprising: a question in no paper at all is
 * unreleased, not unused — it is what next month's contest will be built
 * from — so the archive does not have it.
 */
const EXPECTED: Record<string, boolean> = {
  "no paper at all": false,
  "ended contest": true,
  "published mock": true,
  "ended contest + published mock": true,
  "live contest": false,
  "scheduled contest": false,
  "unpublished mock": false,
  // A question can sit in several papers at once. One unfinished paper
  // withholds it however many finished ones it is also in.
  "ended contest + live contest": false,
  "ended contest + unpublished mock": false,
  "published mock + unpublished mock": false,
};
const ALLOWED_COUNT = Object.values(EXPECTED).filter(Boolean).length;

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
/** Fixture key -> question id. */
const ids = new Map<string, string>();
const contestIds: string[] = [];
const mockIds: string[] = [];

interface Problem {
  id: string;
  title: string;
  subject: string;
  topic: string | null;
  difficulty: string;
  hasSolution: boolean;
  translated: boolean;
  bookmarked: boolean;
  source: { type: string; id: string; title: string } | null;
}
interface ProblemPage {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  problems: Problem[];
}

async function get(path: string, opts: { auth?: boolean } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: opts.auth === false ? {} : { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return { status: res.status, text, body: text ? JSON.parse(text) as any : null };
}

/**
 * Every problem the list will serve for a filter, followed to the last page.
 * The archive holds far more than one page, and "never served" is only a
 * claim worth making about the whole of it.
 */
async function listAll(query: string): Promise<{ problems: Problem[]; raw: string }> {
  const problems: Problem[] = [];
  const raw: string[] = [];
  let page = 1;
  for (;;) {
    const res = await get(`${query}&limit=100&page=${page}`);
    assert.equal(res.status, 200, `page ${page}: ${res.text}`);
    const body = res.body as ProblemPage;
    problems.push(...body.problems);
    raw.push(res.text);
    if (page >= body.pageCount) return { problems, raw: raw.join("") };
    page++;
    assert.ok(page < 200, "pagination did not terminate");
  }
}

async function makeQuestion(key: string) {
  const q = await prisma.question.create({
    data: {
      text: `${MARKER} — ${key}`,
      optionA: `${MARKER} choice A`, optionB: `${MARKER} choice B`,
      optionC: `${MARKER} choice C`, optionD: `${MARKER} choice D`,
      correctOption: "C",
      subject: SUBJECT, topic: TOPIC, difficulty: DIFFICULTY,
      solution: SOLUTION,
    },
    select: { id: true },
  });
  ids.set(key, q.id);
  return q.id;
}

async function makeContest(status: "SCHEDULED" | "LIVE" | "ENDED", keys: string[]) {
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
    data: keys.map((key, i) => ({ contestId: contest.id, questionId: ids.get(key)!, displayOrder: i + 1 })),
  });
  return contest.id;
}

async function makeMock(isPublished: boolean, keys: string[]) {
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
    data: keys.map((key, i) => ({ mockTestId: mock.id, questionId: ids.get(key)!, displayOrder: i + 1 })),
  });
  return mock.id;
}

describe("practice problemset", () => {
  /** The topic's count before any fixture existed, read back from /filters. */
  let baselineTopicCount = 0;
  let endedContestId = "";

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

    endedContestId = await makeContest("ENDED", [
      "ended contest",
      "ended contest + published mock",
      "ended contest + live contest",
      "ended contest + unpublished mock",
    ]);
    await makeContest("LIVE", ["live contest", "ended contest + live contest"]);
    await makeContest("SCHEDULED", ["scheduled contest"]);
    await makeMock(true, [
      "published mock",
      "ended contest + published mock",
      "published mock + unpublished mock",
    ]);
    await makeMock(false, [
      "unpublished mock",
      "ended contest + unpublished mock",
      "published mock + unpublished mock",
    ]);
  });

  after(async () => {
    const questionIds = [...ids.values()];
    if (questionIds.length) {
      await prisma.contestQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.mockTestQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
    }
    if (contestIds.length) await prisma.contest.deleteMany({ where: { id: { in: contestIds } } });
    if (mockIds.length) await prisma.mockTest.deleteMany({ where: { id: { in: mockIds } } });
    // Translations and bookmarks cascade with their question.
    if (questionIds.length) await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    server?.close();
    await prisma.$disconnect();
  });

  it("lists problems released by a finished paper, and withholds the rest", async () => {
    const { problems } = await listAll(
      `/practice/problems?subject=${SUBJECT}&topic=${encodeURIComponent(TOPIC)}&difficulty=${DIFFICULTY}`
    );
    const listed = new Set(problems.map((p) => p.id));

    for (const [key, allowed] of Object.entries(EXPECTED)) {
      assert.equal(
        listed.has(ids.get(key)!),
        allowed,
        allowed
          ? `"${key}" should be in the archive but was withheld`
          : `"${key}" was listed — it is not released by a finished paper`
      );
    }
  });

  it("withholds them on an unfiltered browse too, not just this topic", async () => {
    // The filters narrow the result set; they are not what makes it safe. An
    // unfiltered run is the same claim over the whole archive.
    const { problems } = await listAll("/practice/problems?");
    const listed = new Set(problems.map((p) => p.id));
    for (const [key, allowed] of Object.entries(EXPECTED)) {
      if (!allowed) assert.ok(!listed.has(ids.get(key)!), `"${key}" was listed by an unfiltered browse`);
    }
  });

  it("opens a released problem and 404s every withheld one", async () => {
    // The list is a view, not a gate. An id reaches this endpoint directly.
    for (const [key, allowed] of Object.entries(EXPECTED)) {
      const res = await get(`/practice/problems/${ids.get(key)}`);
      assert.equal(
        res.status,
        allowed ? 200 : 404,
        `"${key}" opened with ${res.status}: ${res.text.slice(0, 200)}`
      );
      if (allowed) {
        assert.equal(res.body.correctOption, "C");
        assert.equal(res.body.solution, SOLUTION);
      }
    }
  });

  it("keeps the answer key out of the list", async () => {
    // A row is a label and a tag or two. Everything that would let the list
    // be scraped for an answer key lives behind the detail endpoint.
    const { problems, raw } = await listAll(
      `/practice/problems?subject=${SUBJECT}&topic=${encodeURIComponent(TOPIC)}&difficulty=${DIFFICULTY}`
    );
    assert.ok(!raw.includes("correctOption"), "the list is carrying correctOption");
    assert.ok(!raw.includes("choice C"), "the list is carrying the option text");
    assert.ok(!raw.includes(SOLUTION), "the list is carrying the solution");

    const one = problems.find((p) => p.id === ids.get("ended contest"));
    assert.ok(one, "the released fixture should be listed");
    // What a row does say: enough to choose what to open.
    assert.match(one!.title, /ended contest/);
    assert.equal(one!.hasSolution, true);
    assert.equal(one!.difficulty, DIFFICULTY);
    assert.equal(one!.bookmarked, false);
  });

  it("names the paper each problem came from", async () => {
    const { problems } = await listAll(`/practice/problems?source=contest:${endedContestId}`);
    const listed = new Set(problems.map((p) => p.id));
    // The ended contest holds four fixtures; two of them are also in an
    // unfinished paper and stay out even when their contest is named.
    assert.ok(listed.has(ids.get("ended contest")!));
    assert.ok(listed.has(ids.get("ended contest + published mock")!));
    assert.ok(!listed.has(ids.get("ended contest + live contest")!));
    assert.ok(!listed.has(ids.get("ended contest + unpublished mock")!));

    const one = problems.find((p) => p.id === ids.get("ended contest"));
    assert.equal(one!.source?.type, "CONTEST");
    assert.equal(one!.source?.id, endedContestId);
    assert.match(one!.source!.title, /ended contest/);

    // Released only by a mock: the mock is what the row names.
    const { problems: all } = await listAll(`/practice/problems?topic=${encodeURIComponent(TOPIC)}`);
    const mockOnly = all.find((p) => p.id === ids.get("published mock"));
    assert.equal(mockOnly!.source?.type, "MOCK");
  });

  it("does not count withheld questions in the filter list", async () => {
    // A count that moved by more than the released fixtures is advertising
    // problems the list will never hand over.
    const filters = await get("/practice/filters");
    const count = filters.body.subjects
      .find((s: any) => s.subject === SUBJECT)?.topics
      .find((t: any) => t.topic === TOPIC)?.count ?? 0;
    assert.equal(count - baselineTopicCount, ALLOWED_COUNT);

    // And a live contest is not offered as somewhere to browse.
    const offered = filters.body.sources.contests.map((c: any) => c.title);
    assert.ok(offered.some((t: string) => t.includes(`${MARKER} ended`)), "the finished contest should be offered");
    assert.ok(!offered.some((t: string) => t.includes(`${MARKER} live`)), "a live contest was offered as a source");
    assert.ok(!offered.some((t: string) => t.includes(`${MARKER} scheduled`)), "a scheduled contest was offered");
  });

  it("writes nothing down", async () => {
    // "Practice never affects ratings or leaderboards" is held up by there
    // being no record of a practice attempt at all — nothing a rating or a
    // leaderboard could be computed from.
    const counts = () => Promise.all([
      prisma.participation.count({ where: { userId } }),
      prisma.mockAttempt.count({ where: { userId } }),
      prisma.ratingHistory.count({ where: { userId } }),
    ]);
    const before = await counts();
    await listAll(`/practice/problems?subject=${SUBJECT}`);
    await get(`/practice/problems/${ids.get("ended contest")}`);
    const after = await counts();
    assert.deepEqual(after, before);
    assert.deepEqual(after, [0, 0, 0]);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { rating: true } });
    assert.equal(user!.rating, 1500);
  });

  it("serves a problem in the language asked for, falling back to English", async () => {
    const id = ids.get("ended contest")!;
    await prisma.questionTranslation.create({
      data: {
        questionId: id, language: "HI",
        text: `${MARKER} — हिंदी`, optionA: "क", optionB: "ख", optionC: "ग", optionD: "घ",
        solution: "क्योंकि।",
      },
    });

    const detail = await get(`/practice/problems/${id}?language=HI`);
    assert.equal(detail.body.language, "HI");
    assert.equal(detail.body.translated, true);
    assert.match(detail.body.text, /हिंदी/);
    assert.equal(detail.body.optionC, "ग");
    // The answer key is not a translated field — a Hindi reader and an
    // English one are answering the same question.
    assert.equal(detail.body.correctOption, "C");

    // The list is labelled in the same language.
    const { problems } = await listAll(`/practice/problems?topic=${encodeURIComponent(TOPIC)}&language=HI`);
    assert.match(problems.find((p) => p.id === id)!.title, /हिंदी/);

    // An untranslated problem reads in English and says so, rather than
    // coming back blank.
    const untranslated = problems.find((p) => p.id === ids.get("published mock"));
    assert.equal(untranslated!.translated, false);
    assert.match(untranslated!.title, /published mock/);
  });

  it("pages without repeating or skipping a problem", async () => {
    const { problems } = await listAll(`/practice/problems?subject=${SUBJECT}`);
    assert.equal(new Set(problems.map((p) => p.id)).size, problems.length, "a problem came back on two pages");

    const first = await get(`/practice/problems?subject=${SUBJECT}&limit=5&page=1`);
    const body = first.body as ProblemPage;
    assert.equal(body.total, problems.length, "`total` disagrees with what paging returns");
    assert.equal(body.pageCount, Math.max(Math.ceil(problems.length / 5), 1));
    assert.deepEqual(body.problems.map((p) => p.id), problems.slice(0, 5).map((p) => p.id));

    const second = await get(`/practice/problems?subject=${SUBJECT}&limit=5&page=2`);
    assert.deepEqual((second.body as ProblemPage).problems.map((p) => p.id), problems.slice(5, 10).map((p) => p.id));

    // Past the end is an empty page, not an error.
    const beyond = await get(`/practice/problems?subject=${SUBJECT}&limit=5&page=9999`);
    assert.equal(beyond.status, 200);
    assert.equal((beyond.body as ProblemPage).problems.length, 0);
  });

  it("finds a problem by its text", async () => {
    // A fixture whose name is nobody else's prefix: `contains` is a
    // substring match, so "— ended contest" would also find the two
    // fixtures whose names start that way.
    const needle = `${MARKER} — ended contest + published mock`;
    const res = await get(`/practice/problems?q=${encodeURIComponent(needle)}`);
    const found = (res.body as ProblemPage).problems;
    assert.equal(found.length, 1);
    assert.equal(found[0].id, ids.get("ended contest + published mock"));

    // Search does not reach past the archive rule either.
    const withheld = await get(`/practice/problems?q=${encodeURIComponent(`${MARKER} — live contest`)}`);
    assert.equal((withheld.body as ProblemPage).total, 0);
  });

  it("rejects filters that are not in the syllabus", async () => {
    assert.equal((await get("/practice/problems?subject=HISTORY")).status, 400);
    assert.equal((await get("/practice/problems?difficulty=IMPOSSIBLE")).status, 400);
    assert.equal((await get("/practice/problems?topic=Percentages")).status, 400);
    // A real topic, but not one this subject has.
    assert.equal((await get("/practice/problems?subject=GK&topic=Percentage")).status, 400);
  });

  it("is closed to callers without a token", async () => {
    assert.equal((await get("/practice/problems", { auth: false })).status, 401);
    assert.equal((await get("/practice/filters", { auth: false })).status, 401);
    assert.equal((await get(`/practice/problems/${ids.get("ended contest")}`, { auth: false })).status, 401);
  });
});
