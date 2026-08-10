import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { issueToken, consumeToken } from "../lib/authTokens";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/mailer";

const router = Router();

// Shape returned to the client on every auth call. emailVerified drives the
// banner and the contest gate, so it has to travel with the user object.
const USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  rating: true,
  emailVerified: true,
  avatarUrl: true,
} as const;

function signToken(user: { id: string; role: string }) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, {
    expiresIn: "7d",
  });
}

// Mail-sending endpoints get their own budget on top of the /auth limiter.
// Without it, one address can be used to post someone else a hundred emails.
const mailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many emails requested. Try again in an hour." },
});

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

// ── Register ────────────────────────────────────────────────────────────────
router.post("/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { name, password } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
    select: USER_FIELDS,
  });

  // They get a token straight away: an unverified account can sign in and look
  // around, it just cannot enter a contest.
  const token = signToken(user);
  const verifyToken = await issueToken(user.id, "EMAIL_VERIFY");
  await sendVerificationEmail(user.email, user.name, verifyToken);

  res.status(201).json({ token, user });
});

// ── Login ───────────────────────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { password } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Signed up through Google, so there is no password to check. Saying so is
  // not a disclosure — anyone can find out by trying Google — and the
  // alternative is "invalid credentials" for a password they never set.
  if (!user.passwordHash) {
    res.status(401).json({
      error: "This account uses Google sign-in. Continue with Google, or use “Forgot password” to set one.",
    });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  res.json({
    token: signToken(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      rating: user.rating,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
    },
  });
});

// ── Google sign-in ──────────────────────────────────────────────────────────
// The browser gets an ID token from Google Identity Services and posts it
// here; we verify the signature and audience server-side. Nothing the client
// says about who they are is trusted.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post("/google", async (req: Request, res: Response) => {
  const credential = String(req.body?.credential ?? "");
  if (!credential) {
    res.status(400).json({ error: "Missing Google credential" });
    return;
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: "Google sign-in is not configured on this server." });
    return;
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    res.status(401).json({ error: "Could not verify that Google account." });
    return;
  }

  if (!payload?.sub || !payload.email) {
    res.status(401).json({ error: "Google did not return an email address." });
    return;
  }
  // Google can hold an unconfirmed address on an account. Linking one to an
  // existing user by email would hand that user's account to whoever claimed
  // the address, so those are refused outright.
  if (!payload.email_verified) {
    res.status(401).json({ error: "That Google account's email is not verified with Google." });
    return;
  }

  const email = payload.email.trim().toLowerCase();
  const name = payload.name?.trim() || email.split("@")[0];

  let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });

  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      // Same person, signing in a second way. Google has confirmed the
      // address, which also settles verification for the existing account.
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: payload.sub,
          emailVerified: true,
          avatarUrl: byEmail.avatarUrl ?? payload.picture ?? null,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name,
          email,
          googleId: payload.sub,
          avatarUrl: payload.picture ?? null,
          emailVerified: true,
        },
      });
    }
  }

  res.json({
    token: signToken(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      rating: user.rating,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
    },
  });
});

// ── Current user ────────────────────────────────────────────────────────────
// The client re-reads this after verifying in another tab, so the banner and
// the contest buttons come back without a fresh login.
router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: USER_FIELDS,
  });
  if (!user) {
    res.status(404).json({ error: "Account no longer exists" });
    return;
  }
  res.json({ user });
});

// ── Email verification ──────────────────────────────────────────────────────
router.post("/verify-email", async (req: Request, res: Response) => {
  const result = await consumeToken(String(req.body?.token ?? ""), "EMAIL_VERIFY");
  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "That link has expired. Sign in and ask for a new one."
        : result.reason === "used"
          ? "That link has already been used. Try signing in."
          : "That link is not valid.";
    res.status(400).json({ error: message, reason: result.reason });
    return;
  }
  const user = await prisma.user.update({
    where: { id: result.userId },
    data: { emailVerified: true },
    select: USER_FIELDS,
  });
  // A fresh token so a browser that verified from the email can be signed in
  // immediately, rather than bouncing to the login form.
  res.json({ token: signToken(user), user });
});

router.post("/resend-verification", mailLimiter, authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    res.status(404).json({ error: "Account no longer exists" });
    return;
  }
  if (user.emailVerified) {
    res.json({ ok: true, alreadyVerified: true });
    return;
  }
  const token = await issueToken(user.id, "EMAIL_VERIFY");
  await sendVerificationEmail(user.email, user.name, token);
  res.json({ ok: true });
});

// ── Forgot / reset password ─────────────────────────────────────────────────
router.post("/forgot-password", mailLimiter, async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

  if (user) {
    const token = await issueToken(user.id, "PASSWORD_RESET");
    await sendPasswordResetEmail(user.email, user.name, token);
  }

  // Always the same answer. Differing on whether the address exists would turn
  // this endpoint into a way to enumerate everyone who has an account.
  res.json({ ok: true });
});

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

router.post("/reset-password", async (req: Request, res: Response) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }
  const result = await consumeToken(parsed.data.token, "PASSWORD_RESET");
  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "That reset link has expired. Request a new one."
        : result.reason === "used"
          ? "That reset link has already been used. Request a new one."
          : "That reset link is not valid.";
    res.status(400).json({ error: message, reason: result.reason });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.update({
    where: { id: result.userId },
    data: {
      passwordHash,
      // Reaching the link proves they read mail at that address, which is
      // exactly what verification asks for. It also gives a Google-only user
      // a way to add a password without a second round of email.
      emailVerified: true,
    },
    select: USER_FIELDS,
  });

  // Any outstanding verify link is now moot, and leaving reset links live
  // after a successful reset would widen the window on a stolen inbox.
  await prisma.authToken.deleteMany({ where: { userId: user.id } });

  res.json({ token: signToken(user), user });
});

export default router;
