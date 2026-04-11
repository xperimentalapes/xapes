#!/usr/bin/env node
/**
 * Sync collection NFTs from Helius into Supabase, then reconcile Discord roles for all linked users.
 * Run locally: node scripts/sync-nfts-roles.js (loads ../.env if present)
 * GitHub Actions: set env secrets (no .env in repo).
 */
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const { runFullSync } = require('../lib/holder/sync-nfts.js');

runFullSync()
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
