import crypto from "crypto";
import prisma from "./prisma";
import { AuthTokenType } from "../generated/prisma/enums";

/**
 * Single-use, expiring tokens for the links we email out.
 *
 * The raw token goes in the email; only its SHA-256 is stored. Lookup hashes
 * the incoming value and matches on that, so the database never holds anything
 * that could be replayed into an account takeover.
 *
 * SHA-256 rather than bcrypt here, unlike passwords: these are 256 bits of
 * random from a CSPRNG, so there is no low-entropy secret to slow a guesser
 * down — and a bcrypt round per lookup would only mean we could not index the
 * column.
 */

const TTL_MS: Record<AuthTokenType, number> = {
  EMAIL_VERIFY: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
};

function hash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a token and invalidates the user's earlier ones of the same type, so
 * asking for a second reset link silently kills the first.
 */
export async function issueToken(userId: string, type: AuthTokenType): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.authToken.deleteMany({ where: { userId, type } });
  await prisma.authToken.create({
    data: {
      userId,
      type,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + TTL_MS[type]),
    },
  });
  return token;
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Validates a token and burns it in the same breath.
 *
 * The update is conditioned on usedAt still being null, so two requests
 * arriving together cannot both come away thinking they won — the loser
 * updates zero rows and is told the token is spent.
 */
export async function consumeToken(token: string, type: AuthTokenType): Promise<ConsumeResult> {
  if (!token) return { ok: false, reason: "invalid" };
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.type !== type) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt < new Date()) return { ok: false, reason: "expired" };

  const claimed = await prisma.authToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, reason: "used" };

  return { ok: true, userId: row.userId };
}
