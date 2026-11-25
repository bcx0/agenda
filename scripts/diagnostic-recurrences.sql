-- ─────────────────────────────────────────────────────────────────────────────
-- Diagnostic EN LECTURE SEULE des RDV réguliers (cas « All-in », 25/11/2026).
-- Fonctionne AVANT et APRÈS la migration 20261125120000. Ne modifie rien.
-- Supabase → SQL editor → coller → Run. Paramètre : le motif de recherche
-- ci-dessous (insensible à la casse), rien n'est codé en dur ailleurs.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN READ ONLY;

-- 1. Séries récurrentes : jour, heures (fuseau de la série), client, note.
SELECT rb.id, rb."dayOfWeek", rb."startTime", rb."endTime", rb."timeZone",
       rb."clientId", c.name AS client, rb.note, rb."createdAt"
FROM "RecurringBlock" rb
LEFT JOIN "Client" c ON c.id = rb."clientId"
ORDER BY rb.id;

-- 2. Réservations du client / de la série recherchée autour des dates
--    signalées, avec l'heure de Bruxelles et de Miami.
WITH params AS (SELECT '%all%in%'::text AS motif)
SELECT b.id, c.name AS client, b.status, b.booked_by,
       to_char(b."startAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Brussels', 'Dy DD/MM/YYYY HH24:MI') AS bruxelles,
       to_char(b."startAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York', 'HH24:MI') AS miami,
       b."rescheduleReason", b."cancelReason", b."googleEventId", b."syncStatus", b."updatedAt"
FROM "Booking" b
JOIN "Client" c ON c.id = b."clientId"
CROSS JOIN params p
WHERE (c.name ILIKE p.motif OR b."rescheduleReason" ILIKE p.motif)
  AND b."startAt" >= now() - interval '7 days'
ORDER BY b."startAt"
LIMIT 200;

-- 3. Blocs importés de Google / manuels correspondant au motif.
WITH params AS (SELECT '%all%in%'::text AS motif)
SELECT bl.id, bl.reason,
       to_char(bl."startAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Brussels', 'Dy DD/MM/YYYY HH24:MI') AS bruxelles,
       bl."syncSource", bl."googleEventId"
FROM "Block" bl CROSS JOIN params p
WHERE bl.reason ILIKE p.motif AND bl."endAt" >= now()
ORDER BY bl."startAt";

-- 4. Ouvertures « Ajouter un créneau » (exceptions OPEN) et blocages
--    manuels à venir : les tentatives de Geoffrey apparaissent ici.
SELECT o.id, o.type,
       to_char(o.date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Brussels', 'Dy DD/MM/YYYY') AS jour,
       o."startTime", o."endTime", o.note, o."createdAt"
FROM "AvailabilityOverride" o
WHERE o.date >= now() - interval '1 day'
ORDER BY o.date, o."startTime";

-- 5. Historique de synchronisation des réservations du motif (déplacements
--    poussés vers / reçus de Google).
WITH params AS (SELECT '%all%in%'::text AS motif)
SELECT s."createdAt", s."table", s."recordId", s.action, s.direction, s.details
FROM "SyncLog" s
WHERE s."table" = 'Booking'
  AND s."recordId" IN (
    SELECT b.id FROM "Booking" b JOIN "Client" c ON c.id = b."clientId", params p
    WHERE c.name ILIKE p.motif
  )
ORDER BY s."createdAt" DESC
LIMIT 100;

ROLLBACK;
