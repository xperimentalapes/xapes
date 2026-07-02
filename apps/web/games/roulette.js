/**
 * XMA Roulette – 3 cells; each cell has 2 slots and slides up to next number. Ease-out timing.
 * Chip placement: select chip (1/5/10/25/50), click table to place; same square stacks.
 * Spins persist to DB (same as slots). Buy chips = purchase spins. Collect = cash out chips.
 */
(function () {
    'use strict';

    var WHEEL_ORDER = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
    var RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    var SEGMENTS = 38;
    var SLIDE_MS = 65;
    var CELL_H = 66;

    var XMA_TOKEN_MINT = 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';
    var TREASURY_WALLET = '6auNHk39Mut82FhjY9iBZXjqm7xJabFVrY3bVgrYSMvj';
    var TOKEN_DECIMALS = 6;
    var PURCHASE_FEE_SOL = 0.002; // Split: 0.0012 to treasury, 0.0008 to partner
    var FEE_TREASURY_LAMPORTS = 1200000;   // 0.0012 SOL -> treasury
    var FEE_PARTNER_LAMPORTS = 800000;     // 0.0008 SOL -> partner
    var FEE_PARTNER_WALLET = '3WNHW6sr1sQdbRjovhPrxgEJdWASZ43egGWMMNrhgoRR';
    var MAX_CHIPS_PER_PURCHASE = 50000;
    var MAX_PURCHASE_XMA = 2000000;
    var DEFAULT_CHIPS_TO_BUY = 10;

    var wallet = null;
    var connection = null;
    var xmaBalance = 0;
    var costPerChip = 0;
    var unclaimedRewards = 0;
    var isCollecting = false;

    var CHIP_VALUES = [1, 5, 10, 25, 50];

    var chipBalance = 0;
    var selectedChipValue = 1;
    var bets = {};
    var chipTypes = {};
    var undoHistory = [];
    var lastBets = {};
    var lastChipTypes = {};
    var last10Results = [];
    var spinInProgress = false;
    var userClickedChipYet = false;

    function getMaxChipsForCost(cost) {
        cost = Math.floor(Number(cost) || 0);
        if (cost <= 0) return 1;
        return Math.max(1, Math.min(MAX_CHIPS_PER_PURCHASE, Math.floor(MAX_PURCHASE_XMA / cost)));
    }

    function updateChipPurchaseLimits() {
        var costEl = document.getElementById('roulette-cost-per-chip');
        var numEl = document.getElementById('roulette-num-chips');
        if (!numEl) return;
        var cost = parseFloat(costEl && costEl.value ? costEl.value : 0);
        var maxChips = getMaxChipsForCost(cost);
        numEl.max = String(maxChips);
        numEl.min = '1';
        numEl.placeholder = 'Max ' + maxChips;
        var current = parseInt(numEl.value, 10);
        if (!current || current < 1) {
            numEl.value = String(Math.min(DEFAULT_CHIPS_TO_BUY, maxChips));
        } else if (current > maxChips) {
            numEl.value = String(maxChips);
        }
        var hint = document.getElementById('roulette-num-chips-hint');
        if (hint) {
            hint.textContent = maxChips === 1
                ? '2M XMA limit — 1 chip max at this tier'
                : '2M XMA limit — max ' + maxChips + ' chips at this tier';
        }
    }

    function bindChipPurchaseControls() {
        var costEl = document.getElementById('roulette-cost-per-chip');
        if (costEl) {
            costEl.addEventListener('change', updateChipPurchaseLimits);
        }
        updateChipPurchaseLimits();
    }

    function getBgColor(num) {
        if (num === 0 || num === '00') return '#0d7d3a';
        return RED_NUMBERS.indexOf(num) !== -1 ? '#b91c1c' : '#1c1917';
    }

    function getBetKey(el) {
        var key = el.getAttribute('data-num');
        if (key != null) return String(key);
        return el.getAttribute('data-bet') || '';
    }

    function getTotalStaked() {
        var total = 0;
        for (var k in bets) if (bets.hasOwnProperty(k)) total += bets[k];
        return total;
    }

    function getAvailableChips() {
        return Math.max(0, chipBalance - getTotalStaked());
    }

    function updateChipUI() {
        var el = document.getElementById('roulette-chips');
        if (el) el.textContent = getAvailableChips();
        updateChipSelectorState();
    }

    function updateChipSelectorState() {
        var available = getAvailableChips();
        var chips = document.querySelectorAll('.roulette-chip');
        var selectedStillOk = false;
        chips.forEach(function (btn) {
            var val = parseInt(btn.getAttribute('data-value'), 10);
            var canAfford = available >= val;
            btn.disabled = !canAfford;
            if (val === selectedChipValue && canAfford) selectedStillOk = true;
        });
        if (!selectedStillOk) {
            selectedChipValue = 0;
            if (available >= 1) {
                selectedChipValue = 1;
            } else if (available > 0) {
                for (var i = CHIP_VALUES.length - 1; i >= 0; i--) {
                    if (CHIP_VALUES[i] <= available) {
                        selectedChipValue = CHIP_VALUES[i];
                        break;
                    }
                }
            }
        }
        chips.forEach(function (btn) {
            var val = parseInt(btn.getAttribute('data-value'), 10);
            var isSel = val === selectedChipValue && !btn.disabled;
            btn.classList.toggle('selected', isSel);
            btn.setAttribute('aria-pressed', isSel ? 'true' : 'false');
        });
    }

    function updateStakedUI() {
        var el = document.getElementById('roulette-staked');
        if (el) el.textContent = getTotalStaked();
    }

    function renderChipStacks() {
        var overlay = document.getElementById('roulette-chip-overlay');
        var table = document.querySelector('.roulette-table');
        if (!overlay || !table) return;
        overlay.innerHTML = '';
        var cells = table.querySelectorAll('.roulette-num, .roulette-zero-cell, .roulette-outside-bet');
        var overlayRect = overlay.getBoundingClientRect();
        cells.forEach(function (cell) {
            var key = getBetKey(cell);
            var amount = bets[key];
            if (amount && amount > 0) {
                var stack = document.createElement('div');
                var chipClass = chipTypes[key] ? 'roulette-chip-stack roulette-chip-' + chipTypes[key] : 'roulette-chip-stack roulette-chip-1';
                stack.className = chipClass;
                stack.textContent = amount;
                var cellRect = cell.getBoundingClientRect();
                var left = cellRect.left - overlayRect.left + cellRect.width / 2;
                var top = cellRect.top - overlayRect.top + cellRect.height / 2;
                stack.style.left = left + 'px';
                stack.style.top = top + 'px';
                overlay.appendChild(stack);
            }
        });
    }

    var COL1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
    var COL2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
    var COL3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

    function getPayoutMultiplier(key, result) {
        var num = result === '00' ? '00' : (result === 0 ? 0 : Number(result));
        if (key === '0' || key === '00' || (key >= '1' && key <= '36')) {
            if (String(key) === String(result)) return 35;
            return 0;
        }
        if (num !== 0 && num !== '00') {
            var n = Number(num);
            switch (key) {
                case 'red': return RED_NUMBERS.indexOf(n) !== -1 ? 1 : 0;
                case 'black': return RED_NUMBERS.indexOf(n) === -1 ? 1 : 0;
                case 'even': return n % 2 === 0 ? 1 : 0;
                case 'odd': return n % 2 === 1 ? 1 : 0;
                case '1-18': return n >= 1 && n <= 18 ? 1 : 0;
                case '19-36': return n >= 19 && n <= 36 ? 1 : 0;
                case '1-12': return n >= 1 && n <= 12 ? 2 : 0;
                case '13-24': return n >= 13 && n <= 24 ? 2 : 0;
                case '25-36': return n >= 25 && n <= 36 ? 2 : 0;
                case 'col1': return COL1.indexOf(n) !== -1 ? 2 : 0;
                case 'col2': return COL2.indexOf(n) !== -1 ? 2 : 0;
                case 'col3': return COL3.indexOf(n) !== -1 ? 2 : 0;
            }
        }
        return 0;
    }

    function calculateWinnings(result) {
        var profit = 0;
        var totalReturned = 0;
        for (var key in bets) {
            if (!bets.hasOwnProperty(key)) continue;
            var stake = bets[key];
            var mult = getPayoutMultiplier(key, result);
            if (mult > 0) {
                profit += stake * mult;
                totalReturned += stake * (1 + mult);
            }
        }
        return { profit: profit, totalReturned: totalReturned };
    }

    function placeBet(key, amount) {
        bets[key] = (bets[key] || 0) + amount;
        chipTypes[key] = selectedChipValue;
        undoHistory.push({ key: key, amount: amount });
        updatePopups();
        updateChipUI();
        updateStakedUI();
        renderChipStacks();
        updateUndoButton();
        updateReplaceButton();
        updateRouletteButtonStates();
    }

    function undoLastBet() {
        if (undoHistory.length === 0) return;
        var last = undoHistory.pop();
        var key = last.key;
        var amount = last.amount;
        bets[key] = (bets[key] || 0) - amount;
        if (bets[key] <= 0) { delete bets[key]; delete chipTypes[key]; }
        updateChipUI();
        updateStakedUI();
        renderChipStacks();
        updateUndoButton();
        updateReplaceButton();
        updateRouletteButtonStates();
    }

    function updateUndoButton() {
        var btn = document.getElementById('roulette-undo');
        if (btn) btn.disabled = undoHistory.length === 0;
    }

    function updateReplaceButton() {
        var btn = document.getElementById('roulette-replace');
        if (!btn) return;
        var total = 0;
        for (var k in lastBets) if (lastBets.hasOwnProperty(k)) total += lastBets[k];
        btn.disabled = Object.keys(lastBets).length === 0 || getAvailableChips() < total;
    }

    function showWinMessage(profit) {
        var overlay = document.getElementById('roulette-win-display');
        var msg = document.getElementById('roulette-win-message');
        if (!overlay || !msg) return;
        if (profit > 0) {
            msg.textContent = 'You won ' + profit + ' chips!';
        } else {
            msg.textContent = 'No win this spin.';
        }
        overlay.style.display = 'block';
        setTimeout(function () {
            overlay.style.display = 'none';
        }, 3000);
    }

    function clearTable() {
        var total = getTotalStaked();
        bets = {};
        chipTypes = {};
        undoHistory = [];
        updateChipUI();
        updateStakedUI();
        renderChipStacks();
        updateUndoButton();
        updateReplaceButton();
        updateRouletteButtonStates();
    }

    function replaceChips() {
        var total = 0;
        for (var k in lastBets) if (lastBets.hasOwnProperty(k)) total += lastBets[k];
        if (getAvailableChips() < total || Object.keys(lastBets).length === 0) return;
        for (var key in lastBets) {
            if (lastBets.hasOwnProperty(key)) {
                bets[key] = lastBets[key];
                chipTypes[key] = lastChipTypes[key] || 1;
            }
        }
        updateChipUI();
        updateStakedUI();
        renderChipStacks();
        updateUndoButton();
        updateReplaceButton();
        updateRouletteButtonStates();
    }

    function copyBets(src) {
        var out = {};
        for (var k in src) if (src.hasOwnProperty(k)) out[k] = src[k];
        return out;
    }

    function updatePopups() {
        var popupSelect = document.getElementById('roulette-popup-select-chip');
        var popupPlace = document.getElementById('roulette-popup-place-chip');
        if (!popupSelect || !popupPlace) return;
        if (spinInProgress) {
            popupSelect.classList.remove('roulette-popup-visible');
            popupPlace.classList.remove('roulette-popup-visible');
            popupSelect.setAttribute('aria-hidden', 'true');
            popupPlace.setAttribute('aria-hidden', 'true');
            return;
        }
        if (userClickedChipYet) {
            popupSelect.classList.remove('roulette-popup-visible');
            popupPlace.classList.add('roulette-popup-visible');
            popupSelect.setAttribute('aria-hidden', 'true');
            popupPlace.setAttribute('aria-hidden', 'false');
        } else {
            popupSelect.classList.add('roulette-popup-visible');
            popupPlace.classList.remove('roulette-popup-visible');
            popupSelect.setAttribute('aria-hidden', 'false');
            popupPlace.setAttribute('aria-hidden', 'true');
        }
    }

    function bindChipSelector() {
        var chips = document.querySelectorAll('.roulette-chip');
        chips.forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (btn.disabled) return;
                var val = parseInt(btn.getAttribute('data-value'), 10);
                if (isNaN(val)) return;
                selectedChipValue = val;
                userClickedChipYet = true;
                updatePopups();
                chips.forEach(function (b) {
                    b.classList.remove('selected');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('selected');
                btn.setAttribute('aria-pressed', 'true');
            });
        });
    }

    function bindTableClicks() {
        var table = document.querySelector('.roulette-table');
        if (!table) return;
        table.addEventListener('click', function (e) {
            var cell = e.target.closest('.roulette-num, .roulette-zero-cell, .roulette-outside-bet');
            if (!cell) return;
            if (!selectedChipValue || getAvailableChips() < selectedChipValue) return;
            var key = getBetKey(cell);
            if (!key) return;
            placeBet(key, selectedChipValue);
        });
    }

    function setSlot(slotEl, num) {
        if (!slotEl) return;
        slotEl.textContent = num;
        slotEl.style.background = getBgColor(num);
    }

    function getSlider(cellEl) {
        return cellEl ? cellEl.querySelector('.roulette-cell-slider') : null;
    }
    function getSlots(cellEl) {
        if (!cellEl) return [null, null];
        var slots = cellEl.querySelectorAll('.roulette-cell-num');
        return [slots[0] || null, slots[1] || null];
    }

    function setCellToIndex(cellEl, centerIndex, offset) {
        var idx = (centerIndex + offset + SEGMENTS) % SEGMENTS;
        var num = WHEEL_ORDER[idx];
        var slots = getSlots(cellEl);
        setSlot(slots[0], num);
        setSlot(slots[1], WHEEL_ORDER[(idx + 1) % SEGMENTS]);
        var slider = getSlider(cellEl);
        if (slider) { slider.style.transition = 'none'; slider.style.transform = 'translateY(0px)'; }
    }

    function showThree(centerIndex) {
        var above = document.getElementById('roulette-cell-above');
        var center = document.getElementById('roulette-cell-center');
        var below = document.getElementById('roulette-cell-below');
        setCellToIndex(above, centerIndex, -1);
        setCellToIndex(center, centerIndex, 0);
        setCellToIndex(below, centerIndex, 1);
    }

    function doOneSlide(above, center, below, currentIdx, onDone) {
        var nextIdx = (currentIdx + 1) % SEGMENTS;
        var slotsA = getSlots(above), slotsC = getSlots(center), slotsB = getSlots(below);
        setSlot(slotsA[1], WHEEL_ORDER[(nextIdx - 1 + SEGMENTS) % SEGMENTS]);
        setSlot(slotsC[1], WHEEL_ORDER[nextIdx]);
        setSlot(slotsB[1], WHEEL_ORDER[(nextIdx + 1) % SEGMENTS]);

        var sliderA = getSlider(above), sliderC = getSlider(center), sliderB = getSlider(below);
        var t = (SLIDE_MS / 1000) + 's';
        sliderA.style.transition = 'transform ' + t + ' ease-out';
        sliderC.style.transition = 'transform ' + t + ' ease-out';
        sliderB.style.transition = 'transform ' + t + ' ease-out';
        sliderA.style.transform = 'translateY(-' + CELL_H + 'px)';
        sliderC.style.transform = 'translateY(-' + CELL_H + 'px)';
        sliderB.style.transform = 'translateY(-' + CELL_H + 'px)';

        setTimeout(function () {
            setSlot(slotsA[0], WHEEL_ORDER[(nextIdx - 1 + SEGMENTS) % SEGMENTS]);
            setSlot(slotsC[0], WHEEL_ORDER[nextIdx]);
            setSlot(slotsB[0], WHEEL_ORDER[(nextIdx + 1) % SEGMENTS]);
            setSlot(slotsA[1], WHEEL_ORDER[(nextIdx + SEGMENTS - 2) % SEGMENTS]);
            setSlot(slotsC[1], WHEEL_ORDER[(nextIdx + 1) % SEGMENTS]);
            setSlot(slotsB[1], WHEEL_ORDER[(nextIdx + 2) % SEGMENTS]);
            sliderA.style.transition = 'none'; sliderA.style.transform = 'translateY(0)';
            sliderC.style.transition = 'none'; sliderC.style.transform = 'translateY(0)';
            sliderB.style.transition = 'none'; sliderB.style.transform = 'translateY(0)';
            if (onDone) onDone(nextIdx);
        }, SLIDE_MS);
    }

    function spinReel(resultNumber, callback) {
        var resultIdx = WHEEL_ORDER.indexOf(resultNumber);
        if (resultIdx === -1) return;

        var above = document.getElementById('roulette-cell-above');
        var center = document.getElementById('roulette-cell-center');
        var below = document.getElementById('roulette-cell-below');
        if (!above || !center || !below) return;

        var duration = 3000;
        var totalSteps = 45 + Math.floor(Math.random() * 15);
        var startIdx = (resultIdx - totalSteps + SEGMENTS * 100) % SEGMENTS;
        showThree(startIdx);

        var currentIdx = startIdx;
        var step = 0;
        var startTime = Date.now();

        function easeOutCubic(t) {
            return 1 - Math.pow(1 - t, 3);
        }

        function runNextSlide() {
            if (step >= totalSteps) {
                showThree(resultIdx);
                if (typeof callback === 'function') callback();
                return;
            }
            doOneSlide(above, center, below, currentIdx, function (newIdx) {
                currentIdx = newIdx;
                step++;
                if (step >= totalSteps) {
                    showThree(resultIdx);
                    if (typeof callback === 'function') callback();
                    return;
                }
                var nextT = easeOutCubic((step + 1) / totalSteps);
                var prevT = easeOutCubic(step / totalSteps);
                var gap = (nextT - prevT) * duration - SLIDE_MS;
                setTimeout(runNextSlide, Math.max(10, gap));
            });
        }

        runNextSlide();
    }

    function getResultColorClass(num) {
        return (num === 0 || num === '00') ? 'roulette-green' : (RED_NUMBERS.indexOf(num) !== -1 ? 'roulette-red' : 'roulette-black');
    }

    function renderLast10() {
        var container = document.getElementById('roulette-last-10');
        if (!container) return;
        container.textContent = '';
        for (var i = 0; i < last10Results.length; i++) {
            var num = last10Results[i];
            var span = document.createElement('span');
            span.className = 'roulette-last-10-num ' + getResultColorClass(num);
            span.textContent = num;
            container.appendChild(span);
        }
    }

    function bindSpinButton() {
        var btn = document.getElementById('roulette-spin');
        if (!btn) return;
        btn.addEventListener('click', function () {
            if (btn.disabled) return;
            if (getTotalStaked() < 1) return;
            if (!wallet || !window.CasinoAuth) {
                alert('Connect wallet and approve the sign request to spin');
                return;
            }
            btn.disabled = true;
            spinInProgress = true;
            userClickedChipYet = false;
            updatePopups();
            updateRouletteButtonStates();
            var betsSnapshot = copyBets(bets);
            window.CasinoAuth.casinoFetch('/api/spin-roulette', 'spin-roulette', wallet, { bets: betsSnapshot })
                .then(function (res) {
                    if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Spin failed'); });
                    return res.json();
                })
                .then(function (data) {
                    var result = data.result;
                    spinReel(result, function () {
                        last10Results.push(result);
                        if (last10Results.length > 7) last10Results.shift();
                        renderLast10();
                        chipBalance = data.chipBalance;
                        lastBets = copyBets(betsSnapshot);
                        lastChipTypes = copyBets(chipTypes);
                        showWinMessage(data.profit);
                        clearTable();
                        userClickedChipYet = false;
                        selectedChipValue = 0;
                        var chipBtns = document.querySelectorAll('.roulette-chip');
                        chipBtns.forEach(function (b) {
                            b.classList.remove('selected');
                            b.setAttribute('aria-pressed', 'false');
                        });
                        updateChipUI();
                        updateReplaceButton();
                        updateRouletteButtonStates();
                        btn.disabled = false;
                        spinInProgress = false;
                        updatePopups();
                    });
                })
                .catch(function (err) {
                    console.error('Spin error:', err);
                    alert(err.message || 'Spin failed');
                    btn.disabled = false;
                    spinInProgress = false;
                    updateRouletteButtonStates();
                });
        });
    }

    function bindUndoButton() {
        var btn = document.getElementById('roulette-undo');
        if (btn) btn.addEventListener('click', undoLastBet);
    }

    function bindReplaceButton() {
        var btn = document.getElementById('roulette-replace');
        if (btn) btn.addEventListener('click', replaceChips);
    }

    function saveSpinToDb(result) {
        if (!wallet) return;
        var resultSymbols = [String(result)];
        fetch('/api/save-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletAddress: wallet,
                costPerChip: costPerChip,
                resultSymbols: resultSymbols,
                wonAmount: 0,
                updateChipsBalance: chipBalance,
                gameType: 'roulette'
            })
        }).then(function (res) {
            if (!res.ok) return res.json().then(function (d) { console.error('Save spin failed:', d); });
        }).catch(function (err) { console.error('Save spin error:', err); });
    }

    function updateRouletteButtonStates() {
        var buyBtn = document.getElementById('roulette-buy-chips');
        var spinBtn = document.getElementById('roulette-spin');
        var collectBtn = document.getElementById('roulette-collect');
        if (buyBtn) {
            buyBtn.disabled = !wallet || isCollecting || chipBalance > 0;
        }
        if (spinBtn) {
            spinBtn.disabled = !wallet || getTotalStaked() < 1 || spinInProgress || isCollecting;
        }
        if (collectBtn) {
            collectBtn.disabled = !wallet || chipBalance <= 0 || getTotalStaked() > 0 || isCollecting;
        }
    }

    function setupWalletConnection() {
        var connectBtn = document.getElementById('connect-wallet');
        var disconnectBtn = document.getElementById('disconnect-wallet');
        var walletInfo = document.getElementById('wallet-info');
        var walletAddress = document.getElementById('wallet-address');
        var connectContainer = document.getElementById('connect-wallet');
        var isPhantomInstalled = typeof window.solana !== 'undefined' &&
            (window.solana.isPhantom || typeof window.solana.connect === 'function');
        if (!isPhantomInstalled) {
            if (connectBtn) {
                connectBtn.textContent = 'Install Phantom';
                connectBtn.onclick = function () { window.open('https://phantom.app/', '_blank'); };
            }
            return;
        }
        function showConnected(addr) {
            wallet = addr;
            if (walletAddress) walletAddress.textContent = addr.slice(0, 4) + '...' + addr.slice(-4);
            if (connectContainer) connectContainer.style.display = 'none';
            if (walletInfo) walletInfo.style.display = 'flex';
            if (window.CasinoAuth && window.CasinoAuth.warmPlaySession) {
                CasinoAuth.warmPlaySession(addr);
            }
        }
        function showDisconnected() {
            if (window.CasinoAuth && window.CasinoAuth.clearPlaySession) {
                CasinoAuth.clearPlaySession();
            }
            wallet = null;
            connection = null;
            if (connectContainer) connectContainer.style.display = 'block';
            if (walletInfo) walletInfo.style.display = 'none';
            xmaBalance = 0;
            costPerChip = 0;
            unclaimedRewards = 0;
            chipBalance = 0;
            updateChipUI();
            updateStakedUI();
            updateRouletteButtonStates();
        }
        try {
            if (window.solana && window.solana.isConnected) {
                window.solana.connect({ onlyIfTrusted: true }).then(function (r) {
                    if (r && r.publicKey) {
                        showConnected(r.publicKey.toString());
                        initConnection();
                        updateBalance().then(function () {
                            loadPlayerData().then(function () {
                                updateRouletteButtonStates();
                            });
                        });
                    }
                }).catch(function () {});
            }
        } catch (e) {}
        if (connectBtn) {
            connectBtn.addEventListener('click', function () {
                window.solana.connect({ onlyIfTrusted: false }).then(function (r) {
                    if (r && r.publicKey) {
                        showConnected(r.publicKey.toString());
                        initConnection();
                        updateBalance().then(function () {
                            loadPlayerData().then(function () {
                                updateRouletteButtonStates();
                            });
                        });
                    }
                }).catch(function (err) {
                    if (err && !String(err.message || '').match(/reject|authorized/i)) {
                        alert('Failed to connect wallet: ' + (err.message || err));
                    }
                });
            });
        }
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', function () {
                if (window.solana && window.solana.disconnect) {
                    window.solana.disconnect();
                }
                showDisconnected();
            });
        }

        function initConnection() {
            var rpcUrl = window.CasinoAuth && window.CasinoAuth.getGameRpcUrl
                ? window.CasinoAuth.getGameRpcUrl()
                : 'https://api.mainnet-beta.solana.com';
            if (typeof window.solanaWeb3 !== 'undefined') {
                connection = new window.solanaWeb3.Connection(rpcUrl, 'confirmed');
            } else if (typeof solanaWeb3 !== 'undefined') {
                connection = new solanaWeb3.Connection(rpcUrl, 'confirmed');
            }
        }
    }

    function updateBalance() {
        if (!wallet || !connection || !window.splToken) return Promise.resolve();
        var PublicKey = (window.solanaWeb3 || solanaWeb3).PublicKey;
        var getAssociatedTokenAddress = window.splToken.getAssociatedTokenAddress;
        var getAccount = window.splToken.getAccount;
        var tokenMint = new PublicKey(XMA_TOKEN_MINT);
        var userPublicKey = new PublicKey(wallet);
        return getAssociatedTokenAddress(tokenMint, userPublicKey)
            .then(function (tokenAccount) {
                return getAccount(connection, tokenAccount);
            })
            .then(function (account) {
                xmaBalance = account ? Number(account.amount) / Math.pow(10, TOKEN_DECIMALS) : 0;
            })
            .catch(function () { xmaBalance = 0; });
    }

    function loadPlayerData() {
        if (!wallet) return Promise.resolve();
        return fetch('/api/load-player?walletAddress=' + encodeURIComponent(wallet) + '&gameType=roulette')
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data) return;
                chipBalance = data.chipsBalance || 0;
                costPerChip = data.costPerChip || 0;
                unclaimedRewards = data.unclaimedRewards || 0;
                var costInput = document.getElementById('roulette-cost-per-chip');
                if (costPerChip > 0 && costInput && window.CasinoBuyTiers) {
                    CasinoBuyTiers.selectCost(costInput, costPerChip);
                }
                updateChipUI();
                updateRouletteButtonStates();
            })
            .catch(function (err) { console.error('loadPlayerData:', err); });
    }

    function purchaseSpins() {
        if (!wallet || !connection) {
            alert('Please connect your wallet first');
            return;
        }
        if (chipBalance > 0) {
            alert('Use or collect your chips before buying more.');
            return;
        }
        var costEl = document.getElementById('roulette-cost-per-chip');
        var numEl = document.getElementById('roulette-num-chips');
        var cost = parseFloat(costEl && costEl.value ? costEl.value : 0);
        var num = Math.min(
            parseInt(numEl && numEl.value ? numEl.value : DEFAULT_CHIPS_TO_BUY, 10),
            getMaxChipsForCost(cost)
        );
        if (!cost || cost <= 0 || !num || num <= 0) {
            alert('Please enter valid cost per chip and number of chips');
            return;
        }
        if (window.CasinoBuyTiers && !CasinoBuyTiers.isAllowedCost(cost)) {
            alert('Please choose a valid buy-in tier.');
            return;
        }
        var maxChips = getMaxChipsForCost(cost);
        if (num > maxChips) {
            alert('Maximum ' + maxChips + ' chips at ' + cost.toLocaleString() + ' XMA each (2M XMA purchase limit).');
            return;
        }
        cost = Math.floor(cost);
        var total = cost * num;
        if (total > MAX_PURCHASE_XMA) {
            alert('Maximum purchase is ' + MAX_PURCHASE_XMA.toLocaleString() + ' XMA.');
            return;
        }
        if (xmaBalance < total) {
            alert('Insufficient balance. You need ' + total + ' XMA but only have ' + xmaBalance.toFixed(2) + ' XMA');
            return;
        }
        if (!window.splToken) {
            alert('Token library still loading. Please wait and try again.');
            return;
        }
        var PublicKey = (window.solanaWeb3 || solanaWeb3).PublicKey;
        var Transaction = (window.solanaWeb3 || solanaWeb3).Transaction;
        var SystemProgram = (window.solanaWeb3 || solanaWeb3).SystemProgram;
        var getAssociatedTokenAddress = window.splToken.getAssociatedTokenAddress;
        var createTransferInstruction = window.splToken.createTransferInstruction;
        var tokenMint = new PublicKey(XMA_TOKEN_MINT);
        var userPublicKey = new PublicKey(wallet);
        var treasuryPublicKey = new PublicKey(TREASURY_WALLET);
        connection.getBalance(userPublicKey).then(function (solBal) {
            var minSol = FEE_TREASURY_LAMPORTS + FEE_PARTNER_LAMPORTS + 10000;
            if (solBal < minSol) {
                throw new Error('Insufficient SOL for transaction fee. Need ~' + (minSol / 1e9).toFixed(4) + ' SOL (includes ' + PURCHASE_FEE_SOL + ' SOL fee). You have ' + (solBal / 1e9).toFixed(4) + ' SOL.');
            }
            return Promise.all([
                getAssociatedTokenAddress(tokenMint, userPublicKey),
                getAssociatedTokenAddress(tokenMint, treasuryPublicKey)
            ]);
        }).then(function (accounts) {
            var userTokenAccount = accounts[0];
            var treasuryTokenAccount = accounts[1];
            var transferAmount = BigInt(Math.floor(total * Math.pow(10, TOKEN_DECIMALS)));
            var transferInstruction = createTransferInstruction(
                userTokenAccount, treasuryTokenAccount, userPublicKey, transferAmount
            );
            var tx = new Transaction().add(transferInstruction);
            var partnerPublicKey = new PublicKey(FEE_PARTNER_WALLET);
            tx.add(SystemProgram.transfer({
                fromPubkey: userPublicKey,
                toPubkey: treasuryPublicKey,
                lamports: FEE_TREASURY_LAMPORTS
            }));
            tx.add(SystemProgram.transfer({
                fromPubkey: userPublicKey,
                toPubkey: partnerPublicKey,
                lamports: FEE_PARTNER_LAMPORTS
            }));
            return connection.getLatestBlockhash().then(function (r) {
                tx.recentBlockhash = r.blockhash;
                tx.feePayer = userPublicKey;
                return window.solana.signTransaction(tx);
            });
        }).then(function (signed) {
            return connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
        }).then(function (sig) {
            return connection.confirmTransaction(sig, 'confirmed').then(function () { return sig; });
        }).then(function (sig) {
            return window.CasinoAuth.casinoFetch('/api/record-game-purchase', 'purchase-roulette', wallet, {
                gameType: 'roulette',
                txSignature: sig,
                chipsPurchased: num,
                costPerChip: cost,
            });
        }).then(function (res) {
            if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Save failed'); });
            return res.json();
        }).then(function (data) {
            chipBalance = data.chipsBalance ?? num;
            costPerChip = cost;
            updateChipUI();
            updateRouletteButtonStates();
        }).then(function () {
            updateBalance();
            updateRouletteButtonStates();
            alert('Successfully bought ' + num + ' chips for ' + total + ' XMA' + (PURCHASE_FEE_SOL > 0 ? ' + ' + PURCHASE_FEE_SOL + ' SOL fee' : '') + '.');
        }).catch(function (err) {
            if (String(err.message || '').match(/reject|authorized|cancelled/i)) return;
            alert('Failed to purchase: ' + (err.message || err));
        });
    }

    function withdrawWinnings() {
        if (chipBalance <= 0) {
            alert('No chips to collect');
            return;
        }
        if (!wallet || !connection || !window.CasinoAuth) {
            alert('Please connect your wallet');
            return;
        }
        if (!window.splToken) {
            alert('Token library still loading. Please wait and try again.');
            return;
        }
        var chipValueXMA = chipBalance * costPerChip;
        isCollecting = true;
        updateRouletteButtonStates();
        var payoutId;
        var amountRaw;
        window.CasinoAuth.casinoFetch('/api/collect', 'collect', wallet, { gameType: 'roulette' })
            .then(function (res) {
                if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || d.message || 'Collect failed'); });
                return res.json();
            })
            .then(function (data) {
                payoutId = data.payoutId;
                amountRaw = data.amountRaw;
                var txBytes = Uint8Array.from(atob(data.transaction), function (c) { return c.charCodeAt(0); });
                var Transaction = (window.solanaWeb3 || solanaWeb3).Transaction;
                var tx = Transaction.from(txBytes);
                return connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 })
                    .then(function (sig) {
                        return connection.confirmTransaction(sig, 'confirmed').then(function () { return sig; });
                    })
                    .then(function (sig) {
                        return window.CasinoAuth.signedPost('/api/confirm-collect', 'confirm-collect', wallet, {
                            signature: sig,
                            payoutId: payoutId,
                            amountRaw: amountRaw,
                            gameType: 'roulette',
                        }).then(function (cr) {
                            if (!cr.ok) return cr.json().then(function (d) { throw new Error(d.error || 'Confirm failed'); });
                        });
                    });
            })
            .then(function () {
                chipBalance = 0;
                unclaimedRewards = 0;
                updateChipUI();
                updateStakedUI();
                renderChipStacks();
                updateBalance();
                loadPlayerData();
                updateRouletteButtonStates();
                alert('Successfully collected ' + chipValueXMA.toFixed(2) + ' XMA!');
            })
            .catch(function (err) {
                if (String(err.message || '').match(/reject|authorized|cancelled/i)) return;
                alert('Failed to collect: ' + (err.message || err));
            })
            .finally(function () {
                isCollecting = false;
                updateRouletteButtonStates();
        });
    }

    function init() {
        var afterTiers = function () {
            if (window.CasinoBuyTiers) {
                CasinoBuyTiers.populateCostSelect(
                    document.getElementById('roulette-cost-per-chip'),
                    CasinoBuyTiers.getDefaultXma()
                );
                updateChipPurchaseLimits();
            }
            showThree(0);
            updateChipUI();
            updateStakedUI();
            updateUndoButton();
            updateReplaceButton();
            renderChipStacks();
            updatePopups();
            bindChipPurchaseControls();
            bindChipSelector();
            bindTableClicks();
            bindSpinButton();
            bindUndoButton();
            bindReplaceButton();
            var buyBtn = document.getElementById('roulette-buy-chips');
            var collectBtn = document.getElementById('roulette-collect');
            if (buyBtn) buyBtn.addEventListener('click', purchaseSpins);
            if (collectBtn) collectBtn.addEventListener('click', withdrawWinnings);
            var initWallet = function () {
                setupWalletConnection();
                updateRouletteButtonStates();
            };
            if (window.splToken) {
                initWallet();
            } else {
                window.addEventListener('splTokenLoaded', initWallet);
                setTimeout(initWallet, 2000);
            }
            window.addEventListener('resize', renderChipStacks);
        };
        if (window.CasinoBuyTiers) {
            CasinoBuyTiers.load().then(afterTiers).catch(afterTiers);
        } else {
            afterTiers();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
