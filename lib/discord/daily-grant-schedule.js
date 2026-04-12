/**
 * Next calendar midnight in an IANA time zone (e.g. daily accrual cap window in ET).
 * Steps by second from `now` — fine for once-per-request / cron.
 */
function nextMidnightIsoInTimeZone(timeZone) {
  const now = Date.now();
  let t = Math.floor(now / 1000) * 1000 + 1000;
  const end = t + 26 * 3600 * 1000;
  while (t <= end) {
    const d = new Date(t);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const h = parts.find((p) => p.type === 'hour').value;
    const m = parts.find((p) => p.type === 'minute').value;
    const s = parts.find((p) => p.type === 'second').value;
    if (h === '00' && m === '00' && s === '00') {
      return d.toISOString();
    }
    t += 1000;
  }
  return new Date(now + 24 * 3600 * 1000).toISOString();
}

/** Today's calendar date in time zone as YYYY-MM-DD */
function calendarDateInTimeZone(timeZone, dateMs = Date.now()) {
  return new Date(dateMs).toLocaleDateString('en-CA', { timeZone });
}

/** Add signed days to a YYYY-MM-DD string (Gregorian). */
function addCalendarDaysYmd(ymd, deltaDays) {
  const parts = ymd.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Previous calendar date in the given IANA zone (e.g. settle “yesterday” after midnight ET). */
function yesterdayCalendarDateInTimeZone(timeZone) {
  const today = calendarDateInTimeZone(timeZone);
  return addCalendarDaysYmd(today, -1);
}

/** ISO timestamp of the most recent 00:00:00 in `timeZone` at or before now (same stepping approach as next midnight). */
function startOfCurrentDayIsoInTimeZone(timeZone) {
  let t = Math.floor(Date.now() / 1000) * 1000;
  const minT = t - 36 * 3600 * 1000;
  while (t >= minT) {
    const d = new Date(t);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const h = parts.find((p) => p.type === 'hour').value;
    const m = parts.find((p) => p.type === 'minute').value;
    const s = parts.find((p) => p.type === 'second').value;
    if (h === '00' && m === '00' && s === '00') {
      return d.toISOString();
    }
    t -= 1000;
  }
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString();
}

module.exports = {
  nextMidnightIsoInTimeZone,
  calendarDateInTimeZone,
  addCalendarDaysYmd,
  yesterdayCalendarDateInTimeZone,
  startOfCurrentDayIsoInTimeZone,
};
