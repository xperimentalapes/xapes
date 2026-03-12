// POST /api/coinflip-confirm-collect — clear total_won after user has sent the collect tx
const { createClient } = require('@supabase/supabase-js');
const { PublicKey } = require('@solana/web3.js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

module.exports = async function handler(req, res) {
    const origin = req.headers.origin;
    if (origin && ['https://xapes.vercel.app', 'http://localhost:8000', 'http://localhost:3000'].includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });

    try {
        const { walletAddress } = req.body || {};
        if (!walletAddress) return res.status(400).json({ error: 'walletAddress required' });
        try { new PublicKey(walletAddress); } catch (e) { return res.status(400).json({ error: 'Invalid wallet' }); }

        const { error } = await supabase
            .from('coinflip_players')
            .update({ total_won: '0', updated_at: new Date().toISOString() })
            .eq('wallet_address', walletAddress);
        if (error) {
            console.error('coinflip-confirm-collect error:', error);
            return res.status(500).json({ error: 'Failed to confirm' });
        }
        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('coinflip-confirm-collect error:', err);
        return res.status(500).json({ error: err.message || 'Server error' });
    }
};
