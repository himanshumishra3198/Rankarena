-- CreateTable mock_tests
CREATE TABLE "mock_tests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" "Subject" NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "negative_marks" DECIMAL(65,30) NOT NULL DEFAULT 0.5,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mock_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable mock_test_questions
CREATE TABLE "mock_test_questions" (
    "mock_test_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "marks" DECIMAL(65,30) NOT NULL DEFAULT 2,
    "negative_marks" DECIMAL(65,30) NOT NULL DEFAULT 0.5,
    CONSTRAINT "mock_test_questions_pkey" PRIMARY KEY ("mock_test_id", "question_id")
);

-- CreateTable mock_attempts
CREATE TABLE "mock_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mock_test_id" TEXT NOT NULL,
    "score" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total_marks" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "wrong_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "answers" JSONB,
    "time_spent" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    CONSTRAINT "mock_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mock_attempts_user_id_mock_test_id_key" ON "mock_attempts"("user_id", "mock_test_id");

-- AddForeignKey
ALTER TABLE "mock_test_questions" ADD CONSTRAINT "mock_test_questions_mock_test_id_fkey"
    FOREIGN KEY ("mock_test_id") REFERENCES "mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mock_test_questions" ADD CONSTRAINT "mock_test_questions_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mock_attempts" ADD CONSTRAINT "mock_attempts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mock_attempts" ADD CONSTRAINT "mock_attempts_mock_test_id_fkey"
    FOREIGN KEY ("mock_test_id") REFERENCES "mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
