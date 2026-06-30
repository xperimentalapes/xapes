// GET chest opens remaining for a wallet (persists across refresh). Requires Supabase.

const { createClient } = require('@supabase/supabase-js');
const { PublicKey } = require('@solana/web3.js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

module.exports = async function handler(req, res) {
    const origin = req.headers.origin;
    const allowedOrigins = ['https://xapes.vercel.app', 'http://localhost:8000', 'http://localhost:3000'];
    if (origin && allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    if (!supabase) return res.status(500).json({ error: 'Database not configured' });

    try {
        const wallet = req.query.wallet;
        if (!wallet) return res.status(400).json({ error: 'wallet query required' });
        try { new PublicKey(wallet); } catch (e) { return res.status(400).json({ error: 'Invalid wallet' }); }

        const { data, error } = await supabase
            .from('chest_opens_available')
            .select('opens_remaining')
            .eq('user_wallet', wallet)
            .maybeSingle();

        if (error) {
            console.error('chest-opens error:', error);
            return res.status(500).json({ error: error.message });
        }
        const opens = (data && data.opens_remaining) || 0;
        return res.status(200).json({ opens });
    } catch (err) {
        console.error('chest-opens error:', err);
        return res.status(500).json({ error: err.message || 'Failed to get opens' });
    }
};
