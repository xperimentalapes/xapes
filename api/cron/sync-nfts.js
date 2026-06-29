const path = require('path');
const root = path.resolve(path.join(__dirname, '..', '..'));
require('dotenv').config({ path: path.join(root, '.env') });

const { createCronHandler } = require('../../lib/cron/http-handler');
const { runFullSync } = require('../../lib/holder/sync-nfts');

module.exports = createCronHandler('sync-nfts', async function () {
  const result = await runFullSync();
  return { result };
});

module.exports.config = {
  maxDuration: 300,
};
