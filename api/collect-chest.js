// Vercel serverless: send chest prize (NFT or token) from bronze treasury to user.
// Uses BRONZE_WALLET_KEY (private key for bronze treasury). No user signature – backend signs and returns tx; frontend sends.

const { Connection, PublicKey, Transaction, Keypair } = require('@solana/web3.js');
const {
    getAssociatedTokenAddress,
    createTransferInstruction,
    getAccount,
    createAssociatedTokenAccountInstruction
} = require('@solana/spl-token');
const { createClient } = require('@supabase/supabase-js');

const BRONZE_TREASURY_WALLET = '9iyfxFga7a9FAkkgpgeP7PSscKEKdShihvso44GiMT4H';
const RPC_URL = process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=' + (process.env.HELIUS_API_KEY || '');

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

    try {
        const { userWallet, prizeType, mint, tokenMint, amount, decimals, reservationId } = req.body;
        if (!userWallet) return res.status(400).json({ error: 'userWallet required' });
        if (prizeType !== 'nft' && prizeType !== 'token') return res.status(400).json({ error: 'prizeType must be nft or token' });
        if (supabase && !reservationId) return res.status(400).json({ error: 'reservationId required for collect' });

        let reservation = null;
        if (supabase) {
            const { data, error } = await supabase
                .from('chest_reservations')
                .select('*')
                .eq('id', reservationId)
                .single();
            if (error || !data) {
                return res.status(400).json({ error: 'Reservation not found' });
            }
            const nowIso = new Date().toISOString();
            if (data.user_wallet !== userWallet) {
                return res.status(400).json({ error: 'Reservation does not belong to this wallet' });
            }
            if (data.expires_at <= nowIso) {
                return res.status(400).json({ error: 'Reservation expired' });
            }
            if (data.prize_type !== prizeType) {
                return res.status(400).json({ error: 'Reservation prize type mismatch' });
            }
            reservation = data;
        }

        let mintPubkey;
        let transferAmountRaw;
        if (prizeType === 'nft') {
            if (!mint) return res.status(400).json({ error: 'mint required for nft' });
            mintPubkey = new PublicKey(mint);
            transferAmountRaw = 1;
            if (reservation && reservation.mint !== mint) {
                return res.status(400).json({ error: 'Reservation mint mismatch' });
            }
        } else {
            if (!tokenMint || amount == null || decimals == null) return res.status(400).json({ error: 'tokenMint, amount, decimals required for token' });
            mintPubkey = new PublicKey(tokenMint);
            const dec = Math.max(0, Number(decimals));
            transferAmountRaw = Math.floor(Number(amount) * Math.pow(10, dec));
            if (!isFinite(transferAmountRaw) || transferAmountRaw <= 0) return res.status(400).json({ error: 'Invalid token amount' });
            if (reservation) {
                if (reservation.token_mint !== tokenMint) {
                    return res.status(400).json({ error: 'Reservation token mint mismatch' });
                }
                const reservedRaw = BigInt(reservation.amount.toString());
                if (reservedRaw !== BigInt(transferAmountRaw)) {
                    return res.status(400).json({ error: 'Reservation amount mismatch' });
                }
            }
        }

        try { new PublicKey(userWallet); } catch (e) { return res.status(400).json({ error: 'Invalid user wallet' }); }

        const bronzePrivateKey = process.env.BRONZE_WALLET_KEY;
        if (!bronzePrivateKey) {
            return res.status(500).json({ error: 'BRONZE_WALLET_KEY not set. Add the bronze treasury private key in Vercel.' });
        }

        let keypair;
        try {
            if (bronzePrivateKey.startsWith('[')) {
                const arr = JSON.parse(bronzePrivateKey);
                if (!Array.isArray(arr) || arr.length !== 64) throw new Error('Invalid key length');
                keypair = Keypair.fromSecretKey(Uint8Array.from(arr));
            } else {
                const bs58 = require('bs58');
                const decoded = bs58.decode(bronzePrivateKey);
                if (decoded.length !== 64) throw new Error('Invalid key length');
                keypair = Keypair.fromSecretKey(decoded);
            }
        } catch (e) {
            return res.status(500).json({ error: 'Invalid BRONZE_WALLET_KEY format: ' + (e.message || '') });
        }

        if (keypair.publicKey.toString() !== BRONZE_TREASURY_WALLET) {
            return res.status(500).json({ error: 'BRONZE_WALLET_KEY does not match bronze treasury address' });
        }

        const connection = new Connection(RPC_URL, 'confirmed');
        const userPublicKey = new PublicKey(userWallet);
        const treasuryPublicKey = keypair.publicKey;

        const [treasuryTokenAccount, userTokenAccount] = await Promise.all([
            getAssociatedTokenAddress(mintPubkey, treasuryPublicKey),
            getAssociatedTokenAddress(mintPubkey, userPublicKey)
        ]);

        let userAccountExists = false;
        try {
            await getAccount(connection, userTokenAccount);
            userAccountExists = true;
        } catch (_) {}

        try {
            const treasuryAccount = await getAccount(connection, treasuryTokenAccount);
            const balance = Number(treasuryAccount.amount);
            if (balance < transferAmountRaw) {
                return res.status(503).json({
                    error: 'Insufficient treasury balance',
                    available: balance,
                    required: transferAmountRaw
                });
            }
        } catch (e) {
            return res.status(503).json({ error: 'Treasury token account not found or error: ' + (e.message || '') });
        }

        const transaction = new Transaction();
        if (!userAccountExists) {
            transaction.add(createAssociatedTokenAccountInstruction(
                treasuryPublicKey,
                userTokenAccount,
                userPublicKey,
                mintPubkey
            ));
        }
        transaction.add(createTransferInstruction(
            treasuryTokenAccount,
            userTokenAccount,
            treasuryPublicKey,
            BigInt(transferAmountRaw)
        ));

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = treasuryPublicKey;
        transaction.sign(keypair);

        if (supabase && reservation) {
            await supabase
                .from('chest_reservations')
                .delete()
                .eq('id', reservation.id);
        }

        const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
        return res.status(200).json({ transaction: serialized.toString('base64') });
    } catch (error) {
        console.error('Collect chest error:', error);
        return res.status(500).json({ error: 'Failed to create collect transaction', message: error.message });
    }
};
