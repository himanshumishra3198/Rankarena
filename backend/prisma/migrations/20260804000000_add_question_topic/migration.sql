-- Optional syllabus topic per question. Nullable: existing questions stay
-- untagged, and tagging remains optional for new ones.
ALTER TABLE "questions" ADD COLUMN "topic" TEXT;

-- Supports filtering the question bank by topic, on its own or with subject.
CREATE INDEX "questions_subject_topic_idx" ON "questions"("subject", "topic");
