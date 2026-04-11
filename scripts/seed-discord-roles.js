/**
 * Upsert discord_roles from seed_discord_roles_xapes.sql (same data).
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY in .env (repo root).
 *
 *   npm run seed-discord-roles
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const ROWS = [
  { slug: 'xape_holder', discord_role_id: '1377593419723046952', display_name: 'Xape Holder', rule_type: 'collection_min_one', rule_config: {}, active: true, sort_order: 10 },
  { slug: 'royal_family', discord_role_id: '1456871093351747604', display_name: 'Royal Family', rule_type: 'nft_column_true', rule_config: { column: 'is_crown' }, active: true, sort_order: 20 },
  { slug: 'cowboy_dao', discord_role_id: '1463993881392709693', display_name: 'Cowboy DAO', rule_type: 'nft_column_true', rule_config: { column: 'is_cowboy' }, active: true, sort_order: 30 },
  { slug: 'burn_squad', discord_role_id: '1491281476367552642', display_name: 'Burn Squad', rule_type: 'nft_column_true', rule_config: { column: 'is_burn_squad' }, active: true, sort_order: 40 },
  { slug: 'xape_god', discord_role_id: '1380162518072164383', display_name: 'Xape God', rule_type: 'collection_min_nfts', rule_config: { min: 50 }, active: true, sort_order: 50 },
  { slug: 'mutant_100', discord_role_id: '1388338739297648640', display_name: 'Mutant', rule_type: 'collection_min_nfts', rule_config: { min: 100 }, active: true, sort_order: 60 },
  { slug: 'xma_holder', discord_role_id: '1457517122581168252', display_name: '$XMA holder', rule_type: 'token_balance_min', rule_config: { min: 5000000 }, active: true, sort_order: 70 },
  { slug: 'xma_whale', discord_role_id: '1457516956985852017', display_name: '$XMA whale', rule_type: 'token_balance_min', rule_config: { min: 20000000 }, active: true, sort_order: 80 },
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
  }
  const supabase = createClient(url, key);
  const { data, error } = await supabase.from('discord_roles').upsert(ROWS, { onConflict: 'slug' }).select('slug');
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log('Upserted', (data || []).length, 'rows:', (data || []).map((r) => r.slug).join(', '));
}

main();
