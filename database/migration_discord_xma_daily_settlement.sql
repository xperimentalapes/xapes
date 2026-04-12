-- Intraday XMA sits in discord_xma_daily_pending; settlement moves it to discord_xma_rewards.unclaimed_xma
-- and clears pending + discord_xma_daily_accrual for that calendar date (America/New_York).
-- Run after migration_discord_xma_engagement_accrual_v2.sql.

CREATE TABLE IF NOT EXISTS discord_xma_daily_pending (
  discord_user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  accrual_date TEXT NOT NULL,
  pending_xma NUMERIC(38, 18) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (discord_user_id, guild_id, accrual_date)
);

CREATE INDEX IF NOT EXISTS idx_discord_xma_daily_pending_guild_date
  ON discord_xma_daily_pending (guild_id, accrual_date);

COMMENT ON TABLE discord_xma_daily_pending IS
  'XMA earned from engagement for a calendar day (ET) before nightly settlement to unclaimed_xma.';

-- Accrual: credit pending (not unclaimed) + same daily cap logic as before.
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
      CONTINUE;
    END IF;

    credit := LEAST(base_xma, p_daily_cap - prior);

    IF credit < base_xma THEN
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
  'Accrue XMA into daily pending (settled nightly to unclaimed); per-user daily cap in America/New_York.';

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

  RETURN jsonb_build_object(
    'settled_users', n,
    'pending_moved_xma', total,
    'accrual_date', p_accrual_date,
    'guild_id', p_guild_id
  );
END;
$$;

COMMENT ON FUNCTION settle_discord_xma_daily_pending IS
  'Move all pending XMA for p_accrual_date into unclaimed_xma, then delete pending and daily_accrual rows for that date/guild. Idempotent if already empty.';
