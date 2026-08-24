-- ─────────────────────────────────────────────────────────────────────────────
-- Fiabilisation agenda — 24/08/2026. ⚠️ PAS ENCORE APPLIQUÉE.
-- À exécuter sur Supabase (SQL editor ou MCP), puis à garder pour la parité du
-- repo — même convention que 20260704180000 (le projet utilise `prisma db
-- push`, pas `migrate deploy`). Chaque bloc est idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. ROOT CAUSE du bug « 13h jamais disponible quand je suis en Belgique » :
--    cinq blocs récurrents lun→ven 13:00-14:00 (note "Bloc 15h Brussels -
--    supprimé par Geoffrey", créés le 31/03/2026, ids 24-28 en prod). Écrits
--    avec des heures UTC (13:00 UTC = 15:00 Bruxelles en été) alors que le
--    moteur de disponibilité lit ces heures comme de l'heure de Bruxelles →
--    ils bloquaient 13:00-14:00 Bruxelles chaque jour ouvré. En période Miami
--    (créneaux 15h-22h Bruxelles), aucun créneau 13h n'existe → invisible ;
--    en période Belgique (09h-19h) → « le 13h n'est jamais disponible ».
DELETE FROM "RecurringBlock"
WHERE note LIKE 'Bloc 15h Brussels%';

-- 2. Convention explicite : les blocs récurrents sans fuseau sont en heure de
--    Bruxelles. Le code applique désormais ce défaut (lib/recurring.mjs) ;
--    on fige la donnée pour lever toute ambiguïté future.
UPDATE "RecurringBlock"
SET "timeZone" = 'Europe/Brussels'
WHERE "timeZone" IS NULL;

-- 3. Intégrité : une réservation / un bloc ne peut pas finir avant de
--    commencer. Le code le refuse désormais aussi (lib/booking.ts,
--    checkSlotAvailability) ; la contrainte ferme la porte aux autres chemins
--    d'écriture. Vérifié le 24/08 : 0 ligne existante en violation.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_end_after_start') THEN
    ALTER TABLE "Booking" ADD CONSTRAINT booking_end_after_start CHECK ("endAt" > "startAt");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'block_end_after_start') THEN
    ALTER TABLE "Block" ADD CONSTRAINT block_end_after_start CHECK ("endAt" > "startAt");
  END IF;
END $$;

-- 4. Lint sécurité Supabase (advisor "function_search_path_mutable") :
--    search_path fixe pour la fonction trigger.
ALTER FUNCTION public.set_updated_at() SET search_path = public;
