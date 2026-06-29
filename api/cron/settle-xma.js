const path = require('path');
const root = path.resolve(path.join(__dirname, '..', '..'));
require('dotenv').config({ path: path.join(root, '.env') });

const { createCronHandler } = require('../../lib/cron/http-handler');
const { runSettleDiscordXmaDaily } = require('../../lib/cron/settle-discord-xma');

module.exports = createCronHandler('settle-xma', async function (req) {
  const q = req.query || {};
  return runSettleDiscordXmaDaily({
    settleDate: q.settleDate ? String(q.settleDate) : undefined,
    timezone: q.timezone ? String(q.timezone) : undefined,
  });
});

module.exports.config = {
  maxDuration: 60,
};
