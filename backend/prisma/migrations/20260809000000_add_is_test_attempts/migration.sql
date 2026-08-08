-- Marks attempts made by admins while testing. Excluded from leaderboards,
-- ratings, ranks, percentiles and public counts.
ALTER TABLE "participations" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mock_attempts"  ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;

-- Every aggregate filters on is_test = false, usually alongside the contest or
-- mock id, so index the pair rather than the flag alone.
CREATE INDEX "participations_contest_id_is_test_idx" ON "participations"("contest_id", "is_test");
CREATE INDEX "mock_attempts_mock_test_id_is_test_idx" ON "mock_attempts"("mock_test_id", "is_test");

-- Backfill: any existing attempt by a current admin was almost certainly a
-- test run, so retire it from the public numbers.
UPDATE "participations" p SET "is_test" = true
  FROM "users" u WHERE u.id = p."user_id" AND u.role = 'ADMIN';
UPDATE "mock_attempts" m SET "is_test" = true
  FROM "users" u WHERE u.id = m."user_id" AND u.role = 'ADMIN';
