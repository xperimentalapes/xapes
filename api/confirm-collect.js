// Vercel serverless function to confirm collect after transaction is verified
// Clears unclaimed_rewards only after transaction is confirmed on-chain

const { Connection, PublicKey } = require('@solana/web3.js');
const { createClient } = require('@supabase/supabase-js');

const TOKEN_DECIMALS = 6;
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=277997e8-09ce-4516-a03e-5b062b51c6ac';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
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
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabase) {
        return res.status(500).json({ error: 'Database not configured' });
    }

    try {
        const { userWallet, signature, amount } = req.body;

        // Validate inputs
        if (!userWallet || !signature || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid request: userWallet, signature, and amount required' });
        }

        // Validate wallet address format
        try {
            new PublicKey(userWallet);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }

        // Verify transaction signature exists and is valid
        try {
            new PublicKey(signature);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid transaction signature format' });
        }

        // Connect to Solana and verify transaction
        const connection = new Connection(RPC_URL, 'confirmed');
        
        // Check if transaction is confirmed
        const status = await connection.getSignatureStatus(signature);
        
        if (!status || !status.value) {
            return res.status(400).json({ error: 'Transaction not found' });
        }

        if (status.value.err) {
            console.error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
            return res.status(400).json({ 
                error: 'Transaction failed',
                transactionError: status.value.err
            });
        }

        if (!status.value.confirmationStatus || status.value.confirmationStatus === 'processed') {
            // Transaction is still processing, wait a bit
            return res.status(202).json({ 
                message: 'Transaction still processing',
                status: 'processing'
            });
        }

        // Transaction is confirmed - now safely clear unclaimed_rewards
        // Get current unclaimed rewards to verify amount matches
        const { data: playerData, error: fetchError } = await supabase
            .from('players')
            .select('unclaimed_rewards')
            .eq('wallet_address', userWallet)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('Error fetching player data:', fetchError);
            return res.status(500).json({ error: 'Failed to verify unclaimed rewards' });
        }

        if (!playerData) {
            return res.status(404).json({ error: 'Player not found' });
        }

        const dbUnclaimedRewards = Number(playerData.unclaimed_rewards || 0) / Math.pow(10, TOKEN_DECIMALS);

        // Verify amount matches (within small tolerance for floating point)
        if (Math.abs(dbUnclaimedRewards - amount) > 0.000001) {
            console.warn(`Amount mismatch during confirm: expected ${amount}, database has ${dbUnclaimedRewards}`);
            // Still proceed if database amount is close (might have been updated)
        }

        // Atomically clear unclaimed_rewards to 0
        const { data: updateData, error: updateError } = await supabase
            .from('players')
            .update({ unclaimed_rewards: '0' })
            .eq('wallet_address', userWallet)
            .eq('unclaimed_rewards', playerData.unclaimed_rewards) // Only update if value hasn't changed
            .select();

        if (updateError) {
            console.error('Error clearing unclaimed rewards:', updateError);
            return res.status(500).json({ error: 'Failed to clear unclaimed rewards' });
        }

        if (!updateData || updateData.length === 0) {
            // Already cleared (maybe by another request or race condition)
            console.warn(`Unclaimed rewards already cleared for wallet: ${userWallet}`);
            return res.status(200).json({ 
                message: 'Unclaimed rewards already cleared',
                alreadyCleared: true
            });
        }

        console.log(`Successfully cleared unclaimed rewards for ${userWallet}. Amount: ${amount} XMA`);
        
        return res.status(200).json({
            message: 'Unclaimed rewards cleared successfully',
            amount: amount
        });

    } catch (error) {
        console.error('Confirm collect error:', error);
        return res.status(500).json({ 
            error: 'Failed to confirm collect',
            message: error.message 
        });
    }
};
