-- ============================================================
-- CLEANUP DOUBLONS — A executer dans Supabase SQL Editor
-- ============================================================
-- ETAPE 1 : D'abord lancer en mode "apercu" (les SELECT)
-- ETAPE 2 : Si OK, lancer les DELETE/UPDATE (decommenter)
-- ============================================================

-- ============================================================
-- APERCU 1 : Clients en doublon (meme nom, case-insensitive)
-- ============================================================
SELECT
  LOWER(TRIM(name)) AS normalized_name,
  COUNT(*) AS nb_doublons,
  ARRAY_AGG(id ORDER BY "createdAt" ASC) AS ids,
  ARRAY_AGG(name ORDER BY "createdAt" ASC) AS names
FROM "Client"
GROUP BY LOWER(TRIM(name))
HAVING COUNT(*) > 1;

-- ============================================================
-- APERCU 2 : Bookings en doublon (meme googleEventId)
-- ============================================================
SELECT
  "googleEventId",
  COUNT(*) AS nb_doublons,
  ARRAY_AGG(id ORDER BY "createdAt" ASC) AS ids
FROM "Booking"
WHERE "googleEventId" IS NOT NULL
GROUP BY "googleEventId"
HAVING COUNT(*) > 1;

-- ============================================================
-- APERCU 3 : Blocks en doublon (meme googleEventId)
-- ============================================================
SELECT
  "googleEventId",
  COUNT(*) AS nb_doublons,
  ARRAY_AGG(id ORDER BY "createdAt" ASC) AS ids
FROM "Block"
WHERE "googleEventId" IS NOT NULL
GROUP BY "googleEventId"
HAVING COUNT(*) > 1;


-- ============================================================
-- CORRECTION 1 : Fusionner les clients doublons
-- Transfere les bookings + recurringBlocks vers le plus ancien
-- puis supprime les doublons
-- ============================================================
-- DECOMMENTER CI-DESSOUS APRES AVOIR VERIFIE LES APERCUS

/*
-- 1a. Transferer les bookings des doublons vers le client le plus ancien
UPDATE "Booking"
SET "clientId" = keeper.id
FROM (
  SELECT
    LOWER(TRIM(name)) AS norm,
    MIN(id) AS id
  FROM "Client"
  GROUP BY LOWER(TRIM(name))
) AS keeper
WHERE "Booking"."clientId" IN (
  SELECT c.id
  FROM "Client" c
  WHERE LOWER(TRIM(c.name)) = keeper.norm
    AND c.id != keeper.id
)
AND LOWER(TRIM((SELECT name FROM "Client" WHERE id = "Booking"."clientId"))) = keeper.norm;

-- 1b. Transferer les recurringBlocks
UPDATE "RecurringBlock"
SET "clientId" = keeper.id
FROM (
  SELECT
    LOWER(TRIM(name)) AS norm,
    MIN(id) AS id
  FROM "Client"
  GROUP BY LOWER(TRIM(name))
) AS keeper
WHERE "RecurringBlock"."clientId" IN (
  SELECT c.id
  FROM "Client" c
  WHERE LOWER(TRIM(c.name)) = keeper.norm
    AND c.id != keeper.id
)
AND "RecurringBlock"."clientId" IS NOT NULL
AND LOWER(TRIM((SELECT name FROM "Client" WHERE id = "RecurringBlock"."clientId"))) = keeper.norm;

-- 1c. Supprimer les clients doublons (garder le plus ancien par nom)
DELETE FROM "Client"
WHERE id NOT IN (
  SELECT MIN(id)
  FROM "Client"
  GROUP BY LOWER(TRIM(name))
);
*/


-- ============================================================
-- CORRECTION 2 : Supprimer les bookings doublons
-- Garde le plus ancien par googleEventId
-- ============================================================

/*
DELETE FROM "Booking"
WHERE "googleEventId" IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id)
    FROM "Booking"
    WHERE "googleEventId" IS NOT NULL
    GROUP BY "googleEventId"
  );
*/


-- ============================================================
-- CORRECTION 3 : Supprimer les blocks doublons
-- Garde le plus ancien par googleEventId
-- ============================================================

/*
DELETE FROM "Block"
WHERE "googleEventId" IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id)
    FROM "Block"
    WHERE "googleEventId" IS NOT NULL
    GROUP BY "googleEventId"
  );
*/


-- ============================================================
-- APRES CLEANUP : Ajouter les index uniques
-- (equivalent de prisma db push pour @unique)
-- ============================================================

/*
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_googleEventId_key" ON "Booking"("googleEventId");
CREATE UNIQUE INDEX IF NOT EXISTS "Block_googleEventId_key" ON "Block"("googleEventId");
*/
