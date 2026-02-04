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
const TREASURY_WALLET = '6auNHk39Mut82FhjY9iBZXjqm7xJabFVrY3bVgrYSMvj'; // Treasury wallet address
const TOKEN_DECIMALS = 6; // XMA token decimals

let wallet = null;
let connection = null;
let xmaBalance = 0;
let spinsRemaining = 0;
let totalWon = 0;
let isSpinning = false;
let isCollecting = false;

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
        loadGameStats(); // Load grand totals
        
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
    // Phantom injects window.solana, check for isPhantom or if it has connect method
    const isPhantomInstalled = typeof window.solana !== 'undefined' && 
        (window.solana.isPhantom || typeof window.solana.connect === 'function');
    
    if (isPhantomInstalled) {
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
    spinBtn.addEventListener('click', spin);
    withdrawBtn.addEventListener('click', withdrawWinnings);
    
    // Update button states when inputs change
    [costInput, spinsInput].forEach(input => {
        input.addEventListener('input', updateButtonStates);
    });
}

// Purchase Spins - Transfer XMA tokens to treasury wallet
async function purchaseSpins() {
    if (!wallet || !connection) {
        alert('Please connect your wallet first');
        return;
    }
    
    const costPerSpin = parseFloat(document.getElementById('cost-per-spin').value);
    const numSpins = parseInt(document.getElementById('number-of-spins').value);
    
    if (!costPerSpin || costPerSpin <= 0 || !numSpins || numSpins <= 0) {
        alert('Please enter valid cost per spin and number of spins');
        return;
    }
    
    const totalCost = costPerSpin * numSpins;
    
    if (xmaBalance < totalCost) {
        alert(`Insufficient balance. You need ${totalCost} XMA but only have ${xmaBalance.toFixed(2)} XMA`);
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
        
        // Create transfer instruction
        const transferAmount = BigInt(Math.floor(totalCost * Math.pow(10, TOKEN_DECIMALS)));
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

// Generate weighted random position for a reel
// We select a random index in the fixed reel order; symbol probabilities follow SYMBOL_COUNTS
function getWeightedRandomPosition() {
    // Use the pre-created fixed order (same for all reels)
    if (!FIXED_REEL_ORDER) {
        FIXED_REEL_ORDER = createFixedReelOrder();
    }
    // Select random position in the reel (this naturally gives weighted probability)
    return Math.floor(Math.random() * FIXED_REEL_ORDER.length);
}

// Spin
async function spin() {
    if (isSpinning || spinsRemaining <= 0) return;
    
    isSpinning = true;
    spinsRemaining = Math.max(0, spinsRemaining - 1);
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
    
    // Generate weighted random positions based on symbol distribution
    const resultPositions = [
        getWeightedRandomPosition(),
        getWeightedRandomPosition(),
        getWeightedRandomPosition()
    ];
    
    // Derive symbol indices from positions for win calculation
    const results = resultPositions.map(pos => FIXED_REEL_ORDER[pos]);
    
    // Stop reels with delay for visual effect, positioning the chosen symbol in the center
    setTimeout(() => stopReel(1, resultPositions[0]), 1000);
    setTimeout(() => stopReel(2, resultPositions[1]), 1500);
    setTimeout(() => stopReel(3, resultPositions[2]), 2000);
    
    // Calculate win after all reels stop
    setTimeout(() => {
        const costPerSpin = parseFloat(document.getElementById('cost-per-spin').value) || SPIN_COST;
        calculateWin(results, costPerSpin);
        isSpinning = false;
        updateDisplay();
        updateButtonStates();
    }, 2500);
}

// Stop Reel - position a specific symbol index from the reel strip in the center
function stopReel(reelNum, targetPosition) {
    const reel = document.getElementById(`reel-${reelNum}`);
    const strip = reel.querySelector('.reel-strip');
    
    reel.classList.remove('spinning');
    reel.classList.add('stopping');
    
    // Calculate position using pixels for accuracy
    const reelHeight = reel.offsetHeight;
    // Position so the chosen symbol (at targetPosition) is centered on the winline
    // Each symbol occupies exactly reelHeight in the strip, so:
    // offset = -(targetPosition * reelHeight)
    const offset = -(targetPosition * reelHeight);
    strip.style.transform = `translateY(${offset}px)`;
    strip.style.transition = 'transform 0.5s ease-out';
}

// Calculate Win
function calculateWin(results, bet) {
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
}

// Withdraw Winnings - Transfer XMA tokens from treasury to user wallet
// Uses backend API to get presigned transaction from treasury
async function withdrawWinnings() {
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
    if (withdrawBtn) {
        withdrawBtn.disabled = true;
    }
    
    try {
        const amount = totalWon;
        
        // Call backend API to get presigned transaction
        const response = await fetch('/api/collect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userWallet: wallet,
                amount: amount
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            let errorMessage = errorData.error || errorData.message || 'Failed to create collect transaction';
            
            // Add more details if available
            if (errorData.treasuryAccount) {
                errorMessage += ` (Treasury account: ${errorData.treasuryAccount})`;
            }
            if (errorData.availableBalance !== undefined) {
                errorMessage += ` (Available: ${errorData.availableBalance} XMA)`;
            }
            
            console.error('Collect API error:', errorData);
            throw new Error(errorMessage);
        }

        const { transaction: transactionBase64, actualAmount } = await response.json();

        // Deserialize the presigned transaction
        const { Transaction } = window.solanaWeb3 || solanaWeb3;
        // Convert base64 to Uint8Array for browser
        const transactionBytes = Uint8Array.from(atob(transactionBase64), c => c.charCodeAt(0));
        const transaction = Transaction.from(transactionBytes);

        // Send the transaction with retry logic for rate limits
        // Try with preflight first, then without if it fails (for mobile/Phantom browser compatibility)
        let retries = 3;
        let signature;
        let lastError = null;
        
        while (retries > 0) {
            try {
                // First try with preflight enabled
                signature = await connection.sendRawTransaction(transaction.serialize(), {
                    skipPreflight: false,
                    maxRetries: 3
                });
                break;
            } catch (error) {
                lastError = error;
                const errorMsg = error.message || error.toString() || '';
                
                // If this is a SendTransactionError, try to pull full simulation logs
                try {
                    if (typeof error.getLogs === 'function') {
                        const logs = await error.getLogs(connection);
                        if (logs && logs.length) {
                            console.error('Collect transaction simulation logs (preflight):', logs);
                        } else {
                            console.error('Collect transaction simulation logs (preflight): <no logs>');
                        }
                    } else if (Array.isArray(error.logs)) {
                        console.error('Collect transaction simulation logs (preflight, from error.logs):', error.logs);
                    }
                } catch (logErr) {
                    console.error('Failed to fetch simulation logs for collect (preflight):', logErr);
                }
                
                // If it's a simulation error and we haven't tried without preflight yet, try that
                if (errorMsg.includes('Simulation failed') || errorMsg.includes('attempt to debit')) {
                    console.warn('Preflight simulation failed, trying without preflight...');
                    try {
                        signature = await connection.sendRawTransaction(transaction.serialize(), {
                            skipPreflight: true,
                            maxRetries: 3
                        });
                        break;
                    } catch (skipPreflightError) {
                        console.error('Transaction failed even without preflight:', skipPreflightError);
                        const skipErrorMsg = skipPreflightError.message || skipPreflightError.toString() || '';
                        
                        // Try to get logs if it's a SendTransactionError
                        let detailedError = skipErrorMsg;
                        try {
                            if (typeof skipPreflightError.getLogs === 'function') {
                                const logs = await skipPreflightError.getLogs(connection);
                                if (logs && logs.length) {
                                    console.error('Collect transaction simulation logs (skipPreflight):', logs);
                                    detailedError += `\nSimulation logs:\n${logs.join('\n')}`;
                                } else {
                                    detailedError += '\nSimulation logs: <no logs>';
                                }
                            } else if (Array.isArray(skipPreflightError.logs)) {
                                console.error('Collect transaction simulation logs (skipPreflight, from error.logs):', skipPreflightError.logs);
                                detailedError += `\nSimulation logs:\n${skipPreflightError.logs.join('\n')}`;
                            }
                        } catch (logErr) {
                            console.error('Failed to fetch simulation logs for collect (skipPreflight):', logErr);
                        }
                        
                        throw new Error(`Transaction simulation failed: ${detailedError}. This usually means the treasury token account doesn't exist or has insufficient balance. If you just switched treasury wallets, make sure at least one purchase has been made to create the treasury token account.`);
                    }
                }
                
                // Handle rate limiting
                if (errorMsg.includes('403') || errorMsg.includes('429')) {
                    retries--;
                    if (retries > 0) {
                        console.warn(`RPC rate limited on send, retrying... (${3 - retries}/3)`);
                        await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
                        continue;
                    }
                }
                
                // If we get here, it's not a rate limit issue
                throw error;
            }
        }
        
        if (!signature && lastError) {
            throw lastError;
        }

        // Wait for confirmation
        await connection.confirmTransaction(signature, 'confirmed');
        
        // Call backend to confirm collect and clear unclaimed_rewards in DB
        try {
            const confirmResponse = await fetch('/api/confirm-collect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userWallet: wallet,
                    signature: signature,
                    amount: actualAmount || amount
                })
            });

            if (!confirmResponse.ok) {
                const errorData = await confirmResponse.json();
                console.error('Failed to confirm collect in database:', errorData);
                // Don't throw - transaction already succeeded, just log the error
                // The user got their tokens, we'll just need to manually fix the DB if needed
            } else {
                console.log('Successfully confirmed collect in database');
            }
        } catch (confirmError) {
            console.error('Error confirming collect in database:', confirmError);
            // Don't throw - transaction already succeeded
        }

        // Reset total won (now that database is updated)
        totalWon = 0;

        // Update balance
        await updateBalance();
        updateDisplay();
        updateButtonStates();

        alert(`Successfully collected ${(actualAmount || amount).toLocaleString()} XMA!`);
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

// Update Button States
function updateButtonStates() {
    const purchaseBtn = document.getElementById('purchase-spins');
    const spinBtn = document.getElementById('spin-button');
    const withdrawBtn = document.getElementById('withdraw-button');
    
    // Enable purchase button when wallet is connected, but disable if spins remaining or collecting
    purchaseBtn.disabled = !wallet || isCollecting || spinsRemaining > 0;
    if (wallet && !isCollecting && spinsRemaining === 0) {
        purchaseBtn.style.opacity = '1';
        purchaseBtn.style.cursor = 'pointer';
    } else {
        purchaseBtn.style.opacity = '0.5';
        purchaseBtn.style.cursor = 'not-allowed';
    }
    
    // Enable spin button when spins > 0 and not spinning
    spinBtn.disabled = spinsRemaining <= 0 || isSpinning || isCollecting;
    
    // Enable collect button when wallet connected and total won > 0, but disable if collecting
    withdrawBtn.disabled = !wallet || totalWon <= 0 || isCollecting;
}

// Database Functions

// Load game stats (grand totals)
async function loadGameStats() {
    try {
        const response = await fetch('/api/game-stats');
        
        if (!response.ok) {
            console.error('Failed to load game stats:', response.statusText);
            return;
        }
        
        const data = await response.json();
        
        // Update grand totals display
        const grandTotalSpinsEl = document.getElementById('grand-total-spins');
        const grandTotalWonEl = document.getElementById('grand-total-won');
        
        if (grandTotalSpinsEl) {
            grandTotalSpinsEl.textContent = data.grandTotalSpins.toLocaleString();
        }
        
        if (grandTotalWonEl) {
            grandTotalWonEl.textContent = `${data.grandTotalWon.toFixed(2)} XMA`;
        }
        
        console.log('Game stats loaded:', data);
    } catch (error) {
        console.error('Error loading game stats:', error);
        // Don't show error to user - just continue without stats
    }
}

// Load player data from database
let isLoadingPlayerData = false; // Prevent duplicate calls
async function loadPlayerData() {
    if (!wallet) return;
    
    // Prevent duplicate simultaneous calls
    if (isLoadingPlayerData) {
        console.log('loadPlayerData: Already loading, skipping duplicate call');
        return;
    }
    
    isLoadingPlayerData = true;
    
    try {
        const response = await fetch(`/api/load-player?walletAddress=${encodeURIComponent(wallet)}`, {
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        if (!response.ok) {
            console.error('Failed to load player data:', response.status, response.statusText);
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
        
        // Restore cost per spin for remaining spins
        if (data.costPerSpin && spinsRemaining > 0) {
            const costPerSpinInput = document.getElementById('cost-per-spin');
            if (costPerSpinInput) {
                costPerSpinInput.value = data.costPerSpin;
                console.log('Restored cost per spin:', data.costPerSpin);
            }
        }
        
        // Update display and buttons
        updateDisplay();
        updateButtonStates();
        
        console.log('Player data loaded:', {
            totalSpins: data.totalSpins,
            totalWon: data.totalWon,
            unclaimedRewards: data.unclaimedRewards,
            spinsRemaining: data.spinsRemaining,
            costPerSpin: data.costPerSpin
        });
    } catch (error) {
        // Only log if it's not an abort/timeout (which are expected in some cases)
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
            console.warn('loadPlayerData: Request timeout or aborted');
        } else if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
            console.warn('loadPlayerData: Network error - API may be unavailable or request was aborted');
        } else {
            console.error('Error loading player data:', error);
        }
        // Don't show error to user - just continue without saved data
    } finally {
        isLoadingPlayerData = false;
    }
}
