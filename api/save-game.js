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
            spinsPurchased,
            chipsPurchased,
            costPerChip,
            updateChipsBalance,
            gameType = 'slots'
        } = req.body;

        const isRoulette = gameType === 'roulette';
        const playersTable = isRoulette ? 'roulette_players' : 'slots_players';
        const historyTable = isRoulette ? 'roulette_game_history' : 'slots_game_history';

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

        // Roulette uses chips; slots uses spins - branch early
        if (isRoulette) {
            const { data: existingRoulette } = await supabase
                .from(playersTable)
                .select('chips_balance, cost_per_chip, total_spins, total_won, total_wagered, unclaimed_rewards')
                .eq('wallet_address', walletAddress)
                .single();
            const currentChips = Number(existingRoulette?.chips_balance || 0);
            const storedCostPerChip = Number(existingRoulette?.cost_per_chip || 1);
            if (chipsPurchased !== undefined && chipsPurchased > 0) {
                if (currentChips > 0) {
                    return res.status(400).json({ error: 'Cannot buy more chips while you have chips. Collect or use them first.' });
                }
                if (!costPerChip || costPerChip <= 0) {
                    return res.status(400).json({ error: 'costPerChip must be > 0 when purchasing chips' });
                }
                playerUpdate.chips_balance = currentChips + chipsPurchased;
                playerUpdate.cost_per_chip = costPerChip;
            } else if (updateChipsBalance !== undefined) {
                playerUpdate.chips_balance = Math.max(0, Math.floor(updateChipsBalance));
                if (updateChipsBalance > 0) {
                    playerUpdate.total_spins = (existingRoulette?.total_spins || 0) + 1;
                    playerUpdate.total_wagered = (BigInt(existingRoulette?.total_wagered || 0) + BigInt(Math.floor(storedCostPerChip * 1e6))).toString();
                    playerUpdate.total_won = (BigInt(existingRoulette?.total_won || 0) + BigInt(Math.floor(wonAmount * 1e6))).toString();
                }
            }
            if (updateUnclaimedRewards !== undefined) {
                playerUpdate.unclaimed_rewards = BigInt(Math.floor(updateUnclaimedRewards * 1e6)).toString();
            } else if (existingRoulette) {
                playerUpdate.unclaimed_rewards = existingRoulette.unclaimed_rewards || '0';
            } else {
                playerUpdate.unclaimed_rewards = '0';
            }
            if (!existingRoulette && chipsPurchased > 0) {
                playerUpdate.created_at = new Date().toISOString();
                playerUpdate.total_spins = 0;
                playerUpdate.total_wagered = '0';
                playerUpdate.total_won = '0';
            }
        } else {
        // Slots logic
        const { data: existingPlayer } = await supabase
            .from(playersTable)
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
            // If spins were purchased, set spins_remaining and cost_per_spin
            if (spinsPurchased !== undefined && spinsPurchased > 0) {
                playerUpdate.spins_remaining = spinsPurchased;
                // CRITICAL: Use spinCost from request (the actual cost per spin used for purchase)
                // If spinCost is 0 or not provided, this is an error
                if (spinCost <= 0) {
                    console.error('Invalid spinCost for new player purchase:', spinCost);
                    return res.status(400).json({ error: 'spinCost must be provided and > 0 when purchasing spins' });
                }
                playerUpdate.cost_per_spin = Math.floor(spinCost); // Store cost per spin for remaining spins
            } else {
                playerUpdate.spins_remaining = 0; // First spin, so no remaining after this
                // For first spin, use spinCost from request
                if (spinCost > 0) {
                    playerUpdate.cost_per_spin = Math.floor(spinCost); // Store cost per spin
                } else {
                    playerUpdate.cost_per_spin = 100; // Default if not provided
                }
            }
        } else {
            // Update existing player
            const { data: currentPlayer } = await supabase
                .from(playersTable)
                .select('total_spins, total_won, total_wagered, unclaimed_rewards, spins_remaining, cost_per_spin')
                .eq('wallet_address', walletAddress)
                .single();

            if (currentPlayer) {
                // If spins were purchased, add to remaining (don't increment total_spins)
                if (spinsPurchased !== undefined && spinsPurchased > 0) {
                    // Only allow purchase if no spins remaining (to prevent mixed cost per spin)
                    if ((currentPlayer.spins_remaining || 0) > 0) {
                        return res.status(400).json({ 
                            error: 'Cannot purchase spins while spins are remaining. Please use existing spins first.',
                            spinsRemaining: currentPlayer.spins_remaining
                        });
                    }
                    playerUpdate.spins_remaining = (currentPlayer.spins_remaining || 0) + spinsPurchased;
                    // CRITICAL: Use spinCost from request (the actual cost per spin used for purchase)
                    // If spinCost is 0 or not provided, this is an error
                    if (spinCost <= 0) {
                        console.error('Invalid spinCost for purchase:', spinCost);
                        return res.status(400).json({ error: 'spinCost must be provided and > 0 when purchasing spins' });
                    }
                    playerUpdate.cost_per_spin = Math.floor(spinCost); // Store cost per spin for remaining spins
                    // Don't increment total_spins or update wagered/won for purchases
                } 
                // If updateSpinsRemaining is set, this is a spin (increment stats)
                // Use stored cost_per_spin from database for calculations (even if spinCost is 0)
                else if (updateSpinsRemaining !== undefined) {
                    // This is a spin - increment total_spins and update wagered/won
                    // Use stored cost_per_spin from database for prize calculations
                    const storedCostPerSpin = currentPlayer.cost_per_spin || 100;
                    playerUpdate.total_spins = (currentPlayer.total_spins || 0) + 1;
                    playerUpdate.spins_remaining = updateSpinsRemaining;
                    playerUpdate.total_wagered = (
                        BigInt(currentPlayer.total_wagered || 0) + 
                        BigInt(Math.floor(storedCostPerSpin * 1e6))
                    ).toString();
                    playerUpdate.total_won = (
                        BigInt(currentPlayer.total_won || 0) + 
                        BigInt(Math.floor(wonAmount * 1e6))
                    ).toString();
                    // Clear cost_per_spin when all spins are used
                    if (updateSpinsRemaining === 0) {
                        playerUpdate.cost_per_spin = null;
                    }
                }
                // Otherwise, this is a regular spin (spinCost > 0, no special flags)
                else if (spinCost > 0) {
                    // Use stored cost_per_spin from database for prize calculations
                    const storedCostPerSpin = currentPlayer.cost_per_spin || 100;
                    playerUpdate.total_spins = (currentPlayer.total_spins || 0) + 1;
                    const newSpinsRemaining = Math.max(0, (currentPlayer.spins_remaining || 0) - 1);
                    playerUpdate.spins_remaining = newSpinsRemaining;
                    playerUpdate.total_wagered = (
                        BigInt(currentPlayer.total_wagered || 0) + 
                        BigInt(Math.floor(storedCostPerSpin * 1e6))
                    ).toString();
                    playerUpdate.total_won = (
                        BigInt(currentPlayer.total_won || 0) + 
                        BigInt(Math.floor(wonAmount * 1e6))
                    ).toString();
                    // Clear cost_per_spin when all spins are used
                    if (newSpinsRemaining === 0) {
                        playerUpdate.cost_per_spin = null;
                    }
                }
                
                // Only update wagered/won if not already set above
                if (playerUpdate.total_wagered === undefined && spinCost > 0) {
                    playerUpdate.total_wagered = (
                        BigInt(currentPlayer.total_wagered || 0) + 
                        BigInt(Math.floor(spinCost * 1e6))
                    ).toString();
                }
                if (playerUpdate.total_won === undefined && wonAmount > 0) {
                    playerUpdate.total_won = (
                        BigInt(currentPlayer.total_won || 0) + 
                        BigInt(Math.floor(wonAmount * 1e6))
                    ).toString();
                }
                
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
        }

        // Upsert player
        console.log('Attempting to upsert player:', {
            wallet_address: playerUpdate.wallet_address,
            ...playerUpdate
        });
        
        const { data: playerData, error: playerError } = await supabase
            .from(playersTable)
            .upsert(playerUpdate, { onConflict: 'wallet_address' });

        if (playerError) {
            console.error('Error saving player data:', playerError);
            return res.status(500).json({ error: 'Failed to save player data', details: playerError.message });
        }

        console.log('Player data saved successfully:', playerData);

        // Save game history entry (slots uses result_symbols, roulette uses result_number)
        const historyData = isRoulette
            ? {
                wallet_address: walletAddress,
                spin_cost: BigInt(Math.floor((costPerChip || 1) * 1e6)).toString(),
                result_number: Array.isArray(resultSymbols) && resultSymbols.length > 0 ? String(resultSymbols[0]) : '0',
                won_amount: BigInt(Math.floor(wonAmount * 1e6)).toString(),
                timestamp: new Date().toISOString()
            }
            : {
                wallet_address: walletAddress,
                spin_cost: BigInt(Math.floor(spinCost * 1e6)).toString(),
                result_symbols: resultSymbols || [],
                won_amount: BigInt(Math.floor(wonAmount * 1e6)).toString(),
                timestamp: new Date().toISOString()
            };
        
        console.log('Attempting to insert game history:', historyData);
        
        const { data: historyDataResult, error: historyError } = await supabase
            .from(historyTable)
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
