#!/usr/bin/env node
/**
 * List every distinct Body + Head/Hat/Headwear attribute value in nfts.metadata_json (with counts).
 * Paginates past Supabase 1000-row default.
 *
 * Usage: node scripts/extract-trait-values.js
 * Output: console + database/trait_inventory_body_head.json
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
  return String(s == null ? '' : s)
    .trim()
    .toLowerCase();
}

function normValue(s) {
  return String(s == null ? '' : s).trim();
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const bodyMap = new Map();
  /** @type {Map<string, { trait_type: string, value: string, count: number }>} */
  const headMap = new Map();

  for (let from = 0; ; from += PAGE) {
    const { data: chunk, error } = await supabase
      .from('nfts')
      .select('mint_address, metadata_json')
      .order('mint_address')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!chunk || chunk.length === 0) break;

    for (const row of chunk) {
      const attrs = (row.metadata_json && row.metadata_json.attributes) || [];
      if (!Array.isArray(attrs)) continue;
      for (const a of attrs) {
        const t = normType(a.trait_type);
        const v = normValue(a.value);
        if (!v) continue;
        if (t === 'body') {
          bodyMap.set(v, (bodyMap.get(v) || 0) + 1);
        }
        if (HEAD_TYPES.has(t)) {
          const rawType = a.trait_type != null ? String(a.trait_type).trim() : t;
          const key = `${normType(rawType)}\t${v}`;
          const prev = headMap.get(key);
          if (prev) prev.count += 1;
          else headMap.set(key, { trait_type: rawType, value: v, count: 1 });
        }
      }
    }

    if (chunk.length < PAGE) break;
  }

  const bodySorted = [...bodyMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const headSorted = [...headMap.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  const out = {
    generated_at: new Date().toISOString(),
    body_note: 'trait_type matched case-insensitively as "body"',
    body_distinct_values: bodySorted.length,
    head_note: 'trait_type matched case-insensitively as head | hat | headwear',
    head_distinct_entries: headSorted.length,
    body: bodySorted.map(([value, count]) => ({ value, count })),
    head: headSorted,
  };

  const dest = path.join(__dirname, '..', 'database', 'trait_inventory_body_head.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2), 'utf8');

  console.log('Rows scanned. Body distinct values:', bodySorted.length, '| Head/Hat/Headwear distinct:', headSorted.length);
  console.log('Wrote', dest);
  console.log('\n--- BODY (value, count) top 40 ---');
  bodySorted.slice(0, 40).forEach(([v, c]) => console.log(c + '\t' + JSON.stringify(v)));
  console.log('\n--- HEAD / HAT / HEADWEAR (trait_type, value, count) top 40 ---');
  headSorted.slice(0, 40).forEach((h) => console.log(h.count + '\t' + JSON.stringify(h.trait_type) + '\t' + JSON.stringify(h.value)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
