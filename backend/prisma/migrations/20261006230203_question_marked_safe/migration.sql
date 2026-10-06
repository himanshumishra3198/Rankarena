-- An admin's "the key is right" decision on a flagged question: when, and by
-- whom. Written by hand: `migrate dev` also proposed dropping the trigram and
-- announced_at indexes and recreating foreign keys, because those come from
-- hand-written SQL in earlier migrations that the schema file does not model.

-- AlterTable
ALTER TABLE "questions" ADD COLUMN "marked_safe_at" TIMESTAMP(3),
ADD COLUMN "marked_safe_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_marked_safe_by_id_fkey" FOREIGN KEY ("marked_safe_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
