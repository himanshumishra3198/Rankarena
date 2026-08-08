-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FOLLOW', 'ARTICLE_VOTE', 'COMMENT_VOTE', 'ANNOUNCEMENT');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "actor_id" TEXT,
    "article_id" TEXT,
    "comment_id" TEXT,
    "vote_value" INTEGER,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- One notification per actor per target: re-voting updates it rather than
-- creating a duplicate. NULLS NOT DISTINCT so the null target columns still
-- collide (Postgres 15+ treats NULLs as distinct in unique indexes otherwise).
CREATE UNIQUE INDEX "notifications_unique_target"
    ON "notifications"("user_id", "actor_id", "type", "article_id", "comment_id")
    NULLS NOT DISTINCT;

CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
