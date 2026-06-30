-- Casino security follow-up: reservation status, history RLS, chest RLS.
-- Run in Supabase SQL Editor after migration_casino_security.sql.

ALTER TABLE chest_reservations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'reserved'
  CHECK (status IN ('reserved', 'pending_collect', 'collected', 'restored'));

UPDATE chest_reservations SET status = 'reserved' WHERE status IS NULL;

DROP POLICY IF EXISTS "Slots players can insert game history" ON slots_game_history;
DROP POLICY IF EXISTS "Roulette players can insert game history" ON roulette_game_history;
DROP POLICY IF EXISTS "Coinflip rounds insert" ON coinflip_rounds;

ALTER TABLE chest_opens_available ENABLE ROW LEVEL SECURITY;
ALTER TABLE chest_purchase_txs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chest_reservations ENABLE ROW LEVEL SECURITY;
