// Reserve a chest prize for a user so the same NFT/token amount isn't given twice.
// Uses Supabase to track reservations and Helius RPC to check treasury balances.

const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');
const {
    getAssociatedTokenAddress,
    getAccount
} = require('@solana/spl-token');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

const BRONZE_TREASURY_WALLET = '9iyfxFga7a9FAkkgpgeP7PSscKEKdShihvso44GiMT4H';
const RPC_URL = process.env.HELIUS_RPC_URL || ('https://mainnet.helius-rpc.com/?api-key=' + (process.env.HELIUS_API_KEY || ''));

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
        const { userWallet, prizeType, mint, tokenMint, amount, decimals } = req.body;
        if (!userWallet) return res.status(400).json({ error: 'userWallet required' });
        if (prizeType !== 'nft' && prizeType !== 'token') return res.status(400).json({ error: 'prizeType must be nft or token' });

        try { new PublicKey(userWallet); } catch (e) { return res.status(400).json({ error: 'Invalid user wallet' }); }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

        const connection = new Connection(RPC_URL, 'confirmed');
        const treasuryPubkey = new PublicKey(BRONZE_TREASURY_WALLET);

        if (prizeType === 'nft') {
            if (!mint) return res.status(400).json({ error: 'mint required for nft' });
            const mintPubkey = new PublicKey(mint);
            const treasuryTokenAccount = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);

            try {
                const treasuryAccount = await getAccount(connection, treasuryTokenAccount);
                if (Number(treasuryAccount.amount) < 1) {
                    return res.status(503).json({ reserved: false, error: 'NFT no longer in treasury' });
                }
            } catch (e) {
                return res.status(503).json({ reserved: false, error: 'Treasury NFT account not found or error: ' + (e.message || '') });
            }

            const { data: existing } = await supabase
                .from('chest_reservations')
                .select('id')
                .eq('prize_type', 'nft')
                .eq('mint', mint)
                .gt('expires_at', now.toISOString())
                .maybeSingle();

            if (existing) {
                return res.status(200).json({ reserved: false, reason: 'already_reserved' });
            }

            const { data, error } = await supabase
                .from('chest_reservations')
                .insert({
                    user_wallet: userWallet,
                    prize_type: 'nft',
                    mint,
                    amount: 1,
                    decimals: 0,
                    expires_at: expiresAt
                })
                .select('id')
                .single();

            if (error) {
                console.error('reserve-chest-prize insert nft error:', error);
                return res.status(500).json({ error: 'Failed to reserve NFT prize' });
            }

            return res.status(200).json({ reserved: true, reservationId: data.id });
        }

        if (!tokenMint || amount == null || decimals == null) {
            return res.status(400).json({ error: 'tokenMint, amount, decimals required for token' });
        }

        const dec = Math.max(0, Number(decimals));
        const requestedRaw = BigInt(Math.floor(Number(amount) * Math.pow(10, dec)));
        if (!isFinite(Number(amount)) || requestedRaw <= 0n) {
            return res.status(400).json({ error: 'Invalid token amount' });
        }

        const mintPubkey = new PublicKey(tokenMint);
        const treasuryTokenAccount = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);

        let availableRaw;
        try {
            const treasuryAccount = await getAccount(connection, treasuryTokenAccount);
            availableRaw = BigInt(treasuryAccount.amount.toString());
        } catch (e) {
            return res.status(503).json({ reserved: false, error: 'Treasury token account not found or error: ' + (e.message || '') });
        }

        const { data: reservedRows, error: sumErr } = await supabase
            .from('chest_reservations')
            .select('amount')
            .eq('prize_type', 'token')
            .eq('token_mint', tokenMint)
            .gt('expires_at', now.toISOString());

        if (sumErr) {
            console.error('reserve-chest-prize sum error:', sumErr);
            return res.status(500).json({ error: 'Failed to check existing reservations' });
        }

        let alreadyReservedRaw = 0n;
        if (reservedRows && reservedRows.length) {
            for (const row of reservedRows) {
                if (row.amount != null) {
                    alreadyReservedRaw += BigInt(row.amount.toString());
                }
            }
        }

        if (availableRaw < alreadyReservedRaw + requestedRaw) {
            return res.status(200).json({ reserved: false, reason: 'insufficient_treasury' });
        }

        const { data, error } = await supabase
            .from('chest_reservations')
            .insert({
                user_wallet: userWallet,
                prize_type: 'token',
                token_mint: tokenMint,
                amount: requestedRaw.toString(),
                decimals: dec,
                expires_at: expiresAt
            })
            .select('id')
            .single();

        if (error) {
            console.error('reserve-chest-prize insert token error:', error);
            return res.status(500).json({ error: 'Failed to reserve token prize' });
        }

        return res.status(200).json({ reserved: true, reservationId: data.id });
    } catch (err) {
        console.error('reserve-chest-prize error:', err);
        return res.status(500).json({ error: err.message || 'Failed to reserve chest prize' });
    }
};

// Reserve a chest prize for a user (so same NFT/token isn't given to two people). Requires Supabase + RPC.

const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const BRONZE_TREASURY_WALLET = '9iyfxFga7a9FAkkgpgeP7PSscKEKdShihvso44GiMT4H';
const RPC_URL = process.env.HELIUS_RPC_URL || ('https://mainnet.helius-rpc.com/?api-key=' + (process.env.HELIUS_API_KEY || ''));

const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;
const RESERVATION_TTL_MS = 5 * 60 * 1000;

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
        const { userWallet, prizeType, mint, tokenMint, amount, decimals } = req.body;
        if (!userWallet) return res.status(400).json({ error: 'userWallet required' });
        if (prizeType !== 'nft' && prizeType !== 'token') return res.status(400).json({ error: 'prizeType must be nft or token' });
        try { new PublicKey(userWallet); } catch (e) { return res.status(400).json({ error: 'Invalid user wallet' }); }

        const connection = new Connection(RPC_URL, 'confirmed');
        const treasuryPubkey = new PublicKey(BRONZE_TREASURY_WALLET);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);

        if (prizeType === 'nft') {
            if (!mint) return res.status(400).json({ error: 'mint required for nft' });
            const mintPubkey = new PublicKey(mint);
            const treasuryAta = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);
            const { data: existing } = await supabase
                .from('chest_reservations')
                .select('id')
                .eq('mint', mint)
                .gt('expires_at', now.toISOString())
                .limit(1)
                .maybeSingle();
            if (existing) return res.status(200).json({ reserved: false, reason: 'Prize already reserved' });
            try {
                const acc = await getAccount(connection, treasuryAta);
                if (Number(acc.amount) < 1) return res.status(200).json({ reserved: false, reason: 'NFT not available' });
            } catch (e) {
                return res.status(200).json({ reserved: false, reason: 'NFT not available' });
            }
            const { data: ins, error } = await supabase
                .from('chest_reservations')
                .insert({
                    user_wallet: userWallet,
                    prize_type: 'nft',
                    mint,
                    token_mint: null,
                    amount: null,
                    decimals: null,
                    expires_at: expiresAt.toISOString()
                })
                .select('id')
                .single();
            if (error) {
                if (error.code === '23505') return res.status(200).json({ reserved: false });
                throw error;
            }
            return res.status(200).json({ reserved: true, reservationId: ins.id });
        }

        if (prizeType === 'token') {
            if (!tokenMint || amount == null || decimals == null) return res.status(400).json({ error: 'tokenMint, amount, decimals required for token' });
            const mintPubkey = new PublicKey(tokenMint);
            const dec = Math.max(0, Number(decimals));
            const amountRaw = Math.floor(Number(amount) * Math.pow(10, dec));
            if (!isFinite(amountRaw) || amountRaw <= 0) return res.status(400).json({ error: 'Invalid amount' });
            const treasuryAta = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);
            try {
                const acc = await getAccount(connection, treasuryAta);
                if (Number(acc.amount) < amountRaw) return res.status(200).json({ reserved: false, reason: 'Insufficient token balance' });
            } catch (e) {
                return res.status(200).json({ reserved: false, reason: 'Token not available' });
            }
            const { data: ins, error } = await supabase
                .from('chest_reservations')
                .insert({
                    user_wallet: userWallet,
                    prize_type: 'token',
                    mint: null,
                    token_mint: tokenMint,
                    amount: Number(amount),
                    decimals: dec,
                    expires_at: expiresAt.toISOString()
                })
                .select('id')
                .single();
            if (error) throw error;
            return res.status(200).json({ reserved: true, reservationId: ins.id });
        }

        return res.status(400).json({ error: 'Invalid prizeType' });
    } catch (err) {
        console.error('reserve-chest-prize error:', err);
        return res.status(500).json({ error: err.message || 'Failed to reserve' });
    }
};
