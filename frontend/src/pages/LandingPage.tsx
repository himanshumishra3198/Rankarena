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

interface PublicMock {
  id: string;
  title: string;
  subject: "QUANT" | "REASONING" | "ENGLISH" | "GK";
  durationMinutes: number;
  questionCount: number;
}

interface Stats {
  aspirants: number;
  mockTests: number;
  questions: number;
  contests: number;
  testsTaken: number;
}

const MOCK_SUBJECT_LABELS: Record<string, string> = {
  QUANT: "Quantitative Aptitude",
  REASONING: "Reasoning",
  ENGLISH: "English",
  GK: "General Awareness",
};

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

// HH:MM:SS (with a leading "Nd" when more than a day out) for the big timer.
function formatClock(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${d}d ${hms}` : hms;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

const FEATURES = [
  { icon: "🎯", title: "Real SSC exam pattern", body: "Quant, Reasoning, English & GK with negative marking and sequential sectional timing — exactly like the real CBT." },
  { icon: "⚡", title: "Live rated contests", body: "Compete against other aspirants in real time. Your rating updates after every contest." },
  { icon: "📚", title: "Sectional mock tests", body: "Targeted subject-wise practice you can attempt anytime and retake as often as you want." },
  { icon: "📝", title: "Detailed solutions", body: "Every question comes with the answer key and a step-by-step explanation." },
  { icon: "📊", title: "Performance analytics", body: "Accuracy, time-per-question, and section-wise strengths & weaknesses after each test." },
  { icon: "🏆", title: "Global leaderboard", body: "Climb the ranks, earn tiers, and track your growth against the whole community." },
];

const FAQS = [
  { q: "Is RankArena free?", a: "Yes. Create a free account and practice unlimited sectional mock tests. No credit card required." },
  { q: "Which exams does it cover?", a: "SSC CGL, CHSL, MTS, CPO and GD — full exam pattern with the official marking scheme." },
  { q: "How does rating work?", a: "Everyone starts at 1500. After each contest your rating moves up or down based on your rank against other participants." },
  { q: "Can I review my answers?", a: "Absolutely. Every test ends with detailed solutions, the answer key, and a full performance breakdown you can revisit anytime." },
];

export default function LandingPage() {
  // This page is now /about rather than the home page, so it has to cope with
  // a signed-in visitor arriving on it.
  const isSignedIn = Boolean(localStorage.getItem("token"));
  usePageMeta(
    "RankArena — Live SSC Mock Tests & Rated Contests (CGL, CHSL, MTS, CPO, GD)",
    "Compete in timed, ranked SSC mock contests and sectional mock tests for CGL, CHSL, MTS, CPO and GD. Live leaderboards, ratings, detailed solutions and performance analysis.",
  );
  const navigate = useNavigate();
  const [active, setActive] = useState<Contest[]>([]);
  const [mocks, setMocks] = useState<PublicMock[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    Promise.all([
      api.get("/contests"),
      api.get("/mocks/public"),
      api.get("/ratings/leaderboard"),
      api.get("/stats/public"),
    ])
      .then(([contestsRes, mocksRes, lbRes, statsRes]) => {
        setActive(contestsRes.data.active ?? []);
        setMocks(mocksRes.data ?? []);
        setLeaderboard((lbRes.data ?? []).slice(0, 3));
        setStats(statsRes.data ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const liveContest = active.find((c) => effectivePhase(c) === "live");
  const upcoming = active
    .filter((c) => effectivePhase(c) === "scheduled")
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const featured = liveContest ?? upcoming[0] ?? null;

  const statItems = stats
    ? [
        { value: fmt(stats.questions), label: "Practice questions" },
        { value: fmt(stats.mockTests), label: "Mock tests" },
        { value: fmt(stats.testsTaken), label: "Tests attempted" },
        { value: fmt(stats.aspirants), label: "Aspirants" },
      ].filter((s) => s.value !== "0")
    : [];

  function renderFeatured() {
    if (!featured) {
      return (
        <div className="landing-featured-card">
          <div className="landing-featured-eyebrow">Start now</div>
          <div className="landing-featured-title">Free sectional mock tests</div>
          <p className="landing-featured-sub">
            No contest running right now — jump into a subject-wise mock and start practising in seconds.
          </p>
          <button
            className="btn btn-primary btn-full"
            style={{ marginTop: "auto", justifyContent: "center", fontSize: 15 }}
            onClick={() => navigate("/register")}
          >
            Practice Free →
          </button>
        </div>
      );
    }
    const isLive = effectivePhase(featured) === "live";
    const startMs = new Date(featured.startTime).getTime();
    const endMs = startMs + featured.durationMinutes * 60_000;
    const ms = isLive ? Math.max(0, endMs - now) : Math.max(0, startMs - now);
    return (
      <div className={`landing-featured-card ${isLive ? "landing-featured-live" : ""}`}>
        <div className="landing-featured-eyebrow">
          {isLive ? <span className="landing-live-dot">● LIVE NOW</span> : "Next contest"}
        </div>
        <div className="landing-featured-title">{featured.title}</div>
        <div className="landing-featured-meta">
          {featured.durationMinutes} min &nbsp;·&nbsp; −{Number(featured.negativeMarks)} negative &nbsp;·&nbsp;{" "}
          {featured._count?.participations ?? 0} joined
        </div>
        <div className="landing-featured-timer-label">{isLive ? "Ends in" : "Starts in"}</div>
        <div className="landing-featured-timer">{formatClock(ms)}</div>
        <button
          className="btn btn-primary btn-full"
          style={{ marginTop: "auto", justifyContent: "center", fontSize: 15 }}
          onClick={() => navigate("/login")}
        >
          {isLive ? "Login to Enter" : "Login to Register"} →
        </button>
      </div>
    );
  }

  return (
    <div className="landing-root">
      {/* ── Navbar ─────────────────────────────────────── */}
      <nav className="landing-nav">
        <button className="navbar-brand" onClick={() => navigate("/")}>
          Rank<span>Arena</span>
        </button>
        <div className="landing-nav-links">
          <a href="#contests">Contests</a>
          <a href="#mocks">Mock Tests</a>
          <a href="#leaderboard">Leaderboard</a>
        </div>
        <div className="landing-nav-actions">
          {isSignedIn ? (
            <button className="btn btn-primary btn-sm" onClick={() => navigate("/")}>
              Go to home →
            </button>
          ) : (
          <>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/login")}>
            Login
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("/register")}>
            Sign Up Free
          </button>
          </>
          )}
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="landing-hero-2col">
          <div className="landing-hero-copy">
            <div className="landing-hero-eyebrow">SSC Exam Contest Platform</div>
            <h1 className="landing-hero-title">
              Practice SSC the way<br />the real exam feels.
            </h1>
            <p className="landing-hero-sub">
              Timed, competitive, ranked. Live contests and free sectional mock tests
              for SSC CGL, CHSL, MTS, CPO & GD — with detailed solutions and ratings.
            </p>
            <div className="landing-hero-ctas">
              <button
                className="btn btn-primary"
                style={{ fontSize: 15, padding: "10px 28px" }}
                onClick={() => navigate("/register")}
              >
                Start Free — No credit card
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
          {renderFeatured()}
        </div>
      </section>

      {/* ── Stats band ─────────────────────────────────── */}
      {statItems.length > 0 && (
        <section className="landing-stats-band">
          <div className="landing-stats-inner">
            {statItems.map((s) => (
              <div key={s.label} className="landing-stat">
                <div className="landing-stat-num">{s.value}</div>
                <div className="landing-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Upcoming / Live Contests ────────────────────── */}
      {active.length > 0 && (
        <section className="landing-section" id="contests">
          <div className="landing-section-inner">
            <div className="landing-section-label">Upcoming &amp; Live Contests</div>
            <div className="landing-contests-grid">
              {active.slice(0, 4).map((c) => {
                const phase = effectivePhase(c);
                const isLive = phase === "live";
                const startMs = new Date(c.startTime).getTime();
                const endMs = startMs + c.durationMinutes * 60_000;
                const countdownMs = isLive ? Math.max(0, endMs - now) : Math.max(0, startMs - now);
                const countdownLabel = isLive
                  ? `Ends in ${formatCountdown(countdownMs)}`
                  : `Starts in ${formatCountdown(countdownMs)}`;
                return (
                  <div key={c.id} className={`landing-contest-card ${isLive ? "landing-contest-live" : ""}`}>
                    {isLive && <div className="landing-live-dot">● LIVE</div>}
                    <div className="landing-contest-title">{c.title}</div>
                    <div className="landing-contest-meta">
                      {c.durationMinutes} min &nbsp;·&nbsp; {c._count?.participations ?? 0} joined
                    </div>
                    <div className="landing-contest-countdown">{countdownLabel}</div>
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

      {/* ── Sectional Mock Tests ────────────────────────── */}
      {mocks.length > 0 && (
        <section className="landing-section" id="mocks">
          <div className="landing-section-inner">
            <div className="landing-section-label">Free Sectional Mock Tests</div>
            <p className="landing-section-intro">
              Subject-wise practice with detailed solutions — attempt anytime, retake as often as you like.
            </p>
            <div className="mock-list">
              <div className="mock-list-head">
                <span>Mock Test</span>
                <span>Questions</span>
                <span>Duration</span>
                <span />
              </div>
              {mocks.slice(0, 10).map((m) => (
                <div key={m.id} className="mock-row">
                  <div className="mock-row-main">
                    <span className="landing-mock-subject">
                      {MOCK_SUBJECT_LABELS[m.subject] ?? m.subject}
                    </span>
                    <span className="mock-row-title">{m.title}</span>
                  </div>
                  <div className="mock-row-cell">{m.questionCount} questions</div>
                  <div className="mock-row-cell">{m.durationMinutes} min</div>
                  <div className="mock-row-action">
                    <button className="btn btn-primary btn-sm" onClick={() => navigate("/login")}>
                      Practice →
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {mocks.length > 10 && (
              <div style={{ textAlign: "center", marginTop: 18 }}>
                <button className="btn btn-ghost" onClick={() => navigate("/register")}>
                  Sign up to see all {mocks.length} mock tests →
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Why RankArena ───────────────────────────────── */}
      <section className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-section-label">Why RankArena</div>
          <div className="landing-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="landing-feature-card">
                <div className="landing-feature-icon">{f.icon}</div>
                <div className="landing-feature-title">{f.title}</div>
                <div className="landing-feature-body">{f.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────── */}
      <section className="landing-section landing-how">
        <div className="landing-section-inner">
          <div className="landing-section-label">How It Works</div>
          <div className="how-grid">
            <div className="how-step">
              <div className="how-step-num">1</div>
              <div className="how-step-heading">Create a free account</div>
              <div className="how-step-body">
                Sign up in seconds — no credit card. Get instant access to every mock test and upcoming contest.
              </div>
            </div>
            <div className="how-step">
              <div className="how-step-num">2</div>
              <div className="how-step-heading">Take the timed exam</div>
              <div className="how-step-body">
                Full SSC pattern — Quant, Reasoning, English, GK with negative marking. Sequential sections, real pressure.
              </div>
            </div>
            <div className="how-step">
              <div className="how-step-num">3</div>
              <div className="how-step-heading">Get rated &amp; improve</div>
              <div className="how-step-body">
                Review every question with solutions, see your analytics, and climb the leaderboard with each attempt.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Leaderboard Preview ──────────────────────────── */}
      {leaderboard.length > 0 && (
        <section className="landing-section" id="leaderboard">
          <div className="landing-section-inner landing-lb-inner">
            <div>
              <div className="landing-section-label">Top Rated Players</div>
              <div className="landing-lb-list">
                {leaderboard.map((entry) => {
                  const t = getTier(entry.rating);
                  const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉";
                  return (
                    <div key={entry.id} className="landing-lb-row">
                      <span className="landing-lb-medal">{medal}</span>
                      <span className="landing-lb-name" style={{ color: t.fg }}>
                        {entry.name}
                      </span>
                      <span className="landing-lb-tier" style={{ background: t.bg, color: t.fg }}>
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
                Everyone starts at rating 1500. Every contest is a chance to climb.
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 20, width: "100%", justifyContent: "center", fontSize: 15 }}
                onClick={() => navigate("/register")}
              >
                Create Free Account
              </button>
              <button
                className="btn btn-ghost"
                style={{ marginTop: 8, width: "100%", justifyContent: "center" }}
                onClick={() => navigate("/login")}
              >
                Already have an account? Login
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ─────────────────────────────────────────── */}
      <section className="landing-section landing-how">
        <div className="landing-section-inner" style={{ maxWidth: 720 }}>
          <div className="landing-section-label">Frequently Asked Questions</div>
          <div className="landing-faq">
            {FAQS.map((f, i) => (
              <div key={f.q} className={`faq-item ${openFaq === i ? "open" : ""}`}>
                <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{f.q}</span>
                  <span className="faq-chevron">{openFaq === i ? "−" : "+"}</span>
                </button>
                {openFaq === i && <div className="faq-a">{f.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA band ──────────────────────────────── */}
      <section className="landing-cta-band">
        <div className="landing-cta-inner">
          <h2 className="landing-cta-heading">Your next rank starts today.</h2>
          <p className="landing-cta-sub">
            Join thousands of SSC aspirants practising smarter — free forever to start.
          </p>
          <div className="landing-hero-ctas" style={{ justifyContent: "center" }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 15, padding: "11px 30px" }}
              onClick={() => navigate("/register")}
            >
              Create Free Account
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 15, padding: "11px 30px" }}
              onClick={() => navigate("/login")}
            >
              Login
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="landing-footer">
        <button className="navbar-brand" style={{ fontSize: 16 }} onClick={() => navigate("/")}>
          Rank<span>Arena</span>
        </button>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Built for SSC aspirants
        </span>
      </footer>
    </div>
  );
}
