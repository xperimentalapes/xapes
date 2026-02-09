// XMA Chests - Demo UI for founder testing. Buy/open and outcomes are mocked.
// Token prices (USD per token) — update from Dextools or your price feed
const XMA_PRICE = 0.0000028817201476158986;
const BLUNANA_PRICE = 0.000018359793263521786;
const FRENS_PRICE = 9.628874693810868e-7;
// Bronze chest price (fixed)
const PRICE_XMA_AMOUNT = 700000;
const WIN_CHANCE = 0.8;     // 80% win
const NFT_RATE_OF_WINS = 0.3;  // 30% of wins are NFT
const COINS_RATE_OF_WINS = 0.5; // 50% of wins are coins

let walletConnected = false;
let bronzeOwned = 0;
let walletAddress = null;

const resultModal = document.getElementById('result-modal');
const resultEmpty = document.getElementById('result-empty');
const resultNft = document.getElementById('result-nft');
const resultCoins = document.getElementById('result-coins');
const resultCoinsAmount = document.getElementById('result-coins-amount');

document.addEventListener('DOMContentLoaded', () => {
    setupWallet();
    setupBronzeChest();
    setupResultModal();
    setupAvailablePrizesModal();
    setupCarousel();
    renderXmaPrice();
});

function renderXmaPrice() {
    const el = document.getElementById('bronze-price-xma');
    if (el) el.textContent = PRICE_XMA_AMOUNT.toLocaleString();
}

function setupCarousel() {
    const wrap = document.querySelector('.chests-carousel-wrap');
    const carousel = document.getElementById('chests-carousel');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    if (!carousel || !prevBtn || !nextBtn || !wrap) return;

    const cards = carousel.querySelectorAll('.chest-card');
    const total = cards.length;
    let currentIndex = 1; // 0=Silver, 1=Bronze, 2=Gold – start on Bronze

    function updateCarousel() {
        if (window.innerWidth >= 901) {
            carousel.style.transform = 'none';
            prevBtn.disabled = false;
            nextBtn.disabled = false;
            return;
        }
        const card = cards[0];
        if (!card) return;
        const cardWidth = card.offsetWidth;
        const gap = parseFloat(getComputedStyle(carousel).gap) || 16;
        const wrapWidth = wrap.offsetWidth;
        if (wrapWidth <= 0) return;
        const slideStep = cardWidth + gap;
        const totalWidth = total * cardWidth + (total - 1) * gap;
        const maxTranslate = Math.max(0, totalWidth - wrapWidth);
        const centerCard = currentIndex * slideStep + cardWidth / 2;
        let translateX = centerCard - wrapWidth / 2;
        translateX = Math.max(0, Math.min(translateX, maxTranslate));
        carousel.style.transform = `translateX(-${translateX}px)`;
        prevBtn.disabled = currentIndex <= 0;
        nextBtn.disabled = currentIndex >= total - 1;
    }

    prevBtn.addEventListener('click', () => {
        if (currentIndex <= 0) return;
        currentIndex--;
        updateCarousel();
    });

    nextBtn.addEventListener('click', () => {
        if (currentIndex >= total - 1) return;
        currentIndex++;
        updateCarousel();
    });

    function goToBronze() {
        currentIndex = 1;
        updateCarousel();
    }

    goToBronze();
    requestAnimationFrame(goToBronze);
    requestAnimationFrame(() => requestAnimationFrame(goToBronze));
    window.addEventListener('load', goToBronze);
    setTimeout(goToBronze, 50);
    setTimeout(goToBronze, 200);
    window.addEventListener('resize', () => {
        currentIndex = Math.min(Math.max(0, currentIndex), total - 1);
        updateCarousel();
    });
}

function setupAvailablePrizesModal() {
    const modal = document.getElementById('available-prizes-modal');
    const link = document.getElementById('available-prizes-link');
    const closeBtn = document.getElementById('close-available-prizes');
    const backdrop = modal && modal.querySelector('.chest-modal-backdrop');

    if (link) link.addEventListener('click', (e) => {
        e.preventDefault();
        if (modal) modal.setAttribute('aria-hidden', 'false');
    });
    if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.setAttribute('aria-hidden', 'true'));
    if (backdrop && modal) backdrop.addEventListener('click', () => modal.setAttribute('aria-hidden', 'true'));
}

function setupWallet() {
    const connectBtn = document.getElementById('connect-wallet');
    const disconnectBtn = document.getElementById('disconnect-wallet');
    const walletInfo = document.getElementById('wallet-info');
    const walletAddressEl = document.getElementById('wallet-address');

    connectBtn.addEventListener('click', () => {
        if (window.solana?.isPhantom) {
            window.solana.connect()
                .then(({ publicKey }) => {
                    walletAddress = publicKey.toBase58();
                    walletConnected = true;
                    walletAddressEl.textContent = walletAddress.slice(0, 4) + '…' + walletAddress.slice(-4);
                    connectBtn.style.display = 'none';
                    walletInfo.style.display = 'flex';
                    updateBronzeUI();
                })
                .catch(() => {
                    useDemoWallet();
                });
        } else {
            useDemoWallet();
        }
    });

    disconnectBtn.addEventListener('click', () => {
        walletConnected = false;
        walletAddress = null;
        walletInfo.style.display = 'none';
        connectBtn.style.display = 'block';
        updateBronzeUI();
    });

    function useDemoWallet() {
        walletAddress = 'Demo' + Math.random().toString(36).slice(2, 10);
        walletConnected = true;
        walletAddressEl.textContent = walletAddress;
        connectBtn.style.display = 'none';
        walletInfo.style.display = 'flex';
        updateBronzeUI();
    }

    if (window.solana?.isPhantom) {
        window.solana.on('accountChanged', () => {
            if (!window.solana.isConnected()) {
                walletConnected = false;
                walletAddress = null;
                walletInfo.style.display = 'none';
                connectBtn.style.display = 'block';
                updateBronzeUI();
            }
        });
    }
}

function setupBronzeChest() {
    const buyBtn = document.getElementById('buy-bronze');
    const openBtn = document.getElementById('open-bronze');
    const bronzeOwnedEl = document.getElementById('bronze-owned');
    const bronzeCountEl = document.getElementById('bronze-count');

    buyBtn.addEventListener('click', () => {
        if (!walletConnected) return;
        bronzeOwned += 1;
        bronzeCountEl.textContent = bronzeOwned;
        bronzeOwnedEl.style.display = 'block';
        openBtn.style.display = 'inline-flex';
        openBtn.disabled = false;
        buyBtn.textContent = `Buy another chest (~${PRICE_XMA_AMOUNT} XMA)`;
    });

    openBtn.addEventListener('click', () => {
        if (bronzeOwned <= 0) return;
        bronzeOwned -= 1;
        bronzeCountEl.textContent = bronzeOwned;
        if (bronzeOwned === 0) {
            openBtn.style.display = 'none';
            openBtn.disabled = true;
            bronzeOwnedEl.style.display = 'none';
        }

        const outcome = rollOutcome();
        showResult(outcome);
    });
}

function rollOutcome() {
    const r = Math.random();
    if (r >= WIN_CHANCE) {
        return { type: 'empty' };
    }
    const winRoll = Math.random();
    if (winRoll < NFT_RATE_OF_WINS) {
        return { type: 'nft' };
    }
    const coinValue = (1.2 + Math.random() * 2.3).toFixed(2);
    return { type: 'coins', amount: coinValue };
}

function showResult(outcome) {
    resultEmpty.style.display = 'none';
    resultNft.style.display = 'none';
    resultCoins.style.display = 'none';

    if (outcome.type === 'empty') {
        resultEmpty.style.display = 'block';
    } else if (outcome.type === 'nft') {
        resultNft.style.display = 'block';
    } else {
        resultCoins.style.display = 'block';
        resultCoinsAmount.textContent = `$${outcome.amount} (simulated)`;
    }

    resultModal.setAttribute('aria-hidden', 'false');
}

function setupResultModal() {
    const closeBtn = document.getElementById('close-result-modal');
    const backdrop = resultModal.querySelector('.chest-modal-backdrop');

    function close() {
        resultModal.setAttribute('aria-hidden', 'true');
    }

    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
}

function updateBronzeUI() {
    const buyBtn = document.getElementById('buy-bronze');
    const openBtn = document.getElementById('open-bronze');
    const bronzeOwnedEl = document.getElementById('bronze-owned');
    const bronzeCountEl = document.getElementById('bronze-count');

    if (walletConnected) {
        buyBtn.disabled = false;
        buyBtn.textContent = `Buy chest (~${PRICE_XMA_AMOUNT} XMA)`;
        if (bronzeOwned > 0) {
            bronzeOwnedEl.style.display = 'block';
            bronzeCountEl.textContent = bronzeOwned;
            openBtn.style.display = 'inline-flex';
            openBtn.disabled = false;
        }
    } else {
        buyBtn.disabled = true;
        buyBtn.textContent = 'Connect wallet to buy';
        openBtn.style.display = 'none';
        bronzeOwnedEl.style.display = 'none';
    }
}
