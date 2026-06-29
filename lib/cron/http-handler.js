const { verifyCronSecret } = require('./verify-cron-secret');

/**
 * @param {string} jobName
 * @param {(req: import('http').IncomingMessage) => Promise<object>} runJob
 */
function createCronHandler(jobName, runJob) {
  return async function cronHandler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!verifyCronSecret(req, res)) return;

    try {
      const result = await runJob(req);
      return res.status(200).json({ ok: true, job: jobName, ...result });
    } catch (e) {
      console.error('[cron]', jobName, e);
      return res.status(500).json({
        ok: false,
        job: jobName,
        error: e.message || String(e),
      });
    }
  };
}

module.exports = { createCronHandler };
