const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const WHEEL_ORDER = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00',
  27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2,
];
const COL1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
const COL2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const COL3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

function getPayoutMultiplier(key, result) {
  const num = result === '00' ? '00' : (result === 0 ? 0 : Number(result));
  if (key === '0' || key === '00' || (key >= '1' && key <= '36')) {
    return String(key) === String(result) ? 35 : 0;
  }
  if (num !== 0 && num !== '00') {
    const n = Number(num);
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
      default: return 0;
    }
  }
  return 0;
}

function calculateWinnings(result, bets) {
  let profit = 0;
  let totalReturned = 0;
  for (const key of Object.keys(bets || {})) {
    const stake = Number(bets[key] || 0);
    if (stake <= 0) continue;
    const mult = getPayoutMultiplier(key, result);
    if (mult > 0) {
      profit += stake * mult;
      totalReturned += stake * (1 + mult);
    }
  }
  return { profit, totalReturned };
}

function spinResult() {
  return WHEEL_ORDER[Math.floor(Math.random() * WHEEL_ORDER.length)];
}

function validateBets(bets, chipBalance) {
  if (!bets || typeof bets !== 'object') throw new Error('bets required');
  let totalStaked = 0;
  for (const key of Object.keys(bets)) {
    const stake = Number(bets[key]);
    if (!Number.isFinite(stake) || stake < 0) throw new Error('Invalid bet amount');
    if (stake > 0) totalStaked += stake;
  }
  if (totalStaked < 1) throw new Error('Place at least 1 chip before spinning');
  if (totalStaked > chipBalance) throw new Error('Insufficient chips for placed bets');
  return totalStaked;
}

module.exports = {
  WHEEL_ORDER,
  spinResult,
  calculateWinnings,
  validateBets,
  getPayoutMultiplier,
};
