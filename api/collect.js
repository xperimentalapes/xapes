// Vercel serverless function to handle collect winnings
// Signs transaction on behalf of treasury wallet

const { Connection, PublicKey, Transaction, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');
const { createClient } = require('@supabase/supabase-js');

const TREASURY_WALLET = '5eZ3Qt1jKCGdXkCES791W68T87bGG62j9ZHcmBaMUtTP';
const XMA_TOKEN_MINT = 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';
const TOKEN_DECIMALS = 6;
// Use Helius RPC endpoint (dedicated service, no rate limits)
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=277997e8-09ce-4516-a03e-5b062b51c6ac';

// Initialize Supabase client for database operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseServiceKey 
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

// Security limits
const MAX_WIN_AMOUNT = 10000000; // Maximum win amount (10M XMA)
const MAX_REQUESTS_PER_MINUTE = 10; // Rate limiting: max 10 requests per minute per wallet

// Simple in-memory rate limiting (for production, use Redis or similar)
const rateLimitMap = new Map();

function checkRateLimit(walletAddress) {
    const now = Date.now();
    const key = walletAddress;
    const requests = rateLimitMap.get(key) || [];
    
    // Remove requests older than 1 minute
    const recentRequests = requests.filter(timestamp => now - timestamp < 60000);
    
    if (recentRequests.length >= MAX_REQUESTS_PER_MINUTE) {
        return false; // Rate limited
    }
    
    // Add current request
    recentRequests.push(now);
    rateLimitMap.set(key, recentRequests);
    
    // Clean up old entries periodically (keep map size manageable)
    if (rateLimitMap.size > 1000) {
        const oldestKey = rateLimitMap.keys().next().value;
        rateLimitMap.delete(oldestKey);
    }
    
    return true; // Allowed
}

module.exports = async function handler(req, res) {
    // CORS: Only allow requests from same origin (Vercel handles this, but we can be explicit)
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://xapes.vercel.app',
        'http://localhost:8000',
        'http://localhost:3000'
    ];
    
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userWallet, amount } = req.body;

        // Validate inputs
        if (!userWallet || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid request: userWallet and amount required' });
        }
        
        // Security: Validate wallet address format
        try {
            new PublicKey(userWallet); // Will throw if invalid
        } catch (error) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }
        
        // Security: Validate amount is a valid number
        if (isNaN(amount) || !isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount: must be a positive number' });
        }
        
        // Security: Enforce maximum win amount
        if (amount > MAX_WIN_AMOUNT) {
            console.error(`Win amount exceeds maximum: ${amount} from wallet ${userWallet}`);
            return res.status(400).json({ error: `Win amount exceeds maximum limit of ${MAX_WIN_AMOUNT.toLocaleString()} XMA` });
        }
        
        // Security: Rate limiting
        if (!checkRateLimit(userWallet)) {
            return res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
        }

        // Get treasury private key from environment variable
        const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;
        if (!treasuryPrivateKey) {
            console.error('TREASURY_PRIVATE_KEY not set in environment variables');
            return res.status(500).json({ 
                error: 'Server configuration error',
                message: 'TREASURY_PRIVATE_KEY environment variable is not set. Please configure it in Vercel.'
            });
        }

        // Parse treasury keypair
        // Support both JSON array format and base58 string format
        let treasuryKeypair;
        try {
            // Try parsing as JSON array first (most common format)
            if (treasuryPrivateKey.startsWith('[')) {
                const privateKeyArray = JSON.parse(treasuryPrivateKey);
                if (!Array.isArray(privateKeyArray) || privateKeyArray.length !== 64) {
                    throw new Error('Private key array must have 64 elements');
                }
                treasuryKeypair = Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
            } else {
                // Try base58 format (alternative)
                try {
                    const bs58 = require('bs58');
                    const decoded = bs58.decode(treasuryPrivateKey);
                    if (decoded.length !== 64) {
                        throw new Error('Private key must be 64 bytes');
                    }
                    treasuryKeypair = Keypair.fromSecretKey(decoded);
                } catch (bs58Error) {
                    throw new Error('Private key must be a JSON array [1,2,3,...] or base58 string. bs58 package may not be installed.');
                }
            }
        } catch (error) {
            console.error('Error parsing treasury private key:', error);
            console.error('Private key format received:', treasuryPrivateKey.substring(0, 20) + '...');
            return res.status(500).json({ 
                error: 'Invalid treasury key configuration',
                message: `Failed to parse treasury private key: ${error.message}. Expected JSON array [1,2,3,...] or base58 string.`
            });
        }

        // Initialize connection with retry configuration
        const connection = new Connection(RPC_URL, 'confirmed', {
            commitment: 'confirmed',
            disableRetryOnRateLimit: false
        });

        // Create public keys
        const tokenMint = new PublicKey(XMA_TOKEN_MINT);
        const userPublicKey = new PublicKey(userWallet);
        const treasuryPublicKey = new PublicKey(TREASURY_WALLET);

        // Verify treasury keypair matches expected address
        if (treasuryKeypair.publicKey.toString() !== TREASURY_WALLET) {
            console.error('Treasury keypair does not match expected address');
            return res.status(500).json({ error: 'Treasury key mismatch' });
        }

        // Get token accounts
        const userTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            userPublicKey
        );

        const treasuryTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            treasuryPublicKey
        );

        // Security: Validate and calculate transfer amount
        const transferAmountRaw = amount * Math.pow(10, TOKEN_DECIMALS);
        if (!isFinite(transferAmountRaw) || transferAmountRaw <= 0 || transferAmountRaw > MAX_WIN_AMOUNT * Math.pow(10, TOKEN_DECIMALS)) {
            console.error(`Invalid transfer amount calculation: ${transferAmountRaw} from amount ${amount}`);
            return res.status(400).json({ error: 'Invalid transfer amount calculation' });
        }
        
        const transferAmount = BigInt(Math.floor(transferAmountRaw));

        // Create transfer instruction (from treasury to user)
        const transferInstruction = createTransferInstruction(
            treasuryTokenAccount,
            userTokenAccount,
            treasuryPublicKey,
            transferAmount
        );

        // Create transaction
        const transaction = new Transaction().add(transferInstruction);
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = treasuryPublicKey;

        // Sign transaction with treasury keypair
        transaction.sign(treasuryKeypair);

        // Serialize transaction
        const serializedTransaction = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false
        });

        // Clear unclaimed rewards in database after successful transaction creation
        // Note: This clears it optimistically - if transaction fails, it will be restored on next spin
        if (collectSupabase) {
            try {
                const { error: updateError } = await collectSupabase
                    .from('players')
                    .update({ unclaimed_rewards: '0' })
                    .eq('wallet_address', userWallet);
                
                if (updateError) {
                    console.error('Error clearing unclaimed rewards:', updateError);
                    // Don't fail the request - transaction is still valid
                }
            } catch (dbError) {
                console.error('Database error clearing unclaimed rewards:', dbError);
                // Continue - transaction is still valid
            }
        }

        // Return the signed transaction as base64
        return res.status(200).json({
            transaction: serializedTransaction.toString('base64')
        });

    } catch (error) {
        console.error('Collect error:', error);
        return res.status(500).json({ 
            error: 'Failed to create collect transaction',
            message: error.message 
        });
    }
};
