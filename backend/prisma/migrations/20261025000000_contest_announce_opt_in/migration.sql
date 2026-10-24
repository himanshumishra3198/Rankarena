-- Announcing a contest by email becomes a deliberate act.
--
-- Every contest created was broadcast to every verified account that had not
-- opted out — around thirty inboxes — including the ones made to try
-- something out. The flag is off by default so a test contest is silent, and
-- an announcement has to be asked for.
--
-- Safe to default to false: no contest is currently awaiting an announcement
-- (every row either has announced_at set or has already ended), so this
-- suppresses nothing that was going to be sent.
ALTER TABLE "contests"
  ADD COLUMN "announce_by_email" BOOLEAN NOT NULL DEFAULT false;

-- Contests already announced are recorded as such, so that turning the flag
-- on for an old contest cannot re-broadcast it. The sweep keys on
-- announced_at as well, but saying it here keeps the two columns telling the
-- same story.
UPDATE "contests" SET "announce_by_email" = true WHERE "announced_at" IS NOT NULL;
