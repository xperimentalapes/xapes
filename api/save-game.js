// Vercel serverless function to save game data to Supabase
// Called after each spin to persist player state

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
        const { 
            walletAddress, 
            spinCost, 
            resultSymbols, 
            wonAmount,
            updateUnclaimedRewards,
            updateSpinsRemaining,
            spinsPurchased
        } = req.body;

        // Validate inputs
        if (!walletAddress) {
            return res.status(400).json({ error: 'walletAddress is required' });
        }

        // Validate wallet address format
        try {
            const { PublicKey } = require('@solana/web3.js');
            new PublicKey(walletAddress);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }

        // Upsert player data (insert or update)
        const playerUpdate = {
            wallet_address: walletAddress,
            updated_at: new Date().toISOString()
        };

        // If this is a new player, set created_at
        const { data: existingPlayer } = await supabase
            .from('players')
            .select('wallet_address')
            .eq('wallet_address', walletAddress)
            .single();

        if (!existingPlayer) {
            playerUpdate.created_at = new Date().toISOString();
            playerUpdate.total_spins = 1;
            playerUpdate.total_wagered = BigInt(Math.floor(spinCost * 1e6)).toString();
            playerUpdate.total_won = BigInt(Math.floor(wonAmount * 1e6)).toString();
            playerUpdate.unclaimed_rewards = updateUnclaimedRewards 
                ? BigInt(Math.floor(updateUnclaimedRewards * 1e6)).toString()
                : BigInt(Math.floor(wonAmount * 1e6)).toString();
            // If spins were purchased, set spins_remaining, otherwise start at 0 and decrement
            if (spinsPurchased !== undefined) {
                playerUpdate.spins_remaining = spinsPurchased;
            } else {
                playerUpdate.spins_remaining = 0; // First spin, so no remaining after this
            }
        } else {
            // Update existing player
            const { data: currentPlayer } = await supabase
                .from('players')
                .select('total_spins, total_won, total_wagered, unclaimed_rewards, spins_remaining')
                .eq('wallet_address', walletAddress)
                .single();

            if (currentPlayer) {
                // If spins were purchased, add to remaining
                if (spinsPurchased !== undefined && spinsPurchased > 0) {
                    playerUpdate.spins_remaining = (currentPlayer.spins_remaining || 0) + spinsPurchased;
                } 
                // If updateSpinsRemaining is explicitly set, use that value
                else if (updateSpinsRemaining !== undefined) {
                    playerUpdate.spins_remaining = updateSpinsRemaining;
                }
                // Otherwise, decrement by 1 (a spin was played)
                else {
                    playerUpdate.total_spins = (currentPlayer.total_spins || 0) + 1;
                    playerUpdate.spins_remaining = Math.max(0, (currentPlayer.spins_remaining || 0) - 1);
                }
                
                playerUpdate.total_wagered = (
                    BigInt(currentPlayer.total_wagered || 0) + 
                    BigInt(Math.floor(spinCost * 1e6))
                ).toString();
                playerUpdate.total_won = (
                    BigInt(currentPlayer.total_won || 0) + 
                    BigInt(Math.floor(wonAmount * 1e6))
                ).toString();
                
                if (updateUnclaimedRewards !== undefined) {
                    playerUpdate.unclaimed_rewards = BigInt(Math.floor(updateUnclaimedRewards * 1e6)).toString();
                } else if (wonAmount > 0) {
                    // Add to unclaimed if won
                    playerUpdate.unclaimed_rewards = (
                        BigInt(currentPlayer.unclaimed_rewards || 0) + 
                        BigInt(Math.floor(wonAmount * 1e6))
                    ).toString();
                } else {
                    playerUpdate.unclaimed_rewards = currentPlayer.unclaimed_rewards || '0';
                }
            }
        }

        // Upsert player
        console.log('Attempting to upsert player:', {
            wallet_address: playerUpdate.wallet_address,
            total_spins: playerUpdate.total_spins,
            total_wagered: playerUpdate.total_wagered,
            total_won: playerUpdate.total_won,
            unclaimed_rewards: playerUpdate.unclaimed_rewards,
            spins_remaining: playerUpdate.spins_remaining
        });
        
        const { data: playerData, error: playerError } = await supabase
            .from('players')
            .upsert(playerUpdate, { onConflict: 'wallet_address' });

        if (playerError) {
            console.error('Error saving player data:', playerError);
            return res.status(500).json({ error: 'Failed to save player data', details: playerError.message });
        }

        console.log('Player data saved successfully:', playerData);

        // Save game history entry
        const historyData = {
            wallet_address: walletAddress,
            spin_cost: BigInt(Math.floor(spinCost * 1e6)).toString(),
            result_symbols: resultSymbols,
            won_amount: BigInt(Math.floor(wonAmount * 1e6)).toString(),
            timestamp: new Date().toISOString()
        };
        
        console.log('Attempting to insert game history:', historyData);
        
        const { data: historyDataResult, error: historyError } = await supabase
            .from('game_history')
            .insert(historyData);

        if (historyError) {
            console.error('Error saving game history:', historyError);
            // Don't fail the request if history fails, but log it
        } else {
            console.log('Game history saved successfully:', historyDataResult);
        }

        return res.status(200).json({ 
            success: true,
            message: 'Game data saved successfully',
            playerData: playerData,
            historyData: historyDataResult
        });

    } catch (error) {
        console.error('Save game error:', error);
        return res.status(500).json({ 
            error: 'Failed to save game data',
            message: error.message 
        });
    }
};
