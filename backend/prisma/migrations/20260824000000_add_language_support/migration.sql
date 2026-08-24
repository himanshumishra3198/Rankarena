-- Hindi/English support.
--
-- Additive only. No existing column is altered and no row is rewritten:
-- English content stays exactly where it is, in the base columns, and is
-- treated as the default language. Every other language lives in the new
-- tables. That is what makes this safe to run against 236 live questions.

CREATE TYPE "Language" AS ENUM ('EN', 'HI');

-- The language a paper was taken in, fixed at the moment it was opened so the
-- review afterwards reads the same as the exam did. Existing attempts default
-- to EN, which is what they were.
ALTER TABLE "participations" ADD COLUMN "language" "Language" NOT NULL DEFAULT 'EN';
ALTER TABLE "mock_attempts"  ADD COLUMN "language" "Language" NOT NULL DEFAULT 'EN';

-- Only what a reader sees. correctOption, subject, difficulty and marks stay
-- on questions, so a translation cannot change what is being asked.
CREATE TABLE "question_translations" (
  "id"              TEXT NOT NULL,
  "question_id"     TEXT NOT NULL,
  "language"        "Language" NOT NULL,
  "text"            TEXT NOT NULL,
  "option_a"        TEXT NOT NULL,
  "option_b"        TEXT NOT NULL,
  "option_c"        TEXT NOT NULL,
  "option_d"        TEXT NOT NULL,
  "solution"        TEXT,
  "structured_data" JSONB,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "question_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "question_translations_question_id_language_key"
  ON "question_translations"("question_id", "language");
CREATE INDEX "question_translations_language_idx" ON "question_translations"("language");

ALTER TABLE "question_translations"
  ADD CONSTRAINT "question_translations_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Passages translate independently: one typically serves several questions.
CREATE TABLE "passage_translations" (
  "id"         TEXT NOT NULL,
  "passage_id" TEXT NOT NULL,
  "language"   "Language" NOT NULL,
  "title"      TEXT NOT NULL DEFAULT '',
  "content"    TEXT NOT NULL,
  "table_data" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "passage_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passage_translations_passage_id_language_key"
  ON "passage_translations"("passage_id", "language");

ALTER TABLE "passage_translations"
  ADD CONSTRAINT "passage_translations_passage_id_fkey"
  FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
