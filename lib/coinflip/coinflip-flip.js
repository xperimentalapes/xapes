// POST /api/coinflip-flip — perform one flip (server-authoritative result)
const { createClient } = require('@supabase/supabase-js');
const { PublicKey } = require('@solana/web3.js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;
const TOKEN_DECIMALS = 6;
const WIN_MULTIPLIER = 1.9;

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
        const { walletAddress, prediction } = req.body || {};
        if (!walletAddress || !prediction) return res.status(400).json({ error: 'walletAddress and prediction required' });
        if (!['heads', 'tails'].includes(prediction)) return res.status(400).json({ error: 'prediction must be heads or tails' });
        try { new PublicKey(walletAddress); } catch (e) { return res.status(400).json({ error: 'Invalid wallet' }); }

        const { data: player, error: fetchErr } = await supabase
            .from('coinflip_players')
            .select('flips_remaining, cost_per_flip, total_won')
            .eq('wallet_address', walletAddress)
            .single();

        // Connected wallet = player; create row if none exists
        let row = player;
        if (fetchErr?.code === 'PGRST116' || !row) {
            const { data: inserted, error: insertErr } = await supabase.from('coinflip_players').insert({
                wallet_address: walletAddress,
                flips_remaining: 0,
                cost_per_flip: 0,
                total_wagered: 0,
                total_won: 0
            }).select('flips_remaining, cost_per_flip, total_won').single();
            if (insertErr) {
                const { data: existing } = await supabase.from('coinflip_players').select('flips_remaining, cost_per_flip, total_won').eq('wallet_address', walletAddress).single();
                row = existing;
            } else {
                row = inserted;
            }
        }
        if (!row) return res.status(500).json({ error: 'Failed to load player' });
        const flipsRemaining = Number(row.flips_remaining || 0);
        if (flipsRemaining < 1) return res.status(400).json({ error: 'No flips remaining' });

        const costPerFlipLamports = BigInt(row.cost_per_flip || 0);
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = result === prediction;
        const wonLamports = won ? BigInt(Math.floor(Number(costPerFlipLamports) * WIN_MULTIPLIER)) : BigInt(0);
        const newTotalWon = BigInt(row.total_won || 0) + wonLamports;
        const newFlipsRemaining = flipsRemaining - 1;

        await supabase.from('coinflip_rounds').insert({
            wallet_address: walletAddress,
            bet_amount: costPerFlipLamports.toString(),
            prediction,
            result,
            won_amount: wonLamports.toString()
        });

        const { error: updateErr } = await supabase
            .from('coinflip_players')
            .update({
                flips_remaining: newFlipsRemaining,
                total_won: newTotalWon.toString(),
                updated_at: new Date().toISOString()
            })
            .eq('wallet_address', walletAddress);

        if (updateErr) {
            console.error('coinflip-flip update error:', updateErr);
            return res.status(500).json({ error: 'Failed to update state' });
        }

        const totalWonXma = Number(newTotalWon) / Math.pow(10, TOKEN_DECIMALS);
        const wonAmountXma = Number(wonLamports) / Math.pow(10, TOKEN_DECIMALS);

        return res.status(200).json({
            result,
            won,
            wonAmount: wonAmountXma,
            flipsRemaining: newFlipsRemaining,
            totalWon: totalWonXma
        });
    } catch (err) {
        console.error('coinflip-flip error:', err);
        return res.status(500).json({ error: err.message || 'Server error' });
    }
};
