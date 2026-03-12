// GET /api/coinflip-state?walletAddress=... — load player state for coin flip game
const { createClient } = require('@supabase/supabase-js');
const { PublicKey } = require('@solana/web3.js');

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });

    try {
        const { walletAddress } = req.query;
        if (!walletAddress) return res.status(400).json({ error: 'walletAddress required' });
        try { new PublicKey(walletAddress); } catch (e) { return res.status(400).json({ error: 'Invalid wallet' }); }

        const { data: player, error } = await supabase
            .from('coinflip_players')
            .select('flips_remaining, cost_per_flip, total_wagered, total_won')
            .eq('wallet_address', walletAddress)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('coinflip-state fetch error:', error);
            return res.status(500).json({ error: 'Failed to load state' });
        }

        const flipsRemaining = player ? Number(player.flips_remaining || 0) : 0;
        const costPerFlip = player ? Number(player.cost_per_flip || 0) / Math.pow(10, TOKEN_DECIMALS) : 0;
        const totalWon = player ? Number(player.total_won || 0) / Math.pow(10, TOKEN_DECIMALS) : 0;

        const { count } = await supabase.from('coinflip_rounds').select('*', { count: 'exact', head: true }).eq('wallet_address', walletAddress);
        const totalFlips = count || 0;

        const { data: agg } = await supabase.from('coinflip_rounds').select('won_amount').eq('wallet_address', walletAddress);
        const grandTotalWon = (agg || []).reduce((s, r) => s + Number(r.won_amount || 0), 0) / Math.pow(10, TOKEN_DECIMALS);

        return res.status(200).json({
            walletAddress,
            flipsRemaining,
            costPerFlip,
            totalWon,
            totalFlips,
            grandTotalWon
        });
    } catch (err) {
        console.error('coinflip-state error:', err);
        return res.status(500).json({ error: err.message || 'Server error' });
    }
};
