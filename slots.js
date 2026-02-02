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

// Payouts for 3-of-a-kind (in XMA, based on 100 XMA per spin, targeting 80% RTP)
// Probabilities: (count/36)³ for each symbol
// Expected payout = Σ(probability × payout) = 80 XMA
// Probabilities: Grapes 1.097%, Cherry 0.735%, Lemon 0.463%, Orange 0.268%, Watermelon 0.137%, Star 0.058%, Diamond 0.017%, Seven 0.002%
// Total win probability ≈ 1.88%, so payouts need to be high to reach 80% RTP
const PAYOUTS = {
    0: 1300,  // 3 Grapes (1.097% chance) - 13x
    1: 1600,  // 3 Cherries (0.735% chance) - 16x
    2: 2100,  // 3 Lemons (0.463% chance) - 21x
    3: 3500,  // 3 Oranges (0.268% chance) - 35x
    4: 7000,  // 3 Watermelons (0.137% chance) - 70x
    5: 16500, // 3 Stars (0.058% chance) - 165x
    6: 55000, // 3 Diamonds (0.017% chance) - 550x
    7: 330000 // 3 Sevens (0.002% chance) - 3300x
};
// Expected RTP: 80% (calculated and verified)

const SPIN_COST = 100; // Fixed cost per spin in XMA
const SLOT_MACHINE_PROGRAM_ID = 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS'; // Update with actual program ID
const XMA_TOKEN_MINT = 'YOUR_XMA_TOKEN_MINT_HERE'; // Update with actual XMA token mint

let wallet = null;
let connection = null;
let xmaBalance = 0;
let spinsRemaining = 0;
let totalWon = 0;
let isSpinning = false;

// Fixed reel order (created once, same for all reels)
let FIXED_REEL_ORDER = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Create fixed reel order once (same for all reels)
    FIXED_REEL_ORDER = createFixedReelOrder();
    
    checkOrientation();
    setupWalletConnection();
    setupGameControls();
    setupPrizeModal();
    initializeReels();
    
    // Testing mode: Set fixed cost and give 1 free spin
    document.getElementById('cost-per-spin').value = SPIN_COST;
    document.getElementById('cost-per-spin').disabled = true; // Disable cost input for testing
    document.getElementById('number-of-spins').disabled = true; // Disable spins input for testing
    spinsRemaining = 1; // Give 1 free spin
    updateDisplay();
    updateButtonStates();
    
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
                img.alt = SYMBOL_NAMES[symbolIndex];
                img.className = 'symbol-image';
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
        connectBtn.addEventListener('click', async () => {
            try {
                const resp = await window.solana.connect();
                wallet = resp.publicKey.toString();
                walletAddress.textContent = `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
                connectContainer.style.display = 'none';
                walletInfo.style.display = 'flex';
                
                // Initialize connection using solanaWeb3 from the loaded script
                if (typeof window.solanaWeb3 !== 'undefined') {
                    connection = new window.solanaWeb3.Connection(
                        'https://api.devnet.solana.com', // Change to mainnet when ready
                        'confirmed'
                    );
                } else if (typeof solanaWeb3 !== 'undefined') {
                    connection = new solanaWeb3.Connection(
                        'https://api.devnet.solana.com',
                        'confirmed'
                    );
                }
                
                await updateBalance();
                updateButtonStates();
            } catch (err) {
                console.error('Wallet connection error:', err);
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

// Update Balance (Mock - replace with actual token balance fetch)
async function updateBalance() {
    if (!wallet || !connection) return;
    
    try {
        // TODO: Replace with actual token balance fetch
        // const tokenAccount = await getAssociatedTokenAddress(...);
        // const balance = await getAccount(connection, tokenAccount);
        // xmaBalance = Number(balance.amount) / 1_000_000;
        
        // Mock balance for testing
        xmaBalance = 100; // Remove this when implementing real balance
        updateDisplay();
    } catch (error) {
        console.error('Error fetching balance:', error);
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

// Purchase Spins (Disabled in testing mode)
async function purchaseSpins() {
    alert('Purchase disabled in testing mode. You automatically get 1 spin after each use.');
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
    spinsRemaining--;
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
    setTimeout(() => {
        calculateWin(results, SPIN_COST);
        isSpinning = false;
        // Auto-grant 1 spin for testing
        spinsRemaining = 1;
        updateDisplay();
        updateButtonStates();
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
            img.alt = SYMBOL_NAMES[symbolIndex];
        } else {
            // If no image exists, create one
            symbols[centerIndex].innerHTML = '';
            const newImg = document.createElement('img');
            newImg.src = `/images/symbols/${imageNumber}.png`;
            newImg.alt = SYMBOL_NAMES[symbolIndex];
            newImg.className = 'symbol-image';
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
function calculateWin(results, bet) {
    const winDisplay = document.getElementById('win-display');
    const winMessage = document.getElementById('win-message');
    const winAmount = document.getElementById('win-amount');
    
    let win = 0;
    let message = '';
    
    // Check for 3-of-a-kind
    if (results[0] === results[1] && results[1] === results[2]) {
        // All symbols match - use payout table
        const symbolIndex = results[0];
        win = PAYOUTS[symbolIndex] || 0;
        // Create win message with image: "3 x [image]"
        const imageNumber = 8 - symbolIndex;
        winMessage.innerHTML = `🎉 <span class="win-symbols">3 x <img src="/images/symbols/${imageNumber}.png" alt="${SYMBOL_NAMES[symbolIndex]}" class="win-symbol-image"></span> 🎉`;
    }
    
    if (win > 0) {
        totalWon += win;
        winAmount.textContent = `You won ${win} XMA!`;
        winDisplay.style.display = 'block';
        
        setTimeout(() => {
            winDisplay.style.display = 'none';
        }, 3000);
    }
    // No popup for losses - just update display silently
    
    updateDisplay();
}

// Withdraw Winnings
async function withdrawWinnings() {
    if (totalWon <= 0) {
        alert('No winnings to withdraw');
        return;
    }
    
    if (!wallet) {
        alert('Please connect your wallet');
        return;
    }
    
    try {
        // TODO: Replace with actual Solana transaction
        // const program = new Program(idl, SLOT_MACHINE_PROGRAM_ID, provider);
        // const tx = await program.methods.withdraw(...).rpc();
        
        // Mock withdrawal for testing
        const amount = totalWon;
        xmaBalance += amount;
        totalWon = 0;
        
        updateDisplay();
        updateButtonStates();
        alert(`Withdrew ${amount.toFixed(2)} XMA`);
    } catch (error) {
        console.error('Withdrawal error:', error);
        alert('Failed to withdraw: ' + error.message);
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

// Update Button States
function updateButtonStates() {
    const purchaseBtn = document.getElementById('purchase-spins');
    const spinBtn = document.getElementById('spin-button');
    const withdrawBtn = document.getElementById('withdraw-button');
    
    // Testing mode: Disable purchase button
    purchaseBtn.disabled = true;
    purchaseBtn.style.opacity = '0.5';
    purchaseBtn.style.cursor = 'not-allowed';
    
    // Enable spin button when spins > 0
    spinBtn.disabled = spinsRemaining <= 0 || isSpinning;
    
    withdrawBtn.disabled = !wallet || totalWon <= 0;
}
