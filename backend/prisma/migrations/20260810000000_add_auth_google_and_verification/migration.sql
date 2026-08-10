-- Google sign-in + email verification + password reset.

CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');

-- A Google account has no password of ours.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

ALTER TABLE "users"
  ADD COLUMN "google_id"      TEXT,
  ADD COLUMN "avatar_url"     TEXT,
  ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- Everyone who signed up before verification existed keeps full access.
-- Without this they would silently lose the ability to join a contest.
UPDATE "users" SET "email_verified" = true;

CREATE TABLE "auth_tokens" (
  "id"         TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "type"       "AuthTokenType" NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

ALTER TABLE "auth_tokens"
  ADD CONSTRAINT "auth_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
