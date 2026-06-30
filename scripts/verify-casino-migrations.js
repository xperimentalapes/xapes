#!/usr/bin/env node
/**
 * Verify casino security migrations were applied in Supabase.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in env or .env.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

async function tableExists(name) {
  const { error } = await supabase.from(name).select('*').limit(0);
  return !error || !String(error.message || '').includes('does not exist');
}

async function main() {
  const checks = [];
  const tables = ['game_purchase_txs', 'casino_pending_payouts'];
  for (const t of tables) {
    const ok = await tableExists(t);
    checks.push({ name: `table ${t}`, ok });
  }

  const { data: resCols, error: resErr } = await supabase
    .from('chest_reservations')
    .select('status')
    .limit(0);
  checks.push({
    name: 'chest_reservations.status column',
    ok: !resErr || !String(resErr.message || '').includes('status'),
  });

  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? 'OK' : 'FAIL';
    console.log(`[${mark}] ${c.name}`);
    if (!c.ok) failed += 1;
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed. Run migration SQL files in Supabase.`);
    process.exit(1);
  }
  console.log('\nAll casino security checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
