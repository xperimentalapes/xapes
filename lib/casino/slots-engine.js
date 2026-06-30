const SYMBOL_COUNTS = [8, 7, 6, 5, 4, 3, 2, 1];
const PAYOUT_MULTIPLIERS = {
  0: 13,
  1: 16,
  2: 21,
  3: 35,
  4: 70,
  5: 165,
  6: 550,
  7: 3300,
};

function createFixedReelOrder() {
  const symbolPool = [];
  for (let symbolIndex = 0; symbolIndex < SYMBOL_COUNTS.length; symbolIndex++) {
    for (let count = 0; count < SYMBOL_COUNTS[symbolIndex]; count++) {
      symbolPool.push(symbolIndex);
    }
  }
  const ordered = [];
  const remaining = [...symbolPool];
  let lastSymbol = -1;
  while (remaining.length > 0) {
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
    if (!found && remaining.length > 0) {
      ordered.push(remaining[0]);
      lastSymbol = remaining[0];
      remaining.splice(0, 1);
    }
  }
  return ordered;
}

const FIXED_REEL_ORDER = createFixedReelOrder();

function randomReelPosition() {
  return Math.floor(Math.random() * FIXED_REEL_ORDER.length);
}

function spinReels() {
  const positions = [randomReelPosition(), randomReelPosition(), randomReelPosition()];
  const symbols = positions.map((pos) => FIXED_REEL_ORDER[pos]);
  return { positions, symbols };
}

function calculateWinAmount(symbols, costPerSpin) {
  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    const mult = PAYOUT_MULTIPLIERS[symbols[0]];
    if (mult) return mult * costPerSpin;
  }
  return 0;
}

module.exports = {
  SYMBOL_COUNTS,
  PAYOUT_MULTIPLIERS,
  FIXED_REEL_ORDER,
  spinReels,
  calculateWinAmount,
};
