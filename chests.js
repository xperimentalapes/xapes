// XMA Chests - Open chest for random prize (no purchase flow).
// Bronze chest price (fixed) — for display only
const PRICE_XMA_AMOUNT = 700000;

// Bronze chest treasury – prizes are read from this wallet
const BRONZE_TREASURY_WALLET = '9iyfxFga7a9FAkkgpgeP7PSscKEKdShihvso44GiMT4H';

// Prizes: 35% loss, 10% NFT, 55% token. NFT list from treasury; token prizes are tiered (see TOKEN_PRIZE_TIERS).
var treasuryNfts = [];         // { id, name, image }
var treasuryTokens = [];       // { id, symbol, balanceHuman, decimals, image } – raw balances from treasury
var availableTokenPrizes = []; // { tokenId, symbol, tierAmount, tierStr, image } – only tiers treasury can cover

// For each token symbol: 3 prize amounts (small, medium, large). When adding a new token, add tiers + image URL here.
const TOKEN_PRIZE_TIERS = {
    BLUNANA: [50000, 150000, 250000],
    XMA: [350000, 1050000, 1750000], // 350k, x3, x5
    FRENS: [1000000, 3000000, 5000000]
};
const TOKEN_IMAGES = {
    BLUNANA: 'https://ipfs.io/ipfs/QmTKRAZEcTfDeVDt8hebrCv27DctYghtdfXRMc9FRA6NU3',
    XMA: 'images/logo.png',
    FRENS: 'https://img-cdn.magiceden.dev/rs:fill:400:0:0/plain/https%3A%2F%2Fcreator-hub-prod.s3.us-east-2.amazonaws.com%2Ffrens_factory_pfp_1736409521055.gif'
};

// Fallbacks when treasury has no assets or for display
const NFT_FALLBACK_IMAGES = {};
const TOKEN_SIZE_WEIGHTS = [0.5, 0.3, 0.2];
const TOKEN_SIZES = ['small', 'medium', 'large'];

// Optional: set window.HELIUS_API_KEY for live NFT metadata fetch
let walletConnected = false;
let walletAddress = null;
// After successful Buy Chest tx, user can open once; reset on disconnect
let canOpenChest = false;
// Current result modal outcome (win with nft/token) for Collect
let currentOutcome = null;
// XMA for buy flow (same as slots)
const XMA_TOKEN_MINT = 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';
const TOKEN_DECIMALS = 6;
const PURCHASE_FEE_SOL = 0.002;
const PURCHASE_FEE_LAMPORTS = 2_000_000;

const resultModal = document.getElementById('result-modal');
const resultLose = document.getElementById('result-lose');
const resultWin = document.getElementById('result-win');
const resultPrizeImg = document.getElementById('result-prize-img');
const resultPrizeName = document.getElementById('result-prize-name');
const resultCollectBtn = document.getElementById('result-collect-btn');

var fireworksCanvas = null;
var fireworksCtx = null;
var fireworksWrap = null;
var fireworksParticles = [];
var fireworksAnimationId = null;
var fireworksBurstsScheduled = 0;
var FIREWORKS_COLORS = ['#fbbf24', '#f59e0b', '#a78bfa', '#8b5cf6', '#f472b6', '#f0abfc', '#fff'];

document.addEventListener('DOMContentLoaded', () => {
    setupWallet();
    fetchTreasuryPrizes(); // Load available prizes from bronze treasury wallet
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

function fetchTreasuryPrizes() {
    var apiKey = typeof window !== 'undefined' && window.HELIUS_API_KEY;
    if (!apiKey) {
        console.warn('HELIUS_API_KEY not set; cannot load treasury prizes');
        renderAvailablePrizesList([]);
        return;
    }
    var url = 'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(apiKey);
    treasuryNfts = [];
    treasuryTokens = [];
    var page = 1;
    var limit = 100;
    function fetchPage() {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: '1',
                method: 'getAssetsByOwner',
                params: { ownerAddress: BRONZE_TREASURY_WALLET, page: page, limit: limit }
            })
        }).then(function (r) { return r.json(); }).then(function (data) {
            if (data.error || !data.result) return;
            var result = data.result;
            var items = result.items || [];
            items.forEach(function (item) {
                var id = item.id;
                var iface = (item.interface || '').toLowerCase();
                var tokenStandard = (item.token_standard || '').toLowerCase();
                var content = item.content || {};
                var files = (content.files || [])[0];
                var metadata = content.metadata || {};
                var image = (files && (files.cdn_uri || files.uri)) || null;
                var name = metadata.name || null;
                var tokenInfo = item.token_info || {};
                var balance = tokenInfo.balance !== undefined ? Number(tokenInfo.balance) : 0;
                var decimals = Math.max(0, Number(tokenInfo.decimals) || 0);
                var isNft = (iface === 'v1_nft' || tokenStandard === 'nonfungible' || tokenStandard === 'programmablenonfungible' ||
                    (item.compression && item.compression.compressed) ||
                    (decimals === 0 && (balance === 1 || balance === 0) && (image || metadata.name)));
                if (isNft) {
                    treasuryNfts.push({ id: id, name: name || 'NFT', image: image });
                } else {
                    var symbol = (tokenInfo.symbol || metadata.symbol || 'TOKEN').replace(/^\$/, '');
                    var balanceHuman = decimals ? balance / Math.pow(10, decimals) : balance;
                    treasuryTokens.push({
                        id: id,
                        symbol: symbol,
                        balanceHuman: balanceHuman,
                        decimals: decimals,
                        image: image
                    });
                }
            });
            var total = result.total || 0;
            if (page * limit < total) {
                page++;
                return fetchPage();
            }
        });
    }
    fetchPage().then(function () {
        return fetchTokenAccountsAndBuildTokens(url);
    }).then(function () {
        buildAvailableTokenPrizes();
        renderAvailablePrizesList();
        fillNftNamesFromApi();
    }).catch(function (err) {
        console.error('Failed to fetch treasury prizes:', err);
        renderAvailablePrizesList([]);
    });
}

function fetchTokenAccountsAndBuildTokens(url) {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: '1',
            method: 'getTokenAccounts',
            params: { owner: BRONZE_TREASURY_WALLET }
        })
    }).then(function (r) { return r.json(); }).then(function (data) {
        if (data.error) return;
        var result = data.result || data;
        var accounts = result.token_accounts || [];
        if (accounts.length === 0) return;
        var mints = [];
        var amountByMint = {};
        accounts.forEach(function (acc) {
            var mint = acc.mint;
            var amount = Number(acc.amount) || 0;
            if (amount <= 0) return;
            amountByMint[mint] = (amountByMint[mint] || 0) + amount;
            if (mints.indexOf(mint) === -1) mints.push(mint);
        });
        return Promise.all(mints.map(function (mint) {
            return fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'getAsset', params: { id: mint } })
            }).then(function (r) { return r.json(); }).then(function (res) {
                var asset = res.result;
                if (!asset) return null;
                var rawAmount = amountByMint[mint] || 0;
                var content = asset.content || {};
                var tokenInfo = asset.token_info || content.metadata || {};
                var decimals = Math.max(0, Number(tokenInfo.decimals) || Number((content.metadata && content.metadata.decimals)) || 0);
                if (decimals === 0 && rawAmount > 1) decimals = 6;
                var symbol = (tokenInfo.symbol || (content.metadata && content.metadata.symbol) || 'TOKEN').replace(/^\$/, '');
                var files = (content.files || [])[0];
                var image = files && (files.cdn_uri || files.uri) || null;
                var balanceHuman = decimals ? rawAmount / Math.pow(10, decimals) : rawAmount;
                return { id: mint, symbol: symbol, balanceHuman: balanceHuman, decimals: decimals, image: image };
            }).catch(function () { return null; });
        })).then(function (results) {
            treasuryTokens = (results || []).filter(Boolean);
        });
    }).catch(function () {});
}

function buildAvailableTokenPrizes() {
    availableTokenPrizes = [];
    treasuryTokens.forEach(function (tok) {
        var symbolKey = (tok.symbol || '').toUpperCase();
        var tiers = TOKEN_PRIZE_TIERS[symbolKey];
        if (!tiers || !Array.isArray(tiers)) return;
        var balanceHuman = tok.balanceHuman || 0;
        tiers.forEach(function (tierAmount) {
            if (balanceHuman >= tierAmount) {
                availableTokenPrizes.push({
                    tokenId: tok.id,
                    symbol: tok.symbol,
                    tierAmount: tierAmount,
                    tierStr: tierAmount.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' ' + tok.symbol,
                    image: TOKEN_IMAGES[symbolKey] || tok.image
                });
            }
        });
    });
}

function fillNftNamesFromApi() {
    var apiKey = typeof window !== 'undefined' && window.HELIUS_API_KEY;
    if (!apiKey || treasuryNfts.length === 0) return;
    var url = 'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(apiKey);
    treasuryNfts.forEach(function (nft, index) {
        if (nft.name && nft.name !== 'NFT') return;
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'getAsset', params: { id: nft.id } })
        }).then(function (r) { return r.json(); }).then(function (data) {
            var asset = data.result;
            if (!asset || data.error) return;
            var content = asset.content || {};
            var metadata = content.metadata || {};
            var name = metadata.name || null;
            if (name) {
                nft.name = name;
                renderAvailablePrizesList();
            }
        }).catch(function () {});
    });
}

function renderAvailablePrizesList() {
    var list = document.querySelector('.available-prizes-list');
    if (!list) return;
    list.innerHTML = '';
    if (treasuryNfts.length === 0 && availableTokenPrizes.length === 0) {
        var li = document.createElement('li');
        li.className = 'prize-item';
        li.textContent = 'No prizes in treasury yet. Add NFTs or tokens to the bronze treasury wallet.';
        list.appendChild(li);
        return;
    }
    treasuryNfts.forEach(function (nft) {
        var li = document.createElement('li');
        li.className = 'prize-item';
        var img = document.createElement('img');
        img.src = nft.image || 'images/logo.png';
        img.alt = nft.name;
        img.className = 'prize-thumb';
        var span = document.createElement('span');
        span.className = 'prize-label';
        span.textContent = nft.name;
        li.appendChild(img);
        li.appendChild(span);
        list.appendChild(li);
    });
    availableTokenPrizes.forEach(function (prize) {
        var li = document.createElement('li');
        li.className = 'prize-item';
        var img = document.createElement('img');
        img.src = prize.image || 'images/logo.png';
        img.alt = prize.symbol || 'Token';
        img.className = 'prize-thumb';
        var span = document.createElement('span');
        span.className = 'prize-label';
        span.textContent = prize.tierStr;
        li.appendChild(img);
        li.appendChild(span);
        list.appendChild(li);
    });
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
                    updateChestButton();
                })
                .catch(() => useDemoWallet());
        } else {
            useDemoWallet();
        }
    });

    disconnectBtn.addEventListener('click', () => {
        walletConnected = false;
        walletAddress = null;
        canOpenChest = false;
        walletInfo.style.display = 'none';
        connectBtn.style.display = 'block';
        updateChestButton();
    });

    function useDemoWallet() {
        walletAddress = 'Demo' + Math.random().toString(36).slice(2, 10);
        walletConnected = true;
        walletAddressEl.textContent = walletAddress;
        connectBtn.style.display = 'none';
        walletInfo.style.display = 'flex';
        updateChestButton();
    }

    if (window.solana?.isPhantom) {
        window.solana.on('accountChanged', () => {
            if (!window.solana.isConnected()) {
                walletConnected = false;
                walletAddress = null;
                canOpenChest = false;
                walletInfo.style.display = 'none';
                connectBtn.style.display = 'block';
                updateChestButton();
            }
        });
    }
}

function updateChestButton() {
    const openBtn = document.getElementById('open-chest-btn');
    if (!openBtn) return;
    var isRealWallet = walletConnected && walletAddress && !walletAddress.startsWith('Demo');
    if (canOpenChest) {
        openBtn.textContent = 'Open Chest';
        openBtn.disabled = !isRealWallet;
    } else {
        openBtn.textContent = 'Buy Chest';
        openBtn.disabled = !isRealWallet;
    }
}

function setupBronzeChest() {
    updateChestButton();
    const openBtn = document.getElementById('open-chest-btn');
    if (!openBtn) return;
    openBtn.addEventListener('click', () => {
        if (canOpenChest) {
            const outcome = rollOutcome();
            showResult(outcome);
        } else {
            buyChest();
        }
    });
}

function getChestConnection() {
    var apiKey = typeof window !== 'undefined' && window.HELIUS_API_KEY;
    var url = apiKey ? 'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(apiKey) : 'https://api.mainnet-beta.solana.com';
    return new (window.solanaWeb3 || solanaWeb3).Connection(url, 'confirmed');
}

async function buyChest() {
    if (!walletAddress || walletAddress.startsWith('Demo') || !window.solana?.signTransaction) {
        alert('Please connect your Phantom wallet to buy a chest.');
        return;
    }
    if (!window.splToken) {
        alert('Token library is loading. Please wait a moment and try again.');
        return;
    }
    var connection = getChestConnection();
    var PublicKey = (window.solanaWeb3 || solanaWeb3).PublicKey;
    var Transaction = (window.solanaWeb3 || solanaWeb3).Transaction;
    var TransactionInstruction = (window.solanaWeb3 || solanaWeb3).TransactionInstruction;
    var SystemProgram = (window.solanaWeb3 || solanaWeb3).SystemProgram;
    var getAssociatedTokenAddress = window.splToken.getAssociatedTokenAddress;
    var createTransferInstruction = window.splToken.createTransferInstruction;

    var userPublicKey = new PublicKey(walletAddress);
    var treasuryPublicKey = new PublicKey(BRONZE_TREASURY_WALLET);
    var tokenMint = new PublicKey(XMA_TOKEN_MINT);

    // Memo so scanners/Phantom can see this is a known chest purchase (may reduce false "malicious" warnings)
    var MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
    var memoIx = new TransactionInstruction({
        keys: [],
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: new TextEncoder().encode('Xapes Bronze Chest Purchase')
    });

    var userTokenAccount = await getAssociatedTokenAddress(tokenMint, userPublicKey);
    var treasuryTokenAccount = await getAssociatedTokenAddress(tokenMint, treasuryPublicKey);
    var transferAmount = BigInt(Math.floor(PRICE_XMA_AMOUNT * Math.pow(10, TOKEN_DECIMALS)));
    var transferInstruction = createTransferInstruction(
        userTokenAccount,
        treasuryTokenAccount,
        userPublicKey,
        transferAmount
    );
    var solFeeInstruction = SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: treasuryPublicKey,
        lamports: PURCHASE_FEE_LAMPORTS
    });
    var transaction = new Transaction().add(memoIx).add(transferInstruction).add(solFeeInstruction);
    try {
        var blockhash = (await connection.getLatestBlockhash()).blockhash;
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userPublicKey;
        var signed = await window.solana.signTransaction(transaction);
        var signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
        await connection.confirmTransaction(signature, 'confirmed');
        canOpenChest = true;
        updateChestButton();
    } catch (err) {
        console.error('Buy chest error:', err);
        alert('Transaction failed: ' + (err.message || String(err)));
    }
}

/** 35% loss, 10% NFT (random from treasury), 55% token (random from treasury). */
function rollOutcome() {
    var r = Math.random();
    if (r < 0.35) {
        return { type: 'loss' };
    }
    if (r < 0.45 && treasuryNfts.length > 0) {
        var nft = treasuryNfts[Math.floor(Math.random() * treasuryNfts.length)];
        return { type: 'win', kind: 'nft', collection: nft.name, mint: nft.id, nftImage: nft.image };
    }
    if (availableTokenPrizes.length > 0) {
        var prize = availableTokenPrizes[Math.floor(Math.random() * availableTokenPrizes.length)];
        var tokenInfo = treasuryTokens.find(function (t) { return t.id === prize.tokenId; });
        var decimals = (tokenInfo && tokenInfo.decimals != null) ? tokenInfo.decimals : 6;
        return { type: 'win', kind: 'token', prize: prize.tierStr, tokenMint: prize.tokenId, tokenImage: prize.image, amount: prize.tierAmount, decimals: decimals };
    }
    if (treasuryNfts.length > 0) {
        var nft2 = treasuryNfts[Math.floor(Math.random() * treasuryNfts.length)];
        return { type: 'win', kind: 'nft', collection: nft2.name, mint: nft2.id, nftImage: nft2.image };
    }
    return { type: 'loss' };
}

function showResult(outcome) {
    currentOutcome = outcome;
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
        setTimeout(startFireworks, 80);
        return;
    }

    if (outcome.kind === 'token') {
        resultPrizeImg.src = outcome.tokenImage || 'images/logo.png';
        resultPrizeImg.alt = outcome.prize;
        resultPrizeName.textContent = outcome.prize || 'Token';
        resultModal.setAttribute('aria-hidden', 'false');
        setTimeout(startFireworks, 80);
        return;
    }

    var collectionLabel = outcome.collection || outcome.prize || 'NFT';
    var fallbackImg = outcome.nftImage || NFT_FALLBACK_IMAGES[outcome.collection] || NFT_FALLBACK_IMAGES[collectionLabel] || 'images/logo.png';
    resultPrizeImg.src = fallbackImg;
    resultPrizeImg.alt = collectionLabel;
    resultPrizeName.textContent = collectionLabel;
    resultModal.setAttribute('aria-hidden', 'false');
    setTimeout(startFireworks, 80);
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

function createFireworksBurst(cx, cy, colorList) {
    var colors = colorList || FIREWORKS_COLORS;
    var count = 50 + Math.floor(Math.random() * 30);
    for (var i = 0; i < count; i++) {
        var angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        var speed = 2 + Math.random() * 5;
        var vx = Math.cos(angle) * speed;
        var vy = Math.sin(angle) * speed - 2;
        fireworksParticles.push({
            x: cx,
            y: cy,
            vx: vx,
            vy: vy,
            life: 1,
            decay: 0.012 + Math.random() * 0.01,
            color: colors[Math.floor(Math.random() * colors.length)],
            radius: 1.2 + Math.random() * 1.2
        });
    }
}

function runFireworksTick() {
    if (!fireworksCtx || !fireworksCanvas) return;
    var w = fireworksCanvas.width;
    var h = fireworksCanvas.height;
    fireworksCtx.fillStyle = 'rgba(0,0,0,0.12)';
    fireworksCtx.fillRect(0, 0, w, h);
    var i = fireworksParticles.length;
    while (i--) {
        var p = fireworksParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.life -= p.decay;
        if (p.life <= 0) {
            fireworksParticles.splice(i, 1);
            continue;
        }
        var alpha = p.life;
        fireworksCtx.beginPath();
        fireworksCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        if (p.color.startsWith('#')) {
            var hex = p.color.slice(1);
            var r = parseInt(hex.slice(0, 2), 16);
            var g = parseInt(hex.slice(2, 4), 16);
            var b = parseInt(hex.slice(4, 6), 16);
            fireworksCtx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(2) + ')';
        } else {
            fireworksCtx.fillStyle = p.color;
        }
        fireworksCtx.fill();
    }
    if (fireworksParticles.length > 0 || fireworksBurstsScheduled > 0) {
        fireworksAnimationId = requestAnimationFrame(runFireworksTick);
    } else {
        fireworksAnimationId = null;
        if (fireworksWrap) fireworksWrap.setAttribute('aria-hidden', 'true');
    }
}

function startFireworks() {
    fireworksWrap = document.querySelector('.fireworks-canvas-wrap');
    fireworksCanvas = document.getElementById('result-fireworks-canvas');
    if (!fireworksWrap || !fireworksCanvas) return;
    if (fireworksAnimationId) cancelAnimationFrame(fireworksAnimationId);
    fireworksParticles = [];
    fireworksWrap.setAttribute('aria-hidden', 'false');
    var rect = fireworksWrap.getBoundingClientRect();
    fireworksCanvas.width = rect.width;
    fireworksCanvas.height = rect.height;
    fireworksCtx = fireworksCanvas.getContext('2d');
    if (!fireworksCtx) return;
    var cx = rect.width * 0.5;
    var cy = rect.height * 0.35;
    createFireworksBurst(cx, cy);
    fireworksBurstsScheduled = 2;
    setTimeout(function () {
        if (fireworksBurstsScheduled > 0) {
            fireworksBurstsScheduled--;
            createFireworksBurst(rect.width * 0.3, rect.height * 0.4);
        }
    }, 400);
    setTimeout(function () {
        if (fireworksBurstsScheduled > 0) {
            fireworksBurstsScheduled--;
            createFireworksBurst(rect.width * 0.7, rect.height * 0.4);
        }
    }, 800);
    runFireworksTick();
}

function stopFireworks() {
    if (fireworksAnimationId) {
        cancelAnimationFrame(fireworksAnimationId);
        fireworksAnimationId = null;
    }
    fireworksParticles = [];
    fireworksBurstsScheduled = 0;
    if (fireworksWrap) fireworksWrap.setAttribute('aria-hidden', 'true');
    if (fireworksCtx && fireworksCanvas) {
        fireworksCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
    }
}

function setupResultModal() {
    const closeBtn = document.getElementById('close-result-modal');
    const backdrop = resultModal && resultModal.querySelector('.chest-modal-backdrop');

    function close() {
        stopFireworks();
        if (currentOutcome && currentOutcome.type === 'loss') {
            canOpenChest = false;
            currentOutcome = null;
            updateChestButton();
        }
        if (resultModal) resultModal.setAttribute('aria-hidden', 'true');
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);
    if (resultCollectBtn) {
        resultCollectBtn.addEventListener('click', () => {
            if (currentOutcome && currentOutcome.type === 'win') {
                collectChestPrize();
            } else {
                close();
            }
        });
    }
}

async function collectChestPrize() {
    if (!currentOutcome || currentOutcome.type !== 'win' || !walletAddress || walletAddress.startsWith('Demo')) {
        return;
    }
    var body = { userWallet: walletAddress };
    if (currentOutcome.kind === 'nft') {
        body.prizeType = 'nft';
        body.mint = currentOutcome.mint;
    } else {
        body.prizeType = 'token';
        body.tokenMint = currentOutcome.tokenMint;
        body.amount = currentOutcome.amount;
        body.decimals = currentOutcome.decimals != null ? currentOutcome.decimals : 6;
    }
    resultCollectBtn.disabled = true;
    try {
        var res = await fetch('/api/collect-chest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            throw new Error(data.error || data.message || 'Collect failed');
        }
        var txBase64 = data.transaction;
        if (!txBase64) throw new Error('No transaction returned');
        var Transaction = (window.solanaWeb3 || solanaWeb3).Transaction;
        var raw = Uint8Array.from(atob(txBase64), function (c) { return c.charCodeAt(0); });
        var tx = Transaction.from(raw);
        var connection = getChestConnection();
        var sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
        await connection.confirmTransaction(sig, 'confirmed');
        canOpenChest = false;
        currentOutcome = null;
        updateChestButton();
        stopFireworks();
        if (resultModal) resultModal.setAttribute('aria-hidden', 'true');
    } catch (err) {
        console.error('Collect chest error:', err);
        alert('Collect failed: ' + (err.message || String(err)));
    } finally {
        resultCollectBtn.disabled = false;
    }
}
