-- Performance indexes for common admin queries
-- These are additive (CREATE INDEX IF NOT EXISTS) and won't break anything.

-- Booking: most admin pages filter by (status, startAt)
CREATE INDEX IF NOT EXISTS "Booking_status_startAt_idx" ON "Booking"("status", "startAt");

-- SyncLog: settings page queries (table, action, createdAt) for reauth badge
CREATE INDEX IF NOT EXISTS "SyncLog_table_action_createdAt_idx" ON "SyncLog"("table", "action", "createdAt");
