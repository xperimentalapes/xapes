/**
 * Batch-credit XMA from uncredited discord_engagement_events.
 * Schedule via cron-job.org → GET/POST /api/cron/accrue-xma (see docs/deploy-cron-jobs.md).
 */
require('dotenv').config();
const { runAccrueDiscordXmaRewards } = require('../lib/cron/accrue-discord-xma');

runAccrueDiscordXmaRewards()
  .then(function (r) {
    console.log(JSON.stringify(r));
    console.log('accrual complete; total events marked:', r.totalMarked);
  })
  .catch(function (e) {
    console.error(e);
    process.exit(1);
  });
