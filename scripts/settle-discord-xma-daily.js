/**
 * Move yesterday's pending engagement XMA into unclaimed_xma.
 * Schedule via cron-job.org → GET/POST /api/cron/settle-xma (see docs/deploy-cron-jobs.md).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { runSettleDiscordXmaDaily } = require('../lib/cron/settle-discord-xma');

runSettleDiscordXmaDaily()
  .then(function (r) {
    console.log(JSON.stringify(r.result));
  })
  .catch(function (e) {
    console.error(e);
    process.exit(1);
  });
