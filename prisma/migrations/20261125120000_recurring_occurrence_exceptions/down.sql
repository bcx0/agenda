-- Retour arrière de migration.sql (même dossier). À n'exécuter qu'APRÈS être
-- revenu à la version précédente du code (sinon l'app lit des colonnes
-- absentes).
--
-- ⚠️ Supprime les exceptions d'occurrence saisies depuis la migration (table
-- RecurringBlockException) : les créneaux libérés ou déplacés redeviennent
-- bloqués comme avant le correctif. Exporter la table au préalable si besoin :
--   COPY (SELECT * FROM "RecurringBlockException") TO STDOUT WITH CSV HEADER;
-- Aucune réservation, aucun client, aucun réglage n'est touché.

BEGIN;
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_recurringBlockId_fkey";
DROP INDEX IF EXISTS "Booking_recurringBlockId_occurrenceDate_idx";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "occurrenceDate";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "recurringBlockId";
DROP TABLE IF EXISTS "RecurringBlockException";
ALTER TABLE "RecurringBlock" DROP CONSTRAINT IF EXISTS recurring_block_period_valid;
ALTER TABLE "RecurringBlock" DROP COLUMN IF EXISTS "endDate";
ALTER TABLE "RecurringBlock" DROP COLUMN IF EXISTS "startDate";
COMMIT;
