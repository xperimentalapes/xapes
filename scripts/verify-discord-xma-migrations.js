/**
 * Verify Discord XMA Supabase objects exist (uses SUPABASE_URL + SUPABASE_SERVICE_KEY from .env).
 * Migrations must be applied in Supabase Dashboard → SQL Editor (service key cannot run DDL).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function checkTable(name) {
  const { error } = await supabase.from(name).select('*', { count: 'exact', head: true });
  return !error;
}

async function checkRpc(name, args) {
  const { error } = await supabase.rpc(name, args);
  if (!error) return true;
  const msg = error.message || '';
  if (msg.includes('Could not find the function')) return false;
  // RPC exists; other errors (e.g. below threshold) are fine
  return true;
}

async function main() {
  console.log('Supabase:', url.replace(/\/\/[^@]+@/, '//***@'));

  const tables = [
    'discord_engagement_events',
    'discord_xma_rewards',
    'discord_xma_daily_pending',
    'discord_xma_claims',
    'discord_wallet_links',
  ];
  for (const t of tables) {
    const ok = await checkTable(t);
    console.log(ok ? '  OK' : '  MISSING', 'table:', t);
  }

  const rpcs = [
    ['process_discord_engagement_accrual_batch', { p_batch_limit: 0 }],
    ['settle_discord_xma_daily_pending', { p_guild_id: '0', p_accrual_date: '2000-01-01' }],
    ['reserve_discord_xma_claim', { p_discord_user_id: '0', p_guild_id: '0', p_threshold: 1e15 }],
    ['restore_discord_xma_claim', { p_discord_user_id: '0', p_guild_id: '0', p_amount: 0 }],
  ];
  for (const [name, args] of rpcs) {
    const ok = await checkRpc(name, args);
    console.log(ok ? '  OK' : '  MISSING', 'rpc:', name);
  }

  const missingClaim = !(await checkRpc('reserve_discord_xma_claim', {
    p_discord_user_id: '0',
    p_guild_id: '0',
    p_threshold: 1e15,
  }));
  if (missingClaim) {
    console.log('\nApply pending migrations in Supabase → SQL Editor:');
    console.log('  1. database/migration_discord_xma_accrual_partial_cap.sql');
    console.log('  2. database/migration_discord_xma_claim_atomic.sql');
    console.log('Or paste: database/migration_discord_xma_pending_apply.sql (combined)');
    process.exit(1);
  }
  console.log('\nDiscord XMA migrations look applied.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
