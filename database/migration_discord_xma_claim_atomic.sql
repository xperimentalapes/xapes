-- Atomic claim debit/restore for Discord XMA rewards (prevents concurrent double-claim).
-- Run after migration_discord_xma_rewards.sql.

CREATE OR REPLACE FUNCTION reserve_discord_xma_claim(
  p_discord_user_id text,
  p_guild_id text,
  p_threshold numeric
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_unclaimed numeric;
BEGIN
  SELECT unclaimed_xma INTO v_unclaimed
  FROM discord_xma_rewards
  WHERE discord_user_id = p_discord_user_id
    AND guild_id = p_guild_id
  FOR UPDATE;

  IF v_unclaimed IS NULL OR v_unclaimed < p_threshold THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'below_threshold',
      'unclaimed_xma', COALESCE(v_unclaimed, 0),
      'claim_threshold', p_threshold
    );
  END IF;

  UPDATE discord_xma_rewards
  SET unclaimed_xma = 0, updated_at = NOW()
  WHERE discord_user_id = p_discord_user_id
    AND guild_id = p_guild_id;

  RETURN jsonb_build_object(
    'ok', true,
    'claimed_xma', v_unclaimed
  );
END;
$$;

COMMENT ON FUNCTION reserve_discord_xma_claim IS
  'Lock row, verify threshold, zero unclaimed_xma, return debited amount for on-chain transfer.';

CREATE OR REPLACE FUNCTION restore_discord_xma_claim(
  p_discord_user_id text,
  p_guild_id text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  INSERT INTO discord_xma_rewards (discord_user_id, guild_id, unclaimed_xma, updated_at)
  VALUES (p_discord_user_id, p_guild_id, p_amount, NOW())
  ON CONFLICT (discord_user_id, guild_id)
  DO UPDATE SET
    unclaimed_xma = discord_xma_rewards.unclaimed_xma + EXCLUDED.unclaimed_xma,
    updated_at = NOW();

  RETURN jsonb_build_object('ok', true, 'restored_xma', p_amount);
END;
$$;

COMMENT ON FUNCTION restore_discord_xma_claim IS
  'Restore unclaimed_xma after a failed on-chain claim transfer.';
