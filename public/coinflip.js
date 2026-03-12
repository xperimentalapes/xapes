// Coin Flip game - same wallet/balance pattern as slots, persist via API

const XMA_TOKEN_MINT = 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';
const TREASURY_WALLET = '6auNHk39Mut82FhjY9iBZXjqm7xJabFVrY3bVgrYSMvj';
const TOKEN_DECIMALS = 6;
const WIN_MULTIPLIER = 1.9;
const MAX_COST_PER_FLIP = 1500;
const MAX_FLIPS_PER_PURCHASE = 500;
const FLIP_ANIMATION_MS = 1200;

let wallet = null;
let connection = null;
let xmaBalance = 0;
let flipsRemaining = 0;
let costPerFlip = 0;
let totalWon = 0;
let totalFlips = 0;
let grandTotalWon = 0;
let selectedPrediction = null; // 'heads' | 'tails'
let isFlipping = false;
let isCollecting = false;

function formatXma(n) {
    if (n == null || isNaN(n)) return '0 XMA';
    return (Number(n).toFixed(2)) + ' XMA';
}

function updateDisplay() {
    const balanceEl = document.getElementById('xma-balance');
    const totalWonEl = document.getElementById('total-won');
    const flipsRemainingEl = document.getElementById('flips-remaining');
    const grandFlipsEl = document.getElementById('grand-total-flips');
    const grandWonEl = document.getElementById('grand-total-won');
    if (balanceEl) balanceEl.textContent = formatXma(xmaBalance);
    if (totalWonEl) totalWonEl.textContent = formatXma(totalWon);
    if (flipsRemainingEl) flipsRemainingEl.textContent = String(flipsRemaining);
    if (grandFlipsEl) grandFlipsEl.textContent = String(totalFlips);
    if (grandWonEl) grandWonEl.textContent = formatXma(grandTotalWon);
}

function updateButtonStates() {
    const purchaseBtn = document.getElementById('purchase-flips');
    const flipBtn = document.getElementById('flip-button');
    const withdrawBtn = document.getElementById('withdraw-button');
    const pickHeads = document.getElementById('pick-heads');
    const pickTails = document.getElementById('pick-tails');
    const costInput = document.getElementById('cost-per-flip');
    const numInput = document.getElementById('number-of-flips');

    const cost = parseFloat(costInput?.value || 0);
    const num = parseInt(numInput?.value || 0, 10);
    const totalCost = cost * num;
    const hasBalance = xmaBalance >= totalCost && totalCost > 0 && num > 0;

    if (purchaseBtn) {
        purchaseBtn.disabled = !wallet || isFlipping || isCollecting || !hasBalance || cost > MAX_COST_PER_FLIP || num > MAX_FLIPS_PER_PURCHASE;
    }
    if (flipBtn) {
        flipBtn.disabled = !wallet || flipsRemaining <= 0 || selectedPrediction === null || isFlipping || isCollecting;
    }
    if (withdrawBtn) {
        withdrawBtn.disabled = !wallet || totalWon <= 0 || isFlipping || isCollecting;
    }
    if (pickHeads) {
        pickHeads.disabled = !wallet || flipsRemaining <= 0 || isFlipping;
        pickHeads.classList.toggle('selected', selectedPrediction === 'heads');
    }
    if (pickTails) {
        pickTails.disabled = !wallet || flipsRemaining <= 0 || isFlipping;
        pickTails.classList.toggle('selected', selectedPrediction === 'tails');
    }
}

async function updateBalance() {
    if (!wallet || !connection || !window.splToken) return;
    try {
        const { PublicKey } = window.solanaWeb3 || solanaWeb3;
        const { getAssociatedTokenAddress, getAccount } = window.splToken;
        const mint = new PublicKey(XMA_TOKEN_MINT);
        const ata = await getAssociatedTokenAddress(mint, new PublicKey(wallet));
        const account = await getAccount(connection, ata);
        xmaBalance = Number(account.amount) / Math.pow(10, TOKEN_DECIMALS);
    } catch (e) {
        if (!(e.message && (e.message.includes('could not find account') || e.message.includes('Account does not exist')))) {
            console.error('Balance fetch error:', e);
        }
        xmaBalance = 0;
    }
    updateDisplay();
}

async function loadCoinflipState() {
    if (!wallet) return;
    try {
        const res = await fetch(`/api/coinflip-state?walletAddress=${encodeURIComponent(wallet)}`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
            const data = await res.json();
            flipsRemaining = data.flipsRemaining || 0;
            costPerFlip = data.costPerFlip || 0;
            totalWon = data.totalWon != null ? Number(data.totalWon) : 0;
            totalFlips = data.totalFlips || 0;
            grandTotalWon = data.grandTotalWon != null ? Number(data.grandTotalWon) : 0;
        }
        const costInput = document.getElementById('cost-per-flip');
        if (costPerFlip > 0 && costInput) costInput.value = costPerFlip;
        updateDisplay();
        updateButtonStates();
    } catch (e) {
        if (e.name !== 'AbortError' && e.name !== 'TimeoutError') console.warn('loadCoinflipState:', e);
        updateDisplay();
        updateButtonStates();
    }
}

async function loadGameStats() {
    try {
        const res = await fetch('/api/coinflip-stats', { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const data = await res.json();
        totalFlips = data.totalFlips || 0;
        grandTotalWon = data.grandTotalWon != null ? Number(data.grandTotalWon) : 0;
        updateDisplay();
    } catch (e) {
        if (e.name !== 'AbortError' && e.name !== 'TimeoutError') console.warn('loadGameStats:', e);
    }
}

function setupWalletConnection() {
    const connectBtn = document.getElementById('connect-wallet');
    const disconnectBtn = document.getElementById('disconnect-wallet');
    const walletInfo = document.getElementById('wallet-info');
    const walletAddress = document.getElementById('wallet-address');

    const hasPhantom = typeof window.solana !== 'undefined' && (window.solana.isPhantom || typeof window.solana.connect === 'function');

    if (hasPhantom) {
        try {
            if (window.solana.isConnected) {
                window.solana.connect({ onlyIfTrusted: true }).then(r => {
                    wallet = r.publicKey.toString();
                    walletAddress.textContent = `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
                    connectBtn.style.display = 'none';
                    walletInfo.style.display = 'flex';
                    initConnection();
                    updateBalance();
                    loadCoinflipState();
                    loadGameStats();
                    updateButtonStates();
                }).catch(() => {});
            }
        } catch (e) {}
    }

    connectBtn.addEventListener('click', async () => {
        if (!hasPhantom) {
            alert('Please install Phantom wallet');
            return;
        }
        try {
            const r = await window.solana.connect();
            wallet = r.publicKey.toString();
            walletAddress.textContent = `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
            connectBtn.style.display = 'none';
            walletInfo.style.display = 'flex';
            initConnection();
            await updateBalance();
            await loadCoinflipState();
            await loadGameStats();
            updateButtonStates();
        } catch (e) {
            if (!String(e.message || e).includes('rejected')) alert('Failed to connect: ' + (e.message || e));
        }
    });

    disconnectBtn.addEventListener('click', () => {
        if (window.solana.disconnect) window.solana.disconnect();
        wallet = null;
        connection = null;
        walletInfo.style.display = 'none';
        connectBtn.style.display = 'block';
        xmaBalance = 0;
        flipsRemaining = 0;
        totalWon = 0;
        selectedPrediction = null;
        updateDisplay();
        updateButtonStates();
    });
}

function initConnection() {
    const { Connection } = window.solanaWeb3 || solanaWeb3;
    const apiKey = typeof window.HELIUS_API_KEY === 'string' && window.HELIUS_API_KEY.indexOf('__') === -1 ? window.HELIUS_API_KEY : '';
    const rpcUrl = apiKey ? ('https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(apiKey)) : 'https://api.mainnet-beta.solana.com';
    connection = new Connection(rpcUrl, 'confirmed');
}

function setupControls() {
    document.getElementById('pick-heads').addEventListener('click', () => {
        selectedPrediction = 'heads';
        updateButtonStates();
    });
    document.getElementById('pick-tails').addEventListener('click', () => {
        selectedPrediction = 'tails';
        updateButtonStates();
    });
    document.getElementById('purchase-flips').addEventListener('click', purchaseFlips);
    document.getElementById('flip-button').addEventListener('click', doFlip);
    document.getElementById('withdraw-button').addEventListener('click', withdrawWinnings);
    ['cost-per-flip', 'number-of-flips'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateButtonStates);
    });
}

async function purchaseFlips() {
    if (!wallet || !connection || !window.splToken) {
        alert('Connect wallet and wait for token library.');
        return;
    }
    const costInput = document.getElementById('cost-per-flip');
    const numInput = document.getElementById('number-of-flips');
    let cost = parseFloat(costInput.value);
    let num = parseInt(numInput.value, 10);
    if (!cost || cost <= 0 || !num || num <= 0) {
        alert('Enter valid cost per flip and number of flips.');
        return;
    }
    cost = Math.min(cost, MAX_COST_PER_FLIP);
    num = Math.min(num, MAX_FLIPS_PER_PURCHASE);
    const totalCost = cost * num;
    if (xmaBalance < totalCost) {
        alert(`Insufficient balance. Need ${totalCost} XMA, you have ${xmaBalance.toFixed(2)} XMA.`);
        return;
    }
    try {
        const { PublicKey, Transaction } = window.solanaWeb3 || solanaWeb3;
        const { getAssociatedTokenAddress, createTransferInstruction } = window.splToken;
        const mint = new PublicKey(XMA_TOKEN_MINT);
        const userKey = new PublicKey(wallet);
        const treasuryKey = new PublicKey(TREASURY_WALLET);
        const userAta = await getAssociatedTokenAddress(mint, userKey);
        const treasuryAta = await getAssociatedTokenAddress(mint, treasuryKey);
        const amount = BigInt(Math.floor(totalCost * Math.pow(10, TOKEN_DECIMALS)));
        const ix = createTransferInstruction(userAta, treasuryAta, userKey, amount);
        const tx = new Transaction().add(ix);
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = userKey;
        const signed = await window.solana.signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
        await connection.confirmTransaction(sig, 'confirmed');

        const saveRes = await fetch('/api/coinflip-purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletAddress: wallet,
                totalAmountXma: totalCost,
                numFlips: num,
                costPerFlip: cost
            })
        });
        if (!saveRes.ok) {
            const err = await saveRes.json().catch(() => ({}));
            console.error('DB save failed:', err);
        } else {
            flipsRemaining += num;
            costPerFlip = cost;
            updateDisplay();
            updateButtonStates();
            alert(`Purchased ${num} flip(s) for ${totalCost} XMA.`);
        }
        await updateBalance();
    } catch (e) {
        const msg = e.message || String(e);
        if (!msg.includes('rejected') && !msg.includes('User rejected')) alert('Purchase failed: ' + msg);
    }
}

function showResult(won, result, wonAmount) {
    const el = document.getElementById('flip-result');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = won ? `Win! +${wonAmount.toFixed(2)} XMA` : 'Lose';
    el.className = 'flip-result ' + (won ? 'win' : 'lose');
    setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function runFlipAnimation(coinEl, result, won, wonAmount) {
    coinEl.classList.remove('coin-result-heads', 'coin-result-tails');
    coinEl.classList.add('coin-spinning');
    return new Promise(r => setTimeout(r, FLIP_ANIMATION_MS)).then(() => {
        coinEl.classList.remove('coin-spinning');
        coinEl.classList.add(result === 'heads' ? 'coin-result-heads' : 'coin-result-tails');
        showResult(won, result, wonAmount);
    });
}

async function doFlip() {
    if (!wallet || flipsRemaining <= 0 || selectedPrediction === null || isFlipping) return;
    isFlipping = true;
    updateButtonStates();
    const coinEl = document.getElementById('coin');
    const resultEl = document.getElementById('flip-result');
    if (resultEl) resultEl.style.display = 'none';

    try {
        const res = await fetch('/api/coinflip-flip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: wallet, prediction: selectedPrediction })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Flip failed');
        }
        const data = await res.json();
        const result = data.result;
        const wonAmount = Number(data.wonAmount || 0);
        const won = data.won === true;
        await runFlipAnimation(coinEl, result, won, wonAmount);
        flipsRemaining = data.flipsRemaining ?? flipsRemaining - 1;
        totalWon = data.totalWon != null ? Number(data.totalWon) : totalWon + (won ? wonAmount : 0);
        totalFlips++;
        grandTotalWon = (grandTotalWon || 0) + (won ? wonAmount : 0);
        updateDisplay();
        updateButtonStates();
    } catch (e) {
        alert(e.message || 'Flip failed');
    } finally {
        isFlipping = false;
        updateButtonStates();
    }
}

async function withdrawWinnings() {
    if (!wallet || totalWon <= 0 || isCollecting) return;
    isCollecting = true;
    updateButtonStates();
    try {
        const res = await fetch('/api/coinflip-collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: wallet })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Collect failed');
        }
        const { transaction: transactionBase64, actualAmount } = await res.json();
        const { Transaction } = window.solanaWeb3 || solanaWeb3;
        const transactionBytes = Uint8Array.from(atob(transactionBase64), c => c.charCodeAt(0));
        const transaction = Transaction.from(transactionBytes);
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            maxRetries: 3
        });
        await connection.confirmTransaction(signature, 'confirmed');
        await fetch('/api/coinflip-confirm-collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: wallet })
        });
        totalWon = 0;
        updateDisplay();
        updateButtonStates();
        await updateBalance();
        alert('Collected ' + (actualAmount || totalWon).toFixed(2) + ' XMA! Check your wallet.');
    } catch (e) {
        const msg = e.message || String(e);
        if (!msg.includes('rejected')) alert(msg || 'Collect failed');
    } finally {
        isCollecting = false;
        updateButtonStates();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const init = () => {
        setupWalletConnection();
        setupControls();
        loadGameStats();
        updateDisplay();
        updateButtonStates();
    };
    if (window.splToken) init();
    else {
        window.addEventListener('splTokenLoaded', init);
        setTimeout(() => { if (window.splToken) init(); else init(); }, 2000);
    }
});
