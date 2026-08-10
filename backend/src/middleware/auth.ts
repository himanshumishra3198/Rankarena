import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";

export interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      role: string;
    };
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * Attaches req.user when a valid token is present, but lets the request
 * through either way. Used by pages guests can read — the community feed and
 * article pages — where a signed-in caller additionally gets their own vote
 * state, and a guest simply gets none.
 */
export function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET!) as {
        id: string;
        role: string;
      };
    } catch {
      // An expired or bogus token is treated as "not signed in" rather than
      // an error, so a stale tab can still read public pages.
    }
  }
  next();
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (req.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

/**
 * Blocks an action until the account's email is confirmed.
 *
 * Sitting on top of `authenticate`, not replacing it: an unverified user can
 * sign in, read, and post in the community. What they cannot do is enter a
 * contest or a mock, because those write to the leaderboard and to ratings,
 * and a throwaway address should not be able to move either.
 *
 * The flag is read from the database rather than the JWT — tokens live seven
 * days, and someone who verifies should not have to sign out and back in to
 * get past this.
 */
export async function requireVerifiedEmail(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { emailVerified: true },
  });
  if (!user) {
    res.status(401).json({ error: "Account no longer exists" });
    return;
  }
  if (!user.emailVerified) {
    res.status(403).json({
      error: "Confirm your email address before taking a contest.",
      code: "EMAIL_NOT_VERIFIED",
    });
    return;
  }
  next();
}
