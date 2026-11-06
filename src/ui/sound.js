// Small synthesised sounds: no audio files to download, works offline.
// success: a soft two-note rise · fail: a low double knock · cash: a cash-register "ka-ching".
// Playful moments: moo, calf, cluck, coins, jar, honk, fanfare, chime.

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
  // ── Playful moments (celebrate.jsx) ──
  moo(c, out, t) { voice(c, out, t, { f: [128, 168, 112], dur: 1.05, formant: [420, 950, 520], gain: 0.22 }); },
  calf(c, out, t) {
    voice(c, out, t, { f: [250, 320, 230], dur: 0.6, formant: [700, 1300, 800], gain: 0.16 });
    [784, 988, 1175].forEach((f, i) => tone(c, out, { f, t0: t + 0.62 + i * 0.12, dur: 0.5, type: 'sine', gain: 0.08 }));
  },
  cluck(c, out, t) {
    [0, 0.13, 0.24].forEach((d) => { noise(c, out, { t0: t + d, dur: 0.05, freq: 1400, q: 5, gain: 0.25 }); tone(c, out, { f: 520, f2: 380, t0: t + d, dur: 0.07, type: 'square', gain: 0.035 }); });
    noise(c, out, { t0: t + 0.42, dur: 0.16, freq: 1100, q: 3, gain: 0.2 });
    tone(c, out, { f: 640, f2: 400, t0: t + 0.42, dur: 0.2, type: 'square', gain: 0.04 });
  },
  coins(c, out, t) {
    for (let i = 0; i < 6; i++) bell(c, out, t + i * 0.075 + Math.random() * 0.02, 2800 + Math.random() * 2200, 0.05);
  },
  jar(c, out, t) {
    [0, 0.22].forEach((d) => { noise(c, out, { t0: t + d, dur: 0.03, freq: 6000, q: 8, gain: 0.18 }); bell(c, out, t + d + 0.01, 1760 + d * 400, 0.07); });
    tone(c, out, { f: 1320, t0: t + 0.45, dur: 0.6, type: 'sine', gain: 0.05 });
  },
  honk(c, out, t) {
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; lp.connect(out);
    tone(c, lp, { f: 392, t0: t, dur: 0.16, type: 'square', gain: 0.07 }); tone(c, lp, { f: 494, t0: t, dur: 0.16, type: 'square', gain: 0.05 });
    tone(c, lp, { f: 392, t0: t + 0.22, dur: 0.28, type: 'square', gain: 0.07 }); tone(c, lp, { f: 494, t0: t + 0.22, dur: 0.28, type: 'square', gain: 0.05 });
  },
  fanfare(c, out, t) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, out, { f, t0: t + i * 0.11, dur: 0.24, type: 'triangle', gain: 0.13 }));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(c, out, { f, t0: t + 0.5, dur: 0.75, type: 'triangle', gain: 0.07 }));
  },
  chime(c, out, t) { bell(c, out, t, 1318.5, 0.07); bell(c, out, t + 0.16, 1760, 0.08); },
};

/** A voiced animal call: a buzzy source through a moving vowel filter ("mooo"). */
function voice(c, out, t, { f, dur, formant, gain }) {
  const lp = c.createBiquadFilter(); lp.type = 'bandpass'; lp.Q.value = 3.5;
  lp.frequency.setValueAtTime(formant[0], t);
  lp.frequency.linearRampToValueAtTime(formant[1], t + dur * 0.35);
  lp.frequency.linearRampToValueAtTime(formant[2], t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.09);
  g.gain.setValueAtTime(gain, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(g); g.connect(out);
  const vib = c.createOscillator(); const vg = c.createGain(); vib.frequency.value = 5.5; vg.gain.value = f[0] * 0.025; vib.connect(vg);
  for (const det of [0, 7]) {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
    o.frequency.setValueAtTime(f[0], t);
    o.frequency.linearRampToValueAtTime(f[1], t + dur * 0.3);
    o.frequency.linearRampToValueAtTime(f[2], t + dur);
    vg.connect(o.frequency);
    o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
  }
  vib.start(t); vib.stop(t + dur + 0.05);
}

/** Play after the save chime has finished, so the two never clash. */
export function playLater(kind, ms = 380) { setTimeout(() => play(kind), ms); }

export function play(kind) {
  if (!on || !SOUNDS[kind] || typeof window === 'undefined') return;
  const now = Date.now();
  if (now - last < 120) return; // never stack sounds
  last = now;
  try {
    const c = engine();
    const out = c.createGain(); out.gain.value = 0.9; out.connect(c.destination);
    SOUNDS[kind](c, out, c.currentTime + 0.01);
  } catch (e) { try { window.__mzSoundErr = String(e); } catch { /* ignore */ } /* sound is optional */ }
}
