import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import type { Contest } from "../lib/types";
import { getTier } from "../lib/tiers";
import { usePageMeta } from "../lib/seo";

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  rating: number;
}

function effectivePhase(c: Contest): "scheduled" | "live" | "ended" {
  const now = Date.now();
  const startMs = new Date(c.startTime).getTime();
  const endMs = startMs + c.durationMinutes * 60_000;
  if (now >= endMs) return "ended";
  if (now >= startMs) return "live";
  return "scheduled";
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Starting now";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function LandingPage() {
  usePageMeta(
    "RankArena — Live SSC Mock Tests & Rated Contests (CGL, CHSL, MTS, CPO, GD)",
    "Compete in timed, ranked SSC mock contests and sectional mock tests for CGL, CHSL, MTS, CPO and GD. Live leaderboards, ratings, detailed solutions and performance analysis.",
  );
  const navigate = useNavigate();
  const [active, setActive] = useState<Contest[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    Promise.all([api.get("/contests"), api.get("/ratings/leaderboard")])
      .then(([contestsRes, lbRes]) => {
        setActive(contestsRes.data.active ?? []);
        setLeaderboard((lbRes.data ?? []).slice(0, 3));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="landing-root">
      {/* ── Navbar ─────────────────────────────────────── */}
      <nav className="landing-nav">
        <span className="navbar-brand" style={{ cursor: "default" }}>
          Rank<span>Arena</span>
        </span>
        <div className="landing-nav-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate("/login")}
          >
            Login
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => navigate("/register")}
          >
            Sign Up Free
          </button>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-eyebrow">SSC Exam Contest Platform</div>
          <h1 className="landing-hero-title">
            Compete in Live SSC
            <br />
            Mock Contests. Get Rated.
          </h1>
          <p className="landing-hero-sub">
            Practice the way the real exam feels — timed, competitive, ranked.
            <br />
            Ratings for SSC CGL, CHSL, MTS, CPO, and GD.
          </p>
          <div className="landing-hero-ctas">
            <button
              className="btn btn-primary"
              style={{ fontSize: 15, padding: "10px 28px" }}
              onClick={() => navigate("/register")}
            >
              Join Free — No credit card
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 15, padding: "10px 28px" }}
              onClick={() => navigate("/login")}
            >
              Login
            </button>
          </div>
        </div>
      </section>

      {/* ── Upcoming / Live Contests ────────────────────── */}
      {active.length > 0 && (
        <section className="landing-section">
          <div className="landing-section-inner">
            <div className="landing-section-label">
              Upcoming &amp; Live Contests
            </div>
            <div className="landing-contests-grid">
              {active.slice(0, 4).map((c) => {
                const phase = effectivePhase(c);
                const isLive = phase === "live";
                const startMs = new Date(c.startTime).getTime();
                const endMs = startMs + c.durationMinutes * 60_000;
                const now = Date.now();
                const countdownMs = isLive
                  ? Math.max(0, endMs - now)
                  : Math.max(0, startMs - now);
                const countdownLabel = isLive
                  ? `Ends in ${formatCountdown(countdownMs)}`
                  : `Starts in ${formatCountdown(countdownMs)}`;
                return (
                  <div
                    key={c.id}
                    className={`landing-contest-card ${isLive ? "landing-contest-live" : ""}`}
                  >
                    {isLive && <div className="landing-live-dot">● LIVE</div>}
                    <div className="landing-contest-title">{c.title}</div>
                    <div className="landing-contest-meta">
                      {c.durationMinutes} min &nbsp;·&nbsp;{" "}
                      {c._count?.participations ?? 0} joined
                    </div>
                    <div className="landing-contest-countdown">
                      {countdownLabel}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: "auto", width: "100%" }}
                      onClick={() => navigate("/login")}
                    >
                      Login to {isLive ? "Enter" : "Register"} →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── How It Works ────────────────────────────────── */}
      <section className="landing-section landing-how">
        <div className="landing-section-inner">
          <div className="landing-section-label">How It Works</div>
          <div className="how-grid">
            <div className="how-step">
              <div className="how-step-num">1</div>
              <div className="how-step-heading">Join a Contest</div>
              <div className="how-step-body">
                Contests are scheduled like real SSC exams. Sign up, register
                for a contest, and the exam begins at the scheduled time.
              </div>
            </div>
            <div className="how-step">
              <div className="how-step-num">2</div>
              <div className="how-step-heading">Take the Timed Exam</div>
              <div className="how-step-body">
                Full SSC pattern — Quant, Reasoning, English, GK with negative
                marking. Sections are sequential. No early peeking at other
                sections.
              </div>
            </div>
            <div className="how-step">
              <div className="how-step-num">3</div>
              <div className="how-step-heading">Get Rated &amp; Ranked</div>
              <div className="how-step-body">
                Your rating updates after every contest. Track growth, review
                every question with the answer key, and climb the global
                leaderboard.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Leaderboard Preview ──────────────────────────── */}
      {leaderboard.length > 0 && (
        <section className="landing-section">
          <div className="landing-section-inner landing-lb-inner">
            <div>
              <div className="landing-section-label">Top Rated Players</div>
              <div className="landing-lb-list">
                {leaderboard.map((entry) => {
                  const t = getTier(entry.rating);
                  const medal =
                    entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉";
                  return (
                    <div key={entry.id} className="landing-lb-row">
                      <span className="landing-lb-medal">{medal}</span>
                      <span className="landing-lb-name" style={{ color: t.fg }}>
                        {entry.name}
                      </span>
                      <span
                        className="landing-lb-tier"
                        style={{ background: t.bg, color: t.fg }}
                      >
                        {t.label}
                      </span>
                      <span className="landing-lb-rating">{entry.rating}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="landing-lb-cta-card">
              <div className="landing-lb-cta-title">Ready to compete?</div>
              <div className="landing-lb-cta-sub">
                Everyone starts at rating 1500. Every contest is a chance to
                climb.
              </div>
              <button
                className="btn btn-primary"
                style={{
                  marginTop: 20,
                  width: "100%",
                  justifyContent: "center",
                  fontSize: 15,
                }}
                onClick={() => navigate("/register")}
              >
                Create Free Account
              </button>
              <button
                className="btn btn-ghost"
                style={{
                  marginTop: 8,
                  width: "100%",
                  justifyContent: "center",
                }}
                onClick={() => navigate("/login")}
              >
                Already have an account? Login
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="landing-footer">
        <span
          className="navbar-brand"
          style={{ cursor: "default", fontSize: 16 }}
        >
          Rank<span>Arena</span>
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Built for SSC aspirants
        </span>
      </footer>
    </div>
  );
}
