// GET /api/coinflip-stats — grand totals for stats bar
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;
const TOKEN_DECIMALS = 6;

module.exports = async function handler(req, res) {
    const origin = req.headers.origin;
    if (origin && ['https://xapes.vercel.app', 'http://localhost:8000', 'http://localhost:3000'].includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });

    try {
        const { count: totalFlips } = await supabase.from('coinflip_rounds').select('*', { count: 'exact', head: true });
        const { data: rows } = await supabase.from('coinflip_rounds').select('won_amount');
        const grandTotalWon = (rows || []).reduce((s, r) => s + Number(r.won_amount || 0), 0) / Math.pow(10, TOKEN_DECIMALS);
        return res.status(200).json({ totalFlips: totalFlips || 0, grandTotalWon });
    } catch (err) {
        console.error('coinflip-stats error:', err);
        return res.status(500).json({ error: err.message || 'Server error' });
    }
};
