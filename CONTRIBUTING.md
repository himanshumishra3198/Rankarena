# Contributing to RankArena

This guide takes you from a fresh clone to the whole app running on your
machine with realistic data, then covers the day-to-day workflow.

You do not need access to the production database or any cloud account.
Everything runs locally against a database you can wipe and rebuild at will.

## What you are running

| Folder      | What it is                 | Local URL             |
| ----------- | -------------------------- | --------------------- |
| `backend/`  | Express + Prisma API       | http://localhost:4000 |
| `frontend/` | Student app (React + Vite) | http://localhost:5173 |
| `admin/`    | Admin panel (React + Vite) | http://localhost:5174 |
| Docker      | PostgreSQL 16 and Redis 7  | ports 5432 and 6379   |

## Prerequisites

- **Node.js 22** and npm
- **Docker Desktop**, running
- **Git**

Check with:

```bash
node -v            # v22.x
docker info        # should print server details, not an error
```

## First-time setup

### 1. Get the code

If you will open pull requests, fork the repository on GitHub first and clone
your fork:

```bash
git clone https://github.com/<your-username>/Rankarena.git
cd Rankarena
git remote add upstream https://github.com/himanshumishra3198/Rankarena.git
```

### 2. Create the env files

```bash
cp .env.example .env                  # database credentials for Docker
cp backend/.env.example backend/.env  # backend settings
```

The defaults work as-is: `.env` and `backend/.env` agree on the database
password. If you change `POSTGRES_PASSWORD` in `.env`, change it in
`DATABASE_URL` in `backend/.env` too.

`frontend/.env` and `admin/.env` are committed and already point at
`http://localhost:4000`. To override something just for your machine, put it in
`frontend/.env.local` or `admin/.env.local`, which git ignores.

### 3. Start Postgres and Redis

```bash
docker compose up -d
```

This uses `docker-compose.yml`, which runs only the database and Redis. The
`docker-compose.prod.yml` and `docker-compose.server.yml` files are for the
production server. Do not use them locally.

### 4. Install dependencies

```bash
cd backend && npm ci
cd ../frontend && npm ci
cd ../admin && npm ci
cd ..
```

Use `npm ci`, not `npm install`: it installs exactly what the lockfile says
and does not rewrite `package-lock.json`.

### 5. Create the schema and load the seed data

```bash
cd backend
npx prisma migrate deploy   # create all tables
npm run db:seed             # fill them with sample data
cd ..
```

At the end, the seed prints the accounts you can log in with (see
[Seed data](#seed-data)).

### 6. Run the app

**First, make sure ports 4000, 5173 and 5174 are free.** If a previous run of
the app (or anything else) is still using one of them, the backend fails to
start, and Vite silently moves the student app or admin panel to the next free
port (5175, 5176, …). The app then appears to run, but the backend rejects its
requests, because CORS only allows 5173 and 5174.

Check what is using the ports:

```bash
lsof -nP -iTCP:4000 -iTCP:5173 -iTCP:5174 -sTCP:LISTEN
```

- **No output:** the ports are free. Go on to the commands below.
- **Processes listed:** stop them. If they are an earlier RankArena run in
  another terminal, press `Ctrl + C` there. Otherwise, stop them by port
  (macOS and Linux):

  ```bash
  kill $(lsof -tiTCP:4000 -sTCP:LISTEN) $(lsof -tiTCP:5173 -sTCP:LISTEN) $(lsof -tiTCP:5174 -sTCP:LISTEN)
  ```

  Then run the `lsof` check again and confirm it prints nothing.

On Windows, use `netstat -ano | findstr ":4000 :5173 :5174"` to find the
process IDs and `taskkill /PID <pid> /F` to stop each one.

Then start the three apps, one per terminal:

```bash
cd backend  && npm run dev   # http://localhost:4000
cd frontend && npm run dev   # http://localhost:5173
cd admin    && npm run dev   # http://localhost:5174
```

Open http://localhost:5173 and log in as `student1@rankarena.local` /
`password123`.

## Seed data

`backend/prisma/seed/` fills an **empty** database with synthetic data. None of
it comes from production.

### Accounts

All passwords are `password123`.

| Email                                                   | Role    | Notes                                                    |
| ------------------------------------------------------- | ------- | -------------------------------------------------------- |
| `admin@rankarena.local`                                 | Admin   | Log in at http://localhost:5174                          |
| `student1@rankarena.local`                              | Student | Strongest student; has bookmarks and follows             |
| `student2@rankarena.local` … `student8@rankarena.local` | Student | Skill decreases from 2 to 8; 3 and 6 sit papers in Hindi |

### Contests

Contests follow the SSC CGL Tier 1 pattern: sections in the order Reasoning,
General Awareness, Quantitative Aptitude, English, at +2 / −0.5 marks per
question.

| Contest           | Questions               | Time   | State                                        |
| ----------------- | ----------------------- | ------ | -------------------------------------------- |
| SSC CGL Contest 1 | 100 (25 per subject)    | 60 min | Ended 14 days ago, ranked and rated          |
| SSC CGL Contest 2 | 100 (25 per subject)    | 60 min | Ended 7 days ago, ranked and rated           |
| Rapid Contest 1   | 40 (10 per subject)     | 24 min | Ended 2 days ago, ranked and rated           |
| SSC CGL Contest 3 | 100 (25 per subject)    | 60 min | **Live** — started 5 minutes before seeding  |
| SSC CGL Contest 4 | 100 (25 per subject)    | 60 min | **Scheduled** for 2 days from now            |

### Mocks

Each subject (Logical Reasoning, General Awareness, Quantitative Aptitude and
English Language) has:

| Mock                             | Questions | Time   |
| -------------------------------- | --------- | ------ |
| `<Subject> Sectional Test - 1`   | 25        | 15 min |
| `<Subject> Sectional Test - 2`   | 25        | 15 min |
| `<Subject> Rapid Mock`           | 10        | 6 min  |

That is 12 published mocks. A 13th, **Logical Reasoning Sectional Test - 3**,
is unpublished, as a draft would be.

### Questions

About 745 questions, and no question appears in more than one paper. About 40
are in no paper at all, like new questions waiting in the bank. Quant and
Reasoning questions are generated from templates with computed answers, so the
answer keys are right by construction. English and GK questions come from fact
lists, with wrong options taken from other entries in the same list. Around 290
have Hindi translations (most Quant and numeric Reasoning). The English section
stays in English, as in the real exam. About 1 in 12 questions has no topic tag.

### Everything else

- **Attempts:** submitted contest and mock attempts in English and Hindi; one
  contest attempt that was never submitted and was scored automatically when
  the contest was settled; admin test attempts, which are excluded from ranks.
- **Other:** question reports (open and resolved), bookmarks, follows, a
  notification, and community articles with comments and votes.

### Deliberate test cases

- **The live and upcoming contests and the unpublished mock** contain questions
  that appear nowhere else. Practice must never show them. Their answer keys
  are the ones a leak would expose.
- **"What is 30% of 150?"** in SSC CGL Contest 3 (live) is worded almost exactly
  like "What is 20% of 150?" in SSC CGL Contest 1. It tests that
  similarity-based features cannot reach live questions.
- **"What is 25% of 80?"** in SSC CGL Contest 2 is deliberately mis-keyed: the
  answer key says C (25), but the correct answer is B (20), and most students
  chose B. It has two open reports.

### Dates

Dates are relative to when you ran the seed. The live contest stays live for
about 55 minutes after seeding; after that, the app settles it the next time a
page loads. To get a fresh live contest, reset the database.

### Resetting

```bash
cd backend
npm run db:reset
```

This **deletes everything in your local database**, re-applies every
migration and runs the seed again. It asks for confirmation first.

The seed refuses to run against a database that already has data, and against
any host other than `localhost`, so it cannot be pointed at a shared or
production database by mistake.

## Day-to-day workflow

### Keep your fork current

```bash
git checkout main
git fetch upstream
git merge --ff-only upstream/main
git push origin main
```

Then, in `backend/`, apply any new migrations:

```bash
npx prisma migrate deploy
```

### Branches and pull requests

- Branch from an up-to-date `main`, one branch per change:
  `feat/practice-similarity`, `fix/leaderboard-ties`, `docs/local-setup`.
- Keep a pull request to one issue. Link it with `Closes #<number>` in the
  description.
- Commit messages follow the existing history: a type prefix, then what the
  change does for the user, in the present tense.
  - `feat: let people practise questions without sitting a test`
  - `fix: stop the pager's button style from being applied to the whole page`
  - `docs: …`, `style: …`, `test: …`, `refactor: …` as fitting

### Before opening a pull request

```bash
cd backend  && npm test && npm run build
cd frontend && npm run lint && npm run build
cd admin    && npm run lint && npm run build
```

Backend tests run against the database in `backend/.env`. They create their
own rows and delete them afterwards, so they do not depend on the seed and do
not disturb it.

## Changing the database schema

1. Edit `backend/prisma/schema.prisma`.
2. Create a migration with a descriptive name:

   ```bash
   cd backend
   npx prisma migrate dev --name add_question_stats
   ```

   This writes a new folder under `prisma/migrations/`, applies it to your
   local database and regenerates the Prisma client in `src/generated/prisma/`.

3. Commit the schema, the new migration folder **and** the regenerated client
   files in the same pull request.
4. If the change affects what the seed creates, update
   `backend/prisma/seed/` and check that `npm run db:reset` still works.

Rules:

- Never edit a migration that has already been merged. Add a new one.
- Never use `prisma db push`. It changes the database without recording a
  migration, so nobody else can reproduce the change.
- Production applies migrations with `prisma migrate deploy`. Nothing else
  should change the production schema.

## Troubleshooting

**`P1000: Authentication failed against database server`**
Docker volumes outlive containers. If an older RankArena database already
exists on your machine, it keeps the password it was created with, and
changing `.env` does not change it. Either set the old password in
`backend/.env`, or delete the volume and start again (this erases that local
data):

```bash
docker compose down -v
docker compose up -d
```

**Port 5432 or 6379 is already in use**
Another Postgres or Redis is running, either installed directly or in another
project's container. Stop it, or change the port mapping in
`docker-compose.yml` and the matching URL in `backend/.env`.

**`FATAL: JWT_SECRET is not set or is using the insecure default`**
`backend/.env` is missing or still has the old placeholder. Copy
`backend/.env.example` again, or set `JWT_SECRET` to the output of
`openssl rand -hex 32`.

**`The database already has data, and the seed only fills an empty one`**
Run `npm run db:reset` in `backend/` to wipe and reseed.

**Verification and password-reset emails never arrive**
They are not sent locally. With no `SMTP_HOST` set, each email, including its
link, is printed to the backend console. All seeded accounts are already
verified.

**Image upload fails with "Image storage is not configured"**
Uploads need an S3 bucket, which is optional locally. See the optional
section of `backend/.env.example`.

**The live contest is no longer live**
It lasts about 55 minutes from when you seeded. Run `npm run db:reset`.
