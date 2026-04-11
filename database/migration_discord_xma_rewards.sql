-- XMA rewards balances + accrual from discord_engagement_events (message rows).
-- Run after migration_discord_engagement.sql

ALTER TABLE discord_engagement_events
  ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_discord_engagement_uncredited
  ON discord_engagement_events (created_at)
  WHERE credited_at IS NULL AND event_type = 'message';

CREATE TABLE IF NOT EXISTS discord_xma_rewards (
  discord_user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  unclaimed_xma NUMERIC(38, 18) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (discord_user_id, guild_id)
);

CREATE TABLE IF NOT EXISTS discord_xma_claims (
  id BIGSERIAL PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  amount_xma NUMERIC(38, 18) NOT NULL,
  tx_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_xma_claims_user ON discord_xma_claims (discord_user_id, created_at DESC);

-- Accrual: lock uncredited message events, add XMA per row to discord_xma_rewards, mark credited_at.
-- Call from scripts/accrue-discord-xma-rewards.js via supabase.rpc (repeat until events_marked = 0).
CREATE OR REPLACE FUNCTION process_discord_message_event_accrual(
  p_batch_limit int DEFAULT 5000,
  p_xma_per_message numeric DEFAULT 600
)
RETURNS jsonb
LANGUAGE sql
AS $$
  WITH batch AS (
    SELECT id, discord_user_id, guild_id
    FROM discord_engagement_events
    WHERE credited_at IS NULL AND event_type = 'message'
    ORDER BY id
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  ),
  agg AS (
    SELECT discord_user_id, guild_id, (COUNT(*) * p_xma_per_message)::numeric AS amt
    FROM batch
    GROUP BY discord_user_id, guild_id
  ),
  ins AS (
    INSERT INTO discord_xma_rewards (discord_user_id, guild_id, unclaimed_xma, updated_at)
    SELECT discord_user_id, guild_id, amt, NOW() FROM agg
    ON CONFLICT (discord_user_id, guild_id)
    DO UPDATE SET
      unclaimed_xma = discord_xma_rewards.unclaimed_xma + EXCLUDED.unclaimed_xma,
      updated_at = NOW()
    RETURNING 1
  ),
  marked AS (
    UPDATE discord_engagement_events e
    SET credited_at = NOW()
    FROM batch b
    WHERE e.id = b.id
    RETURNING e.id
  )
  SELECT jsonb_build_object(
    'events_marked', COALESCE((SELECT COUNT(*)::int FROM marked), 0),
    'reward_rows_touched', COALESCE((SELECT COUNT(*)::int FROM ins), 0)
  );
$$;

COMMENT ON FUNCTION process_discord_message_event_accrual IS 'Accrue XMA from uncredited message engagement events; idempotent per event row.';
