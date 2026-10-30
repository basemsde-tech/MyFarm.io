// Hover any USD amount for 2 seconds and the value itself turns over to show the same amount in LBP.
// Works on every money figure in the app without touching each call site: it reads the
// rendered text, draws a flip card exactly over it, and never edits React-managed nodes.

const HOLD_MS = 2000;
const MONEY = /([+−-]?)\$([\d,]+(?:\.\d+)?)/g;
const HAS_MONEY = /\$[\d,]+(?:\.\d+)?/;

function toCents(digits) {
  const [w, f = ''] = digits.replace(/,/g, '').split('.');
  return Number(w) * 100 + Number((f + '00').slice(0, 2));
}

function candidate(start) {
  let el = start;
  for (let i = 0; el && i < 4; i++, el = el.parentElement) {
    if (el.nodeType !== 1 || el.closest('.money-flip, input, textarea, select, svg, .print-doc')) return null;
    const text = el.textContent || '';
    if (text.length <= 56 && HAS_MONEY.test(text) && el.children.length <= 4) return el;
  }
  return null;
}

export function initMoneyFlip(getConfig) {
  if (typeof window === 'undefined' || window.__moneyFlip) return;
  window.__moneyFlip = true;
  let active = null; // { el, card, timer, flipped }

  const convert = (text, cfg) => text.replace(MONEY, (_, sign, digits) => {
    const value = (toCents(digits) / 100) * cfg.rate;
    const n = Math.round(value).toLocaleString('en-US');
    return `${sign}${n} ${cfg.symbol}`;
  });

  const build = (el, cfg) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const cs = getComputedStyle(el);
    const card = document.createElement('div');
    card.className = 'money-flip';
    card.setAttribute('aria-hidden', 'true');
    // Copy the longhands: the 'font' shorthand reads back empty when tabular numbers are on.
    Object.assign(card.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle, lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing, color: cs.color, direction: cs.direction, fontVariantNumeric: 'tabular-nums',
    });
    const rtl = cs.direction === 'rtl';
    const ta = cs.textAlign;
    const align = ta === 'center' || cs.justifyContent === 'center' ? 'center'
      : ta === 'end' ? 'flex-end'
      : ta === 'left' ? (rtl ? 'flex-end' : 'flex-start')
      : ta === 'right' ? (rtl ? 'flex-start' : 'flex-end')
      : 'flex-start';
    const inner = document.createElement('div');
    inner.className = 'money-flip-inner';
    const front = document.createElement('div');
    front.className = 'money-flip-face front';
    front.textContent = el.textContent;
    const back = document.createElement('div');
    back.className = 'money-flip-face back';
    // The amount reads left to right ("1,250,000 LBP") even inside Arabic text.
    const val = document.createElement('bdi');
    const text = convert(el.textContent, cfg);
    val.dir = /[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr';
    val.textContent = text;
    back.append(val);

    front.style.justifyContent = align;
    back.style.justifyContent = align;
    inner.append(front, back);
    card.append(inner);
    document.body.appendChild(card);
    return card;
  };

  const finish = () => {
    if (!active) return;
    const { el, card, timer, flipped } = active;
    clearTimeout(timer);
    active = null;
    if (!card) return;
    if (flipped) {
      card.classList.remove('is-flipped');
      card.classList.add('is-leaving');
      setTimeout(() => { el.style.opacity = ''; card.remove(); }, 520);
    } else {
      card.remove();
    }
  };

  const start = (el) => {
    const cfg = getConfig();
    if (!cfg.enabled) return;
    if (active?.el === el) return;
    finish();
    const card = build(el, cfg);
    if (!card) return;
    const timer = setTimeout(() => {
      if (!active || active.el !== el) return;
      active.flipped = true;
      el.style.opacity = '0';
      card.classList.add('is-flipped');
    }, HOLD_MS);
    active = { el, card, timer, flipped: false };
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
  // Touch: press and hold for 2 seconds; lifting the finger flips back.
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const el = candidate(e.target);
    if (el) start(el);
  }, true);
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, (e) => { if (e.pointerType === 'touch') finish(); }, true);
  window.addEventListener('scroll', finish, true);
  window.addEventListener('resize', finish);
  document.addEventListener('keydown', finish, true);
  window.addEventListener('blur', finish);
}
