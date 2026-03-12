// POST /api/coinflip-purchase — record purchase of flips (client sends XMA on-chain first)
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
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });

    try {
        const { walletAddress, totalAmountXma, numFlips, costPerFlip } = req.body || {};
        if (!walletAddress || totalAmountXma == null || !numFlips || costPerFlip == null) {
            return res.status(400).json({ error: 'walletAddress, totalAmountXma, numFlips, costPerFlip required' });
        }
        try { new PublicKey(walletAddress); } catch (e) { return res.status(400).json({ error: 'Invalid wallet' }); }
        const totalLamports = BigInt(Math.floor(Number(totalAmountXma) * Math.pow(10, TOKEN_DECIMALS)));
        const costLamports = BigInt(Math.floor(Number(costPerFlip) * Math.pow(10, TOKEN_DECIMALS)));

        const { data: existing } = await supabase
            .from('coinflip_players')
            .select('flips_remaining, cost_per_flip, total_wagered, total_won')
            .eq('wallet_address', walletAddress)
            .single();

        if (existing && Number(existing.flips_remaining || 0) > 0) {
            return res.status(400).json({ error: 'Use or collect before buying more flips' });
        }

        const flipsRemaining = (existing ? Number(existing.flips_remaining || 0) : 0) + numFlips;
        const totalWagered = (existing ? BigInt(existing.total_wagered || 0) : BigInt(0)) + totalLamports;
        const totalWon = existing ? BigInt(existing.total_won || 0) : BigInt(0);

        const row = {
            wallet_address: walletAddress,
            flips_remaining: flipsRemaining,
            cost_per_flip: costLamports.toString(),
            total_wagered: totalWagered.toString(),
            total_won: totalWon.toString(),
            updated_at: new Date().toISOString()
        };
        if (!existing) row.created_at = new Date().toISOString();

        const { error } = await supabase.from('coinflip_players').upsert(row, { onConflict: 'wallet_address' });
        if (error) {
            console.error('coinflip-purchase error:', error);
            return res.status(500).json({ error: 'Failed to save purchase' });
        }
        return res.status(200).json({ ok: true, flipsRemaining });
    } catch (err) {
        console.error('coinflip-purchase error:', err);
        return res.status(500).json({ error: err.message || 'Server error' });
    }
};
