const { createCronHandler } = require('./http-handler');
const { runAccrueDiscordXmaRewards } = require('./accrue-discord-xma');
const { runSettleDiscordXmaDaily } = require('./settle-discord-xma');
const { runFullSync } = require('../holder/sync-nfts');

function registerCronRoutes(app) {
  const accrue = createCronHandler('accrue-xma', async function (req) {
    const q = req.query || {};
    const maxBatchesRaw = q.maxBatches != null ? q.maxBatches : process.env.CRON_ACCRUE_MAX_BATCHES;
    const maxBatches = maxBatchesRaw != null ? Math.max(1, parseInt(maxBatchesRaw, 10) || 1) : 1;
    return runAccrueDiscordXmaRewards({ maxBatches });
  });

  const settle = createCronHandler('settle-xma', async function (req) {
    const q = req.query || {};
    return runSettleDiscordXmaDaily({
      settleDate: q.settleDate ? String(q.settleDate) : undefined,
      timezone: q.timezone ? String(q.timezone) : undefined,
    });
  });

  const sync = createCronHandler('sync-nfts', async function (req) {
    const q = req.query || {};
    const mode = q.mode ? String(q.mode).toLowerCase() : 'roles';
    const result = await runFullSync({ mode });
    return { mode, result };
  });

  app.get('/api/cron/accrue-xma', accrue);
  app.post('/api/cron/accrue-xma', accrue);
  app.get('/api/cron/settle-xma', settle);
  app.post('/api/cron/settle-xma', settle);
  app.get('/api/cron/sync-nfts', sync);
  app.post('/api/cron/sync-nfts', sync);
}

module.exports = { registerCronRoutes };
