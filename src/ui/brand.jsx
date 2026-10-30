import React, { useRef, useState } from 'react';
import { LOGO } from './logo-data.js';

// The logo shape, used as a mask for the shine that sweeps across it on hover.
if (typeof document !== 'undefined') document.documentElement.style.setProperty('--app-logo', `url(${LOGO})`);
import { useApp } from './store.jsx';
import { Button, Icon, Pill, Seg, Check } from './kit.jsx';
import { updateSettings } from '../core/commands.mjs';
import { fileToDataUrl } from './vault.js';
import { Help } from './help.jsx';

/** Pixels, transparency and type of an uploaded image, and a quality verdict for printing. */
export function analyzeImage(dataUrl, mime, bytes) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 0, h = img.naturalHeight || 0;
      const vector = /svg/.test(mime);
      let alpha = vector;
      if (!vector && w && h) {
        try {
          const s = Math.min(1, 160 / Math.max(w, h));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          for (let i = 3; i < d.length; i += 16) if (d[i] < 250) { alpha = true; break; }
        } catch { /* tainted canvas: leave alpha unknown */ }
      }
      const side = Math.min(w, h);
      const ratio = w && h ? Math.max(w, h) / Math.min(w, h) : 1;
      const level = vector || side >= 600 ? 'great' : side >= 300 ? 'ok' : 'low';
      const tips = [];
      if (!vector && side < 600) tips.push('brand.tip.size');
      if (!alpha && !/png|svg|webp/.test(mime)) tips.push('brand.tip.png');
      else if (!alpha) tips.push('brand.tip.transparent');
      if (ratio > 3) tips.push('brand.tip.wide');
      if (bytes > 2.5 * 1024 * 1024) tips.push('brand.tip.heavy');
      resolve({ w, h, alpha, vector, ratio, level, tips, img });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Keep logos sharp: PNG when there is transparency, up to 1000 px on the long side; SVG stays as it is. */
function prepareLogo(info, dataUrl, mime) {
  if (info.vector) return dataUrl;
  const max = 1000;
  const s = Math.min(1, max / Math.max(info.w, info.h));
  if (s === 1 && /png|webp/.test(mime) && dataUrl.length < 1.6e6) return dataUrl;
  const c = document.createElement('canvas');
  c.width = Math.round(info.w * s); c.height = Math.round(info.h * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(info.img, 0, 0, c.width, c.height);
  return info.alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.93);
}

/** The logo as it appears at the top of every printed document. */
export function DocBrand({ size }) {
  const { farm, t } = useApp();
  const s = farm.settings;
  const b = s.brand || {};
  if (!s.logo || b.onDocs === false) return null;
  return <img src={s.logo} alt={s.farmName || t('brand')} className={`doc-logo shape-${b.shape || 'original'}`} style={size ? { blockSize: size, inlineSize: 'auto', maxInlineSize: size * 2.4 } : undefined} />;
}

/** Brand mark for the app chrome: the farm logo when chosen, otherwise the م mark. */
export function BrandMark({ className = '' }) {
  const { farm } = useApp();
  const s = farm.settings;
  if (s.logo && s.brand?.inApp) return <span className={`brand-mark has-logo ${className}`}><img src={s.logo} alt="" /></span>;
  return <span className={`brand-mark app-logo ${className}`}><img src={LOGO} alt="" /></span>;
}

/** Settings → Farm profile photo / logo. */
export function LogoPanel({ canSet }) {
  const { t, farm, commit, toast, lang } = useApp();
  const s = farm.settings;
  const b = s.brand || {};
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);
  const setBrand = (patch, label) => commit((f) => updateSettings(f, { brand: { ...(f.settings.brand || {}), ...patch } }), label ? { label } : { silent: true, undoable: false });
  const pick = async (file) => {
    if (!file || !canSet) return;
    if (!/^image\//.test(file.type)) { toast(t('brand.notImage'), { tone: 'bad' }); return; }
    if (file.size > 12 * 1024 * 1024) { toast(t('brand.tooBig'), { tone: 'bad' }); return; }
    setBusy(true);
    try {
      const url = await fileToDataUrl(file);
      const a = await analyzeImage(url, file.type, file.size);
      if (!a) { toast(t('brand.notImage'), { tone: 'bad' }); return; }
      const logo = prepareLogo(a, url, file.type);
      setInfo({ ...a, name: file.name, mime: file.type, bytes: file.size });
      commit((f) => updateSettings(f, { logo, brand: { onDocs: true, shape: 'original', ...(f.settings.brand || {}), meta: { w: a.w, h: a.h, alpha: a.alpha, vector: a.vector, level: a.level, name: file.name } } }), { label: t('brand.saved') });
    } finally { setBusy(false); }
  };
  const meta = info || b.meta;
  const level = meta?.level;
  return (
    <section className="panel brand-panel">
      <div className="panel-head"><h2>{t('brand.title')} <Help k="brand" /></h2></div>
      <p className="muted small">{t('brand.hint')}</p>
      <div className="brand-grid">
        <div className={`brand-drop ${drag ? 'drag' : ''} ${s.logo ? 'has' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
          onClick={() => !s.logo && input.current?.click()} role="button" tabIndex={0} aria-label={t('brand.upload')}>
          {s.logo ? <img src={s.logo} alt="" className={`shape-${b.shape || 'original'}`} /> : (
            <div className="brand-empty"><Icon name="image" size={30} /><b>{t('brand.upload')}</b><span className="muted small">{t('brand.dropHint')}</span></div>
          )}
          <input ref={input} type="file" hidden accept="image/png,image/svg+xml,image/webp,image/jpeg" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <div className="brand-side">
          {meta ? (
            <div className={`brand-quality q-${level}`}>
              <div className="bq-head"><Icon name={level === 'low' ? 'alert' : 'check'} size={16} /><b>{t(`brand.q.${level}`)}</b>
                <span className="muted small num">{meta.vector ? 'SVG' : `${meta.w}×${meta.h}px`}{meta.alpha ? ` · ${t('brand.transparent')}` : ''}</span></div>
              {info?.tips?.length > 0 && <ul>{info.tips.map((k) => <li key={k}>{t(k)}</li>)}</ul>}
            </div>
          ) : null}
          <div className="brand-tips">
            <b className="small">{t('brand.bestTitle')}</b>
            <ul className="small muted">
              <li>{t('brand.best1')}</li><li>{t('brand.best2')}</li><li>{t('brand.best3')}</li><li>{t('brand.best4')}</li>
            </ul>
          </div>
          <div className="row-btns">
            <Button size="sm" variant={s.logo ? 'quiet' : 'primary'} icon="upload" disabled={!canSet || busy} onClick={() => input.current?.click()}>{s.logo ? t('brand.replace') : t('brand.upload')}</Button>
            {s.logo && canSet && <Button size="sm" variant="quiet" icon="trash" onClick={() => { setInfo(null); commit((f) => updateSettings(f, { logo: '', brand: { ...(f.settings.brand || {}), meta: null } }), { label: t('brand.removed') }); }}>{t('delete')}</Button>}
          </div>
        </div>
      </div>
      {s.logo && (
        <>
          <div className="grid2">
            <Seg label={t('brand.shape')} value={b.shape || 'original'} onChange={(v) => canSet && setBrand({ shape: v })} options={['original', 'rounded', 'circle'].map((v) => ({ value: v, label: t(`brand.shape.${v}`) }))} />
            <div className="brand-checks">
              <Check label={t('brand.onDocs')} checked={b.onDocs !== false} onChange={(v) => canSet && setBrand({ onDocs: v })} />
              <Check label={t('brand.inApp')} checked={!!b.inApp} onChange={(v) => canSet && setBrand({ inApp: v })} />
            </div>
          </div>
          <div className="brand-preview">
            <span className="muted small">{t('brand.preview')}</span>
            <div className="print-doc mini" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
              <header className="doc-head">
                <div className="doc-farm"><DocBrand /><div><b>{s.farmName || t('brand')}</b><div>{[s.farmPhone, s.farmAddress].filter(Boolean).join(' · ')}</div></div></div>
                <div className="doc-title"><h1>{t('sale.invoice')}</h1><b className="doc-no num">{(s.doc?.prefix || 'INV-')}0001</b></div>
              </header>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
