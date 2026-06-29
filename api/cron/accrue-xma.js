const path = require('path');
const root = path.resolve(path.join(__dirname, '..', '..'));
require('dotenv').config({ path: path.join(root, '.env') });

const { createCronHandler } = require('../../lib/cron/http-handler');
const { runAccrueDiscordXmaRewards } = require('../../lib/cron/accrue-discord-xma');

module.exports = createCronHandler('accrue-xma', async function (req) {
  const q = req.query || {};
  const maxBatchesRaw = q.maxBatches != null ? q.maxBatches : process.env.CRON_ACCRUE_MAX_BATCHES;
  const maxBatches = maxBatchesRaw != null ? Math.max(1, parseInt(maxBatchesRaw, 10) || 1) : 1;
  return runAccrueDiscordXmaRewards({ maxBatches });
});

module.exports.config = {
  maxDuration: 300,
};
