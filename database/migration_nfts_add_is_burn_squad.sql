-- Add Burn Squad trait flag (for Discord rule `nft_column_true` with column `is_burn_squad`).
-- Run once in Supabase if `nfts` already exists without this column.

ALTER TABLE nfts
  ADD COLUMN IF NOT EXISTS is_burn_squad BOOLEAN NOT NULL DEFAULT false;
