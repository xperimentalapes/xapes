/**
 * XMA Roulette – 3 cells; each cell has 2 slots and slides up to next number. Ease-out timing.
 * Chip placement: select chip (10/50/100), click table to place; same square stacks.
 * Testing: award 100 chips per spin.
 */
(function () {
    'use strict';

    var WHEEL_ORDER = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
    var RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    var SEGMENTS = 38;
    var SLIDE_MS = 65;
    var CELL_H = 66;
    var CHIPS_PER_SPIN_TEST = 100;

    var chipBalance = 100;
    var selectedChipValue = 0;
    var bets = {};
    var chipTypes = {};
    var undoHistory = [];
    var lastBets = {};
    var lastChipTypes = {};
    var last10Results = [];
    var spinInProgress = false;
    var userClickedChipYet = false;

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

    function updateChipUI() {
        var el = document.getElementById('roulette-chips');
        if (el) el.textContent = chipBalance;
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
                var chipClass = chipTypes[key] ? 'roulette-chip-stack roulette-chip-' + chipTypes[key] : 'roulette-chip-stack roulette-chip-10';
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
        chipBalance -= amount;
        undoHistory.push({ key: key, amount: amount });
        updatePopups();
        updateChipUI();
        updateStakedUI();
        renderChipStacks();
        updateUndoButton();
        updateReplaceButton();
    }

    function undoLastBet() {
        if (undoHistory.length === 0) return;
        var last = undoHistory.pop();
        var key = last.key;
        var amount = last.amount;
        bets[key] = (bets[key] || 0) - amount;
        if (bets[key] <= 0) { delete bets[key]; delete chipTypes[key]; }
        chipBalance += amount;
        updateChipUI();
        updateStakedUI();
        renderChipStacks();
        updateUndoButton();
        updateReplaceButton();
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
        btn.disabled = Object.keys(lastBets).length === 0 || chipBalance < total;
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
    }

    function replaceChips() {
        var total = 0;
        for (var k in lastBets) if (lastBets.hasOwnProperty(k)) total += lastBets[k];
        if (chipBalance < total || Object.keys(lastBets).length === 0) return;
        for (var key in lastBets) {
            if (lastBets.hasOwnProperty(key)) {
                bets[key] = lastBets[key];
                chipTypes[key] = lastChipTypes[key] || 10;
                chipBalance -= lastBets[key];
            }
        }
        updateChipUI();
        updateStakedUI();
        renderChipStacks();
        updateUndoButton();
        updateReplaceButton();
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
            if (!selectedChipValue || chipBalance < selectedChipValue) return;
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
            btn.disabled = true;
            spinInProgress = true;
            userClickedChipYet = false;
            updatePopups();
            var result = WHEEL_ORDER[Math.floor(Math.random() * SEGMENTS)];
            spinReel(result, function () {
                last10Results.push(result);
                if (last10Results.length > 7) last10Results.shift();
                renderLast10();
                var win = calculateWinnings(result);
                chipBalance += win.totalReturned;
                lastBets = copyBets(bets);
                lastChipTypes = copyBets(chipTypes);
                showWinMessage(win.profit);
                clearTable();
                chipBalance += CHIPS_PER_SPIN_TEST;
                userClickedChipYet = false;
                selectedChipValue = 0;
                var chipBtns = document.querySelectorAll('.roulette-chip');
                chipBtns.forEach(function (b) {
                    b.classList.remove('selected');
                    b.setAttribute('aria-pressed', 'false');
                });
                updateChipUI();
                updateReplaceButton();
                btn.disabled = false;
                spinInProgress = false;
                updatePopups();
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

    function init() {
        showThree(0);
        updateChipUI();
        updateStakedUI();
        updateUndoButton();
        updateReplaceButton();
        renderChipStacks();
        updatePopups();
        bindChipSelector();
        bindTableClicks();
        bindSpinButton();
        bindUndoButton();
        bindReplaceButton();
        window.addEventListener('resize', renderChipStacks);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
