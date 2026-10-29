// Hover any USD amount for 2 seconds and it flips in 3D to show the same amount in LBP.
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
    Object.assign(card.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      font: cs.font, letterSpacing: cs.letterSpacing, color: cs.color, direction: cs.direction,
      fontVariantNumeric: 'tabular-nums',
    });
    const align = cs.textAlign === 'center' ? 'center' : cs.justifyContent === 'center' ? 'center' : (cs.direction === 'rtl' ? (cs.textAlign === 'left' || cs.textAlign === 'end' ? 'flex-start' : 'flex-end') : (cs.textAlign === 'right' || cs.textAlign === 'end' ? 'flex-end' : 'flex-start'));
    const inner = document.createElement('div');
    inner.className = 'money-flip-inner';
    const front = document.createElement('div');
    front.className = 'money-flip-face front';
    front.textContent = el.textContent;
    const back = document.createElement('div');
    back.className = 'money-flip-face back';
    back.textContent = convert(el.textContent, cfg);
    const bar = document.createElement('span');
    bar.className = 'money-flip-bar';
    front.style.justifyContent = align;
    back.style.justifyContent = align;
    inner.append(front, back);
    card.append(inner, bar);
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
    requestAnimationFrame(() => card.classList.add('is-arming'));
    const timer = setTimeout(() => {
      if (!active || active.el !== el) return;
      active.flipped = true;
      el.style.opacity = '0';
      card.classList.remove('is-arming');
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
