// Record a chest purchase: verify tx on-chain (700k XMA to bronze treasury), then add 1 open for user.
// Prevents double-counting same tx. Requires Supabase.

const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const BRONZE_TREASURY_WALLET = '9iyfxFga7a9FAkkgpgeP7PSscKEKdShihvso44GiMT4H';
const XMA_TOKEN_MINT = 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';
const CHEST_PRICE_RAW = 700000 * 1e6; // 700k XMA, 6 decimals
const RPC_URL = process.env.HELIUS_RPC_URL || ('https://mainnet.helius-rpc.com/?api-key=' + (process.env.HELIUS_API_KEY || ''));

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
        const { userWallet, txSignature } = req.body;
        if (!userWallet || !txSignature) return res.status(400).json({ error: 'userWallet and txSignature required' });
        try { new PublicKey(userWallet); } catch (e) { return res.status(400).json({ error: 'Invalid user wallet' }); }

        const sig = String(txSignature).trim();
        if (!sig) return res.status(400).json({ error: 'Invalid txSignature' });

        const { data: existing } = await supabase.from('chest_purchase_txs').select('tx_signature').eq('tx_signature', sig).maybeSingle();
        if (existing) {
            const { data: row } = await supabase.from('chest_opens_available').select('opens_remaining').eq('user_wallet', userWallet).maybeSingle();
            return res.status(200).json({ ok: true, opens: (row && row.opens_remaining) || 0 });
        }

        const connection = new Connection(RPC_URL, 'confirmed');
        const tx = await connection.getParsedTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (!tx || !tx.meta || tx.meta.err) return res.status(400).json({ error: 'Transaction not found or failed' });

        const instructions = tx.transaction?.message?.instructions || [];
        const { getAssociatedTokenAddress } = require('@solana/spl-token');
        const userPubkey = new PublicKey(userWallet);
        const treasuryPubkey = new PublicKey(BRONZE_TREASURY_WALLET);
        const mintPubkey = new PublicKey(XMA_TOKEN_MINT);
        const userAta = await getAssociatedTokenAddress(mintPubkey, userPubkey);
        const treasuryAta = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);
        const userAtaStr = userAta.toString();
        const treasuryAtaStr = treasuryAta.toString();

        let found = false;
        for (const ix of instructions) {
            const p = ix.parsed;
            if (!p || p.type !== 'transfer') continue;
            const info = p.info;
            if (!info) continue;
            const amount = info.amount;
            const amountStr = typeof amount === 'string' ? amount : (amount && amount.amount);
            const amt = amountStr ? BigInt(amountStr) : 0n;
            const source = info.source || info.authority;
            const dest = info.destination;
            const src = (typeof source === 'string' ? source : source?.toString?.()) || '';
            const dst = (typeof dest === 'string' ? dest : dest?.toString?.()) || '';
            if (src === userAtaStr && dst === treasuryAtaStr && amt === BigInt(CHEST_PRICE_RAW)) {
                found = true;
                break;
            }
        }
        if (!found) return res.status(400).json({ error: 'Transaction is not a valid chest purchase (700k XMA to bronze treasury)' });

        await supabase.from('chest_purchase_txs').insert({ tx_signature: sig, user_wallet: userWallet });

        const { data: current } = await supabase.from('chest_opens_available').select('opens_remaining').eq('user_wallet', userWallet).maybeSingle();
        const newOpens = (current?.opens_remaining ?? 0) + 1;
        await supabase.from('chest_opens_available').upsert(
            { user_wallet: userWallet, opens_remaining: newOpens, updated_at: new Date().toISOString() },
            { onConflict: 'user_wallet' }
        );

        return res.status(200).json({ ok: true, opens: newOpens });
    } catch (err) {
        console.error('record-chest-purchase error:', err);
        return res.status(500).json({ error: err.message || 'Failed to record purchase' });
    }
};
