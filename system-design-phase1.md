# RankArena — Phase 1 System Design (As Built)

## Overview

A Testbook-like app where students participate in live contests for SSC exams (CGL, CHSL, MTS, CPO, GD), modeled after the competitive feel of Codeforces but for MCQ-based government exams. Students get rated after every contest, track their growth on a profile page, and follow rivals on a live leaderboard.

---

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐
│  Student Frontend   │    │   Admin Frontend     │
│  (React + Vite)     │    │   (React + Vite)     │
│  Port 5173          │    │   Port 5174          │
└──────────┬──────────┘    └──────────┬──────────┘
           │                          │
           └─────────────┬────────────┘
                         │ HTTP / REST
                         ▼
              ┌──────────────────────┐
              │   Express Backend    │
              │   (Node.js, Port 4000)│
              └────────┬─────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌────────────┐ ┌─────────┐ ┌─────────┐
   │ PostgreSQL │ │  Redis  │ │ Prisma  │
   │   (DB)     │ │(Sorted  │ │  ORM    │
   │            │ │  Sets)  │ │         │
   └────────────┘ └─────────┘ └─────────┘
```

---

## Tech Stack

| Layer             | Choice             | Reason                                              |
|-------------------|--------------------|-----------------------------------------------------|
| Student Frontend  | React + Vite       | Fast dev, component reuse                           |
| Admin Frontend    | React + Vite       | Separate app, same tech stack                       |
| Backend           | Node.js + Express  | REST API, familiar ecosystem                        |
| ORM               | Prisma             | Type-safe DB access, migrations                     |
| Primary DB        | PostgreSQL 16      | Relational, handles JSONB for answers/drafts        |
| Cache/Leaderboard | Redis 7            | Sorted sets for O(log n) rank queries               |
| Auth              | JWT + bcrypt       | Stateless, bcrypt salt=10                           |
| Validation        | Zod                | Schema-level validation on all routes               |
| Rate Limiting     | express-rate-limit | Auth: 20/15min, Submit: 5/min                       |
| Infrastructure    | Docker Compose     | Local postgres + redis in containers                |

---

## Database Schema

### `users`
| Column        | Type      | Notes                              |
|---------------|-----------|------------------------------------|
| id            | UUID (PK) | auto-generated                     |
| name          | TEXT      |                                    |
| email         | TEXT      | unique                             |
| password_hash | TEXT      | bcrypt hash                        |
| role          | Enum      | `STUDENT` or `ADMIN`               |
| rating        | INT       | starts at 1500                     |
| created_at    | TIMESTAMP |                                    |

### `contests`
| Column           | Type      | Notes                                           |
|------------------|-----------|-------------------------------------------------|
| id               | UUID (PK) |                                                 |
| title            | TEXT      |                                                 |
| start_time       | TIMESTAMP |                                                 |
| duration_minutes | INT       |                                                 |
| negative_marks   | DECIMAL   | default 0.5                                     |
| section_limits   | JSONB     | `{ QUANT: 25, REASONING: 20, ... }` in minutes  |
| status           | Enum      | `SCHEDULED`, `LIVE`, or `ENDED`                 |
| created_at       | TIMESTAMP |                                                 |

### `questions`
| Column        | Type      | Notes                                |
|---------------|-----------|--------------------------------------|
| id            | UUID (PK) |                                      |
| text          | TEXT      |                                      |
| image_url     | TEXT?     | optional diagram/image               |
| option_a–d    | TEXT      |                                      |
| correct_option| CHAR(1)   | `A`, `B`, `C`, or `D`               |
| subject       | Enum      | `QUANT`, `REASONING`, `ENGLISH`, `GK`|
| difficulty    | Enum      | `EASY`, `MEDIUM`, `HARD`             |

### `contest_questions`
| Column        | Type    | Notes                        |
|---------------|---------|------------------------------|
| contest_id    | UUID FK |                              |
| question_id   | UUID FK | composite PK                 |
| display_order | INT     | default order within section |
| marks         | DECIMAL | default 2                    |
| negative_marks| DECIMAL | default 0.5                  |

### `participations`
| Column        | Type      | Notes                                        |
|---------------|-----------|----------------------------------------------|
| id            | UUID (PK) |                                              |
| user_id       | UUID FK   |                                              |
| contest_id    | UUID FK   | unique(user_id, contest_id)                  |
| score         | DECIMAL   | server-computed on submit                    |
| draft_answers | JSONB     | `{ questionId: "A" }` — autosaved every 30s  |
| answers       | JSONB     | finalized on submit; draft_answers → NULL    |
| time_spent    | JSONB     | `{ questionId: seconds }` — per-question     |
| started_at    | TIMESTAMP |                                              |
| submitted_at  | TIMESTAMP | null until submitted                         |

### `rating_history`
| Column             | Type      | Notes                           |
|--------------------|-----------|---------------------------------|
| id                 | UUID (PK) |                                 |
| user_id            | UUID FK   |                                 |
| contest_id         | UUID FK   | unique(user_id, contest_id)     |
| old_rating         | INT       |                                 |
| new_rating         | INT       |                                 |
| rank               | INT       | final rank in that contest      |
| total_participants | INT       |                                 |
| created_at         | TIMESTAMP |                                 |

### `follows`
| Column       | Type      | Notes                           |
|--------------|-----------|---------------------------------|
| id           | UUID (PK) |                                 |
| follower_id  | UUID FK   |                                 |
| following_id | UUID FK   | unique(follower_id, following_id)|
| created_at   | TIMESTAMP |                                 |

---

## API Reference

### Auth
All auth routes have a rate limit of **20 requests per 15 minutes**.

| Method | Endpoint         | Auth | Description                                           |
|--------|------------------|------|-------------------------------------------------------|
| POST   | /auth/register   | —    | Register new student. Returns JWT + user object.      |
| POST   | /auth/login      | —    | Login. Returns JWT + user object.                     |

**Register body:** `{ name, email, password (min 6) }`
**Login body:** `{ email, password }`
**Response:** `{ token: "jwt...", user: { id, name, email, role, rating } }`

---

### Contests (Student-Facing)

| Method | Endpoint                     | Auth     | Description                                                              |
|--------|------------------------------|----------|--------------------------------------------------------------------------|
| GET    | /contests                    | Optional | List all contests. Returns `{ active: [], past: [] }` with `hasJoined`, `hasSubmitted` flags. |
| GET    | /contests/:id                | —        | Contest detail including question count and participant count.             |
| POST   | /contests/:id/join           | Required | Join a contest. Creates a Participation row. Idempotent (upsert).        |
| GET    | /contests/:id/questions      | Required | Fetch questions shuffled per user. Correct answers omitted.               |
| PATCH  | /contests/:id/draft          | Required | Autosave current answer state. Rejected if past deadline or already submitted. |
| GET    | /contests/:id/draft          | Required | Fetch last saved draft. Used on page load/refresh.                        |
| POST   | /contests/:id/submit         | Required | Final submit. Rate-limited to 5/min. Scores server-side, updates Redis.   |
| GET    | /contests/:id/leaderboard    | Required | Real-time leaderboard. `?filter=friends` shows only followed users + self. `?limit=N` (max 100). Always includes current user. |
| GET    | /contests/:id/result         | Required | Full result + answer key. Blocked while contest is still running.         |

**GET /contests response:**
```json
{
  "active": [{ "id", "title", "startTime", "durationMinutes", "negativeMarks", "status", "_count": { "participations" }, "hasJoined", "hasSubmitted" }],
  "past":   [...]
}
```

**GET /contests/:id/questions response (per question):**
```json
{ "id", "text", "optionA", "optionB", "optionC", "optionD", "subject", "difficulty", "marks", "negativeMarks" }
```
*(No `correctOption` field — never sent to client)*

**POST /contests/:id/submit body:**
```json
{ "answers": { "<questionId>": "A" | "B" | "C" | "D" }, "timeSpent": { "<questionId>": <seconds> } }
```

**GET /contests/:id/leaderboard response (per entry):**
```json
{ "rank", "userId", "name", "rating", "score", "isCurrentUser" }
```

**GET /contests/:id/result response:**
```json
{
  "score", "rank", "totalParticipants", "submittedAt", "answers",
  "questions": [{ ...fullQuestion, "correctOption", "marks", "negativeMarks" }],
  "totalMaxMarks", "contestTitle", "durationMinutes", "sectionLimits",
  "ratingChange": { "oldRating", "newRating", "delta" } | null,
  "avgTimePerQuestion": { "<questionId>": <avgSeconds> }
}
```

---

### Ratings

| Method | Endpoint                  | Auth     | Description                                                    |
|--------|---------------------------|----------|----------------------------------------------------------------|
| GET    | /ratings/users/:id/rating | Required | User's current rating + full rating history with contest names.|
| GET    | /ratings/leaderboard      | —        | Global top-100 by rating. `?period=week|month|all`             |

**GET /ratings/leaderboard response:**
```json
[{ "rank", "id", "name", "rating", "ratingChange" }]
```
`ratingChange` is the net rating change within the selected period (null for `all`).

---

### Profile

| Method | Endpoint      | Auth     | Description                                      |
|--------|---------------|----------|--------------------------------------------------|
| GET    | /profile      | Required | Own profile. Includes email.                     |
| GET    | /profile/:id  | Required | Public profile. Includes `isFollowing`, `isOwnProfile` flags. |

**Profile response:**
```json
{
  "user": { "id", "name", "email?", "role", "rating", "createdAt", "followerCount", "followingCount" },
  "ratingHistory": [{ "contestId", "contestTitle", "date", "oldRating", "newRating", "rank", "totalParticipants" }],
  "heatmap": { "YYYY-MM-DD": <contestCount> },
  "stats": { "totalContests", "bestRank", "maxRating", "maxStreak", "currentStreak" },
  "subjectStats": { "QUANT": { "correct", "wrong", "skipped" }, ... },
  "verdictTotals": { "correct", "wrong", "skipped", "total" },
  "isFollowing?": true | false,
  "isOwnProfile?": true | false
}
```

---

### Social (Follows)

| Method | Endpoint             | Auth     | Description                                     |
|--------|----------------------|----------|-------------------------------------------------|
| POST   | /follows/:userId     | Required | Follow a user. Idempotent upsert.               |
| DELETE | /follows/:userId     | Required | Unfollow a user.                                |
| GET    | /follows/following   | Required | List of user IDs that I follow.                 |

---

### Admin (All routes require `role: ADMIN` — 403 otherwise)

**Contests:**

| Method | Endpoint                              | Description                                               |
|--------|---------------------------------------|-----------------------------------------------------------|
| GET    | /admin/contests                       | All contests across all statuses.                         |
| POST   | /admin/contests                       | Create contest.                                           |
| PUT    | /admin/contests/:id                   | Edit contest (partial updates supported).                 |
| DELETE | /admin/contests/:id                   | Delete contest + all related data. Clears Redis key.       |
| POST   | /admin/contests/:id/status            | Set status: `SCHEDULED`, `LIVE`, or `ENDED`. Setting to `ENDED` triggers async rating computation. |
| POST   | /admin/contests/:id/restart           | Reset an ENDED contest to a new start time. Wipes all participations and rating history. |

**POST /admin/contests body:**
```json
{
  "title": "SSC CGL Tier 1 Mock",
  "startTime": "2026-06-01T10:00:00Z",
  "durationMinutes": 60,
  "negativeMarks": 0.5,
  "sectionLimits": { "QUANT": 15, "REASONING": 15, "ENGLISH": 15, "GK": 15 }
}
```

**Questions:**

| Method | Endpoint                | Description                                    |
|--------|-------------------------|------------------------------------------------|
| POST   | /admin/questions        | Add a single question to the question bank.    |
| GET    | /admin/questions        | List question bank. `?subject=QUANT&difficulty=EASY` |
| PUT    | /admin/questions/:id    | Edit a question.                               |
| DELETE | /admin/questions/:id    | Delete from bank.                              |

**Contest ↔ Questions:**

| Method | Endpoint                               | Description                                                 |
|--------|----------------------------------------|-------------------------------------------------------------|
| GET    | /admin/contests/:id/questions          | List questions assigned to a contest (with full question data). |
| POST   | /admin/contests/:id/questions          | Add one existing question to a contest.                     |
| DELETE | /admin/contests/:id/questions/:qid     | Remove a question from a contest.                           |
| POST   | /admin/contests/:id/questions/bulk     | Create new questions AND add them to the contest in one call.|

**POST /admin/questions body:**
```json
{
  "text": "If 2x + 3 = 11, what is x?",
  "optionA": "3", "optionB": "4", "optionC": "5", "optionD": "6",
  "correctOption": "B",
  "subject": "QUANT",
  "difficulty": "EASY",
  "imageUrl": "https://..." // optional
}
```

**POST /admin/contests/:id/questions/bulk body** (array):
```json
[{ ...questionFields, "marks": 2, "negativeMarks": 0.5 }, ...]
```

---

## Contest Room — Features

The exam interface is the most feature-rich part of the app:

| Feature                    | How it works                                                                               |
|----------------------------|--------------------------------------------------------------------------------------------|
| **Waiting room**           | If contest hasn't started, shows countdown timer. Transitions automatically.               |
| **Instructions modal**     | Shown once when exam goes live. Student must click "I'm Ready" to start.                   |
| **Section-wise navigation**| 4 sections (QUANT, REASONING, ENGLISH, GK). Sequential locking — must submit current section to unlock next. |
| **Per-section timers**     | Each section has its own countdown (from `sectionLimits` or equal split). Auto-submits the section when time runs out. |
| **Question status tracking**| Each question is one of: `not-visited`, `not-answered`, `answered`, `marked`, `answered-marked`. Shown as colored grid in sidebar. |
| **Mark for review**        | Student can flag questions for re-check. Bookmarks shown in sidebar.                       |
| **Draft autosave**         | localStorage write on every answer. Backend sync every 30 seconds via PATCH /draft. On reload: backend-first, localStorage as fallback. |
| **Per-question time**      | Tracks ms spent on each question. Sent to backend on submit as `timeSpent` JSON.           |
| **Built-in calculator**    | Draggable floating calculator panel.                                                       |
| **Fullscreen mode**        | Entered automatically on exam start. Warning shown if user exits fullscreen.               |
| **Tab-switch detection**   | Counts tab/window switches. Shows warning badge in header.                                 |
| **Auto-submit**            | When overall timer hits 0, answers are auto-submitted without student action.              |
| **Submit confirmation modal** | Shows section-wise summary (answered/marked/total) before final submit.               |

---

## Result Page — Analytics

After the contest ends, students get a comprehensive breakdown:

| Section                  | What it shows                                                              |
|--------------------------|----------------------------------------------------------------------------|
| **Overall stats**        | Score, rank, attempted, accuracy, percentile                               |
| **Rating change card**   | Old rating → new rating with delta (shown only after rating is computed)   |
| **Accuracy donut chart** | Interactive SVG donut: correct / wrong / skipped                           |
| **Subject grid**         | Per-section score, bar chart, correct/wrong/skipped pills                  |
| **Sectional summary**    | Table: score, attempted, accuracy, avg time/question, allotted time        |
| **Difficulty breakdown** | Easy/Medium/Hard performance comparison with stacked bars                  |
| **Time analysis**        | Top 3 slowest questions + top 3 fastest questions (color-coded by verdict) |
| **Leaderboard**          | Top 10 + current user rank. Toggle: All / Friends only                     |
| **Question review**      | Full answer key. Filter: all / correct / wrong / skipped. Per-section filter. Each question shows: your time vs avg time across all users, emoji indicator (🚀/⚡/😊/🐢/😰). |
| **Share result**         | Copy-to-clipboard formatted text summary.                                  |

---

## Profile Page

| Section                | What it shows                                                                     |
|------------------------|-----------------------------------------------------------------------------------|
| **Profile header**     | Avatar initial, tier label + color, rating, max rating, follower/following count  |
| **Tier badge system**  | Newbie / Pupil / Specialist / Expert / Candidate Master / Master / Grandmaster    |
| **Rating history chart** | Line chart of rating over all contests                                          |
| **Activity heatmap**   | 52-week GitHub-style heatmap of contest participation                             |
| **Verdict summary**    | Total correct / wrong / skipped across all contests (with accuracy bar)           |
| **Subject performance**| Bar chart for QUANT / REASONING / ENGLISH / GK accuracy                          |
| **Streaks**            | Current streak + best streak (consecutive days with a contest submission)         |
| **Achievements**       | 10 unlockable badges (First Steps, Competitor, Veteran, On Fire, Streak Master, Top Scorer, Rising Star, Expert, Sharpshooter, etc.) |
| **Contest history**    | Table of every rated contest: date, rank, old/new rating, delta. Click to go to result. |

---

## Rating System

### Starting Rating
Every new student starts at **1500**.

### Tiers (Codeforces-Inspired)

| Rating     | Tier             | Color  |
|------------|------------------|--------|
| < 1200     | Newbie           | Gray   |
| 1200–1399  | Pupil            | Green  |
| 1400–1599  | Specialist       | Cyan   |
| 1600–1899  | Expert           | Blue   |
| 1900–2099  | Candidate Master | Violet |
| 2100–2299  | Master           | Orange |
| 2300+      | Grandmaster      | Red    |

### Calculation (after each contest)

Triggered asynchronously when admin sets contest status to `ENDED`. Idempotent — skips if rating_history rows already exist for this contest.

```
For each participant sorted by (score DESC, submitted_at ASC):

  rank = 1-indexed position
  n    = total participants

  delta = round(((n - 2*rank + 1) / (n - 1)) * 50)

  new_rating = max(100, old_rating + delta)
```

- Rank 1 gets **+50**; median rank gets **0**; last rank gets **−50**
- Linear interpolation between those anchors for all other ranks
- Rating floor is **100** (cannot go below)
- Handles ties: earlier submission = better rank for equal score (encoded in Redis score)

---

## Leaderboard Design (Redis)

```
Key:   contest:{contestId}:leaderboard
Type:  Sorted Set
Score: (score * 1e10) − submittedAt_epoch_ms
```

The score encoding bakes in the tiebreaker: higher raw score wins; for equal raw score, earlier submission time wins (lower epoch ms → higher encoded score).

```
On submit:    ZADD contest:{id}:leaderboard <encoded_score> <userId>
Get rank:     ZREVRANK contest:{id}:leaderboard <userId>         → 0-indexed rank
Get top N:    ZREVRANGE contest:{id}:leaderboard 0 N-1 WITHSCORES
Extract score: floor(encoded_score / 1e10) → raw score
```

The leaderboard endpoint always includes the requesting user's own entry even if outside the top N.

---

## Draft Autosave Design

```
Student selects answer
        │
        ▼
React state (in-memory answers map)
        │
        ├──→ localStorage["draft-{contestId}"]     ← instant, no network, survives refresh
        │
        └──→ every 30s (setInterval)
                │
                ▼
         PATCH /contests/:id/draft { answers: <full map> }
                │
                ▼
         participations.draft_answers (JSONB, full overwrite each sync)
```

**On page load / refresh:**
1. GET /contests/:id/draft from backend (handles device switching)
2. If backend draft exists → populate state + overwrite localStorage
3. Else → read localStorage as fallback
4. If neither → start fresh

**On final submit:**
- POST /contests/:id/submit sends current in-memory state directly
- No dependency on prior autosave; no race condition
- Backend sets `submitted_at`, moves `draft_answers → answers`, nulls `draft_answers`

---

## Security

| Concern              | Implementation                                                              |
|----------------------|-----------------------------------------------------------------------------|
| Password storage     | bcrypt with salt rounds = 10                                                |
| Authentication       | JWT (7-day expiry) — `Authorization: Bearer <token>`                        |
| Authorization        | `authenticate` middleware on all protected routes                           |
| Admin access         | `requireAdmin` middleware checks `role === ADMIN` — 403 otherwise           |
| Correct answers      | Never included in question fetch response — scoring is server-side only     |
| Submit deadline      | Server rejects submits after `startTime + durationMinutes`                  |
| Draft deadline       | PATCH /draft rejected after contest deadline                                |
| Rate limiting        | Auth routes: 20/15min; Submit: 5/min                                        |
| Input validation     | Zod schemas on all route bodies; enum values enforced                       |
| CORS                 | Allowlist via `CORS_ORIGIN` env var                                         |
| JWT secret check     | Server refuses to start if `JWT_SECRET` is unset or uses the default value  |
| Admin self-signup    | Disabled — admins are created via `scripts/create-admin.ts` seed script     |

---

## Admin Portal (Separate App)

The admin frontend is a separate Vite + React app (`/admin`, port 5174) with its own routing:

| Page              | Functionality                                                               |
|-------------------|-----------------------------------------------------------------------------|
| Login             | Admin-only login; student token gets 403 on all admin API calls             |
| Contests list     | Table of all contests with status badges; create, edit, delete, set status  |
| Contest detail    | Add/remove questions; trigger status transitions; view participant count     |
| Questions bank    | Create, edit, delete questions; filter by subject and difficulty            |

---

## Data Flow — Full Contest Lifecycle

```
[ADMIN]
1. Create contest            → POST /admin/contests
2. Add questions             → POST /admin/contests/:id/questions/bulk
3. Set status → LIVE         → POST /admin/contests/:id/status { "status": "LIVE" }
4. Set status → ENDED        → POST /admin/contests/:id/status { "status": "ENDED" }
                               → Triggers async computeContestRatings()

[STUDENT]
1. Browse contests           → GET /contests
2. Join contest              → POST /contests/:id/join
3. Fetch questions           → GET /contests/:id/questions (shuffled per user)
4. Take exam                 → answer → localStorage, 30s sync → PATCH /draft
5. Submit answers            → POST /contests/:id/submit { answers, timeSpent }
                             → Server scores, updates Redis leaderboard
6. View result               → GET /contests/:id/result (blocked until contest ends)
7. View leaderboard          → GET /contests/:id/leaderboard?filter=all|friends
8. Rating reflected          → GET /profile (after admin ends contest)
```

---

## Suggested Extra Features for Phase 2

### High Priority

**1. Practice Mode**
Solo, untimed, unrated question practice. Students pick a subject and difficulty and get questions from the bank. No rating effect. Valuable for daily preparation between live contests.

**2. Email Notifications**
Send emails 24h and 30 minutes before a contest starts. Uses the `nodemailer` package + any transactional email provider (Resend, SendGrid). Students opt in during registration.

**3. Contest Auto-Status Transitions**
Right now an admin must manually set status to LIVE and ENDED. A background cron job should read `start_time` and `start_time + duration_minutes` and flip status automatically. Eliminates human error and lets contests run unattended.

**4. Admin Analytics Dashboard**
Per-contest: average score, score distribution histogram, per-question solve rate, average time per question, question discrimination index. Helps admins calibrate difficulty and spot bad questions.

### Medium Priority

**5. Question Discussion / Explanations**
After a contest ends, show a discussion thread per question. Students can post solution approaches. Moderatable by admins. Biggest value-add for learning, not just competing.

**6. Bookmark / Saved Questions**
Students mark specific questions to review later (from the result page). A `bookmarks` table with `userId + questionId`. Feeds into a personal practice list.

**7. Daily Challenge**
5 questions every day drawn from the bank. Completing it increments the streak counter. Keeps students engaged even on non-contest days. Much simpler than a full practice mode.

**8. Contest Search and Filtering**
Students can filter contests by: upcoming only, past only, subject focus (Quant-heavy, GK-heavy), duration range. Important once the contest list grows beyond 20 entries.

### Lower Priority (But Good ROI)

**9. Question Difficulty Auto-Calibration**
After each contest, compute the actual solve rate per question. Adjust the stored `difficulty` enum if the real solve rate diverges significantly from Easy/Medium/Hard expectations. Makes the difficulty tags more trustworthy over time.

**10. Mobile-Responsive Exam UI**
The contest room is currently desktop-only (sidebar + content split). A stacked mobile layout would open the platform to students who only have phones — the majority of SSC aspirants.

**11. CSV Bulk Import for Questions**
Right now bulk upload exists as a JSON array API. A CSV upload form in the admin panel (with column mapping and preview before import) would be far more practical for non-technical admins building question banks from Excel.

**12. Notifications Bell (In-App)**
In-app notification system for: "Contest starting in 30 min", "Your result is ready", "You moved up to Expert". Stored in a `notifications` table, polled or pushed via SSE.
