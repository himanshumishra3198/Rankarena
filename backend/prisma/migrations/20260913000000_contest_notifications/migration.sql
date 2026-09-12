-- Contest announcements and start reminders.

-- Opt-out. Defaults on: someone who registered for a contest expects to hear
-- about it, and every such email carries a one-click unsubscribe.
ALTER TABLE "users" ADD COLUMN "contest_emails" BOOLEAN NOT NULL DEFAULT true;

-- Null means "not announced yet", which is what the sweep looks for. A crash
-- halfway through a send is picked up next pass rather than lost or repeated.
ALTER TABLE "contests" ADD COLUMN "announced_at" TIMESTAMP(3);

-- What a contest notification points at.
ALTER TABLE "notifications" ADD COLUMN "contest_id" TEXT;
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_contest_id_fkey"
  FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTEST_ANNOUNCED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTEST_STARTING';

-- Make the existing constraint stop swallowing contest notifications.
--
-- notifications_unique_target is UNIQUE on
-- (user_id, actor_id, type, article_id, comment_id) NULLS NOT DISTINCT.
-- A contest notification has null actor, article and comment, so under
-- NULLS NOT DISTINCT that key collapses to (user_id, type) -- one
-- CONTEST_ANNOUNCED per user, ever. The first contest announced would mail
-- everyone; every contest after it would insert nothing. And because the
-- writes go through createMany({ skipDuplicates: true }), the collisions are
-- silent: the sweep reports success, stamps announced_at, and the
-- announcement is lost with no error anywhere.
--
-- That index exists to dedupe social notifications, which is worth keeping --
-- lib/notify.ts leans on it. It is narrowed to the rows it was written for.
DROP INDEX "notifications_unique_target";
CREATE UNIQUE INDEX "notifications_unique_target"
  ON "notifications" ("user_id", "actor_id", "type", "article_id", "comment_id")
  NULLS NOT DISTINCT
  WHERE "contest_id" IS NULL;

-- The idempotency guarantee for contest notifications.
--
-- One row per user per contest per type, enforced by the database, no matter
-- how many workers run the sweep at once or how often it restarts. Email
-- follows the row, so "already notified" and "already emailed" cannot drift
-- apart. Prisma's schema language cannot express a partial index, so both of
-- these live here rather than in schema.prisma.
CREATE UNIQUE INDEX "notifications_user_type_contest_key"
  ON "notifications" ("user_id", "type", "contest_id")
  WHERE "contest_id" IS NOT NULL;

CREATE INDEX "contests_announced_at_idx" ON "contests" ("announced_at");
