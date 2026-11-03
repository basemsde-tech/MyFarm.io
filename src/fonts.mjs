// Reading settings: text size and font. Shared by the start-up script (build.mjs) and the app,
// so the chosen look is there from the first paint, with no flash of the default.

/** Text size steps; the whole interface scales from the root font size. */
export const TEXT_SIZES = { s: 0.9, m: 1, l: 1.12, xl: 1.25, xxl: 1.4 };

const G = 'https://fonts.googleapis.com/css2?';
/** Fonts that read well in both Arabic and English. `css` is loaded only when the font is chosen. */
export const FONTS = {
  readex: { name: 'Readex Pro', css: null },
  almarai: { name: 'Almarai', css: `${G}family=Almarai:wght@300;400;700;800&display=swap` },
  cairo: { name: 'Cairo', css: `${G}family=Cairo:wght@400;500;600;700&display=swap` },
  plex: { name: 'IBM Plex Sans Arabic', css: `${G}family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap` },
  naskh: { name: 'Noto Naskh Arabic', css: `${G}family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap` },
  system: { name: '', css: null },
};

/** A tiny subset of each font, just enough to draw its name in the picker. */
export function previewCss(text) {
  const fams = Object.values(FONTS).filter((f) => f.css).map((f) => f.css.slice(G.length).replace(/&display=swap$/, '')).join('&');
  return `${G}${fams}&text=${encodeURIComponent(text)}&display=swap`;
}

/** Applies size, font and "clearer text" to the page. Safe to call often. */
export function applyReading(doc, p = {}) {
  const el = doc.documentElement;
  const fs = TEXT_SIZES[p.textSize] || 1;
  if (fs === 1) el.style.removeProperty('--fs'); else el.style.setProperty('--fs', String(fs));
  const f = FONTS[p.font] ? p.font : 'readex';
  if (f === 'readex') el.removeAttribute('data-font'); else el.setAttribute('data-font', f);
  if (p.clearText) el.setAttribute('data-clear', ''); else el.removeAttribute('data-clear');
  const css = FONTS[f].css;
  let link = doc.getElementById('mz-font');
  if (css) {
    if (!link) { link = doc.createElement('link'); link.id = 'mz-font'; link.rel = 'stylesheet'; doc.head.appendChild(link); }
    if (link.getAttribute('href') !== css) link.setAttribute('href', css);
  } else if (link) link.remove();
}
