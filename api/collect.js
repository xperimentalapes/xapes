// Vercel serverless function to handle collect winnings
// Signs transaction on behalf of treasury wallet

const { Connection, PublicKey, Transaction, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');

const TREASURY_WALLET = '5eZ3Qt1jKCGdXkCES791W68T87bGG62j9ZHcmBaMUtTP';
const XMA_TOKEN_MINT = 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';
const TOKEN_DECIMALS = 6;
// Use Helius RPC endpoint (dedicated service, no rate limits)
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=277997e8-09ce-4516-a03e-5b062b51c6ac';

module.exports = async function handler(req, res) {
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

        // Create transfer instruction (from treasury to user)
        const transferAmount = BigInt(Math.floor(amount * Math.pow(10, TOKEN_DECIMALS)));
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
}
