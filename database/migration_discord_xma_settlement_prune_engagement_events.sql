-- If you already applied migration_discord_xma_daily_settlement.sql before engagement pruning existed,
-- run this once to replace settle_discord_xma_daily_pending.

CREATE OR REPLACE FUNCTION settle_discord_xma_daily_pending(
  p_guild_id text,
  p_accrual_date text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  n int := 0;
  total numeric := 0;
BEGIN
  IF p_accrual_date IS NULL OR p_accrual_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN jsonb_build_object('error', 'invalid p_accrual_date', 'got', p_accrual_date);
  END IF;

  FOR r IN
    SELECT discord_user_id, guild_id, pending_xma
    FROM discord_xma_daily_pending
    WHERE guild_id = p_guild_id
      AND accrual_date = p_accrual_date
      AND pending_xma > 0
    FOR UPDATE
  LOOP
    INSERT INTO discord_xma_rewards (discord_user_id, guild_id, unclaimed_xma, updated_at)
    VALUES (r.discord_user_id, r.guild_id, r.pending_xma, NOW())
    ON CONFLICT (discord_user_id, guild_id)
    DO UPDATE SET
      unclaimed_xma = discord_xma_rewards.unclaimed_xma + EXCLUDED.unclaimed_xma,
      updated_at = NOW();
    n := n + 1;
    total := total + r.pending_xma;
  END LOOP;

  DELETE FROM discord_xma_daily_pending
  WHERE guild_id = p_guild_id
    AND accrual_date = p_accrual_date;

  DELETE FROM discord_xma_daily_accrual
  WHERE guild_id = p_guild_id
    AND accrual_date = p_accrual_date;

  DELETE FROM discord_engagement_events
  WHERE guild_id = p_guild_id
    AND to_char((created_at AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD') = p_accrual_date;

  RETURN jsonb_build_object(
    'settled_users', n,
    'pending_moved_xma', total,
    'accrual_date', p_accrual_date,
    'guild_id', p_guild_id
  );
END;
$$;
