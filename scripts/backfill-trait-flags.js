#!/usr/bin/env node
/**
 * Recompute is_burn_squad / is_crown / is_cowboy for every row in nfts using lib/holder/trait-flags.js.
 * Uses UPDATE only (never upserts partial rows).
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const { createClient } = require('@supabase/supabase-js');
const { inferTraitFlagsFromMetadata } = require('../lib/holder/trait-flags.js');

const PARALLEL = 30;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data: chunk, error } = await supabase
      .from('nfts')
      .select('mint_address, metadata_json')
      .order('mint_address')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!chunk || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  if (!rows.length) {
    console.log('No rows in nfts');
    return;
  }

  console.log('Loaded', rows.length, 'rows from nfts');

  const payloads = rows.map((row) => {
    const flags = inferTraitFlagsFromMetadata(row.metadata_json || {});
    return {
      mint_address: row.mint_address,
      is_burn_squad: flags.is_burn_squad,
      is_crown: flags.is_crown,
      is_cowboy: flags.is_cowboy,
      updated_at: new Date().toISOString(),
    };
  });

  let done = 0;
  for (let i = 0; i < payloads.length; i += PARALLEL) {
    const chunk = payloads.slice(i, i + PARALLEL);
    const results = await Promise.all(
      chunk.map((p) =>
        supabase
          .from('nfts')
          .update({
            is_burn_squad: p.is_burn_squad,
            is_crown: p.is_crown,
            is_cowboy: p.is_cowboy,
            updated_at: p.updated_at,
          })
          .eq('mint_address', p.mint_address)
      )
    );
    const err = results.find((r) => r.error);
    if (err && err.error) throw err.error;
    done += chunk.length;
    if (done % 300 === 0 || done === payloads.length) console.log('Updated', done, '/', payloads.length);
  }

  console.log('Done. Total rows:', done);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
