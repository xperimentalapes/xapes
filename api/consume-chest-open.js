// Consume one chest open for the user (call when they click Open Chest). Requires Supabase.

const { createClient } = require('@supabase/supabase-js');
const { PublicKey } = require('@solana/web3.js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

module.exports = async function handler(req, res) {
    const origin = req.headers.origin;
    const allowedOrigins = ['https://xapes.vercel.app', 'http://localhost:8000', 'http://localhost:3000'];
    if (origin && allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!supabase) return res.status(500).json({ error: 'Database not configured' });

    try {
        const { userWallet } = req.body;
        if (!userWallet) return res.status(400).json({ error: 'userWallet required' });
        try { new PublicKey(userWallet); } catch (e) { return res.status(400).json({ error: 'Invalid wallet' }); }

        const { data: row, error: fetchErr } = await supabase
            .from('chest_opens_available')
            .select('opens_remaining')
            .eq('user_wallet', userWallet)
            .single();

        if (fetchErr || !row) return res.status(200).json({ ok: false, opens: 0 });
        const current = row.opens_remaining || 0;
        if (current < 1) return res.status(200).json({ ok: false, opens: 0 });

        const { error: updateErr } = await supabase
            .from('chest_opens_available')
            .update({ opens_remaining: current - 1, updated_at: new Date().toISOString() })
            .eq('user_wallet', userWallet)
            .eq('opens_remaining', current);

        if (updateErr) {
            console.error('consume-chest-open update error:', updateErr);
            return res.status(500).json({ error: 'Failed to consume open' });
        }
        return res.status(200).json({ ok: true, opens: current - 1 });
    } catch (err) {
        console.error('consume-chest-open error:', err);
        return res.status(500).json({ error: err.message || 'Failed to consume open' });
    }
};
