# SSC Contest Platform — Phase 1 System Design

## Overview

A Testbook-like app where students can participate in live contests for SSC exams (CGL, CHSL, MTS, CPO, GD), modeled after the competitive feel of Codeforces but for MCQ-based government exams.

---

## Core Features (Phase 1 Only)

- User signup / login
- Browse and join live contests
- Take MCQ-based timed tests (SSC pattern)
- Real-time leaderboard during contest
- Result and score summary after contest
- Admin portal: manage contests, questions, and durations
- User rating system (Codeforces-style Elo)

---

## Architecture Overview

```
[Student: React Web App]   [Admin: React Web App]
        |                          |
        └──────────────────────────┘
                     |
              [API Gateway]
                     |
   ┌─────────────────┼──────────────────┐
   │                 │                  │
[Auth           [Contest            [Admin
Service]         Service]           Service]
                     |                  |
              [Question            [Rating
               Service]            Service]
                     |
              [Leaderboard
               Service (Redis)]
                     |
              [PostgreSQL DB]
```

---

## Services

### 1. Auth Service

- Register / Login for both students and admins using JWT
- Role field on User distinguishes `student` vs `admin`
- Admin self-signup disabled in production — seeded or invited only
- Entities:
  - `User` (id, name, email, password_hash, role: `student | admin`, created_at)

### 2. Contest Service

- CRUD for contests (admin-created)
- Join contest, submit answers
- Entities:
  - `Contest` (id, title, start_time, duration, status: `scheduled | live | ended`)
  - `Participation` (user_id, contest_id, started_at, submitted_at, score)

### 3. Question Service

- MCQ bank tagged by SSC subject and difficulty
- Entities:
  - `Question` (id, text, options[A–D], correct_option, subject, difficulty)
  - `ContestQuestion` (contest_id, question_id, order, marks, negative_marks)

### 4. Leaderboard Service

- Redis sorted set per contest: `contest:{id}:leaderboard`
- Score updated on each answer submission
- Serves real-time rank during live contest

### 5. Admin Service

- Protected by `role: admin` check on every route
- Create / edit / delete contests (title, start time, duration, negative marking)
- Add questions to contest from the question bank
- Bulk upload questions via CSV
- Manually trigger contest status transitions (`scheduled → live → ended`)

### 6. Rating Service

- Runs after every contest ends (triggered async)
- Computes new rating for all participants using Elo-based formula
- Entities:
  - `RatingHistory` (id, user_id, contest_id, old_rating, new_rating, rank, participants, created_at)

---

## SSC-Specific Contest Rules

- **Subjects:** Quantitative Aptitude, General Intelligence & Reasoning, English Language, General Awareness
- **Negative marking:** -0.25 per wrong answer (configurable per contest)
- **Duration:** 60–90 minutes (fixed, set at contest creation)
- **Navigation:** Students can skip and revisit questions freely
- **Shuffling:** Questions shuffled per user to prevent copying

---

## Data Flow — Taking a Contest

```
1. Student joins contest      → Participation record created in PostgreSQL
2. Questions fetched          → Shuffled per user, correct answers never sent to client
3. Student selects options    → Saved to localStorage instantly (no API call)
4. Every 30s (background)     → PATCH /contests/:id/draft syncs full answers map to DB
5. Student submits            → Flush in-memory state → POST /contests/:id/submit
6. Score calculated           → Server-side, pushed to Redis leaderboard
7. Contest ends               → Final scores persisted to PostgreSQL
```

---

## Tech Stack

| Layer             | Choice            | Reason                         |
| ----------------- | ----------------- | ------------------------------ |
| Frontend          | React + Vite      | Fast, simple                   |
| Backend           | Node.js (Express) | Quick to build REST APIs       |
| Primary DB        | PostgreSQL        | Relational, reliable           |
| Cache/Leaderboard | Redis             | Sorted sets for real-time rank |
| Auth              | JWT + bcrypt      | Stateless, simple              |
| Hosting           | Railway / Render  | Low cost for Phase 1           |
| Admin Frontend    | React + Vite      | Separate app, same tech        |

---

## Database Schema (Core Tables)

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contests
CREATE TABLE contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  status TEXT DEFAULT 'scheduled', -- scheduled | live | ended
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Questions
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL, -- 'A' | 'B' | 'C' | 'D'
  subject TEXT NOT NULL,           -- 'quant' | 'reasoning' | 'english' | 'gk'
  difficulty TEXT DEFAULT 'medium'
);

-- Contest <-> Question mapping
CREATE TABLE contest_questions (
  contest_id UUID REFERENCES contests(id),
  question_id UUID REFERENCES questions(id),
  display_order INT NOT NULL,
  marks NUMERIC DEFAULT 2,
  negative_marks NUMERIC DEFAULT 0.5,
  PRIMARY KEY (contest_id, question_id)
);

-- Participation
CREATE TABLE participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  contest_id UUID REFERENCES contests(id),
  score NUMERIC DEFAULT 0,
  draft_answers JSONB DEFAULT '{}', -- autosaved every 30s, nulled after submit
  answers JSONB,                    -- finalized on submit, never changes after
  started_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  UNIQUE (user_id, contest_id)
);

-- Rating history (one row per user per contest)
CREATE TABLE rating_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  contest_id UUID REFERENCES contests(id),
  old_rating INT NOT NULL,
  new_rating INT NOT NULL,
  rank INT NOT NULL,
  total_participants INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, contest_id)
);

-- Add rating column to users
ALTER TABLE users ADD COLUMN rating INT DEFAULT 1500;
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student'; -- 'student' | 'admin'
```

---

## API Endpoints

```
# Auth (shared for student and admin)
POST   /auth/register
POST   /auth/login

# Contests (student-facing)
GET    /contests                    # list upcoming & live contests
GET    /contests/:id                # contest detail
POST   /contests/:id/join           # join a contest
GET    /contests/:id/questions      # fetch questions (shuffled, no correct answers)
PATCH  /contests/:id/draft          # autosave answers map (every 30s background sync)
GET    /contests/:id/draft          # fetch saved draft on page load / refresh
POST   /contests/:id/submit         # final submit — flushes in-memory state, scores server-side

# Leaderboard & Results
GET    /contests/:id/leaderboard    # real-time rank (during live contest)
GET    /contests/:id/result         # my result + answer key (after contest ends)

# Rating (student-facing)
GET    /users/:id/rating            # current rating + rating history
GET    /ratings/leaderboard         # global rating leaderboard (top N students)

# Admin (all routes require role: admin)
POST   /admin/contests              # create contest
PUT    /admin/contests/:id          # edit contest (title, time, duration, marking)
DELETE /admin/contests/:id          # delete contest
POST   /admin/contests/:id/status   # manually set status (live | ended)

POST   /admin/questions             # add single question
POST   /admin/questions/bulk        # bulk upload via CSV
GET    /admin/questions             # list question bank (with filters)
PUT    /admin/questions/:id         # edit question
DELETE /admin/questions/:id         # delete question

POST   /admin/contests/:id/questions           # add question to contest
DELETE /admin/contests/:id/questions/:qid      # remove question from contest
```

---

## Leaderboard Logic (Redis)

```
Key:   contest:{contest_id}:leaderboard
Type:  Sorted Set
Score: final score (higher = better rank)

On submission:
  ZADD contest:{id}:leaderboard <score> <user_id>

Get rank:
  ZREVRANK contest:{id}:leaderboard <user_id>

Get top N:
  ZREVRANGE contest:{id}:leaderboard 0 N-1 WITHSCORES
```

Tiebreaker (same score): earlier submission time ranks higher. Encode as `score * 1e10 - submitted_epoch_ms` in the Redis score.

---

## Answer Autosave Design

### Strategy: localStorage + Periodic Backend Sync

The core problem: saving on every click causes too many API calls; saving only on submit causes data loss on refresh.

**Solution:** Write to `localStorage` instantly on every selection. Sync to backend in the background every 30 seconds. On page load, rehydrate from backend first (handles device switch), falling back to `localStorage` (handles brief offline).

### Flow

```
Student selects option
        │
        ▼
In-memory answers map (React state)
        │
        ├──→ localStorage           ← instant write, no API call, survives refresh
        │
        └──→ [every 30s]
                │
                ▼
         PATCH /contests/:id/draft  ← single call, full answers map as body
                │
                ▼
         participations.draft_answers (JSONB, overwritten each sync)
```

### On Page Load / Refresh

```
1. Fetch GET /contests/:id/draft from backend
2. If draft exists → populate React state + overwrite localStorage
3. If no backend draft → read localStorage as fallback
4. If neither → start fresh (new participant)
```

### On Final Submit (Edge Case Handled)

Submit does NOT rely on a prior autosave. It sends the current in-memory state directly:

```
1. Student clicks Submit
2. POST /contests/:id/submit  { answers: <current in-memory map> }
3. Server scores answers, sets submitted_at, nulls draft_answers
4. Score pushed to Redis leaderboard
```

This means even if the 30s sync hasn't fired yet, no answers are lost — the submit payload carries everything. There is no race condition between autosave and submit.

### Backend Autosave Rules

- `PATCH /contests/:id/draft` is rejected if `submitted_at` is already set (idempotency guard)
- `PATCH /contests/:id/draft` is rejected if current time > `start_time + duration` (contest over)
- Overwrites the entire `draft_answers` JSONB column — no partial merging needed since client always sends the full map

### Storage Cost

- `draft_answers` is nulled after successful submit — no long-term storage cost
- Worst case size: 100 questions × ~50 bytes per entry = ~5KB per participant in flight

---

## Rating System (Elo-based, Codeforces-style)

### Starting Rating

- Every new student starts at **1500**

### Rating Tiers

| Rating Range | Tier        | Color  |
| ------------ | ----------- | ------ |
| < 1200       | Novice      | Gray   |
| 1200–1399    | Apprentice  | Green  |
| 1400–1599    | Specialist  | Cyan   |
| 1600–1899    | Expert      | Blue   |
| 1900–2199    | Master      | Violet |
| 2200+        | Grandmaster | Orange |

### Rating Calculation (after each contest)

Runs as a background job triggered when contest status → `ended`.

```
For each participant:

  expected_rank = sum over all opponents j:
    (1 / (1 + 6^((rating[j] - rating[i]) / 400)))

  actual_rank   = final rank in contest (1 = best)

  delta = K * (expected_rank - actual_rank) / total_participants

  new_rating = old_rating + delta
```

- `K = 32` (standard Elo K-factor; can be tuned)
- Rating cannot drop below **0**
- Only contests with **≥ 5 participants** affect rating

### Rating History

- Every contest updates `rating_history` with old/new rating, rank, and participant count
- Student profile shows a rating graph over time
- Global leaderboard ranks all students by current rating

---

## Admin Portal — Key Flows

### Contest Setup Flow

```
1. Admin logs in          → JWT with role: admin issued
2. Create contest         → set title, start_time, duration, negative_marks
3. Add questions          → pick from question bank or add new ones
4. Publish contest        → status set to 'scheduled' (visible to students)
5. Contest goes live      → admin manually triggers or auto via cron at start_time
6. Contest ends           → admin triggers end or auto at start_time + duration
7. Rating job fires       → background job recalculates all participant ratings
```

### Question Bank Management

- Admin can add questions one by one or bulk-upload via CSV
- CSV format: `text, option_a, option_b, option_c, option_d, correct_option, subject, difficulty`
- Questions are reusable across multiple contests

### Admin Route Guard

- Middleware checks `req.user.role === 'admin'` on all `/admin/*` routes
- Attempting admin routes with a student token returns `403 Forbidden`

---

## Security Decisions

- Correct answers are **never sent to the client** — all scoring is server-side
- JWT tokens expire in 7 days; refresh via re-login (Phase 1 simplicity)
- Answers submitted after contest end time are rejected server-side
- Admin routes are role-gated at the middleware level, not just the frontend
- Admin self-registration is disabled; new admins are seeded directly in the DB

---

## Out of Scope for Phase 1

- Mobile app
- Video / AI proctoring
- Payment and subscriptions
- AI-generated questions
- Per-contest analytics dashboard
- Email notifications
- Social features (friends, messaging)
- Admin audit logs

---

## Phase 2 Considerations (Not Built Now)

- Practice mode (non-competitive, untimed)
- Subject-wise performance analytics
- Admin dashboard for contest/question management
- Push notifications for upcoming contests
- Mobile app (React Native)
