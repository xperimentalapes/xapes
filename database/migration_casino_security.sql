-- Casino security: purchase dedup, payout tracking, lock down permissive RLS on player tables.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS game_purchase_txs (
  tx_signature TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('slots', 'roulette', 'coinflip')),
  credits_granted INTEGER NOT NULL CHECK (credits_granted > 0),
  cost_per_unit_raw BIGINT NOT NULL CHECK (cost_per_unit_raw > 0),
  amount_raw BIGINT NOT NULL CHECK (amount_raw > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_purchase_txs_wallet ON game_purchase_txs (wallet_address);

CREATE TABLE IF NOT EXISTS casino_pending_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('slots', 'roulette', 'coinflip')),
  amount_raw BIGINT NOT NULL CHECK (amount_raw > 0),
  status TEXT NOT NULL DEFAULT 'signed' CHECK (status IN ('signed', 'confirmed', 'failed', 'restored')),
  tx_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_casino_pending_payouts_wallet ON casino_pending_payouts (wallet_address);
CREATE INDEX IF NOT EXISTS idx_casino_pending_payouts_status ON casino_pending_payouts (status);

ALTER TABLE game_purchase_txs ENABLE ROW LEVEL SECURITY;
ALTER TABLE casino_pending_payouts ENABLE ROW LEVEL SECURITY;
-- No anon policies: service role only.

-- Remove permissive write policies on casino player tables (API uses service key).
DROP POLICY IF EXISTS "Slots players can insert" ON slots_players;
DROP POLICY IF EXISTS "Slots players can update" ON slots_players;
DROP POLICY IF EXISTS "Roulette players can insert" ON roulette_players;
DROP POLICY IF EXISTS "Roulette players can update" ON roulette_players;
DROP POLICY IF EXISTS "Coinflip players insert" ON coinflip_players;
DROP POLICY IF EXISTS "Coinflip players update" ON coinflip_players;

-- Read policies remain for leaderboard/stats if needed.
