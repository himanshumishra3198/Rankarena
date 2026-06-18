-- Enable trigram similarity for near-duplicate detection
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable: add fingerprint for exact-duplicate detection
ALTER TABLE "questions" ADD COLUMN "fingerprint" TEXT;

-- Index for fast exact-duplicate lookup
CREATE INDEX "questions_fingerprint_idx" ON "questions"("fingerprint");

-- GIN trigram index for fast similarity() search on question text
CREATE INDEX "questions_text_trgm_idx" ON "questions" USING gin ("text" gin_trgm_ops);
