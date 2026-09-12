import crypto from "crypto";

/**
 * One-click unsubscribe links for contest mail.
 *
 * The token is an HMAC of the user id, not a stored row. Bulk mail needs a
 * link that works from an inbox with no session, and minting a database token
 * per recipient per send would mean a table that grows with every broadcast
 * and has to be cleaned up. An HMAC is stateless, unguessable without the
 * secret, and scoped to one purpose by the label baked into it — a token from
 * here cannot be replayed anywhere else.
 *
 * It does not expire. An unsubscribe link that has gone stale is worse than
 * useless: the recipient clicks it, nothing happens, and the next email looks
 * like the platform ignored them.
 */

const LABEL = "unsubscribe:contest-emails";

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is required to sign unsubscribe links");
  return s;
}

export function unsubscribeToken(userId: string): string {
  return crypto.createHmac("sha256", secret()).update(`${LABEL}:${userId}`).digest("hex").slice(0, 32);
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = unsubscribeToken(userId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token ?? "");
  // Constant-time, and length-checked first because timingSafeEqual throws on
  // a length mismatch rather than returning false.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function unsubscribeUrl(userId: string): string {
  const site = process.env.PUBLIC_SITE_URL || "https://rankarenas.com";
  return `${site}/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}
