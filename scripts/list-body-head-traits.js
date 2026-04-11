#!/usr/bin/env node
/**
 * Scan all rows in `nfts` and list distinct Body trait values and Head/Hat/Headwear values (with counts).
 * Uses SUPABASE_URL + SUPABASE_SERVICE_KEY from .env or environment.
 *
 * Usage: node scripts/list-body-head-traits.js
 *        node scripts/list-body-head-traits.js --json > traits.json
 */
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const { createClient } = require('@supabase/supabase-js');

const PAGE = 1000;
const HEAD_TYPES = new Set(['head', 'hat', 'headwear']);

function normType(s) {
  return String(s == null ? '')
    .trim()
    .toLowerCase();
}

function normValue(s) {
  return String(s == null ? '').trim();
}

function collectFromMeta(meta, bodyMap, headMap) {
  const attrs = meta && Array.isArray(meta.attributes) ? meta.attributes : [];
  for (const a of attrs) {
    const t = normType(a.trait_type);
    const v = normValue(a.value);
    if (!v) continue;
    if (t === 'body') {
      bodyMap.set(v, (bodyMap.get(v) || 0) + 1);
    }
    if (HEAD_TYPES.has(t)) {
      headMap.set(v, (headMap.get(v) || 0) + 1);
    }
  }
}

function sortEntries(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

async function main() {
  const jsonOut = process.argv.includes('--json');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const bodyMap = new Map();
  const headMap = new Map();

  for (let from = 0; ; from += PAGE) {
    const { data: chunk, error } = await supabase
      .from('nfts')
      .select('metadata_json')
      .order('mint_address')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!chunk || chunk.length === 0) break;
    for (const row of chunk) {
      collectFromMeta(row.metadata_json, bodyMap, headMap);
    }
    if (chunk.length < PAGE) break;
  }

  const body = sortEntries(bodyMap).map(([value, count]) => ({ value, count }));
  const head = sortEntries(headMap).map(([value, count]) => ({ value, count }));

  if (jsonOut) {
    console.log(JSON.stringify({ body_traits: body, head_hat_headwear_traits: head }, null, 2));
    return;
  }

  console.log('=== Body (trait_type = Body) —', body.length, 'distinct values,', body.reduce((s, x) => s + x.count, 0), 'total attribute rows ===\n');
  for (const { value, count } of body) {
    console.log(count + '\t' + JSON.stringify(value));
  }

  console.log('\n=== Head / Hat / Headwear —', head.length, 'distinct values,', head.reduce((s, x) => s + x.count, 0), 'total attribute rows ===\n');
  for (const { value, count } of head) {
    console.log(count + '\t' + JSON.stringify(value));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
