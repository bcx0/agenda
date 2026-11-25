-- ─────────────────────────────────────────────────────────────────────────────
-- Exceptions d'occurrence pour les RDV réguliers — 25/11/2026.
-- ⚠️ PAS ENCORE APPLIQUÉE. Même convention que 20260704180000 et
-- 20260824200000 : à exécuter sur Supabase (SQL editor) AVANT de déployer le
-- code qui l'utilise, puis à garder pour la parité du dépôt.
--
-- NON DESTRUCTIVE : uniquement des colonnes NULLables, une nouvelle table et
-- des index. Aucune ligne supprimée, aucune valeur existante modifiée, sauf le
-- remplissage (bloc 5) des deux NOUVELLES colonnes de liaison de Booking.
-- Idempotente (rejouable sans effet). Retour arrière : down.sql (même dossier).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Période de validité d'une série (dates dans le fuseau de la série,
--    bornes incluses, NULL = sans limite). Les séries existantes restent
--    illimitées : comportement inchangé.
ALTER TABLE "RecurringBlock" ADD COLUMN IF NOT EXISTS "startDate" DATE;
ALTER TABLE "RecurringBlock" ADD COLUMN IF NOT EXISTS "endDate" DATE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_block_period_valid') THEN
    ALTER TABLE "RecurringBlock"
      ADD CONSTRAINT recurring_block_period_valid
      CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate");
  END IF;
END $$;

-- 2. Exceptions sur une occurrence précise (SKIP = libérée, MOVE = déplacée).
CREATE TABLE IF NOT EXISTS "RecurringBlockException" (
  "id" SERIAL PRIMARY KEY,
  "recurringBlockId" INTEGER NOT NULL
    REFERENCES "RecurringBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "occurrenceDate" DATE NOT NULL,
  "type" TEXT NOT NULL,
  "newStartAt" TIMESTAMP(3),
  "newEndAt" TIMESTAMP(3),
  "bookingId" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT recurring_exception_type_valid CHECK ("type" IN ('SKIP', 'MOVE')),
  CONSTRAINT recurring_exception_move_valid CHECK (
    "type" = 'SKIP'
    OR ("newStartAt" IS NOT NULL AND "newEndAt" IS NOT NULL AND "newEndAt" > "newStartAt")
  )
);
-- Une seule exception par occurrence : les écritures sont des upserts
-- idempotents (double-clic, requête rejouée, deux onglets).
CREATE UNIQUE INDEX IF NOT EXISTS "RecurringBlockException_recurringBlockId_occurrenceDate_key"
  ON "RecurringBlockException" ("recurringBlockId", "occurrenceDate");
CREATE INDEX IF NOT EXISTS "RecurringBlockException_newStartAt_idx"
  ON "RecurringBlockException" ("newStartAt");

-- RLS : comme toutes les tables (20260704180000). L'app passe par Prisma
-- (connexion directe, non affectée) ; sans policy, l'API REST Supabase avec la
-- clé anon ne voit rien.
ALTER TABLE public."RecurringBlockException" ENABLE ROW LEVEL SECURITY;

-- 3. Lien réservation → série + date d'origine de l'occurrence.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "recurringBlockId" INTEGER;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "occurrenceDate" DATE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Booking_recurringBlockId_fkey') THEN
    ALTER TABLE "Booking"
      ADD CONSTRAINT "Booking_recurringBlockId_fkey"
      FOREIGN KEY ("recurringBlockId") REFERENCES "RecurringBlock"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Booking_recurringBlockId_occurrenceDate_idx"
  ON "Booking" ("recurringBlockId", "occurrenceDate");

-- 4. (rien à faire pour les séries sans client : elles continuent de bloquer
--    chaque semaine tant qu'aucune exception n'est posée.)

-- 5. Remplissage SÛR des liens : uniquement les réservations CONFIRMÉES créées
--    par une série admin ([ADMIN_BLOCK]) qui tombent EXACTEMENT sur le motif
--    d'UNE seule série du même client (jour + heures dans le fuseau de la
--    série). Pour ces lignes, la disponibilité affichée ne change pas (la
--    réservation bloquait déjà le créneau) ; le lien permet seulement de
--    libérer automatiquement l'ancien créneau si ce RDV est déplacé ou
--    annulé plus tard. Les cas ambigus (RDV déjà déplacés, deux séries
--    candidates) sont laissés à scripts/reconcile-recurring-ghosts.mjs, qui
--    les liste et n'agit qu'après validation.
WITH candidates AS (
  SELECT
    b.id AS booking_id,
    rb.id AS block_id,
    (b."startAt" AT TIME ZONE 'UTC' AT TIME ZONE COALESCE(rb."timeZone", 'Europe/Brussels'))::date AS occ_date
  FROM "Booking" b
  JOIN "RecurringBlock" rb ON rb."clientId" = b."clientId"
  WHERE b."recurringBlockId" IS NULL
    AND b.status = 'CONFIRMED'
    AND left(COALESCE(b."rescheduleReason", ''), 13) = '[ADMIN_BLOCK]'
    AND EXTRACT(ISODOW FROM (b."startAt" AT TIME ZONE 'UTC' AT TIME ZONE COALESCE(rb."timeZone", 'Europe/Brussels'))) = rb."dayOfWeek"
    AND to_char(b."startAt" AT TIME ZONE 'UTC' AT TIME ZONE COALESCE(rb."timeZone", 'Europe/Brussels'), 'HH24:MI') = rb."startTime"
    AND to_char(b."endAt" AT TIME ZONE 'UTC' AT TIME ZONE COALESCE(rb."timeZone", 'Europe/Brussels'), 'HH24:MI') = rb."endTime"
),
unique_candidates AS (
  SELECT booking_id, min(block_id) AS block_id, min(occ_date) AS occ_date
  FROM candidates
  GROUP BY booking_id
  HAVING count(*) = 1
)
UPDATE "Booking" b
SET "recurringBlockId" = u.block_id,
    "occurrenceDate" = u.occ_date
FROM unique_candidates u
WHERE b.id = u.booking_id
  AND b."recurringBlockId" IS NULL;

COMMIT;
