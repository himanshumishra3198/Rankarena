-- A rating per examination.
--
-- One global rating meant a candidate's CAT result moved the same number as
-- their SSC result, and one leaderboard ranked people who had sat different
-- exams against each other. The two ladders are not comparable, so they are
-- now separate rows.
--
-- Every rating that exists today was earned in an SSC CGL contest, because
-- that is the only exam the platform has run. The backfill says so
-- explicitly rather than relying on a column default — mislabelling these
-- would corrupt a ladder with real history in it, and a default is easy to
-- change later without noticing what it silently did here.

CREATE TABLE "user_ratings" (
    "user_id" TEXT NOT NULL,
    "exam" "Exam" NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1500,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ratings_pkey" PRIMARY KEY ("user_id","exam")
);

-- The leaderboard's only query: one exam, ordered by rating.
CREATE INDEX "user_ratings_exam_rating_idx" ON "user_ratings"("exam", "rating");

ALTER TABLE "user_ratings"
  ADD CONSTRAINT "user_ratings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing rating becomes that candidate's SSC CGL rating.
-- Includes candidates still on the default 1500 who have never sat a
-- contest, so that the leaderboard's population is unchanged by this
-- migration rather than quietly shrinking to only those who had played.
INSERT INTO "user_ratings" ("user_id", "exam", "rating", "updated_at")
SELECT "id", 'SSC_CGL', "rating", NOW() FROM "users";

-- Which exam each past rating change belonged to. Taken from the contest it
-- came from, not assumed: a CAT contest settled before this migration ran
-- would otherwise be filed under SSC for ever.
ALTER TABLE "rating_history" ADD COLUMN "exam" "Exam" NOT NULL DEFAULT 'SSC_CGL';

UPDATE "rating_history" rh
   SET "exam" = c."exam"
  FROM "contests" c
 WHERE c."id" = rh."contest_id"
   AND c."exam" <> rh."exam";

CREATE INDEX "rating_history_user_id_exam_idx" ON "rating_history"("user_id", "exam");
