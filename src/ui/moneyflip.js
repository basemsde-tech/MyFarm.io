// Hover any USD amount for 1.2 seconds and a small chat-style bubble pops up with the same amount in LBP.
// Works on every money figure in the app without touching each call site: it reads the rendered
// text, places one floating bubble beside it, and never edits React-managed nodes.

const HOLD_MS = 1200;
const MONEY = /([+−-]?)\$([\d,]+(?:\.\d+)?)/g;
const HAS_MONEY = /\$[\d,]+(?:\.\d+)?/;

function toCents(digits) {
  const [w, f = ''] = digits.replace(/,/g, '').split('.');
  return Number(w) * 100 + Number((f + '00').slice(0, 2));
}

function candidate(start) {
  let el = start;
  for (let i = 0; el && i < 4; i++, el = el.parentElement) {
    if (el.nodeType !== 1 || el.closest('.money-bubble, input, textarea, select, svg, .print-doc')) return null;
    const text = el.textContent || '';
    if (text.length <= 56 && HAS_MONEY.test(text) && el.children.length <= 4) return el;
  }
  return null;
}

/** The box around the visible text, not the whole (often full-width) element. */
function textRect(el) {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    if (r.width && r.height) return r;
  } catch { /* fall back below */ }
  return el.getBoundingClientRect();
}

export function initMoneyFlip(getConfig) {
  if (typeof window === 'undefined' || window.__moneyFlip) return;
  window.__moneyFlip = true;
  let active = null; // { el, timer, bubble }

  const amounts = (text, cfg) => {
    const out = [];
    text.replace(MONEY, (_, sign, digits) => {
      const n = Math.round((toCents(digits) / 100) * cfg.rate).toLocaleString('en-US');
      out.push(`${sign}${n}`);
      return _;
    });
    return [...new Set(out)];
  };

  const show = (el, cfg) => {
    const list = amounts(el.textContent || '', cfg);
    if (!list.length) return null;
    const r = textRect(el);
    const b = document.createElement('div');
    b.className = 'money-bubble';
    b.setAttribute('role', 'tooltip');
    b.dir = 'ltr';
    for (const v of list) {
      const row = document.createElement('div');
      row.className = 'mb-row';
      row.dir = 'ltr';
      const num = document.createElement('b');
      num.textContent = v;
      const code = document.createElement('span');
      code.textContent = cfg.symbol;
      row.append(num, code);
      b.append(row);
    }
    document.body.appendChild(b);
    // Above the amount when there is room, otherwise below; kept inside the screen.
    const bw = b.offsetWidth; const bh = b.offsetHeight; const gap = 10;
    const below = r.top - bh - gap < 8;
    const cx = r.left + r.width / 2;
    const left = Math.min(window.innerWidth - bw - 8, Math.max(8, cx - bw / 2));
    const top = below ? r.bottom + gap : r.top - bh - gap;
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
    b.style.setProperty('--tail', `${Math.min(bw - 14, Math.max(14, cx - left))}px`);
    b.classList.add(below ? 'is-below' : 'is-above');
    requestAnimationFrame(() => b.classList.add('is-in'));
    return b;
  };

  const finish = (delay = 0) => {
    if (!active) return;
    const { timer, bubble } = active;
    clearTimeout(timer);
    active = null;
    if (!bubble) return;
    setTimeout(() => {
      bubble.classList.remove('is-in');
      bubble.classList.add('is-out');
      setTimeout(() => bubble.remove(), 200);
    }, delay);
  };

  const start = (el) => {
    const cfg = getConfig();
    if (!cfg.enabled) return;
    if (active?.el === el) return;
    finish();
    const timer = setTimeout(() => {
      if (!active || active.el !== el || !el.isConnected) return;
      active.bubble = show(el, cfg);
    }, HOLD_MS);
    active = { el, timer, bubble: null };
  };

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = candidate(e.target);
    if (el) start(el);
  }, true);
  document.addEventListener('pointerout', (e) => {
    if (!active || e.pointerType === 'touch') return;
    const to = e.relatedTarget;
    if (!to || !active.el.contains(to)) finish();
  }, true);
  // Touch: press and hold; the bubble stays a moment after the finger lifts.
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const el = candidate(e.target);
    if (el) start(el); else finish();
  }, true);
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, (e) => { if (e.pointerType === 'touch') finish(active?.bubble ? 1500 : 0); }, true);
  window.addEventListener('scroll', () => finish(), true);
  window.addEventListener('resize', () => finish());
  document.addEventListener('keydown', () => finish(), true);
  window.addEventListener('blur', () => finish());
}
