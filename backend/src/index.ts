import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth";
import contestRoutes from "./routes/contests";
import adminRoutes from "./routes/admin";
import ratingRoutes from "./routes/rating";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174").split(",");
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)) }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/contests", contestRoutes);
app.use("/admin", adminRoutes);
app.use("/ratings", ratingRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
