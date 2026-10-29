// Money is always integer cents. Never add floating dollars.

const AR = '٠١٢٣٤٥٦٧٨٩';
const FA = '۰۱۲۳۴۵۶۷۸۹';

/** Normalise Arabic/Persian digits and separators to a plain ASCII number string. */
export function normDigits(s) {
  return String(s ?? '')
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[,،\s]/g, '')
    .trim();
}

/** Parse user text to cents without floating point. Returns {ok, cents, empty}. */
export function parseCents(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return { ok: false, cents: 0 };
    return { ok: true, cents: toCents(input), empty: false };
  }
  const t = normDigits(input);
  if (t === '') return { ok: true, cents: 0, empty: true };
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return { ok: false, cents: 0 };
  const neg = m[1] === '-';
  const whole = m[2] === '' ? 0 : Number(m[2]);
  const frac = (m[3] ?? '').padEnd(3, '0');
  let cents = whole * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  return { ok: true, cents: neg ? -cents : cents, empty: false };
}

export function toCents(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(Number((v * 100).toFixed(6)));
}

export function fromCents(c) {
  return Math.round(c) / 100;
}

/** Parse a plain quantity (litres, kg, count). */
export function parseQty(input) {
  const t = normDigits(input);
  if (t === '') return { ok: true, value: 0, empty: true };
  if (!/^\d*\.?\d*$/.test(t) || t === '.') return { ok: false, value: 0 };
  return { ok: true, value: Number(t), empty: false };
}

export function mulCents(qty, priceC) {
  return Math.round(Number((qty * priceC).toFixed(6)));
}

export function sumC(list, pick = (x) => x) {
  let s = 0;
  for (const x of list) s += Math.round(pick(x) || 0);
  return s;
}

const SYMBOL = { USD: '$', EUR: '€', GBP: '£', LBP: 'ل.ل', SYP: 'ل.س', JOD: 'د.أ', SAR: 'ر.س', AED: 'د.إ', EGP: 'ج.م', AUD: 'A$', TRY: '₺', IQD: 'ع.د' };
export const CURRENCIES = Object.keys(SYMBOL);

/**
 * Format cents for display.
 * opts: { currency, view: 'base'|'second', second: { code, rate } }
 * Display conversion only. Storage is always base cents.
 */
export function fmtMoney(cents, opts = {}) {
  const currency = opts.currency || 'USD';
  const sec = opts.second;
  let value = cents / 100;
  let code = currency;
  let digits = 2;
  if (opts.view === 'second' && sec && sec.rate > 0) {
    value = value * sec.rate;
    code = sec.code;
    digits = sec.rate >= 100 ? 0 : 2;
  }
  const neg = value < 0;
  const n = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sym = SYMBOL[code] || code;
  const body = sym.length <= 2 ? `${sym}${n}` : `${n} ${sym}`;
  return neg ? `−${body}` : body;
}

export function fmtQty(v, digits = 1) {
  const r = Number(v) || 0;
  return r.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
