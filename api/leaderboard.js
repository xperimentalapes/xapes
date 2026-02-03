// Vercel serverless function to get leaderboard data from Supabase

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
        const { sortBy = 'spins', limit = 100 } = req.query;

        // Validate sortBy parameter
        const validSortOptions = ['spins', 'won', 'winRate'];
        if (!validSortOptions.includes(sortBy)) {
            return res.status(400).json({ error: 'Invalid sortBy parameter. Must be: spins, won, or winRate' });
        }

        // Build query based on sort option
        let query = supabase
            .from('players')
            .select('wallet_address, total_spins, total_won, total_wagered, created_at')
            .gt('total_spins', 0); // Only show players who have played

        // Apply sorting
        if (sortBy === 'spins') {
            query = query.order('total_spins', { ascending: false });
        } else if (sortBy === 'won') {
            query = query.order('total_won', { ascending: false });
        } else if (sortBy === 'winRate') {
            // For win rate, we need to calculate it, so we'll fetch all and sort in memory
            // Or use a database function - for now, fetch and calculate
            query = query.order('total_spins', { ascending: false }); // Will recalculate below
        }

        // Apply limit
        const limitNum = parseInt(limit) || 100;
        query = query.limit(Math.min(limitNum, 1000)); // Max 1000

        const { data: players, error } = await query;

        if (error) {
            console.error('Error loading leaderboard:', error);
            return res.status(500).json({ error: 'Failed to load leaderboard', details: error.message });
        }

        // Convert and calculate win rates
        const TOKEN_DECIMALS = 6;
        const leaderboard = players.map(player => {
            const totalWon = Number(player.total_won || 0) / Math.pow(10, TOKEN_DECIMALS);
            const totalWagered = Number(player.total_wagered || 0) / Math.pow(10, TOKEN_DECIMALS);
            const winRate = totalWagered > 0 ? (totalWon / totalWagered) * 100 : 0;

            return {
                walletAddress: player.wallet_address,
                displayAddress: `${player.wallet_address.slice(0, 4)}...${player.wallet_address.slice(-4)}`,
                totalSpins: player.total_spins || 0,
                totalWon: totalWon,
                totalWagered: totalWagered,
                winRate: winRate,
                createdAt: player.created_at
            };
        });

        // Sort by win rate if needed (since we can't do this efficiently in SQL)
        if (sortBy === 'winRate') {
            leaderboard.sort((a, b) => b.winRate - a.winRate);
        }

        return res.status(200).json({
            leaderboard: leaderboard.slice(0, limitNum),
            sortBy,
            totalPlayers: leaderboard.length
        });

    } catch (error) {
        console.error('Leaderboard error:', error);
        return res.status(500).json({ 
            error: 'Failed to load leaderboard',
            message: error.message 
        });
    }
};
