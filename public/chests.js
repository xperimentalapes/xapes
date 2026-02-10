// XMA Chests - Open chest for random prize (no purchase flow).
// Bronze chest price (fixed) — for display only
const PRICE_XMA_AMOUNT = 700000;

// Prizes: 20% loss, 20% NFT, 60% token. Of token wins: 50% small, 30% medium, 20% large.
const NFT_PRIZES = ['Mnk3ys NFT', 'Frens Factory NFT', 'MOSC NFT'];
const NFT_MINTS = {
    'Mnk3ys NFT': ['C6mHMTfJXCRzzvC5btbK6jxy5bkigdrh7pr8rPaV67J8', 'FEQjPe3SWi6ZX9KcDp8wqxvZj15jwzZXbiECfaJtF13Q', 'Enag8xxDDuw3cz3R1uP4oZgb46Z5uDtb9p9PRvWsyufo'],
    'Frens Factory NFT': ['2a2PSb1JCE28BetUx1wyczLqgXfjaGd9u5eTdBLrabKj', '5kAaGHvihSXiEKHJVA4oRESFVWpChgWhU5E1VWkoD3jo', '2Xi1dQT3WkvazJABFmb3BhNxVCg6iqZ1JJJEn9QQ7eLs'],
    'MOSC NFT': ['3NfayXiSEzmGBKDun9irchkac51bYVU3tm6WcgiKtEWi', '6Kf3W72Wp89t77wwvyqan2NJxUhvZ5yBJd5VwENV9qMK', '7Wexrnmq6QcvTPeTspWrcrvCurmuHkJyovxGxPZkTrY7']
};
const NFT_FALLBACK_IMAGES = {
    'Mnk3ys NFT': 'https://img-cdn.magiceden.dev/rs:fill:400:0:0/plain/https%3A%2F%2Fcreator-hub-prod.s3.us-east-2.amazonaws.com%2Fmnk3ys_pfp_1724204870860.png',
    'Frens Factory NFT': 'https://img-cdn.magiceden.dev/rs:fill:400:0:0/plain/https%3A%2F%2Fcreator-hub-prod.s3.us-east-2.amazonaws.com%2Ffrens_factory_pfp_1736409521055.gif',
    'MOSC NFT': 'https://arweave.net/n1x7nzl6e8l2o24CA0ntXkX72SO9ne-pYzGlPMMBkSM'
};
const TOKEN_PRIZES = {
    XMA:    { small: '350,000 XMA',    medium: '1,000,000 XMA',    large: '2,000,000 XMA' },
    BLUNANA: { small: '50,000 BLUNANA',  medium: '150,000 BLUNANA',  large: '300,000 BLUNANA' },
    FRENS:  { small: '1,000,000 FRENS', medium: '3,000,000 FRENS', large: '5,000,000 FRENS' }
};
const TOKEN_IMAGES = {
    XMA: 'images/logo.png',
    BLUNANA: 'https://ipfs.io/ipfs/QmTKRAZEcTfDeVDt8hebrCv27DctYghtdfXRMc9FRA6NU3',
    FRENS: 'https://img-cdn.magiceden.dev/rs:fill:400:0:0/plain/https%3A%2F%2Fcreator-hub-prod.s3.us-east-2.amazonaws.com%2Ffrens_factory_pfp_1736409521055.gif'
};
const TOKEN_TYPES = Object.keys(TOKEN_PRIZES);
const TOKEN_SIZE_WEIGHTS = [0.5, 0.3, 0.2];
const TOKEN_SIZES = ['small', 'medium', 'large'];

// Optional: set window.HELIUS_API_KEY for live NFT metadata fetch
let walletConnected = false;
let walletAddress = null;

const resultModal = document.getElementById('result-modal');
const resultLose = document.getElementById('result-lose');
const resultWin = document.getElementById('result-win');
const resultPrizeImg = document.getElementById('result-prize-img');
const resultPrizeName = document.getElementById('result-prize-name');
const resultCollectBtn = document.getElementById('result-collect-btn');

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
                })
                .catch(() => useDemoWallet());
        } else {
            useDemoWallet();
        }
    });

    disconnectBtn.addEventListener('click', () => {
        walletConnected = false;
        walletAddress = null;
        walletInfo.style.display = 'none';
        connectBtn.style.display = 'block';
    });

    function useDemoWallet() {
        walletAddress = 'Demo' + Math.random().toString(36).slice(2, 10);
        walletConnected = true;
        walletAddressEl.textContent = walletAddress;
        connectBtn.style.display = 'none';
        walletInfo.style.display = 'flex';
    }

    if (window.solana?.isPhantom) {
        window.solana.on('accountChanged', () => {
            if (!window.solana.isConnected()) {
                walletConnected = false;
                walletAddress = null;
                walletInfo.style.display = 'none';
                connectBtn.style.display = 'block';
            }
        });
    }
}

function setupBronzeChest() {
    const openBtn = document.getElementById('open-chest-btn');
    if (!openBtn) return;
    openBtn.addEventListener('click', () => {
        const outcome = rollOutcome();
        showResult(outcome);
    });
}

/** 20% loss, 20% NFT (random from list), 60% token (random type; 50% small, 30% medium, 20% large). */
function rollOutcome() {
    const r = Math.random();
    if (r < 0.2) {
        return { type: 'loss' };
    }
    if (r < 0.4) {
        const collection = NFT_PRIZES[Math.floor(Math.random() * NFT_PRIZES.length)];
        const mints = NFT_MINTS[collection];
        const mint = mints[Math.floor(Math.random() * mints.length)];
        return { type: 'win', kind: 'nft', collection, mint };
    }
    const tokenType = TOKEN_TYPES[Math.floor(Math.random() * TOKEN_TYPES.length)];
    const sizeRoll = Math.random();
    let size = TOKEN_SIZES[0];
    if (sizeRoll < TOKEN_SIZE_WEIGHTS[0]) size = 'small';
    else if (sizeRoll < TOKEN_SIZE_WEIGHTS[0] + TOKEN_SIZE_WEIGHTS[1]) size = 'medium';
    else size = 'large';
    const prize = TOKEN_PRIZES[tokenType][size];
    return { type: 'win', kind: 'token', prize, tokenType };
}

function showResult(outcome) {
    if (!resultLose || !resultWin) return;
    resultLose.style.display = 'none';
    resultWin.style.display = 'none';

    if (outcome.type === 'loss') {
        resultLose.style.display = 'block';
        resultModal.setAttribute('aria-hidden', 'false');
        return;
    }

    resultWin.style.display = 'block';
    if (!resultPrizeImg || !resultPrizeName) {
        resultModal.setAttribute('aria-hidden', 'false');
        return;
    }

    if (outcome.kind === 'token') {
        resultPrizeImg.src = TOKEN_IMAGES[outcome.tokenType] || '';
        resultPrizeImg.alt = outcome.prize;
        resultPrizeName.textContent = outcome.prize;
        resultModal.setAttribute('aria-hidden', 'false');
        return;
    }

    var collectionLabel = outcome.collection || outcome.prize || 'NFT';
    var fallbackImg = NFT_FALLBACK_IMAGES[outcome.collection] || NFT_FALLBACK_IMAGES[collectionLabel] || '';
    resultPrizeImg.src = fallbackImg;
    resultPrizeImg.alt = collectionLabel;
    resultPrizeName.textContent = collectionLabel;
    resultModal.setAttribute('aria-hidden', 'false');
    var mint = outcome.mint;
    if (!mint) {
        return;
    }
    fetchNftMetadata(mint).then(function (meta) {
        if (meta && meta.image) resultPrizeImg.src = meta.image;
        var name = (meta && meta.name) || collectionLabel;
        resultPrizeName.textContent = name || 'NFT';
    }).catch(function () {});
}

function fetchNftMetadata(mintAddress) {
    var apiKey = typeof window !== 'undefined' && window.HELIUS_API_KEY;
    if (!apiKey) return Promise.resolve({ name: null, image: null });
    var url = 'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(apiKey);
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: '1',
            method: 'getAsset',
            params: { id: mintAddress }
        })
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var asset = data.result;
            if (!asset || data.error) return { name: null, image: null };
            var content = asset.content || {};
            var links = content.links || {};
            var metadata = content.metadata || {};
            var files = content.files || [];
            var image = (links && links.image) || (files[0] && (files[0].cdn_uri || files[0].uri)) || null;
            var name = (metadata && metadata.name) || null;
            var jsonUri = content.json_uri || null;
            if ((!image || !name) && jsonUri) {
                var metaUri = jsonUri.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/');
                return fetch(metaUri)
                    .then(function (res) { return res.json(); })
                    .then(function (json) {
                        return {
                            image: image || (json.image && (json.image.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/') || json.image)) || null,
                            name: name || json.name || null
                        };
                    })
                    .catch(function () { return { image: image, name: name }; });
            }
            return { image: image, name: name };
        })
        .catch(function () { return { name: null, image: null }; });
}

function setupResultModal() {
    const closeBtn = document.getElementById('close-result-modal');
    const backdrop = resultModal && resultModal.querySelector('.chest-modal-backdrop');

    function close() {
        if (resultModal) resultModal.setAttribute('aria-hidden', 'true');
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);
    if (resultCollectBtn) resultCollectBtn.addEventListener('click', close);
}
