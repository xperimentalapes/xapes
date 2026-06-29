/**
 * Verify cron HTTP requests (cron-job.org, manual curl).
 * Set CRON_SECRET on Vercel. Send Authorization: Bearer <CRON_SECRET> or x-cron-secret header.
 */
function verifyCronSecret(req, res) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET not configured' });
    return false;
  }
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = String(req.headers['x-cron-secret'] || '').trim();
  if (bearer === secret || header === secret) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

module.exports = { verifyCronSecret };
