// Slot Machine Game Logic
// Note: This is a frontend simulation. Replace with actual Solana program integration when ready.

// Symbol definitions with rarity (most common to rarest)
// Note: We no longer use emoji symbols - only images. SYMBOL_NAMES kept for alt text.
const SYMBOL_NAMES = ['Grapes', 'Cherry', 'Lemon', 'Orange', 'Watermelon', 'Star', 'Diamond', 'Seven'];

// Symbol distribution per reel (36 symbols total per reel for unique rarities)
// Index matches SYMBOL_NAMES array: [Grapes, Cherry, Lemon, Orange, Watermelon, Star, Diamond, Seven]
// Each symbol has unique rarity:
const SYMBOL_COUNTS = [8, 7, 6, 5, 4, 3, 2, 1]; // Total = 36
// Rarities: Grapes 22.2%, Cherry 19.4%, Lemon 16.7%, Orange 13.9%, Watermelon 11.1%, Star 8.3%, Diamond 5.6%, Seven 2.8%

// Payout multipliers for 3-of-a-kind (based on 100 XMA per spin, targeting 80% RTP)
// Probabilities: (count/36)³ for each symbol
// Expected payout = Σ(probability × payout) = 80 XMA
// Probabilities: Grapes 1.097%, Cherry 0.735%, Lemon 0.463%, Orange 0.268%, Watermelon 0.137%, Star 0.058%, Diamond 0.017%, Seven 0.002%
// Total win probability ≈ 1.88%, so payouts need to be high to reach 80% RTP
const PAYOUT_MULTIPLIERS = {
    0: 13,   // 3 Grapes (1.097% chance) - 13x
    1: 16,   // 3 Cherries (0.735% chance) - 16x
    2: 21,   // 3 Lemons (0.463% chance) - 21x
    3: 35,   // 3 Oranges (0.268% chance) - 35x
    4: 70,   // 3 Watermelons (0.137% chance) - 70x
    5: 165,  // 3 Stars (0.058% chance) - 165x
    6: 550,  // 3 Diamonds (0.017% chance) - 550x
    7: 3300  // 3 Sevens (0.002% chance) - 3300x
};
// Expected RTP: 80% (calculated and verified)

// Calculate actual payout amount based on cost per spin
function getPayoutAmount(symbolIndex, costPerSpin) {
    return PAYOUT_MULTIPLIERS[symbolIndex] * costPerSpin;
}

const SPIN_COST = 100; // Fixed cost per spin in XMA
const SLOT_MACHINE_PROGRAM_ID = 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS'; // Update with actual program ID
const XMA_TOKEN_MINT = 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP'; // XMA token mint address
const TREASURY_WALLET = '5eZ3Qt1jKCGdXkCES791W68T87bGG62j9ZHcmBaMUtTP'; // Treasury wallet address
const TOKEN_DECIMALS = 6; // XMA token decimals

// Security limits
const MAX_COST_PER_SPIN = 10000; // Maximum cost per spin (100 XMA default, 10,000 XMA max)
const MAX_NUMBER_OF_SPINS = 100; // Maximum number of spins per purchase
const MAX_TOTAL_COST = 1000000; // Maximum total cost per transaction (1M XMA)
const MAX_WIN_AMOUNT = 10000000; // Maximum win amount (10M XMA) - safety limit

let wallet = null;
let connection = null;
let xmaBalance = 0;
let spinsRemaining = 0;
let totalWon = 0;
let isSpinning = false;
let isCollecting = false; // Prevent multiple simultaneous collect attempts
let isAutoSpinning = false; // Autospin state

// Fixed reel order (created once, same for all reels)
let FIXED_REEL_ORDER = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Create fixed reel order once (same for all reels)
    FIXED_REEL_ORDER = createFixedReelOrder();
    
    checkOrientation();
    
    // Wait for SPL token library to load before setting up wallet
    const initWhenReady = () => {
        setupWalletConnection();
        setupGameControls();
        setupPrizeModal();
        setupLeaderboardModal();
        initializeReels();
        
        // Set default cost per spin
        document.getElementById('cost-per-spin').value = SPIN_COST;
        updateDisplay();
        updateButtonStates();
    };
    
    // Check if SPL token is already loaded
    if (window.splToken) {
        initWhenReady();
    } else {
        // Wait for SPL token to load
        window.addEventListener('splTokenLoaded', initWhenReady);
        // Fallback timeout in case event doesn't fire
        setTimeout(() => {
            if (window.splToken) {
                initWhenReady();
            } else {
                console.warn('SPL token library not loaded, some features may not work');
                initWhenReady(); // Initialize anyway
            }
        }, 2000);
    }
    
    // Check orientation on resize
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
});

// Orientation Check
function checkOrientation() {
    const prompt = document.getElementById('orientation-prompt');
    if (window.innerWidth < 768 && window.innerHeight > window.innerWidth) {
        prompt.classList.add('show');
    } else {
        prompt.classList.remove('show');
    }
}

// Initialize Reels
function initializeReels() {
    // Wait for DOM to be fully rendered and layout to be calculated
    setTimeout(() => {
        for (let i = 1; i <= 3; i++) {
            const reel = document.getElementById(`reel-${i}`);
            const strip = reel.querySelector('.reel-strip');
            if (!reel || !strip) return;
            
            strip.innerHTML = '';
            
            // Get reel height - force layout calculation
            let reelHeight = reel.offsetHeight || reel.clientHeight || 200;
            
            // If height is still too small, use parent container height
            if (reelHeight < 50) {
                const parent = reel.parentElement;
                if (parent) {
                    const parentHeight = parent.offsetHeight || parent.clientHeight;
                    if (parentHeight > 50) {
                        reel.style.height = `${parentHeight}px`;
                        reelHeight = reel.offsetHeight || parentHeight;
                    }
                }
            }
            
            // Ensure minimum height
            if (reelHeight < 100) {
                reel.style.minHeight = '200px';
                reelHeight = Math.max(reel.offsetHeight || reelHeight, 200);
            }
            
            // Create reel with fixed symbol order (same on all reels, no consecutive repeats)
            // Each reel has 36 symbols matching SYMBOL_COUNTS distribution
            const numSymbols = 36;
            
            // Use the pre-created fixed order (same for all reels)
            if (!FIXED_REEL_ORDER) {
                FIXED_REEL_ORDER = createFixedReelOrder();
            }
            
            // Create symbols in the strip using the fixed order
            for (let j = 0; j < numSymbols; j++) {
                const symbol = document.createElement('div');
                symbol.className = 'reel-symbol';
                const symbolIndex = FIXED_REEL_ORDER[j];
                // Map symbol index to image number: 0 (Grapes) -> 8.png, 7 (Seven) -> 1.png
                const imageNumber = 8 - symbolIndex;
                const img = document.createElement('img');
                img.src = `/images/symbols/${imageNumber}.png`;
                img.alt = ''; // Empty alt to prevent text fallback
                img.className = 'symbol-image';
                img.onerror = function() {
                    console.error(`Failed to load image: /images/symbols/${imageNumber}.png`);
                    this.style.display = 'none';
                };
                symbol.appendChild(img);
                symbol.dataset.symbolIndex = symbolIndex; // Store symbol index for win calculation
                symbol.style.height = `${reelHeight}px`;
                strip.appendChild(symbol);
            }
            
            // Set strip height
            strip.style.height = `${numSymbols * reelHeight}px`;
            
            // Position to show:
            // - Bottom half of symbol 17 (visible in top 50% of reel: 0 to reelHeight/2)
            // - Full symbol 18 (visible in center: reelHeight/2 is the center)
            // - Top half of symbol 19 (visible in bottom 50% of reel: reelHeight/2 to reelHeight)
            // Symbol 18's center should be at reelHeight/2 (center of visible reel)
            // Symbol 18's center in strip is at: (centerIndex * reelHeight) + (reelHeight / 2)
            // To position it at reelHeight/2: offset = -(centerIndex * reelHeight)
            const centerIndex = 18;
            const offset = -(centerIndex * reelHeight);
            strip.style.transform = `translateY(${offset}px)`;
            strip.style.transition = 'none';
            
            console.log(`Reel ${i} initialized: height=${reelHeight}, offset=${offset}, should show symbol ${centerIndex} centered`);
        }
    }, 200);
}

// Wallet Connection
async function setupWalletConnection() {
    const connectBtn = document.getElementById('connect-wallet');
    const disconnectBtn = document.getElementById('disconnect-wallet');
    const walletInfo = document.getElementById('wallet-info');
    const walletAddress = document.getElementById('wallet-address');
    const connectContainer = document.getElementById('connect-wallet');
    
    // Check if Phantom wallet is installed
    if (typeof window.solana !== 'undefined' && window.solana.isPhantom) {
        // Check if already connected
        try {
            if (window.solana.isConnected) {
                const resp = await window.solana.connect({ onlyIfTrusted: true });
                if (resp) {
                    wallet = resp.publicKey.toString();
                    walletAddress.textContent = `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
                    connectContainer.style.display = 'none';
                    walletInfo.style.display = 'flex';
                    
                    // Initialize connection
                    const rpcUrl = 'https://mainnet.helius-rpc.com/?api-key=277997e8-09ce-4516-a03e-5b062b51c6ac';
                    if (typeof window.solanaWeb3 !== 'undefined') {
                        connection = new window.solanaWeb3.Connection(rpcUrl, 'confirmed');
                    } else if (typeof solanaWeb3 !== 'undefined') {
                        connection = new solanaWeb3.Connection(rpcUrl, 'confirmed');
                    }
                    
                    await updateBalance();
                    await loadPlayerData(); // Load saved player data from database
                    updateButtonStates();
                }
            }
        } catch (err) {
            // Not connected, that's fine - user will click connect button
            console.log('Wallet not auto-connected:', err.message);
        }
        
        connectBtn.addEventListener('click', async () => {
            try {
                // Request connection with explicit options
                const resp = await window.solana.connect({
                    onlyIfTrusted: false
                });
                
                wallet = resp.publicKey.toString();
                walletAddress.textContent = `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
                connectContainer.style.display = 'none';
                walletInfo.style.display = 'flex';
                
                // Initialize connection using solanaWeb3 from the loaded script
                // Use Helius RPC endpoint (dedicated service, no rate limits)
                const rpcUrl = 'https://mainnet.helius-rpc.com/?api-key=277997e8-09ce-4516-a03e-5b062b51c6ac';
                
                if (typeof window.solanaWeb3 !== 'undefined') {
                    connection = new window.solanaWeb3.Connection(
                        rpcUrl,
                        'confirmed',
                        {
                            commitment: 'confirmed',
                            disableRetryOnRateLimit: false,
                            httpHeaders: {
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                } else if (typeof solanaWeb3 !== 'undefined') {
                    connection = new solanaWeb3.Connection(
                        rpcUrl,
                        'confirmed',
                        {
                            commitment: 'confirmed',
                            disableRetryOnRateLimit: false,
                            httpHeaders: {
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                }
                
                await updateBalance();
                await loadPlayerData(); // Load saved player data from database
                updateButtonStates();
            } catch (err) {
                console.error('Wallet connection error:', err);
                // Don't show alert for user rejection
                if (err.message && (err.message.includes('User rejected') || err.message.includes('not been authorized'))) {
                    console.log('User rejected wallet connection');
                    return;
                }
                alert('Failed to connect wallet: ' + err.message);
            }
        });
        
        disconnectBtn.addEventListener('click', async () => {
            if (window.solana && window.solana.disconnect) {
                await window.solana.disconnect();
            }
            wallet = null;
            connection = null;
            connectContainer.style.display = 'block';
            walletInfo.style.display = 'none';
            xmaBalance = 0;
            spinsRemaining = 0;
            totalWon = 0;
            updateDisplay();
            updateButtonStates();
        });
    } else {
        connectBtn.textContent = 'Install Phantom';
        connectBtn.onclick = () => {
            window.open('https://phantom.app/', '_blank');
        };
    }
}

// Update Balance - Fetch actual XMA token balance
async function updateBalance() {
    if (!wallet || !connection) return;
    
    // Check if SPL token library is loaded
    if (!window.splToken) {
        console.warn('SPL token library not loaded yet');
        return;
    }
    
    try {
        const { PublicKey } = window.solanaWeb3 || solanaWeb3;
        const { getAssociatedTokenAddress, getAccount } = window.splToken;
        
        const tokenMint = new PublicKey(XMA_TOKEN_MINT);
        const userPublicKey = new PublicKey(wallet);
        
        const tokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            userPublicKey
        );
        
        try {
            const account = await getAccount(connection, tokenAccount);
            xmaBalance = Number(account.amount) / Math.pow(10, TOKEN_DECIMALS);
        } catch (error) {
            // Token account doesn't exist yet or RPC error
            const errorMsg = error.message || error.toString() || '';
            if (errorMsg.includes('403') || errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('Too Many Requests')) {
                console.warn('RPC rate limited. Balance may not update. For production, use a dedicated RPC service (Helius, QuickNode, etc.)');
                // Keep current balance, don't reset to 0
            } else if (errorMsg.includes('Invalid param') || errorMsg.includes('not found') || errorMsg.includes('could not find account')) {
                // Token account doesn't exist yet
                xmaBalance = 0;
            } else {
                // Other error - log but don't reset balance
                console.warn('Error fetching token account:', errorMsg);
            }
        }
        
        updateDisplay();
    } catch (error) {
        console.error('Error fetching balance:', error);
        const errorMsg = error.message || error.toString() || '';
        // If it's a rate limit error, don't reset balance
        if (!errorMsg.includes('403') && !errorMsg.includes('429') && !errorMsg.includes('rate limit')) {
            xmaBalance = 0;
        }
        updateDisplay();
    }
}

// Game Controls
function setupGameControls() {
    const purchaseBtn = document.getElementById('purchase-spins');
    const spinBtn = document.getElementById('spin-button');
    const withdrawBtn = document.getElementById('withdraw-button');
    const costInput = document.getElementById('cost-per-spin');
    const spinsInput = document.getElementById('number-of-spins');
    
    purchaseBtn.addEventListener('click', purchaseSpins);
    
    // Handle single click for spin, double click for autospin
    let clickTimeout;
    spinBtn.addEventListener('click', (e) => {
        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
            // Double click detected - toggle autospin
            toggleAutoSpin();
        } else {
            clickTimeout = setTimeout(() => {
                clickTimeout = null;
                // Single click - normal spin (only if not autospinning)
                if (!isAutoSpinning) {
                    spin();
                }
            }, 300); // 300ms window for double click
        }
    });
    
    withdrawBtn.addEventListener('click', withdrawWinnings);
    
    // Update button states when inputs change
    [costInput, spinsInput].forEach(input => {
        input.addEventListener('input', updateButtonStates);
    });
}

// Toggle autospin
function toggleAutoSpin() {
    if (isSpinning || spinsRemaining <= 0) return;
    
    isAutoSpinning = !isAutoSpinning;
    updateSpinButtonText();
    
    if (isAutoSpinning) {
        // Start autospin
        autoSpin();
    }
}

// Auto spin loop
async function autoSpin() {
    while (isAutoSpinning && spinsRemaining > 0 && !isSpinning) {
        await spin();
        // Wait a bit between spins for visual effect
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // If we stopped because spins ran out, disable autospin
    if (spinsRemaining <= 0) {
        isAutoSpinning = false;
        updateSpinButtonText();
    }
}

// Purchase Spins - Transfer XMA tokens to treasury wallet
async function purchaseSpins() {
    if (!wallet || !connection) {
        alert('Please connect your wallet first');
        return;
    }
    
    // Get and sanitize inputs
    const costPerSpinInput = document.getElementById('cost-per-spin').value;
    const numSpinsInput = document.getElementById('number-of-spins').value;
    
    // Validate inputs are not empty
    if (!costPerSpinInput || !numSpinsInput) {
        alert('Please enter valid cost per spin and number of spins');
        return;
    }
    
    // Parse and validate numeric values
    const costPerSpin = parseFloat(costPerSpinInput);
    const numSpins = parseInt(numSpinsInput);
    
    // Validate inputs are valid numbers and within limits
    if (isNaN(costPerSpin) || isNaN(numSpins) || 
        costPerSpin <= 0 || numSpins <= 0 ||
        !isFinite(costPerSpin) || !isFinite(numSpins)) {
        alert('Please enter valid numeric values for cost per spin and number of spins');
        return;
    }
    
    // Security: Enforce maximum limits
    if (costPerSpin > MAX_COST_PER_SPIN) {
        alert(`Cost per spin cannot exceed ${MAX_COST_PER_SPIN.toLocaleString()} XMA`);
        return;
    }
    
    if (numSpins > MAX_NUMBER_OF_SPINS) {
        alert(`Number of spins cannot exceed ${MAX_NUMBER_OF_SPINS}`);
        return;
    }
    
    // Calculate total cost and validate
    const totalCost = costPerSpin * numSpins;
    
    if (totalCost > MAX_TOTAL_COST) {
        alert(`Total transaction amount cannot exceed ${MAX_TOTAL_COST.toLocaleString()} XMA`);
        return;
    }
    
    // Validate user has sufficient balance
    if (xmaBalance < totalCost) {
        alert(`Insufficient balance. You need ${totalCost.toLocaleString()} XMA but only have ${xmaBalance.toFixed(2)} XMA`);
        return;
    }
    
    // Check if SPL token library is loaded
    if (!window.splToken) {
        alert('SPL token library is still loading. Please wait a moment and try again.');
        return;
    }
    
    try {
        const { PublicKey, Transaction } = window.solanaWeb3 || solanaWeb3;
        const { getAssociatedTokenAddress, createTransferInstruction } = window.splToken;
        
        const tokenMint = new PublicKey(XMA_TOKEN_MINT);
        const userPublicKey = new PublicKey(wallet);
        const treasuryPublicKey = new PublicKey(TREASURY_WALLET);
        
        // Get token accounts
        const userTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            userPublicKey
        );
        
        const treasuryTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            treasuryPublicKey
        );
        
        // Security: Double-check amount before creating transaction
        // Round to prevent floating point precision issues
        const transferAmountRaw = totalCost * Math.pow(10, TOKEN_DECIMALS);
        if (!isFinite(transferAmountRaw) || transferAmountRaw <= 0 || transferAmountRaw > MAX_TOTAL_COST * Math.pow(10, TOKEN_DECIMALS)) {
            throw new Error('Invalid transfer amount');
        }
        
        const transferAmount = BigInt(Math.floor(transferAmountRaw));
        
        // Verify treasury address matches expected
        if (treasuryPublicKey.toString() !== TREASURY_WALLET) {
            throw new Error('Invalid treasury wallet address');
        }
        
        // Create transfer instruction
        const transferInstruction = createTransferInstruction(
            userTokenAccount,
            treasuryTokenAccount,
            userPublicKey,
            transferAmount
        );
        
        // Create and send transaction with retry logic for rate limits
        const transaction = new Transaction().add(transferInstruction);
        
        let blockhash;
        let retries = 3;
        while (retries > 0) {
            try {
                const result = await connection.getLatestBlockhash();
                blockhash = result.blockhash;
                break;
            } catch (error) {
                retries--;
                const errorMsg = error.message || error.toString() || '';
                if (retries === 0 || (!errorMsg.includes('403') && !errorMsg.includes('429'))) {
                    throw error;
                }
                console.warn(`RPC rate limited, retrying... (${3 - retries}/3)`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries))); // Exponential backoff
            }
        }
        
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userPublicKey;
        
        // Sign and send transaction
        // Use signTransaction (Phantom's standard method)
        const signed = await window.solana.signTransaction(transaction);
        
        // Send the signed transaction
        retries = 3;
        let signature;
        while (retries > 0) {
            try {
                signature = await connection.sendRawTransaction(signed.serialize(), {
                    skipPreflight: false,
                    maxRetries: 3
                });
                break;
            } catch (error) {
                retries--;
                const errorMsg = error.message || error.toString() || '';
                if (retries === 0 || (!errorMsg.includes('403') && !errorMsg.includes('429'))) {
                    throw error;
                }
                console.warn(`RPC rate limited on send, retrying... (${3 - retries}/3)`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
            }
        }
        
        await connection.confirmTransaction(signature, 'confirmed');

        // Update spins remaining
        spinsRemaining += numSpins;
        console.log(`Purchased ${numSpins} spins. New total: ${spinsRemaining}`);
        
        // Save spins purchase to database
        if (wallet) {
            console.log('Saving spins purchase to database...', { numSpins, spinsRemaining });
            await saveGameData(0, [], 0, undefined, undefined, numSpins); // Save spins purchase
        } else {
            console.warn('Cannot save spins purchase - wallet not connected');
        }
        
        // Update balance
        await updateBalance();
        updateDisplay();
        updateButtonStates();
        
        alert(`Successfully purchased ${numSpins} spin(s) for ${totalCost} XMA!`);
    } catch (error) {
        console.error('Purchase error:', error);
        const errorMsg = error.message || error.toString() || '';
        
        // Handle user rejection gracefully
        if (errorMsg.includes('User rejected') || errorMsg.includes('User cancelled') || errorMsg.includes('rejected')) {
            // User intentionally rejected - don't show error, just return silently
            return;
        }
        
        // Show error for other cases
        alert('Failed to purchase spins: ' + errorMsg);
    }
}

// Create fixed reel order with no consecutive repeats
// Same order on all reels for consistency
function createFixedReelOrder() {
    // Build array of all symbols with their counts
    const symbolPool = [];
    for (let symbolIndex = 0; symbolIndex < SYMBOL_NAMES.length; symbolIndex++) {
        for (let count = 0; count < SYMBOL_COUNTS[symbolIndex]; count++) {
            symbolPool.push(symbolIndex);
        }
    }
    
    // Arrange to avoid consecutive repeats by interleaving
    // Strategy: alternate between different symbols
    const ordered = [];
    const remaining = [...symbolPool];
    
    let lastSymbol = -1;
    while (remaining.length > 0) {
        // Find a symbol that's different from the last one
        let found = false;
        for (let i = 0; i < remaining.length; i++) {
            if (remaining[i] !== lastSymbol) {
                ordered.push(remaining[i]);
                lastSymbol = remaining[i];
                remaining.splice(i, 1);
                found = true;
                break;
            }
        }
        
        // If we can't avoid a repeat (shouldn't happen with our distribution), just take the first
        if (!found && remaining.length > 0) {
            ordered.push(remaining[0]);
            lastSymbol = remaining[0];
            remaining.splice(0, 1);
        }
    }
    
    return ordered;
}

// Generate weighted random symbol for a reel
// Since reels have fixed order, we select a random position and return its symbol
function getWeightedRandomSymbol() {
    // Use the pre-created fixed order (same for all reels)
    if (!FIXED_REEL_ORDER) {
        FIXED_REEL_ORDER = createFixedReelOrder();
    }
    // Select random position in the reel (this naturally gives weighted probability)
    const randomPosition = Math.floor(Math.random() * FIXED_REEL_ORDER.length);
    return FIXED_REEL_ORDER[randomPosition];
}

// Spin
async function spin() {
    if (isSpinning || spinsRemaining <= 0) return;
    
    isSpinning = true;
    const newSpinsRemaining = Math.max(0, spinsRemaining - 1);
    spinsRemaining = newSpinsRemaining;
    
    // Save updated spins remaining to database
    if (wallet) {
        await saveGameData(0, [], 0, undefined, newSpinsRemaining); // Update spins remaining
    }
    
    updateDisplay();
    updateButtonStates();
    
    // Start spinning animation
    for (let i = 1; i <= 3; i++) {
        const reel = document.getElementById(`reel-${i}`);
        const strip = reel.querySelector('.reel-strip');
        if (reel && strip) {
            // Get current position
            const currentTransform = strip.style.transform;
            const currentY = currentTransform ? parseFloat(currentTransform.match(/-?\d+\.?\d*/)?.[0] || '0') : 0;
            strip.style.setProperty('--spin-start', `${currentY}px`);
            reel.classList.add('spinning');
        }
    }
    
    // Generate weighted random results based on symbol distribution
    const results = [
        getWeightedRandomSymbol(),
        getWeightedRandomSymbol(),
        getWeightedRandomSymbol()
    ];
    
    // Stop reels with delay for visual effect
    setTimeout(() => stopReel(1, results[0]), 1000);
    setTimeout(() => stopReel(2, results[1]), 1500);
    setTimeout(() => stopReel(3, results[2]), 2000);
    
    // Calculate win after all reels stop
    setTimeout(async () => {
        const costPerSpin = parseFloat(document.getElementById('cost-per-spin').value) || SPIN_COST;
        const winAmount = await calculateWin(results, costPerSpin);
        
        // Save game data to database
        console.log('Spin complete - checking wallet:', wallet ? 'connected' : 'NOT CONNECTED');
        if (wallet) {
            console.log('Wallet connected, calling saveGameData...');
            await saveGameData(costPerSpin, results, winAmount);
        } else {
            console.warn('Cannot save game data - wallet not connected');
        }
        
        isSpinning = false;
        updateDisplay();
        updateButtonStates();
        
        // Continue autospin if enabled and spins remaining
        if (isAutoSpinning && spinsRemaining > 0) {
            setTimeout(() => autoSpin(), 100);
        }
    }, 2500);
}

// Stop Reel
function stopReel(reelNum, symbolIndex) {
    const reel = document.getElementById(`reel-${reelNum}`);
    const strip = reel.querySelector('.reel-strip');
    
    reel.classList.remove('spinning');
    reel.classList.add('stopping');
    
    // Get all symbols
    const symbols = strip.querySelectorAll('.reel-symbol');
    const centerIndex = 18; // Center symbol index (out of 36)
    
    // Update the center symbol to show the result
    if (symbols[centerIndex]) {
        const imageNumber = 8 - symbolIndex;
        const img = symbols[centerIndex].querySelector('.symbol-image');
        if (img) {
            img.src = `/images/symbols/${imageNumber}.png`;
            img.alt = ''; // Empty alt to prevent text fallback
            img.onerror = function() {
                console.error(`Failed to load image: /images/symbols/${imageNumber}.png`);
                this.style.display = 'none';
            };
        } else {
            // If no image exists, create one
            symbols[centerIndex].innerHTML = '';
            const newImg = document.createElement('img');
            newImg.src = `/images/symbols/${imageNumber}.png`;
            newImg.alt = ''; // Empty alt to prevent text fallback
            newImg.className = 'symbol-image';
            newImg.onerror = function() {
                console.error(`Failed to load image: /images/symbols/${imageNumber}.png`);
                this.style.display = 'none';
            };
            symbols[centerIndex].appendChild(newImg);
        }
    }
    
    // Calculate position using pixels for accuracy
    const reelHeight = reel.offsetHeight;
    // Position so center symbol (index 18) is centered on winline
    // This shows: bottom half of symbol 17, full symbol 18, top half of symbol 19
    // Symbol 18's center is at (centerIndex * reelHeight) + (reelHeight / 2) in the strip
    // We want it at reelHeight / 2 in the visible reel
    // So: offset = -(centerIndex * reelHeight)
    const offset = -(centerIndex * reelHeight);
    strip.style.transform = `translateY(${offset}px)`;
    strip.style.transition = 'transform 0.5s ease-out';
}

// Calculate Win
async function calculateWin(results, bet) {
    const winDisplay = document.getElementById('win-display');
    const winMessage = document.getElementById('win-message');
    
    let win = 0;
    
    // Check for 3-of-a-kind
    if (results[0] === results[1] && results[1] === results[2]) {
        // All symbols match - use payout table
        const symbolIndex = results[0];
        const costPerSpin = parseFloat(document.getElementById('cost-per-spin').value) || SPIN_COST;
        win = getPayoutAmount(symbolIndex, costPerSpin);
        
        if (win > 0) {
            totalWon += win;
            winMessage.textContent = `${win.toLocaleString()} XMA`;
            winDisplay.style.display = 'block';
            
            setTimeout(() => {
                winDisplay.style.display = 'none';
            }, 3000);
        }
    }
    // No popup for losses - just update display silently
    
    updateDisplay();
    updateButtonStates();
    
    return win; // Return win amount for database saving
}

// Withdraw Winnings - Transfer XMA tokens from treasury to user wallet
// Uses backend API to get presigned transaction from treasury
async function withdrawWinnings() {
    // Prevent multiple simultaneous collect attempts
    if (isCollecting) {
        console.log('Collect already in progress, ignoring duplicate request');
        return;
    }
    
    if (totalWon <= 0) {
        alert('No winnings to withdraw');
        return;
    }
    
    if (!wallet || !connection) {
        alert('Please connect your wallet');
        return;
    }
    
    // Check if SPL token library is loaded
    if (!window.splToken) {
        alert('SPL token library is still loading. Please wait a moment and try again.');
        return;
    }
    
    // Security: Validate win amount before withdrawal
    if (totalWon > MAX_WIN_AMOUNT) {
        alert(`Win amount exceeds maximum limit. Please contact support.`);
        console.error('Win amount exceeds maximum:', totalWon);
        return;
    }
    
    // Security: Validate wallet address format
    try {
        const { PublicKey } = window.solanaWeb3 || solanaWeb3;
        new PublicKey(wallet); // Will throw if invalid
    } catch (error) {
        alert('Invalid wallet address');
        console.error('Invalid wallet address:', wallet);
        return;
    }
    
    // Set collecting flag and disable button immediately
    isCollecting = true;
    const withdrawBtn = document.getElementById('withdraw-button');
    const originalText = withdrawBtn.textContent;
    withdrawBtn.disabled = true;
    withdrawBtn.textContent = 'Collecting...';
    withdrawBtn.style.opacity = '0.5';
    withdrawBtn.style.cursor = 'not-allowed';
    
    try {
        // Call backend API to get presigned transaction
        // Backend will check database and atomically update unclaimed_rewards to 0
        const response = await fetch('/api/collect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userWallet: wallet,
                amount: totalWon
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create collect transaction');
        }

        const { transaction: transactionBase64, actualAmount } = await response.json();
        
        // If backend returned actualAmount, use it (means database had different amount)
        if (actualAmount !== undefined && actualAmount !== totalWon) {
            console.warn(`Amount mismatch: frontend had ${totalWon}, database had ${actualAmount}. Using database amount.`);
            // Update frontend to match database
            totalWon = actualAmount;
            if (actualAmount === 0) {
                throw new Error('No unclaimed rewards available (may have already been collected)');
            }
        }

        // Deserialize the presigned transaction
        const { Transaction } = window.solanaWeb3 || solanaWeb3;
        // Convert base64 to Uint8Array for browser
        const transactionBytes = Uint8Array.from(atob(transactionBase64), c => c.charCodeAt(0));
        const transaction = Transaction.from(transactionBytes);

        // Send the transaction with retry logic for rate limits
        let retries = 3;
        let signature;
        while (retries > 0) {
            try {
                signature = await connection.sendRawTransaction(transaction.serialize(), {
                    skipPreflight: false,
                });
                break;
            } catch (error) {
                retries--;
                if (retries === 0 || (!error.message || !error.message.includes('403') && !error.message.includes('429'))) {
                    throw error;
                }
                console.warn(`RPC rate limited on send, retrying... (${3 - retries}/3)`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
            }
        }

        // Wait for confirmation
        await connection.confirmTransaction(signature, 'confirmed');

        // Reset total won (database already updated by backend)
        const amount = totalWon;
        totalWon = 0;

        // Update balance
        await updateBalance();
        updateDisplay();
        updateButtonStates();

        alert(`Successfully collected ${amount.toLocaleString()} XMA!`);
    } catch (error) {
        console.error('Withdrawal error:', error);
        const errorMsg = error.message || error.toString() || '';
        
        // Handle user rejection gracefully
        if (errorMsg.includes('User rejected') || errorMsg.includes('User cancelled') || errorMsg.includes('rejected')) {
            // User intentionally rejected - don't show error, just return silently
            // But re-enable button
            isCollecting = false;
            updateButtonStates();
            return;
        }
        
        // Show error for other cases
        alert('Failed to collect winnings: ' + errorMsg);
    } finally {
        // Always reset collecting flag and re-enable button
        isCollecting = false;
        updateButtonStates();
    }
}

// Update Display
function updateDisplay() {
    document.getElementById('xma-balance').textContent = `${xmaBalance.toFixed(2)} XMA`;
    document.getElementById('spins-remaining').textContent = spinsRemaining;
    document.getElementById('total-won').textContent = `${totalWon.toFixed(2)} XMA`;
    // Update mobile stats
    const mobileBalance = document.getElementById('mobile-xma-balance');
    const mobileSpins = document.getElementById('mobile-spins-remaining');
    const mobileWon = document.getElementById('mobile-total-won');
    if (mobileBalance) mobileBalance.textContent = `${xmaBalance.toFixed(2)} XMA`;
    if (mobileSpins) mobileSpins.textContent = spinsRemaining;
    if (mobileWon) mobileWon.textContent = `${totalWon.toFixed(2)} XMA`;
}

// Setup Prize Modal
function setupPrizeModal() {
    const prizeBtn = document.getElementById('prize-structure-btn');
    const prizeBtnDesktop = document.getElementById('prize-structure-btn-desktop');
    const modal = document.getElementById('prize-modal');
    const closeBtn = document.getElementById('close-prize-modal');
    
    const openModal = () => {
        modal.classList.add('show');
    };
    
    // Open modal from mobile button
    if (prizeBtn) {
        prizeBtn.addEventListener('click', openModal);
    }
    
    // Open modal from desktop button
    if (prizeBtnDesktop) {
        prizeBtnDesktop.addEventListener('click', openModal);
    }
    
    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
        });
    }
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });
}

// Setup Leaderboard Modal
function setupLeaderboardModal() {
    const leaderboardBtn = document.getElementById('leaderboard-btn-desktop');
    const modal = document.getElementById('leaderboard-modal');
    const closeBtn = document.getElementById('close-leaderboard-modal');
    const sortSelect = document.getElementById('leaderboard-sort');
    
    const openModal = async () => {
        modal.classList.add('show');
        await loadLeaderboard('spins'); // Default sort
    };
    
    // Open modal from button
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', openModal);
    }
    
    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
        });
    }
    
    // Close on background click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    }
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });
    
    // Handle sort change
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            loadLeaderboard(e.target.value);
        });
    }
}

// Load leaderboard data
async function loadLeaderboard(sortBy = 'spins') {
    const loadingEl = document.getElementById('leaderboard-loading');
    const errorEl = document.getElementById('leaderboard-error');
    const listEl = document.getElementById('leaderboard-list');
    
    // Show loading
    if (loadingEl) loadingEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';
    if (listEl) listEl.innerHTML = '';
    
    try {
        const response = await fetch(`/api/leaderboard?sortBy=${sortBy}&limit=100`);
        
        if (!response.ok) {
            throw new Error(`Failed to load leaderboard: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Display leaderboard
        if (listEl && data.leaderboard) {
            if (data.leaderboard.length === 0) {
                listEl.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No players yet. Be the first!</p>';
            } else {
                listEl.innerHTML = data.leaderboard.map((player, index) => {
                    const rank = index + 1;
                    const winRate = player.winRate.toFixed(2);
                    const totalWon = player.totalWon.toFixed(2);
                    const totalWagered = player.totalWagered.toFixed(2);
                    
                    return `
                        <div class="leaderboard-item">
                            <div class="leaderboard-rank">#${rank}</div>
                            <div class="leaderboard-wallet">${player.displayAddress}</div>
                            <div class="leaderboard-stats">
                                <div class="leaderboard-stat">
                                    <span class="stat-label">Spins:</span>
                                    <span class="stat-value">${player.totalSpins.toLocaleString()}</span>
                                </div>
                                <div class="leaderboard-stat">
                                    <span class="stat-label">Won:</span>
                                    <span class="stat-value">${totalWon} XMA</span>
                                </div>
                                <div class="leaderboard-stat">
                                    <span class="stat-label">Win %:</span>
                                    <span class="stat-value">${winRate}%</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        if (errorEl) {
            errorEl.textContent = error.message || 'Failed to load leaderboard';
            errorEl.style.display = 'block';
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// Database Functions

// Load player data from database
async function loadPlayerData() {
    if (!wallet) return;
    
    try {
        const response = await fetch(`/api/load-player?walletAddress=${encodeURIComponent(wallet)}`);
        
        if (!response.ok) {
            console.error('Failed to load player data:', response.statusText);
            return;
        }
        
        const data = await response.json();
        
        console.log('Player data loaded from database:', data);
        
        // Restore unclaimed rewards
        if (data.unclaimedRewards > 0) {
            totalWon = data.unclaimedRewards;
            console.log('Restored unclaimed rewards:', data.unclaimedRewards);
        }
        
        // Restore spins remaining (always restore, even if 0, to sync with database)
        spinsRemaining = data.spinsRemaining || 0;
        console.log('Restored spins remaining:', spinsRemaining);
        
        // Update display and buttons
        updateDisplay();
        updateButtonStates();
        
        console.log('Player data loaded:', {
            totalSpins: data.totalSpins,
            totalWon: data.totalWon,
            unclaimedRewards: data.unclaimedRewards,
            spinsRemaining: data.spinsRemaining
        });
    } catch (error) {
        console.error('Error loading player data:', error);
        // Don't show error to user - just continue without saved data
    }
}

// Save game data to database
async function saveGameData(spinCost, resultSymbols, wonAmount, unclaimedRewards = null, updateSpinsRemaining = null, spinsPurchased = null) {
    if (!wallet) {
        console.log('saveGameData: No wallet connected, skipping save');
        return;
    }
    
    try {
        console.log('saveGameData: Attempting to save game data...', {
            wallet: wallet.slice(0, 8) + '...',
            spinCost,
            resultSymbols,
            wonAmount,
            unclaimedRewards: unclaimedRewards !== null ? unclaimedRewards : totalWon,
            updateSpinsRemaining,
            spinsPurchased
        });
        
        const response = await fetch('/api/save-game', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                walletAddress: wallet,
                spinCost: spinCost,
                resultSymbols: resultSymbols,
                wonAmount: wonAmount,
                updateUnclaimedRewards: unclaimedRewards !== null ? unclaimedRewards : totalWon,
                updateSpinsRemaining: updateSpinsRemaining !== null ? updateSpinsRemaining : (spinsPurchased === null ? spinsRemaining : undefined),
                spinsPurchased: spinsPurchased
            })
        });
        
        console.log('saveGameData: Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to save game data:', response.status, response.statusText, errorText);
            return;
        }
        
        const result = await response.json();
        console.log('Game data saved successfully:', result);
    } catch (error) {
        console.error('Error saving game data:', error);
        // Don't show error to user - game continues even if save fails
    }
}

// Update Button States
function updateButtonStates() {
    const purchaseBtn = document.getElementById('purchase-spins');
    const spinBtn = document.getElementById('spin-button');
    const withdrawBtn = document.getElementById('withdraw-button');
    
    // Enable purchase button when wallet is connected and not collecting
    purchaseBtn.disabled = !wallet || isCollecting;
    if (wallet && !isCollecting) {
        purchaseBtn.style.opacity = '1';
        purchaseBtn.style.cursor = 'pointer';
    } else {
        purchaseBtn.style.opacity = '0.5';
        purchaseBtn.style.cursor = 'not-allowed';
    }
    
    // Enable spin button when spins > 0 and not spinning/collecting
    spinBtn.disabled = spinsRemaining <= 0 || isSpinning || isCollecting;
    if (spinsRemaining > 0 && !isSpinning && !isCollecting) {
        spinBtn.style.opacity = '1';
        spinBtn.style.cursor = 'pointer';
    } else {
        spinBtn.style.opacity = '0.5';
        spinBtn.style.cursor = 'not-allowed';
    }
    
    updateSpinButtonText();
    
    // Enable collect button when wallet connected, total won > 0, and not already collecting
    withdrawBtn.disabled = !wallet || totalWon <= 0 || isCollecting;
    if (totalWon > 0 && !isCollecting) {
        withdrawBtn.style.opacity = '1';
        withdrawBtn.style.cursor = 'pointer';
        withdrawBtn.textContent = 'COLLECT';
    } else {
        withdrawBtn.style.opacity = '0.5';
        withdrawBtn.style.cursor = 'not-allowed';
        if (isCollecting) {
            withdrawBtn.textContent = 'Collecting...';
        } else {
            withdrawBtn.textContent = 'COLLECT';
        }
    }
}

// Update spin button text based on autospin state
function updateSpinButtonText() {
    const spinBtn = document.getElementById('spin-button');
    const spinBtnHint = document.getElementById('spin-button-hint');
    
    if (!spinBtn) return;
    
    if (isAutoSpinning) {
        spinBtn.textContent = 'SPINNING...';
        if (spinBtnHint) {
            spinBtnHint.textContent = 'DOUBLE CLICK TO STOP AUTOSPIN';
        }
    } else {
        spinBtn.textContent = 'SPIN';
        if (spinBtnHint) {
            spinBtnHint.textContent = 'DOUBLE CLICK FOR AUTOSPIN';
        }
    }
}
