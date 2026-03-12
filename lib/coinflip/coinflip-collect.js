// POST /api/coinflip-collect — get signed transaction to send total_won XMA to user
const { Connection, PublicKey, Transaction, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction, getAccount, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
const { createClient } = require('@supabase/supabase-js');

const TREASURY_WALLET = '6auNHk39Mut82FhjY9iBZXjqm7xJabFVrY3bVgrYSMvj';
const XMA_TOKEN_MINT = 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';
const TOKEN_DECIMALS = 6;
const RPC_URL = process.env.HELIUS_RPC_URL || (process.env.HELIUS_API_KEY ? 'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(process.env.HELIUS_API_KEY) : 'https://api.mainnet-beta.solana.com');
const MAX_WIN_AMOUNT = 10000000;

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

    try {
        const { walletAddress } = req.body || {};
        if (!walletAddress) return res.status(400).json({ error: 'walletAddress required' });
        try { new PublicKey(walletAddress); } catch (e) { return res.status(400).json({ error: 'Invalid wallet' }); }

        if (!supabase) return res.status(500).json({ error: 'Database not configured' });
        const { data: player, error: fetchErr } = await supabase
            .from('coinflip_players')
            .select('total_won')
            .eq('wallet_address', walletAddress)
            .single();
        if (fetchErr || !player) return res.status(400).json({ error: 'Player not found' });
        const totalWonLamports = BigInt(player.total_won || 0);
        const amount = Number(totalWonLamports) / Math.pow(10, TOKEN_DECIMALS);
        if (amount <= 0) return res.status(400).json({ error: 'No winnings to collect' });
        if (amount > MAX_WIN_AMOUNT) return res.status(400).json({ error: 'Amount exceeds maximum' });

        const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;
        if (!treasuryPrivateKey) return res.status(500).json({ error: 'TREASURY_PRIVATE_KEY not set' });
        let treasuryKeypair;
        try {
            if (treasuryPrivateKey.startsWith('[')) {
                const arr = JSON.parse(treasuryPrivateKey);
                if (!Array.isArray(arr) || arr.length !== 64) throw new Error('Invalid key');
                treasuryKeypair = Keypair.fromSecretKey(Uint8Array.from(arr));
            } else {
                const bs58 = require('bs58');
                const decoded = bs58.decode(treasuryPrivateKey);
                if (decoded.length !== 64) throw new Error('Invalid key');
                treasuryKeypair = Keypair.fromSecretKey(decoded);
            }
        } catch (e) {
            return res.status(500).json({ error: 'Invalid treasury key' });
        }
        if (treasuryKeypair.publicKey.toString() !== TREASURY_WALLET) {
            return res.status(500).json({ error: 'Treasury key mismatch' });
        }

        const connection = new Connection(RPC_URL, 'confirmed');
        const tokenMint = new PublicKey(XMA_TOKEN_MINT);
        const userPublicKey = new PublicKey(walletAddress);
        const treasuryPublicKey = new PublicKey(TREASURY_WALLET);
        const userTokenAccount = await getAssociatedTokenAddress(tokenMint, userPublicKey);
        const treasuryTokenAccount = await getAssociatedTokenAddress(tokenMint, treasuryPublicKey);

        const transferAmount = totalWonLamports;
        let userAccountExists = false;
        try {
            await getAccount(connection, userTokenAccount);
            userAccountExists = true;
        } catch (e) {}
        try {
            const treasuryAccountInfo = await getAccount(connection, treasuryTokenAccount);
            const treasuryBalance = Number(treasuryAccountInfo.amount);
            if (treasuryBalance < Number(transferAmount)) {
                return res.status(503).json({
                    error: 'Insufficient treasury balance',
                    availableBalance: treasuryBalance / Math.pow(10, TOKEN_DECIMALS),
                    requiredAmount: amount
                });
            }
        } catch (e) {
            if (e.message && (e.message.includes('could not find account') || e.message.includes('not found'))) {
                return res.status(503).json({ error: 'Treasury token account not found' });
            }
            return res.status(500).json({ error: 'Failed to verify treasury balance' });
        }

        const transaction = new Transaction();
        if (!userAccountExists) {
            transaction.add(createAssociatedTokenAccountInstruction(
                treasuryPublicKey,
                userTokenAccount,
                userPublicKey,
                tokenMint
            ));
        }
        transaction.add(createTransferInstruction(
            treasuryTokenAccount,
            userTokenAccount,
            treasuryPublicKey,
            transferAmount
        ));
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = treasuryPublicKey;
        transaction.sign(treasuryKeypair);

        const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
        return res.status(200).json({
            transaction: serialized.toString('base64'),
            actualAmount: amount
        });
    } catch (err) {
        console.error('coinflip-collect error:', err);
        return res.status(500).json({ error: err.message || 'Server error' });
    }
};
