-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('STANDARD', 'SYLLOGISM', 'PASSAGE', 'TABLE');
CREATE TYPE "PassageType" AS ENUM ('TEXT', 'TABLE');

-- CreateTable passages
CREATE TABLE "passages" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "type" "PassageType" NOT NULL DEFAULT 'TEXT',
    "table_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "passages_pkey" PRIMARY KEY ("id")
);

-- AlterTable questions
ALTER TABLE "questions"
    ADD COLUMN "question_type" "QuestionType" NOT NULL DEFAULT 'STANDARD',
    ADD COLUMN "passage_id" TEXT,
    ADD COLUMN "structured_data" JSONB;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_passage_id_fkey"
    FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
