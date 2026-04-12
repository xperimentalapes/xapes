-- Idempotent daily flat XMA grant (America/New_York calendar day), all engaged / linked users.
-- Run after migration_discord_xma_rewards.sql (discord_xma_rewards exists).

CREATE TABLE IF NOT EXISTS discord_xma_daily_grant_runs (
  grant_date date NOT NULL,
  guild_id text NOT NULL,
  amount_xma numeric(38, 18) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (grant_date, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_xma_daily_grant_runs_created ON discord_xma_daily_grant_runs (created_at DESC);

CREATE OR REPLACE FUNCTION apply_discord_daily_xma_grant(
  p_guild_id text,
  p_amount numeric,
  p_grant_date date
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  user_count int;
BEGIN
  BEGIN
    INSERT INTO discord_xma_daily_grant_runs (grant_date, guild_id, amount_xma)
    VALUES (p_grant_date, p_guild_id, p_amount);
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'skipped', true,
        'reason', 'already_applied',
        'grant_date', p_grant_date
      );
  END;

  WITH users AS (
    SELECT DISTINCT discord_user_id AS uid
    FROM discord_engagement_events
    WHERE guild_id = p_guild_id
    UNION
    SELECT DISTINCT discord_user_id AS uid
    FROM discord_wallet_links
  )
  INSERT INTO discord_xma_rewards (discord_user_id, guild_id, unclaimed_xma, updated_at)
  SELECT u.uid, p_guild_id, p_amount, NOW()
  FROM users u
  ON CONFLICT (discord_user_id, guild_id) DO UPDATE SET
    unclaimed_xma = discord_xma_rewards.unclaimed_xma + EXCLUDED.unclaimed_xma,
    updated_at = NOW();

  GET DIAGNOSTICS user_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'skipped', false,
    'grant_date', p_grant_date,
    'amount_xma', p_amount,
    'reward_rows_upserted', user_count
  );
END;
$$;

COMMENT ON FUNCTION apply_discord_daily_xma_grant IS 'Once per (grant_date, guild): add p_amount XMA unclaimed to all users seen in engagement or wallet links.';
