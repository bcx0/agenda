-- ─────────────────────────────────────────────────────────────────────────────
-- Appliquée directement sur Supabase le 04/07/2026 (via MCP).
-- Ce fichier existe pour la parité du repo (le projet utilise `prisma db push`,
-- pas `prisma migrate deploy`). Les deux blocs sont idempotents.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Anti double-booking : deux réservations CLIENT confirmées ne peuvent pas
--    partager le même créneau. Les imports Google et créations admin ne sont
--    pas contraints (chevauchements légitimes côté coach).
CREATE UNIQUE INDEX IF NOT EXISTS booking_confirmed_client_slot_unique
ON "Booking" ("startAt")
WHERE status = 'CONFIRMED' AND booked_by = 'client';

-- 2. RLS sur toutes les tables. L'app passe par Prisma (connexion directe,
--    non affectée). Sans policy, RLS bloque tout accès via l'API REST
--    Supabase avec la clé anon — qui exposait sinon toutes les données.
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Block" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EmailLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Admin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AvailabilityRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AvailabilityOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RecurringBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GoogleToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GoogleCalendarWatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SyncLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LocationPeriod" ENABLE ROW LEVEL SECURITY;
