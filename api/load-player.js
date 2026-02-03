// Vercel serverless function to load player data from Supabase
// Called on page load to restore player state

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase credentials not configured');
}

const supabase = supabaseUrl && supabaseServiceKey 
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

module.exports = async function handler(req, res) {
    // CORS headers
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://xapes.vercel.app',
        'http://localhost:8000',
        'http://localhost:3000'
    ];
    
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabase) {
        return res.status(500).json({ error: 'Database not configured' });
    }

    try {
        const { walletAddress } = req.query;

        if (!walletAddress) {
            return res.status(400).json({ error: 'walletAddress query parameter is required' });
        }

        // Validate wallet address format
        try {
            const { PublicKey } = require('@solana/web3.js');
            new PublicKey(walletAddress);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }

        // Get player data
        const { data: player, error } = await supabase
            .from('players')
            .select('*')
            .eq('wallet_address', walletAddress)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
            console.error('Error loading player data:', error);
            return res.status(500).json({ error: 'Failed to load player data', details: error.message });
        }

        // If player doesn't exist, return empty state
        if (!player) {
            return res.status(200).json({
                walletAddress,
                totalSpins: 0,
                totalWon: 0,
                totalWagered: 0,
                unclaimedRewards: 0,
                spinsRemaining: 0,
                createdAt: null
            });
        }

        // Convert from database format (stored as strings for bigint)
        const TOKEN_DECIMALS = 6;
        const unclaimedRewards = Number(player.unclaimed_rewards || 0) / Math.pow(10, TOKEN_DECIMALS);
        const totalWon = Number(player.total_won || 0) / Math.pow(10, TOKEN_DECIMALS);
        const totalWagered = Number(player.total_wagered || 0) / Math.pow(10, TOKEN_DECIMALS);

        return res.status(200).json({
            walletAddress: player.wallet_address,
            totalSpins: player.total_spins || 0,
            totalWon: totalWon,
            totalWagered: totalWagered,
            unclaimedRewards: unclaimedRewards,
            spinsRemaining: player.spins_remaining || 0,
            createdAt: player.created_at
        });

    } catch (error) {
        console.error('Load player error:', error);
        return res.status(500).json({ 
            error: 'Failed to load player data',
            message: error.message 
        });
    }
};
