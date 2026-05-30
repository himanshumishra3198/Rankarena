import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

// Fail fast if critical secrets are missing or still at default
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "change-this-secret-in-production") {
  console.error("FATAL: JWT_SECRET is not set or is using the insecure default. Set a strong secret in .env.");
  process.exit(1);
}

import authRoutes from "./routes/auth";
import contestRoutes from "./routes/contests";
import adminRoutes from "./routes/admin";
import ratingRoutes from "./routes/rating";
import profileRoutes from "./routes/profile";
import followRoutes from "./routes/follows";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174").split(",");
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)) }));
app.use(express.json());

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later." },
});

const submitLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submission attempts." },
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authLimiter, authRoutes);
app.use("/contests/:id/submit", submitLimiter);
app.use("/contests", contestRoutes);
app.use("/admin", adminRoutes);
app.use("/ratings", ratingRoutes);
app.use("/profile", profileRoutes);
app.use("/follows", followRoutes);

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
