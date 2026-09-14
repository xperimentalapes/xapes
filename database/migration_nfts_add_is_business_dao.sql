-- BUSINESS DAO trait flag (Clothes = Business Suit) + retire Burn Squad role mapping.
-- Run once in Supabase SQL Editor after deploying code that writes is_business_dao.

ALTER TABLE nfts
  ADD COLUMN IF NOT EXISTS is_business_dao BOOLEAN NOT NULL DEFAULT false;

-- Reuse Discord role id formerly used for Burn Squad
UPDATE discord_roles
SET
  slug = 'business_dao',
  display_name = 'BUSINESS DAO',
  rule_type = 'nft_column_true',
  rule_config = '{"column":"is_business_dao"}'::jsonb,
  active = true,
  sort_order = 40
WHERE discord_role_id = '1491281476367552642'
   OR slug = 'burn_squad';

-- If slug rename created a conflict path (row already business_dao), ensure config is correct
INSERT INTO discord_roles (slug, discord_role_id, display_name, rule_type, rule_config, active, sort_order)
VALUES (
  'business_dao',
  '1491281476367552642',
  'BUSINESS DAO',
  'nft_column_true',
  '{"column":"is_business_dao"}'::jsonb,
  true,
  40
)
ON CONFLICT (slug) DO UPDATE SET
  discord_role_id = EXCLUDED.discord_role_id,
  display_name = EXCLUDED.display_name,
  rule_type = EXCLUDED.rule_type,
  rule_config = EXCLUDED.rule_config,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order;

-- Any leftover burn_squad row (if slug was not updated due to unique conflict) stays inactive
UPDATE discord_roles
SET active = false
WHERE slug = 'burn_squad';

-- Backfill from indexed metadata (trim + case-insensitive). Refresh metadata via sync-nfts if stale.
UPDATE nfts
SET
  is_business_dao = EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(metadata_json -> 'attributes', '[]'::jsonb)) AS elem
    WHERE lower(trim(elem ->> 'trait_type')) = 'clothes'
      AND lower(trim(elem ->> 'value')) = 'business suit'
  ),
  updated_at = NOW();
