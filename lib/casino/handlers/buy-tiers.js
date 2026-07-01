const { applyCors } = require('../http');
const { resolveBuyInTiers, USD_BUY_IN_TIERS } = require('../buy-in-tiers');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { tiers, xmaUsd, priceSource } = await resolveBuyInTiers();
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    return res.status(200).json({
      tiers,
      xmaUsd,
      priceSource,
      usdTiers: USD_BUY_IN_TIERS,
    });
  } catch (e) {
    console.error('[buy-tiers]', e);
    return res.status(500).json({ error: 'Failed to load buy-in tiers' });
  }
};
