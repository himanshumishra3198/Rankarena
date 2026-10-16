-- CAT examination support.
--
-- Everything here is additive. The platform's existing rows are all SSC CGL
-- and all single-choice, and every new column either has a default that says
-- so or is nullable, so no existing question, paper, attempt or rating is
-- rewritten or re-scored by this migration.

-- Which examination a question, mock test or contest belongs to.
CREATE TYPE "Exam" AS ENUM ('SSC_CGL', 'CAT');

-- The facet a tag describes, so a difficulty tag is never offered in the
-- topic picker.
CREATE TYPE "TagCategory" AS ENUM ('TOPIC', 'SUBTOPIC', 'DIFFICULTY', 'SKILL', 'QUESTION_TYPE', 'CUSTOM');

-- CAT's two answer formats. MSQ has several correct options; TITA has none at
-- all and the candidate types the answer.
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'MSQ';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'TITA';

-- CAT's three sections, alongside SSC CGL's four. One enum for both exams:
-- which members are legal is decided per exam in src/lib/exams.ts.
ALTER TYPE "Subject" ADD VALUE IF NOT EXISTS 'VARC';
ALTER TYPE "Subject" ADD VALUE IF NOT EXISTS 'DILR';
ALTER TYPE "Subject" ADD VALUE IF NOT EXISTS 'QA';

-- Existing questions are SSC CGL, which the default backfills in place.
ALTER TABLE "questions" ADD COLUMN "exam" "Exam" NOT NULL DEFAULT 'SSC_CGL';

-- The answer key for the formats that do not fit in a single letter:
--   MSQ  { correct: ["A","C"], partial: false }
--   TITA { kind: "NUMERIC" | "TEXT", accepted: ["12"], tolerance: 0.01 }
-- Null for single-choice questions, which keep using "correct_option".
ALTER TABLE "questions" ADD COLUMN "answer_config" JSONB;

-- TITA questions have no options. The columns stay NOT NULL so that every
-- query and translation already written against them keeps working; they just
-- default to empty now instead of requiring four strings nobody will read.
ALTER TABLE "questions" ALTER COLUMN "option_a" SET DEFAULT '';
ALTER TABLE "questions" ALTER COLUMN "option_b" SET DEFAULT '';
ALTER TABLE "questions" ALTER COLUMN "option_c" SET DEFAULT '';
ALTER TABLE "questions" ALTER COLUMN "option_d" SET DEFAULT '';

-- MSQ and TITA have no single correct letter. Dropping NOT NULL rather than
-- storing something like 'A,C' here is deliberate: every comparison already
-- written against this column reads it as one option, and a joined string
-- would silently compare unequal to everything instead of failing loudly.
ALTER TABLE "questions" ALTER COLUMN "correct_option" DROP NOT NULL;

ALTER TABLE "mock_tests" ADD COLUMN "exam" "Exam" NOT NULL DEFAULT 'SSC_CGL';
ALTER TABLE "contests" ADD COLUMN "exam" "Exam" NOT NULL DEFAULT 'SSC_CGL';

-- A reusable label for a question, replacing the free-text topic string.
-- Normalized so that renaming a topic is an UPDATE of one row rather than a
-- data migration, and "every question tagged X" is an index lookup.
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "TagCategory" NOT NULL DEFAULT 'TOPIC',
    -- Null means the tag applies to any examination.
    "exam" "Exam",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "question_tags" (
    "question_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "question_tags_pkey" PRIMARY KEY ("question_id","tag_id")
);

CREATE INDEX "tags_exam_category_active_idx" ON "tags"("exam", "category", "active");

-- The identity used to dedupe on import, so "Time & Work" cannot be created
-- twice within a category.
CREATE UNIQUE INDEX "tags_category_slug_key" ON "tags"("category", "slug");

CREATE INDEX "question_tags_tag_id_idx" ON "question_tags"("tag_id");

-- The question bank's main filter: one exam's questions, by section.
CREATE INDEX "questions_exam_subject_idx" ON "questions"("exam", "subject");

ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
