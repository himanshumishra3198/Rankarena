# RankArena — System Design (As Built)

## Overview

RankArena is a practice and competition platform for Indian government exam aspirants (SSC CGL, CHSL, MTS, CPO, GD). The idea is simple: take the way Codeforces makes programming competitive — live contests, ratings, colored tiers, leaderboards — and apply it to MCQ-based exam preparation.

A student can do four things on the platform:

1. **Compete** in live, timed contests against everyone else, and gain or lose rating based on where they place.
2. **Practice** with mock tests at their own pace, any time, without affecting their rating.
3. **Review** their mistakes — every wrong answer, the time spent per question, subject-wise strengths, and a bank of bookmarked questions.
4. **Discuss** in the community — read contest announcements, share shortcuts, and comment on each other's write-ups.

This document describes what is actually built and running, not a plan. If something is listed here, the code for it exists.

---

## What's built so far

| Area | Status | What it does |
|------|--------|--------------|
| Accounts & auth | Done | Register, login, JWT sessions, student/admin roles |
| Live contests | Done | Scheduled contests, timed exam room, autosave, server-side scoring |
| Ratings | Done | Codeforces-style rating changes after every contest, 7 colored tiers |
| Leaderboards | Done | Live per-contest ranking (Redis), plus a global all-time board |
| Mock tests | Done | Unrated, self-paced practice papers grouped by subject |
| Question types | Done | Standard MCQ, syllogism, reading-comprehension passages, data tables |
| Result analysis | Done | Per-question review, time spent, subject breakdown, answer key |
| Bookmarks | Done | Save any question for later revision |
| Question reports | Done | Students flag bad questions; admins triage them |
| Profile & social | Done | Rating graph, activity heatmap, streaks, follow other users |
| Community | Done | Articles, threaded comments, up/down voting, pinned announcements |
| Admin portal | Done | Separate app to manage contests, questions, mocks, reports, community |
| Mobile support | Done | All pages usable on a phone, including a drawer nav |
| Dark mode | Done | Full light/dark theming across both apps |

---

## Architecture

Three separate applications talk to one backend:

```
┌─────────────────────┐    ┌─────────────────────┐
│  Student Frontend   │    │   Admin Frontend    │
│  (React + Vite)     │    │   (React + Vite)    │
│  Port 5173          │    │   Port 5174         │
└──────────┬──────────┘    └──────────┬──────────┘
           │                          │
           └─────────────┬────────────┘
                         │ HTTP / REST (JSON)
                         ▼
              ┌───────────────────────┐
              │    Express Backend    │
              │  (Node.js, Port 4000) │
              └────────┬──────────────┘
                       │
          ┌────────────┼─────────────┐
          ▼            ▼             ▼
   ┌────────────┐ ┌─────────┐ ┌─────────────┐
   │ PostgreSQL │ │  Redis  │ │  S3-compat  │
   │  (all data)│ │ (live   │ │  (question  │
   │            │ │  ranks) │ │   images)   │
   └────────────┘ └─────────┘ └─────────────┘
```

**Why two frontends instead of one app with an admin section?** Keeping them separate means the student bundle never ships admin code, and an admin bug can't break the exam room. They share nothing but the API and a few copied components.

**Why Redis alongside Postgres?** During a live contest, hundreds of students refresh the leaderboard at once. Asking Postgres to sort and rank every participant on each request is wasteful. Redis sorted sets answer "what rank is this user?" in roughly constant time, so Postgres is left to store the durable data.

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Student frontend | React + Vite | Fast dev loop, component reuse |
| Admin frontend | React + Vite | Separate app, same stack |
| Backend | Node.js + Express 5 | REST API, familiar ecosystem |
| ORM | Prisma 7 | Type-safe DB access and migrations |
| Primary DB | PostgreSQL 16 | Relational, with JSONB for answers and drafts |
| Cache / leaderboard | Redis 7 | Sorted sets for cheap rank queries |
| Auth | JWT + bcrypt | Stateless sessions, bcrypt salt rounds = 10 |
| Validation | Zod | Every request body is schema-checked |
| Rate limiting | express-rate-limit | Auth, submit, and community writes |
| File storage | S3-compatible | Question images via presigned uploads |
| Styling | Plain CSS | One stylesheet per app, CSS variables for theming |
| Infrastructure | Docker Compose | Local Postgres + Redis; nginx in production |

The frontend deliberately runs on very few dependencies — `react`, `react-dom`, `react-router-dom`, `axios`, and `dompurify`. Things like the Markdown renderer and the charts are written in-house rather than pulled from npm, to keep the bundle small and the supply chain narrow.

---

## Database Schema

Fifteen tables. Names in `snake_case` in the database, `camelCase` in the Prisma models.

### Core

**`users`** — id, name, email (unique), password_hash, role (`STUDENT` | `ADMIN`), rating (default 1500), created_at.

**`contests`** — id, title, start_time, duration_minutes, negative_marks (default 0.5), section_limits (JSON, e.g. `{ QUANT: 25, REASONING: 20 }`), status (`SCHEDULED` | `LIVE` | `ENDED`).

**`questions`** — id, question_type, text, image_url, four options, correct_option, subject, difficulty, passage_id, structured_data (JSON), solution (HTML), fingerprint.

The `fingerprint` column is a normalized hash of the question text plus its options. It exists so the admin panel can catch an exact duplicate before it's added to the bank twice.

**`passages`** — id, title, content, type (`TEXT` | `TABLE`), table_data (JSON). One passage groups several questions — a reading comprehension paragraph, or a data table that four questions all refer to.

**`contest_questions`** — links contests to questions, with display_order, marks, negative_marks. Composite primary key.

**`participations`** — one row per (user, contest). Holds score, answers (JSON), draft_answers (JSON), time_spent (JSON), submitted_at.

**`rating_history`** — one row per (user, contest) after rating is computed: old_rating, new_rating, rank, total_participants. This is what the profile rating graph reads.

### Practice and review

**`mock_tests`** — id, title, subject, duration_minutes, negative_marks, is_published.

**`mock_test_questions`** — links mocks to questions with display_order, marks, negative_marks.

**`mock_attempts`** — one row per (user, mock). Holds score, total_marks, correct/wrong/skipped counts, answers, time_spent, marked_for_review, started_at, submitted_at.

**`bookmarks`** — (user_id, question_id) unique pair. A student's saved questions.

**`question_reports`** — a student flagging a question: reason (`WRONG_ANSWER`, `TYPO`, `UNCLEAR`, `MULTIPLE_CORRECT`, `OTHER`), free-text details, status (`OPEN` | `RESOLVED` | `DISMISSED`).

**`follows`** — (follower_id, following_id). Powers the friends-only leaderboard filter.

### Community

**`articles`** — id, author_id, title, body (Markdown), type (`GENERAL` | `ANNOUNCEMENT` | `TECHNIQUE` | `EDITORIAL`), pinned, score, comment_count, timestamps.

**`article_comments`** — id, article_id, author_id, **parent_id** (points at another comment), body, score, deleted flag.

The `parent_id` column is what makes replies work. A top-level comment has `parent_id = NULL`; a reply stores the id of the comment it answers. The frontend receives a flat list and rebuilds the tree.

**`article_votes`** and **`comment_votes`** — value is `+1` or `-1`, unique per (target, user), so one person can only hold one vote on one thing.

### A note on the two "score" columns

`articles.score` and `article_comments.score` duplicate information that could be calculated by summing the vote rows. This is deliberate. Sorting the feed by popularity would otherwise mean summing votes for every article on every page load. The cached number is updated in the same database transaction as the vote itself, so the two can never drift apart.

---

## How the main flows work

### 1. A live contest, start to finish

```
[ADMIN]
1. Create the contest                → POST /admin/contests
2. Attach questions                  → POST /admin/contests/:id/questions/bulk
3. Flip status to LIVE               → POST /admin/contests/:id/status
4. Flip status to ENDED              → POST /admin/contests/:id/status
                                       └─ triggers rating calculation in the background

[STUDENT]
1. Browse contests                   → GET /contests
2. Join                              → POST /contests/:id/join
3. Load questions (shuffled per user)→ GET /contests/:id/questions
4. Answer → saved locally instantly, pushed to server every 30s
5. Submit                            → POST /contests/:id/submit
                                       └─ server scores it and updates the Redis leaderboard
6. See the result (after it ends)    → GET /contests/:id/result
7. Rating updates on the profile     → GET /profile
```

Two details worth calling out:

- **Questions are shuffled per user.** Two students sitting side by side see the same questions in a different order, which makes casual copying harder.
- **The correct answer never leaves the server during a contest.** The question payload sent to the browser simply has no `correctOption` field. Scoring happens entirely on the backend, so no amount of poking at the browser reveals the key.

### 2. Draft autosave — not losing work

An exam where a refresh wipes your answers is unusable. So answers are saved in two places at once:

```
Student picks an option
        │
        ├──→ localStorage, immediately        (survives refresh, needs no network)
        │
        └──→ every 30 seconds, PATCH /draft   (survives switching device or browser)
```

On page load the app asks the server for a draft first, because that is the version that works if the student moved from a laptop to a phone. If there's no server draft, it falls back to localStorage. If neither exists, it starts fresh.

Final submit sends whatever is currently in memory — it doesn't depend on the last autosave having succeeded, so there's no race between the two.

### 3. Scoring

Same rules for contests and mocks:

```
correct answer   → + marks            (default 2)
wrong answer     → − negative_marks   (default 0.5)
skipped          →   0
```

Score, correct/wrong/skipped counts, and the total are all computed server-side and stored on the attempt row.

### 4. The rating system

Every new student starts at **1500**.

| Rating | Tier | Colour |
|--------|------|--------|
| under 1200 | Newbie | Grey |
| 1200–1399 | Pupil | Green |
| 1400–1599 | Specialist | Cyan |
| 1600–1899 | Expert | Blue |
| 1900–2099 | Candidate Master | Violet |
| 2100–2299 | Master | Orange |
| 2300+ | Grandmaster | Red |

When an admin ends a contest, ratings are recomputed for everyone who took part:

```
Sort participants by (score DESC, submitted_at ASC)

  rank = position in that list, starting at 1
  n    = number of participants

  delta = round(((n - 2*rank + 1) / (n - 1)) * 50)

  new_rating = max(100, old_rating + delta)
```

In plain terms: **first place gains +50, the middle of the pack gains nothing, and last place loses 50**, with everyone in between scaled smoothly along that line. Rating can never fall below 100. If two people score the same, whoever submitted earlier ranks higher.

The whole calculation is idempotent — if it runs twice for the same contest it notices the existing `rating_history` rows and does nothing, so an accidental double status-flip can't inflate anyone's rating.

### 5. The live leaderboard

Redis holds one sorted set per contest:

```
Key:   contest:{contestId}:leaderboard
Score: (score × 1e10) − submitted_at_in_ms
```

That score formula is a trick to encode the tiebreaker into a single number. The raw score dominates; subtracting the submission timestamp means that among equal scores, an earlier submission produces a slightly higher value and therefore a better rank. One number, both rules.

```
On submit:  ZADD  contest:{id}:leaderboard <encoded> <userId>
Your rank:  ZREVRANK contest:{id}:leaderboard <userId>
Top N:      ZREVRANGE contest:{id}:leaderboard 0 N-1 WITHSCORES
```

The endpoint always includes the requesting student's own row, even when they're nowhere near the top — seeing "you are 412th" is more useful than not appearing at all.

### 6. Mock tests

Mock tests are the low-pressure counterpart to contests: same exam room, same scoring, but **no rating effect and no deadline**. A student can take one whenever they like.

Each mock belongs to a single subject and is only visible once an admin publishes it. A student gets one attempt row per mock, storing their answers, the time spent on each question, and which questions they flagged for review while taking it.

### 7. Question types

Not every exam question is a plain four-option MCQ, so `questions.question_type` supports four shapes:

- **STANDARD** — an ordinary MCQ.
- **SYLLOGISM** — statements and conclusions, stored in `structured_data` and rendered in the layout these questions traditionally use.
- **PASSAGE** — the question is attached to a `passages` row holding a reading comprehension paragraph; several questions share one passage.
- **TABLE** — attached to a passage whose `table_data` holds headers and rows, rendered as a data table for data-interpretation questions.

### 8. Reporting a bad question

Question banks accumulate errors — wrong answer keys, typos, questions with two correct options. Students can flag any question they meet, choosing a reason and optionally adding detail. Reports land in the admin portal with an open-count badge in the nav, and an admin marks each one resolved or dismissed. A student gets one open report per question; re-reporting updates the existing one rather than piling up duplicates.

### 9. The community

The community is the platform's discussion layer, modelled on Codeforces blogs.

**Articles** have a category:

| Category | Who can post | Used for |
|----------|--------------|----------|
| Announcement | Admins only | Official notices — upcoming contests, schedule changes |
| Tip / Technique | Anyone | Shortcuts and methods |
| Editorial | Anyone | Walkthroughs of contest or mock papers |
| General | Anyone | Everything else |

Articles are written in Markdown. Rather than adding a Markdown library, the app includes a small renderer supporting headings, bold, italic, code, code fences, lists, quotes, and links. Whatever it produces is passed through DOMPurify before reaching the page, so a post can't inject scripts or dangerous links into anyone else's browser.

**Voting** works like Codeforces. Each person gets one vote per article or comment. Pressing the arrow you already chose removes your vote; pressing the opposite arrow flips it, moving the score by one step rather than two. You cannot vote on your own posts — self-upvoting is the fastest way to make a young ranking meaningless.

**Comments** nest through `parent_id`, so replies sit under the comment they answer. On screen they indent up to five levels and then stop, so a long back-and-forth doesn't squeeze into a column two words wide on a phone.

**Deleting** behaves differently at the two levels, on purpose:

- Deleting a **comment** is a *soft* delete. The row stays, its text is blanked, and it displays as "[deleted]". This is because deleting it outright would take every reply underneath it along too, and those replies belong to other people.
- Deleting an **article** is a *hard* delete, and its comments and votes are removed with it by database-level cascade rules. Once the article is gone, its discussion has nothing left to attach to.

**Pinning** is admin-only. A pinned article sits at the top of the feed under every sort order, which is how a contest announcement stays visible.

### 10. Profile and social

A profile shows the rating graph over time, a GitHub-style activity heatmap, current and longest streaks, best rank, subject-wise correct/wrong/skipped totals, and follower counts. Following someone is what enables the friends-only filter on a contest leaderboard — useful when you care more about beating the five people you study with than about your absolute rank.

---

## API Reference

Every route below sits under the backend base URL (`http://localhost:4000` in development). Authenticated routes expect an `Authorization: Bearer <token>` header.

### Auth — `/auth` (rate limited: 20 requests / 15 min)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | — | Create a student account. Returns JWT + user. |
| POST | `/auth/login` | — | Log in. Returns JWT + user. |

### Contests — `/contests`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/contests` | Optional | Contest list, split into `active` and `past`, with `hasJoined` / `hasSubmitted` flags |
| GET | `/contests/:id` | — | Contest detail, question and participant counts |
| POST | `/contests/:id/join` | Required | Join. Idempotent |
| GET | `/contests/:id/questions` | Required | Questions, shuffled per user, answer key stripped |
| PATCH | `/contests/:id/draft` | Required | Autosave answers. Refused after the deadline |
| GET | `/contests/:id/draft` | Required | Fetch saved draft on load |
| POST | `/contests/:id/submit` | Required | Final submit (max 5/min). Scores and updates Redis |
| GET | `/contests/:id/leaderboard` | Required | Live ranking. `?filter=friends`, `?limit=N` |
| GET | `/contests/:id/result` | Required | Full result and answer key. Blocked until the contest ends |

### Mock tests — `/mocks`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/mocks/public` | — | Published mocks for the logged-out landing page |
| GET | `/mocks` | Required | Published mocks plus this user's best attempt |
| GET | `/mocks/:id` | Required | Questions for the exam room |
| POST | `/mocks/:id/submit` | Required | Score and store the attempt |
| GET | `/mocks/:id/result` | Required | Result with the answer key and per-question review |

### Community — `/community` (writes rate limited: 30 / 10 min; votes exempt)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/community/articles` | Required | Feed. `?sort=new\|top`, `?type=`, `?page=` |
| GET | `/community/articles/:id` | Required | One article, with your vote and edit permission |
| POST | `/community/articles` | Required | Create. `ANNOUNCEMENT` is admin-only |
| PATCH | `/community/articles/:id` | Required | Edit. Author or admin |
| DELETE | `/community/articles/:id` | Required | Delete. Author or admin. Cascades to comments and votes |
| POST | `/community/articles/:id/pin` | Admin | Toggle pinned |
| POST | `/community/articles/:id/vote` | Required | Vote `1`, `-1`, or `0`. Not on your own article |
| GET | `/community/articles/:id/comments` | Required | Flat comment list; the client nests it |
| POST | `/community/articles/:id/comments` | Required | Comment or reply (`parentId`) |
| PATCH | `/community/comments/:id` | Required | Edit. Author or admin |
| DELETE | `/community/comments/:id` | Required | Soft delete. Author or admin |
| POST | `/community/comments/:id/vote` | Required | Vote on a comment |

### Others

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/ratings/users/:id/rating` | Required | Rating plus full history |
| GET | `/ratings/leaderboard` | — | Global top 100. `?period=week\|month\|all` |
| GET | `/profile` | Required | Own profile (includes email) |
| GET | `/profile/:id` | Required | Public profile, with `isFollowing` |
| POST / DELETE | `/follows/:userId` | Required | Follow / unfollow |
| GET | `/follows/following` | Required | IDs this user follows |
| GET | `/bookmarks` | Required | Saved questions, full detail |
| GET | `/bookmarks/ids` | Required | Just the ids, for toggling stars |
| POST | `/bookmarks/:questionId` | Required | Toggle a bookmark |
| POST | `/reports` | Required | Flag a question |
| GET | `/stats/public` | — | Counts for the landing page |
| GET | `/health` | — | Liveness check |

### Admin — `/admin` (403 without `role: ADMIN`)

Contests (list, create, edit, delete, set status, restart), questions (create, edit, delete, list, duplicate check), passages, contest–question links including bulk add, mock tests and their questions, report triage, and presigned image upload.

---

## The two frontends

### Student app (port 5173)

| Route | Page | What it's for |
|-------|------|---------------|
| `/` | Landing / Dashboard | Marketing page when logged out, home feed when logged in |
| `/login`, `/register` | Auth | |
| `/contests/:id` | Contest room | The exam interface: timer, palette, autosave |
| `/contests/:id/result` | Result | Score, rank, per-question review, time analysis |
| `/mocks` | Mock tests | Practice papers grouped by subject |
| `/mocks/:id`, `/mocks/:id/result` | Mock room and result | |
| `/bookmarks` | Bookmarks | Saved questions for revision |
| `/leaderboard` | Global leaderboard | All-time and periodic rankings |
| `/community` | Community feed | Articles, sorting, category filters |
| `/community/new`, `/community/:id`, `/community/:id/edit` | Community | Write, read, and edit articles |
| `/profile`, `/profile/:id` | Profile | Rating graph, heatmap, stats, follow |

### Admin app (port 5174)

| Route | Page | What it's for |
|-------|------|---------------|
| `/` | Contests | Create, edit, delete, change status |
| `/contests/:id` | Contest detail | Attach questions, view participants |
| `/questions` | Question bank | Create, edit, delete, filter, duplicate detection |
| `/mocks`, `/mocks/:id` | Mock tests | Build and publish practice papers |
| `/reports` | Reports | Triage flagged questions; open count badge in the nav |
| `/community`, `/community/:id`, `/community/new` | Community | Post announcements, pin, moderate, delete comments |

Both apps support light and dark themes, stored per browser, and both are usable on a phone. Below 880px the navigation collapses into a hamburger drawer rather than clipping the links.

---

## Security

| Concern | How it's handled |
|---------|------------------|
| Password storage | bcrypt, salt rounds = 10 |
| Sessions | JWT, 7-day expiry, sent as `Authorization: Bearer` |
| Route protection | `authenticate` middleware on every protected route |
| Admin access | `requireAdmin` checks `role === ADMIN`, else 403 |
| Answer keys | Never sent to the browser during a contest or mock |
| Deadlines | Submits and draft saves are refused server-side after the deadline |
| Ownership | Editing or deleting an article or comment is re-checked on the server, never trusted from the client |
| Reply grafting | A reply's parent must belong to the same article, so a forged `parentId` can't move a comment onto another thread |
| Self-voting | Rejected server-side |
| Input validation | Zod schemas on all request bodies |
| XSS | All user Markdown and rich text passes through DOMPurify with a strict tag and URL allowlist |
| Rate limiting | Auth 20/15min, submit 5/min, community writes 30/10min |
| CORS | Origin allowlist via `CORS_ORIGIN` |
| Secrets | The server refuses to boot if `JWT_SECRET` is missing or left at its default |
| Admin signup | Not possible through the API; admins are created by a seed script |

---

## Running it locally

```bash
# 1. Start Postgres and Redis
docker compose up -d

# 2. Backend
cd backend
npm install
npx prisma migrate deploy     # create the tables
npm run dev                   # http://localhost:4000

# 3. Student app
cd frontend && npm install && npm run dev    # http://localhost:5173

# 4. Admin app
cd admin && npm install && npm run dev       # http://localhost:5174
```

The backend needs a `.env` with at least `DATABASE_URL` and a real `JWT_SECRET`. Admin accounts are created with the script in `scripts/`, or by flipping a user's `role` to `ADMIN` directly in the database.

---

## What's next

Items below are not built yet, roughly in the order they'd pay off.

**1. Automatic contest status transitions.** An admin currently has to flip a contest to LIVE and then to ENDED by hand. A scheduled job reading `start_time` and `duration_minutes` would let contests run unattended and remove the main source of human error.

**2. Email notifications.** A reminder 24 hours and 30 minutes before a contest starts, and a note when results are ready.

**3. Admin analytics.** Per contest: score distribution, per-question solve rate, average time per question. This is how you find out a question was badly worded rather than hard.

**4. Public community pages.** Community articles currently require login. Contest announcements would reach more people if they were readable — and indexable by search engines — without an account. This needs a logged-out navigation variant.

**5. Daily challenge.** Five questions a day from the bank, feeding the existing streak counter. Cheap to build on top of what mocks already do.

**6. Question difficulty auto-calibration.** Compare each question's real solve rate against its stored Easy/Medium/Hard tag and correct the tag over time, so difficulty labels stay honest.

**7. In-app notifications.** A bell for "contest starting soon", "your result is ready", "someone replied to your comment". The community makes this more valuable than it was before.

**8. CSV import for questions.** Bulk import exists as a JSON API, which suits developers and nobody else. A CSV upload with column mapping and a preview would let non-technical admins build banks from Excel.

**9. Shared frontend package.** `RichText`, `Markdown`, and `time` are duplicated between the student and admin apps. At three or four shared files this is fine; past that it should become a real shared module.
