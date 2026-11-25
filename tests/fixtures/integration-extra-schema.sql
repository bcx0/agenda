-- Tables et contraintes de production absentes de backup-schema.sql, pour les
-- tests d'intégration (tests/schedule-integration.test.mjs). Reprend
-- prisma/schema.prisma et les migrations 20260704180000 / 20260824200000.
CREATE TABLE "SyncLog" (
  "id" SERIAL PRIMARY KEY,
  "table" TEXT NOT NULL,
  "recordId" INTEGER,
  "action" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "GoogleToken" (
  "id" SERIAL PRIMARY KEY,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "googleEmail" TEXT,
  "syncToken" TEXT,
  "backupRefreshToken" TEXT,
  "backupUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "GoogleCalendarWatch" (
  "id" SERIAL PRIMARY KEY,
  "channelId" TEXT NOT NULL UNIQUE,
  "resourceId" TEXT NOT NULL,
  "expiration" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "renewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "EmailLog" (
  "id" SERIAL PRIMARY KEY,
  "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_confirmed_client_slot_unique
  ON "Booking" ("startAt") WHERE status = 'CONFIRMED' AND booked_by = 'client';
ALTER TABLE "Booking" ADD CONSTRAINT booking_end_after_start CHECK ("endAt" > "startAt");
ALTER TABLE "Block" ADD CONSTRAINT block_end_after_start CHECK ("endAt" > "startAt");
