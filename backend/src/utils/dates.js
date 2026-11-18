const { TZ } = require('./constants');

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// Date du jour (ou d'un instant donné) en Tunisie, au format YYYY-MM-DD
const tunisYmd = (d = new Date()) => fmt.format(d);
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// "2026-10-22" -> instant UTC du début / de la fin de journée en Tunisie (UTC+1, sans heure d'été)
const startOfDayUtc = (ymd) => new Date(ymd + 'T00:00:00+01:00');
const endOfDayUtc = (ymd) => new Date(ymd + 'T23:59:59.999+01:00');

module.exports = { tunisYmd, isYmd, addDays, diffDays, startOfDayUtc, endOfDayUtc };
