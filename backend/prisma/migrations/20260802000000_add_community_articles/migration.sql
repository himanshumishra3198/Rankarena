-- CreateEnum
CREATE TYPE "ArticleType" AS ENUM ('GENERAL', 'ANNOUNCEMENT', 'TECHNIQUE', 'EDITORIAL');

-- CreateTable articles
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "ArticleType" NOT NULL DEFAULT 'GENERAL',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable article_comments
CREATE TABLE "article_comments" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "body" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "article_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable article_votes
CREATE TABLE "article_votes" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable comment_votes
CREATE TABLE "comment_votes" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comment_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "articles_created_at_idx" ON "articles"("created_at");
CREATE INDEX "articles_score_idx" ON "articles"("score");
CREATE INDEX "articles_author_id_idx" ON "articles"("author_id");
CREATE INDEX "article_comments_article_id_idx" ON "article_comments"("article_id");
CREATE INDEX "article_comments_parent_id_idx" ON "article_comments"("parent_id");
CREATE UNIQUE INDEX "article_votes_article_id_user_id_key" ON "article_votes"("article_id", "user_id");
CREATE INDEX "article_votes_article_id_idx" ON "article_votes"("article_id");
CREATE UNIQUE INDEX "comment_votes_comment_id_user_id_key" ON "comment_votes"("comment_id", "user_id");
CREATE INDEX "comment_votes_comment_id_idx" ON "comment_votes"("comment_id");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_article_id_fkey"
    FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "article_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "article_votes" ADD CONSTRAINT "article_votes_article_id_fkey"
    FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "article_votes" ADD CONSTRAINT "article_votes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_fkey"
    FOREIGN KEY ("comment_id") REFERENCES "article_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
