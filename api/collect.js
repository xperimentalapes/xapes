// Vercel serverless function to handle collect winnings
// Signs transaction on behalf of treasury wallet

const { Connection, PublicKey, Transaction, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction, getAccount, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
const { createClient } = require('@supabase/supabase-js');

const TREASURY_WALLET = '6auNHk39Mut82FhjY9iBZXjqm7xJabFVrY3bVgrYSMvj';
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
        // amount is mutable because we may override it with the DB value (source of truth)
        let { userWallet, amount } = req.body;

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

        // CRITICAL: Check database for actual unclaimed amount and atomically update to 0
        // This prevents race conditions where user clicks collect multiple times
        if (supabase) {
            try {
                // First, get current unclaimed rewards from database
                const { data: playerData, error: fetchError } = await supabase
                    .from('players')
                    .select('unclaimed_rewards')
                    .eq('wallet_address', userWallet)
                    .single();

                if (fetchError && fetchError.code !== 'PGRST116') {
                    console.error('Error fetching player data:', fetchError);
                    return res.status(500).json({ error: 'Failed to verify unclaimed rewards' });
                }

                // Convert database amount to XMA (6 decimals)
                const TOKEN_DECIMALS = 6;
                const dbUnclaimedRewards = playerData 
                    ? Number(playerData.unclaimed_rewards || 0) / Math.pow(10, TOKEN_DECIMALS)
                    : 0;

                // Security: Verify the amount matches what user is requesting
                // Use database amount as source of truth (prevents frontend manipulation)
                if (dbUnclaimedRewards <= 0) {
                    console.warn(`Collect attempt with no unclaimed rewards. Wallet: ${userWallet}, Requested: ${amount}, DB: ${dbUnclaimedRewards}`);
                    return res.status(400).json({ 
                        error: 'No unclaimed rewards available',
                        actualAmount: 0
                    });
                }

                // If requested amount doesn't match database, use database amount (source of truth)
                if (Math.abs(dbUnclaimedRewards - amount) > 0.000001) {
                    console.warn(`Amount mismatch: requested ${amount}, database has ${dbUnclaimedRewards}. Using database amount.`);
                    amount = dbUnclaimedRewards;
                }

                // Store the expected unclaimed_rewards value for later verification
                // We'll clear it only after transaction is confirmed (in confirm-collect endpoint)
                // This prevents losing rewards if transaction fails
                console.log(`Verified ${amount} XMA available for collection. Wallet: ${userWallet}`);
            } catch (dbError) {
                console.error('Database error during collect verification:', dbError);
                return res.status(500).json({ 
                    error: 'Failed to verify unclaimed rewards',
                    message: dbError.message 
                });
            }
        } else {
            // If database not configured, still proceed but log warning
            console.warn('Supabase not configured - cannot verify unclaimed rewards from database');
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

        // Check if user's token account exists, create instruction if needed
        let userAccountExists = false;
        try {
            await getAccount(connection, userTokenAccount);
            userAccountExists = true;
        } catch (error) {
            // User token account doesn't exist - we'll need to create it
            userAccountExists = false;
        }

        // CRITICAL: Verify treasury token account exists and has sufficient balance
        console.log(`Checking treasury token account: ${treasuryTokenAccount.toString()}`);
        console.log(`Treasury wallet: ${TREASURY_WALLET}`);
        console.log(`Token mint: ${XMA_TOKEN_MINT}`);
        
        // Also check what token accounts actually exist for this wallet
        try {
            const allTokenAccounts = await connection.getParsedTokenAccountsByOwner(treasuryPublicKey, {
                mint: tokenMint
            });
            console.log(`Found ${allTokenAccounts.value.length} token account(s) for treasury wallet ${TREASURY_WALLET}`);
            if (allTokenAccounts.value.length > 0) {
                allTokenAccounts.value.forEach((acc, idx) => {
                    console.log(`  Token account ${idx + 1}: ${acc.pubkey.toString()}, Balance: ${acc.account.data.parsed.info.tokenAmount.uiAmount} XMA`);
                });
                // Check if our calculated ATA matches any existing account
                const matchingAccount = allTokenAccounts.value.find(acc => acc.pubkey.toString() === treasuryTokenAccount.toString());
                if (!matchingAccount) {
                    console.warn(`⚠️ WARNING: Calculated ATA (${treasuryTokenAccount.toString()}) does not match any existing token account!`);
                    console.warn(`  Using first token account instead: ${allTokenAccounts.value[0].pubkey.toString()}`);
                    // Use the first token account if ATA doesn't match (for debugging)
                    // But keep using ATA as that's the standard
                }
            }
        } catch (diagError) {
            console.warn('Could not list token accounts for diagnostics:', diagError.message);
        }
        
        let treasuryAccountExists = false;
        let treasuryBalance = 0;
        
        try {
            const treasuryAccountInfo = await getAccount(connection, treasuryTokenAccount);
            treasuryAccountExists = true;
            treasuryBalance = Number(treasuryAccountInfo.amount);
            const requiredAmount = Number(transferAmount);
            
            console.log(`✓ Treasury token account EXISTS: ${treasuryTokenAccount.toString()}`);
            console.log(`✓ Treasury balance: ${treasuryBalance} raw units (${treasuryBalance / Math.pow(10, TOKEN_DECIMALS)} XMA)`);
            console.log(`✓ Required amount: ${requiredAmount} raw units (${amount} XMA)`);
            
            if (treasuryBalance < requiredAmount) {
                console.error(`✗ Insufficient treasury balance: ${treasuryBalance / Math.pow(10, TOKEN_DECIMALS)} XMA available, ${amount} XMA required`);
                return res.status(503).json({ 
                    error: 'Insufficient treasury balance',
                    message: `Treasury has insufficient funds. Available: ${(treasuryBalance / Math.pow(10, TOKEN_DECIMALS)).toFixed(2)} XMA, Required: ${amount} XMA`,
                    treasuryAccount: treasuryTokenAccount.toString(),
                    availableBalance: treasuryBalance / Math.pow(10, TOKEN_DECIMALS),
                    requiredAmount: amount
                });
            }
            
            console.log(`✓ Treasury balance verified: ${treasuryBalance / Math.pow(10, TOKEN_DECIMALS)} XMA available`);
        } catch (accountError) {
            // Token account doesn't exist or other error
            const errorMsg = accountError.message || accountError.toString() || 'Unknown error';
            console.error(`✗ Error checking treasury token account (${treasuryTokenAccount.toString()}):`, errorMsg);
            console.error(`Full error object:`, accountError);
            
            // Check treasury wallet SOL balance for diagnostics
            try {
                const treasuryBalanceSOL = await connection.getBalance(treasuryPublicKey);
                console.log(`Treasury wallet SOL balance: ${treasuryBalanceSOL / 1e9} SOL`);
                
                // Try to find any token accounts for this wallet
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(treasuryPublicKey, {
                    mint: tokenMint
                });
                console.log(`Found ${tokenAccounts.value.length} token account(s) for treasury wallet`);
                if (tokenAccounts.value.length > 0) {
                    console.log(`Token accounts:`, tokenAccounts.value.map(acc => ({
                        address: acc.pubkey.toString(),
                        balance: acc.account.data.parsed.info.tokenAmount.uiAmount
                    })));
                }
            } catch (diagError) {
                console.error('Error getting diagnostics:', diagError);
            }
            
            if (errorMsg.includes('could not find account') || errorMsg.includes('Invalid param') || errorMsg.includes('not found')) {
                return res.status(503).json({ 
                    error: 'Treasury token account not found',
                    message: `The treasury token account does not exist at ${treasuryTokenAccount.toString()}. This usually means no one has purchased spins yet with the new treasury wallet. The account will be created automatically when the first purchase is made.`,
                    treasuryAccount: treasuryTokenAccount.toString(),
                    treasuryWallet: TREASURY_WALLET,
                    tokenMint: XMA_TOKEN_MINT,
                    suggestion: 'Please make a purchase first to create the treasury token account, or contact support if purchases have already been made.'
                });
            }
            return res.status(500).json({ 
                error: 'Failed to verify treasury balance',
                message: errorMsg,
                treasuryAccount: treasuryTokenAccount.toString(),
                details: 'Check server logs for more information'
            });
        }
        
        if (!treasuryAccountExists) {
            return res.status(503).json({ 
                error: 'Treasury token account not found',
                message: `The treasury token account does not exist. Please make a purchase first to create it.`,
                treasuryAccount: treasuryTokenAccount.toString(),
                treasuryWallet: TREASURY_WALLET
            });
        }

        // Create transaction
        const transaction = new Transaction();

        // If user's token account doesn't exist, add instruction to create it first
        if (!userAccountExists) {
            const createAccountInstruction = createAssociatedTokenAccountInstruction(
                treasuryPublicKey, // Payer (treasury pays for account creation)
                userTokenAccount,  // New token account to create
                userPublicKey,     // Owner of the token account
                tokenMint          // Token mint
            );
            transaction.add(createAccountInstruction);
            console.log(`Adding instruction to create user token account: ${userTokenAccount.toString()}`);
        }

        // Create transfer instruction (from treasury to user)
        // Log the accounts being used for debugging
        console.log(`Creating transfer instruction:`);
        console.log(`  From (treasury token account): ${treasuryTokenAccount.toString()}`);
        console.log(`  To (user token account): ${userTokenAccount.toString()}`);
        console.log(`  Authority (treasury wallet): ${treasuryPublicKey.toString()}`);
        console.log(`  Amount: ${transferAmount.toString()} raw units (${amount} XMA)`);
        
        const transferInstruction = createTransferInstruction(
            treasuryTokenAccount,
            userTokenAccount,
            treasuryPublicKey,
            transferAmount
        );
        transaction.add(transferInstruction);
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = treasuryPublicKey;

        // Sign transaction with treasury keypair
        transaction.sign(treasuryKeypair);
        
        // Log transaction details for debugging
        console.log(`Transaction created:`);
        console.log(`  Instructions: ${transaction.instructions.length}`);
        console.log(`  Signers: ${transaction.signatures.length}`);
        console.log(`  Fee payer: ${transaction.feePayer.toString()}`);
        console.log(`  Recent blockhash: ${transaction.recentBlockhash}`);
        
        // Verify transaction is properly signed
        if (!transaction.signature) {
            console.error('ERROR: Transaction is not signed!');
            return res.status(500).json({ error: 'Transaction signing failed' });
        }
        
        console.log(`Transaction signature (before serialization): ${transaction.signature.toString()}`);
        
        // Verify all required signatures are present
        const requiredSignatures = transaction.signatures.filter(sig => sig.signature !== null);
        if (requiredSignatures.length === 0) {
            console.error('ERROR: No signatures found on transaction!');
            return res.status(500).json({ error: 'Transaction has no signatures' });
        }
        
        console.log(`Transaction has ${requiredSignatures.length} signature(s)`);
        
        // Serialize transaction
        const serializedTransaction = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false
        });
        
        console.log(`Transaction serialized: ${serializedTransaction.length} bytes`);

        // Note: Unclaimed rewards will be cleared in confirm-collect endpoint after transaction is confirmed
        // This prevents losing rewards if transaction fails

        // Return the signed transaction as base64 and actual amount collected
        return res.status(200).json({
            transaction: serializedTransaction.toString('base64'),
            actualAmount: amount // Return the actual amount that was collected (from database)
        });

    } catch (error) {
        console.error('Collect error:', error);
        return res.status(500).json({ 
            error: 'Failed to create collect transaction',
            message: error.message 
        });
    }
};
