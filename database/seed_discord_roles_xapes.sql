-- Xapes Discord roles (managed by holder verify + sync job). Run in Supabase after migration_holder_nfts_roles.sql.
-- Idempotent: upserts by slug.

INSERT INTO discord_roles (slug, discord_role_id, display_name, rule_type, rule_config, active, sort_order)
VALUES
  ('xape_holder', '1377593419723046952', 'Xape Holder', 'collection_min_one', '{}'::jsonb, true, 10),
  ('royal_family', '1456871093351747604', 'Royal Family', 'nft_column_true', '{"column":"is_crown"}'::jsonb, true, 20),
  ('cowboy_dao', '1463993881392709693', 'Cowboy DAO', 'nft_column_true', '{"column":"is_cowboy"}'::jsonb, true, 30),
  ('burn_squad', '1491281476367552642', 'Burn Squad', 'nft_column_true', '{"column":"is_burn_squad"}'::jsonb, true, 40),
  ('xape_god', '1380162518072164383', 'Xape God', 'collection_min_nfts', '{"min":50}'::jsonb, true, 50),
  ('mutant_100', '1388338739297648640', 'Mutant', 'collection_min_nfts', '{"min":100}'::jsonb, true, 60),
  ('xma_holder', '1457517122581168252', '$XMA holder', 'token_balance_min', '{"min":5000000}'::jsonb, true, 70),
  ('xma_whale', '1457516956985852017', '$XMA whale', 'token_balance_min', '{"min":20000000}'::jsonb, true, 80)
ON CONFLICT (slug) DO UPDATE SET
  discord_role_id = EXCLUDED.discord_role_id,
  display_name = EXCLUDED.display_name,
  rule_type = EXCLUDED.rule_type,
  rule_config = EXCLUDED.rule_config,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order;
