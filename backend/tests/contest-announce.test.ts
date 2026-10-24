/// <reference types="node" />
/**
 * Announcing a contest is opt-in.
 *
 * The sweep used to broadcast every contest that had not been announced yet
 * to every verified account that had not unsubscribed — around thirty real
 * inboxes — which meant a contest created to try something out mailed
 * everybody. These pin that a contest stays silent unless it is asked to be
 * announced, and that asking later still works.
 *
 * No SMTP host is configured in a local checkout, so nothing is actually
 * sent; what the sweep leaves behind is the notification row it claims per
 * recipient, which is what these assert on.
 *
 *   npm test          (backend/)
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/prisma";
import redis from "../src/lib/redis";
import { announceNewContests } from "../src/lib/contestNotifier";

const MARKER = `announce-test-${randomUUID()}`;
const contests: string[] = [];
let recipientId = "";

/** A future contest, announced or not as asked. */
async function makeContest(announceByEmail: boolean, offsetMs = 86_400_000) {
  const c = await prisma.contest.create({
    data: {
      title: `${MARKER} ${announceByEmail ? "real" : "test"}`,
      startTime: new Date(Date.now() + offsetMs),
      durationMinutes: 60,
      status: "SCHEDULED",
      announceByEmail,
    },
    select: { id: true },
  });
  contests.push(c.id);
  return c.id;
}

const notificationsFor = (contestId: string) =>
  prisma.notification.count({ where: { contestId, type: "CONTEST_ANNOUNCED" } });

const announcedAtOf = async (contestId: string) =>
  (await prisma.contest.findUnique({ where: { id: contestId }, select: { announcedAt: true } }))?.announcedAt ?? null;

describe("announcing a contest", () => {
  before(async () => {
    assert.ok(process.env.DATABASE_URL);
    // Somebody who would be mailed: verified, opted in.
    const u = await prisma.user.create({
      data: {
        name: `${MARKER} recipient`,
        email: `${MARKER}@example.invalid`,
        emailVerified: true,
        contestEmails: true,
      },
      select: { id: true },
    });
    recipientId = u.id;
  });

  after(async () => {
    await prisma.notification.deleteMany({ where: { contestId: { in: contests } } });
    await prisma.contest.deleteMany({ where: { id: { in: contests } } });
    await prisma.user.deleteMany({ where: { id: recipientId } });
    await prisma.$disconnect();
    await redis.quit().catch(() => {});
  });

  it("says nothing about a contest that did not ask to be announced", async () => {
    const id = await makeContest(false);
    await announceNewContests();
    assert.equal(await notificationsFor(id), 0, "a test contest must mail nobody");
    assert.equal(await announcedAtOf(id), null, "and must stay pending, not be marked sent");
  });

  it("announces one that did", async () => {
    const id = await makeContest(true);
    await announceNewContests();
    assert.ok(await notificationsFor(id) > 0, "the recipient should have been claimed");
    assert.notEqual(await announcedAtOf(id), null, "and the contest stamped as announced");
  });

  it("lets an admin announce later, once the paper is ready", async () => {
    const id = await makeContest(false);
    await announceNewContests();
    assert.equal(await notificationsFor(id), 0);

    // The admin ticks the box on the contest page.
    await prisma.contest.update({ where: { id }, data: { announceByEmail: true } });
    await announceNewContests();

    assert.ok(await notificationsFor(id) > 0, "the next sweep should pick it up");
    assert.notEqual(await announcedAtOf(id), null);
  });

  it("does not announce the same contest twice", async () => {
    const id = await makeContest(true);
    await announceNewContests();
    const first = await notificationsFor(id);
    await announceNewContests();
    assert.equal(await notificationsFor(id), first, "a second pass must send nothing further");
  });

  it("still ignores a contest whose start time has passed, flag or not", async () => {
    // Announcing something that has already begun is news to nobody.
    const id = await makeContest(true, -3_600_000);
    await announceNewContests();
    assert.equal(await notificationsFor(id), 0);
  });
});
