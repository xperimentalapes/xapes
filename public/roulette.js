/**
 * XMA Roulette - UI and wheel (game logic later)
 * American wheel order (38 slots: 0, 00, 1-36), clockwise from 0 at top
 */
(function () {
    'use strict';

    const WHEEL_ORDER = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
    const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const SEGMENTS = 38;
    const DEG_PER_SEG = 360 / SEGMENTS;

    function getColor(num) {
        if (num === 0 || num === '00') return 'roulette-seg-green';
        return RED_NUMBERS.indexOf(num) !== -1 ? 'roulette-seg-red' : 'roulette-seg-black';
    }

    function buildWheel() {
        const wheelEl = document.getElementById('roulette-wheel');
        if (!wheelEl) return;

        wheelEl.innerHTML = '';
        WHEEL_ORDER.forEach(function (num, i) {
            const seg = document.createElement('div');
            seg.className = 'roulette-wheel-segment ' + getColor(num);
            seg.dataset.num = String(num);
            var angle = -180 / SEGMENTS + i * DEG_PER_SEG;
            seg.style.transform = 'rotate(' + angle + 'deg)';
            const span = document.createElement('span');
            span.textContent = num;
            seg.appendChild(span);
            wheelEl.appendChild(seg);
        });
    }

    var currentRotation = 0;

    function spinWheel(resultNumber, callback) {
        const wheelEl = document.getElementById('roulette-wheel');
        if (!wheelEl) return;

        const idx = WHEEL_ORDER.indexOf(resultNumber);
        if (idx === -1) return;

        /* Land with segment idx centered at top (pointer). Segment center at -180/SEGMENTS + idx*DEG_PER_SEG. */
        var toTop = (180 / SEGMENTS - idx * DEG_PER_SEG + 360) % 360;
        var fullTurns = 5 + Math.random() * 3;
        var spinDeg = 360 * fullTurns + toTop;
        var totalDeg = currentRotation + spinDeg;
        currentRotation = totalDeg;
        var duration = 4000;

        wheelEl.style.transition = 'transform ' + duration + 'ms cubic-bezier(0.17, 0.67, 0.12, 0.99)';
        wheelEl.style.transform = 'rotate(' + totalDeg + 'deg)';

        if (typeof callback === 'function') {
            setTimeout(callback, duration);
        }
    }

    function updateLastResult(num) {
        const el = document.getElementById('roulette-last-result');
        if (!el) return;
        el.textContent = num;
        var colorClass = (num === 0 || num === '00') ? 'roulette-green' : getColor(num).replace('roulette-seg-', 'roulette-');
        el.className = 'roulette-stat-value roulette-last-number ' + colorClass;
    }

    function bindSpinButton() {
        const btn = document.getElementById('roulette-spin');
        const wheelEl = document.getElementById('roulette-wheel');
        if (!btn || !wheelEl) return;

        btn.addEventListener('click', function () {
            if (btn.disabled) return;
            btn.disabled = true;
            const result = WHEEL_ORDER[Math.floor(Math.random() * SEGMENTS)];
            spinWheel(result, function () {
                updateLastResult(result);
                btn.disabled = false;
            });
        });
    }

    function init() {
        buildWheel();
        bindSpinButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
