-- Engagement events from discord-engagement-bot (Gateway). Service role inserts; RLS optional.
-- Run in Supabase SQL editor after review.

CREATE TABLE IF NOT EXISTS discord_engagement_events (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_discord_engagement_user_time
  ON discord_engagement_events (discord_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discord_engagement_guild_time
  ON discord_engagement_events (guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discord_engagement_type_time
  ON discord_engagement_events (event_type, created_at DESC);

COMMENT ON TABLE discord_engagement_events IS 'Raw engagement: message (qualifying), reaction_add, voice_session seconds.';
