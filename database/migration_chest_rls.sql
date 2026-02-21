-- Migration: Enable Row Level Security on chest tables
-- Fixes UNRESTRICTED warnings - tables are accessed via API (service role bypasses RLS)

ALTER TABLE chest_opens_available ENABLE ROW LEVEL SECURITY;
ALTER TABLE chest_purchase_txs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chest_reservations ENABLE ROW LEVEL SECURITY;

-- No permissive policies = anon/authenticated clients cannot access
-- Service role (API) bypasses RLS and continues to work
