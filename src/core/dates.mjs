// One date format everywhere on screen and in messages: weekday, then day/month/year
// ("Monday 2/11/2026", "الاثنين 2/11/2026"). Files (CSV, backups) keep ISO dates.

const WD = new Map();
const weekdayName = (lang, d) => {
  const k = `${lang}${d.getDay()}`;
  let s = WD.get(k);
  if (!s) { s = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { weekday: 'long' }).format(d); WD.set(k, s); }
  return s;
};
// Keeps "2/11/2026" in reading order inside Arabic text.
const iso = (lang, s) => (lang === 'ar' ? `⁦${s}⁩` : s);

/** "Monday 2/11/2026" for a day 'YYYY-MM-DD' (or a Date / ISO timestamp). */
export function fullDate(day, lang = 'en') {
  if (!day) return '—';
  if (typeof day === 'string' && day.startsWith('0000')) return '—';
  const d = day instanceof Date ? day : /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00`) : new Date(day);
  if (Number.isNaN(d.getTime())) return '—';
  return `${weekdayName(lang, d)} ${iso(lang, `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`)}`;
}

/** "Monday 2/11/2026 14:05" for a moment (ISO timestamp or Date). */
export function fullDateTime(at, lang = 'en') {
  if (!at) return '—';
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '—';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${fullDate(d, lang)} ${iso(lang, hm)}`;
}
