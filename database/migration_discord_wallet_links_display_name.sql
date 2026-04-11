-- Optional: run in Supabase if discord_wallet_links already exists.
-- Stores display name from Discord OAuth when user links wallet (holders table UI).

ALTER TABLE discord_wallet_links
  ADD COLUMN IF NOT EXISTS discord_display_name TEXT;

COMMENT ON COLUMN discord_wallet_links.discord_display_name IS 'Discord global_name or username at last link/verify; shown on holders leaderboard.';
