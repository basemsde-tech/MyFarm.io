// Small synthesised sounds: no audio files to download, works offline.
// success: a soft two-note rise · fail: a low double knock · cash: a cash-register "ka-ching".

let ctx = null;
let on = true;
let last = 0;

export function setSoundOn(v) { on = v !== false; }

function engine() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(c, out, { f, t0, dur, type = 'sine', gain = 0.2, attack = 0.005, f2 }) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(out);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(c, out, { t0, dur, freq, q = 1, gain = 0.2 }) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource(); s.buffer = buf;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = c.createGain(); g.gain.value = gain;
  s.connect(bp); bp.connect(g); g.connect(out);
  s.start(t0);
}

function bell(c, out, t0, base, gain) {
  // Inharmonic partials make it ring like metal rather than beep.
  for (const [r, a] of [[1, 1], [1.5, 0.55], [2.76, 0.35], [5.4, 0.18]]) tone(c, out, { f: base * r, t0, dur: 0.9 / Math.sqrt(r), gain: gain * a, attack: 0.002 });
}

const SOUNDS = {
  success(c, out, t) {
    tone(c, out, { f: 1046.5, t0: t, dur: 0.16, type: 'triangle', gain: 0.16 });
    tone(c, out, { f: 1568, t0: t + 0.09, dur: 0.32, type: 'triangle', gain: 0.14 });
  },
  fail(c, out, t) {
    tone(c, out, { f: 220, f2: 180, t0: t, dur: 0.14, type: 'square', gain: 0.05 });
    tone(c, out, { f: 175, f2: 140, t0: t + 0.16, dur: 0.22, type: 'square', gain: 0.05 });
  },
  cash(c, out, t) {
    noise(c, out, { t0: t, dur: 0.035, freq: 3200, q: 2, gain: 0.35 });          // key press
    noise(c, out, { t0: t + 0.03, dur: 0.12, freq: 700, q: 0.7, gain: 0.18 });    // drawer slides out
    bell(c, out, t + 0.07, 2093, 0.07);                                           // "ka-"
    bell(c, out, t + 0.19, 2637, 0.09);                                           // "-ching"
    for (let i = 0; i < 4; i++) noise(c, out, { t0: t + 0.26 + i * 0.045 + Math.random() * 0.02, dur: 0.03, freq: 5000 + Math.random() * 2500, q: 6, gain: 0.12 }); // coins
  },
};

export function play(kind) {
  if (!on || !SOUNDS[kind] || typeof window === 'undefined') return;
  const now = Date.now();
  if (now - last < 120) return; // never stack sounds
  last = now;
  try {
    const c = engine();
    const out = c.createGain(); out.gain.value = 0.9; out.connect(c.destination);
    SOUNDS[kind](c, out, c.currentTime + 0.01);
  } catch { /* sound is optional */ }
}
