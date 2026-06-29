-- Paste this entire file into Supabase Dashboard → SQL Editor → Run.
-- Run after migration_discord_xma_daily_settlement.sql (and prior Discord XMA migrations).
-- Combines: partial daily-cap fix + atomic claim RPCs.

-- ── 1. Partial cap credit (replaces process_discord_engagement_accrual_batch) ──

CREATE OR REPLACE FUNCTION process_discord_engagement_accrual_batch(
  p_batch_limit int DEFAULT 2000,
  p_daily_cap numeric DEFAULT 100000,
  p_xma_message numeric DEFAULT 300,
  p_xma_reaction numeric DEFAULT 200,
  p_xma_voice_minute numeric DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  base_xma numeric;
  date_et text;
  prior numeric;
  credit numeric;
  marked int := 0;
  voice_sec numeric;
  credited_xma numeric := 0;
BEGIN
  FOR r IN
    SELECT id, discord_user_id, guild_id, event_type, metadata, created_at
    FROM discord_engagement_events
    WHERE credited_at IS NULL
      AND event_type IN ('message', 'reaction_add', 'voice_session')
    ORDER BY id
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    base_xma := 0;
    IF r.event_type = 'message' THEN
      base_xma := p_xma_message;
    ELSIF r.event_type = 'reaction_add' THEN
      base_xma := p_xma_reaction;
    ELSIF r.event_type = 'voice_session' THEN
      BEGIN
        voice_sec := (r.metadata->>'seconds')::numeric;
      EXCEPTION
        WHEN others THEN
          voice_sec := 0;
      END;
      IF voice_sec IS NULL OR voice_sec < 0 THEN
        voice_sec := 0;
      END IF;
      base_xma := (voice_sec / 60.0) * p_xma_voice_minute;
    END IF;

    IF base_xma IS NULL OR base_xma <= 0 THEN
      UPDATE discord_engagement_events SET credited_at = NOW() WHERE id = r.id;
      marked := marked + 1;
      CONTINUE;
    END IF;

    date_et := to_char((r.created_at AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD');

    INSERT INTO discord_xma_daily_accrual (discord_user_id, guild_id, accrual_date, xma_total)
    VALUES (r.discord_user_id, r.guild_id, date_et, 0)
    ON CONFLICT (discord_user_id, guild_id, accrual_date) DO NOTHING;

    SELECT d.xma_total INTO prior
    FROM discord_xma_daily_accrual d
    WHERE d.discord_user_id = r.discord_user_id
      AND d.guild_id = r.guild_id
      AND d.accrual_date = date_et
    FOR UPDATE;

    IF prior IS NULL THEN
      prior := 0;
    END IF;

    IF prior >= p_daily_cap THEN
      UPDATE discord_engagement_events SET credited_at = NOW() WHERE id = r.id;
      marked := marked + 1;
      CONTINUE;
    END IF;

    credit := LEAST(base_xma, p_daily_cap - prior);

    IF credit <= 0 THEN
      UPDATE discord_engagement_events SET credited_at = NOW() WHERE id = r.id;
      marked := marked + 1;
      CONTINUE;
    END IF;

    INSERT INTO discord_xma_daily_pending (discord_user_id, guild_id, accrual_date, pending_xma, updated_at)
    VALUES (r.discord_user_id, r.guild_id, date_et, credit, NOW())
    ON CONFLICT (discord_user_id, guild_id, accrual_date)
    DO UPDATE SET
      pending_xma = discord_xma_daily_pending.pending_xma + EXCLUDED.pending_xma,
      updated_at = NOW();

    UPDATE discord_xma_daily_accrual
    SET xma_total = xma_total + credit, updated_at = NOW()
    WHERE discord_user_id = r.discord_user_id
      AND guild_id = r.guild_id
      AND accrual_date = date_et;

    UPDATE discord_engagement_events SET credited_at = NOW() WHERE id = r.id;
    marked := marked + 1;
    credited_xma := credited_xma + credit;
  END LOOP;

  RETURN jsonb_build_object(
    'events_marked', marked,
    'xma_credited', credited_xma
  );
END;
$$;

COMMENT ON FUNCTION process_discord_engagement_accrual_batch IS
  'Accrue XMA into daily pending (settled nightly to unclaimed); partial credit at daily cap; mark all processed events credited.';

-- ── 2. Atomic claim debit / restore ──

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
