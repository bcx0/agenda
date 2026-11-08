-- Copie des tables sauvegardées, relevée sur la base de production le
-- 08/11/2026 (information_schema). Sert UNIQUEMENT au test de restauration
-- (tests/backup.test.mjs) : les migrations du dépôt ne permettent plus de
-- reconstruire la base depuis zéro (dérive de schéma, cf. rapport).
CREATE TYPE "AvailabilityOverrideType" AS ENUM ('BLOCK', 'OPEN');

CREATE TABLE "Client" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "creditsPerMonth" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Settings" (
  "id" INTEGER PRIMARY KEY DEFAULT 1,
  "location" TEXT NOT NULL DEFAULT 'MIAMI',
  "presentielLocation" TEXT NOT NULL DEFAULT 'Vander Valk',
  "presentielNote" TEXT,
  "defaultMode" TEXT NOT NULL DEFAULT 'VISIO',
  "updatedAt" TIMESTAMP NOT NULL,
  "bookingLocked" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE "session_modes" (
  "id" SERIAL PRIMARY KEY,
  "startDate" TIMESTAMP NOT NULL,
  "endDate" TIMESTAMP NOT NULL,
  "mode" TEXT NOT NULL,
  "location" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Admin" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AvailabilityRule" (
  "id" SERIAL PRIMARY KEY,
  "dayOfWeek" INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "location" TEXT NOT NULL DEFAULT 'MIAMI'
);
CREATE TABLE "LocationPeriod" (
  "id" SERIAL PRIMARY KEY,
  "startDate" TIMESTAMP NOT NULL,
  "endDate" TIMESTAMP NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AvailabilityOverride" (
  "id" SERIAL PRIMARY KEY,
  "date" TIMESTAMP NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "type" "AvailabilityOverrideType" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "RecurringBlock" (
  "id" SERIAL PRIMARY KEY,
  "dayOfWeek" INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "clientId" INTEGER REFERENCES "Client"("id"),
  "note" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "timeZone" TEXT
);
CREATE TABLE "Block" (
  "id" SERIAL PRIMARY KEY,
  "startAt" TIMESTAMP NOT NULL,
  "endAt" TIMESTAMP NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "googleEventId" TEXT UNIQUE,
  "googleEtag" TEXT,
  "syncStatus" TEXT NOT NULL DEFAULT 'pending',
  "syncSource" TEXT NOT NULL DEFAULT 'app',
  "lastSyncedAt" TIMESTAMP
);
CREATE TABLE "Booking" (
  "id" SERIAL PRIMARY KEY,
  "clientId" INTEGER NOT NULL REFERENCES "Client"("id"),
  "startAt" TIMESTAMP NOT NULL,
  "endAt" TIMESTAMP NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "mode" TEXT NOT NULL DEFAULT 'VISIO',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "manageToken" TEXT UNIQUE,
  "updatedAt" TIMESTAMP NOT NULL,
  "manageTokenExpiresAt" TIMESTAMP,
  "cancelReason" TEXT,
  "rescheduleReason" TEXT,
  "timeZone" TEXT NOT NULL DEFAULT 'Europe/Brussels',
  "googleEventId" TEXT UNIQUE,
  "googleEtag" TEXT,
  "syncStatus" TEXT NOT NULL DEFAULT 'pending',
  "syncSource" TEXT NOT NULL DEFAULT 'app',
  "lastSyncedAt" TIMESTAMP,
  "booked_by" TEXT NOT NULL DEFAULT 'client'
);
CREATE TABLE "Prospect" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "desiredAt" TIMESTAMP,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
