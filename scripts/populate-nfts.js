#!/usr/bin/env node
/**
 * One-shot: fill/update the `nfts` table for the configured collection (Helius getAssetsByGroup + Supabase upsert).
 * Does not call Discord. For full sync + role reconcile use: npm run sync-nfts
 *
 * Requires in .env (or environment):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, HELIUS_API_KEY, MUTANT_APES_COLLECTION_MINT
 * Optional: COLLECTION_NAME, COLLECTION_ME_SLUG (name defaults from wallet-holdings)
 */
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const { runPopulateNftsOnly } = require('../lib/holder/sync-nfts.js');

runPopulateNftsOnly()
  .then((stats) => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
