// Vercel serverless function to get overall game statistics
// Returns grand totals across all players

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
        // Get aggregated stats from players table
        const { data: stats, error } = await supabase
            .from('players')
            .select('total_spins, total_won, total_wagered');

        if (error) {
            console.error('Error loading game stats:', error);
            return res.status(500).json({ error: 'Failed to load game stats', details: error.message });
        }

        // Calculate grand totals
        const TOKEN_DECIMALS = 6;
        let grandTotalSpins = 0;
        let grandTotalWon = 0;
        let grandTotalWagered = 0;

        if (stats && stats.length > 0) {
            stats.forEach(player => {
                grandTotalSpins += player.total_spins || 0;
                grandTotalWon += Number(player.total_won || 0) / Math.pow(10, TOKEN_DECIMALS);
                grandTotalWagered += Number(player.total_wagered || 0) / Math.pow(10, TOKEN_DECIMALS);
            });
        }

        return res.status(200).json({
            grandTotalSpins,
            grandTotalWon,
            grandTotalWagered,
            totalPlayers: stats ? stats.length : 0
        });

    } catch (error) {
        console.error('Game stats error:', error);
        return res.status(500).json({ 
            error: 'Failed to load game stats',
            message: error.message 
        });
    }
};
