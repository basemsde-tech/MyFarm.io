// Settings → Appearance → Text and reading: text size, font and clearer text, for easier reading.
import React, { useEffect } from 'react';
import { useApp } from './store.jsx';
import { Button, Check, Icon } from './kit.jsx';
import { TEXT_SIZES, FONTS, previewCss } from '../fonts.mjs';

const SAMPLE = 'مزرعتي Aa 123';
const STACK = { readex: "'Readex Pro'", almarai: "'Almarai'", cairo: "'Cairo'", plex: "'IBM Plex Sans Arabic'", naskh: "'Noto Naskh Arabic', 'Noto Sans'", system: "system-ui, -apple-system, 'Segoe UI', Tahoma, 'Geeza Pro'" };

export function ReadingPanel() {
  const { t, prefs, setPrefs, fmt } = useApp();
  const size = TEXT_SIZES[prefs.textSize] ? prefs.textSize : 'm';
  const font = FONTS[prefs.font] ? prefs.font : 'readex';
  const keys = Object.keys(TEXT_SIZES);
  const at = keys.indexOf(size);
  // Each font draws its own name in the picker: load just those few letters, not whole fonts.
  useEffect(() => {
    if (document.getElementById('mz-font-pv')) return;
    const l = document.createElement('link');
    l.id = 'mz-font-pv'; l.rel = 'stylesheet'; l.href = previewCss(SAMPLE);
    document.head.appendChild(l);
  }, []);
  const isDefault = size === 'm' && font === 'readex' && !prefs.clearText;
  return (
    <div className="reading" id="reading">
      <h3><Icon name="sliders" size={16} />{t('rd.title')}</h3>
      <div className="field">
        <span className="seg-label">{t('rd.size')}</span>
        <div className="ts-row reading-foot">
          <div className="ts-pick" role="radiogroup" aria-label={t('rd.size')}>
            {keys.map((k) => (
              <button type="button" key={k} role="radio" aria-checked={size === k} className={`ts-opt ${size === k ? 'on' : ''}`} onClick={() => setPrefs({ textSize: k })}>
                <b style={{ fontSize: `${0.8 + (TEXT_SIZES[k] - 0.9) * 1.6}rem` }}>{t('rd.aa')}</b><small>{t(`rd.s.${k}`)}</small>
              </button>
            ))}
          </div>
          <span className="a-steps">
            <Button size="sm" onClick={() => setPrefs({ textSize: keys[Math.max(0, at - 1)] })} disabled={at === 0} aria-label={t('rd.smaller')} title={t('rd.smaller')}>A−</Button>
            <Button size="sm" onClick={() => setPrefs({ textSize: keys[Math.min(keys.length - 1, at + 1)] })} disabled={at === keys.length - 1} aria-label={t('rd.bigger')} title={t('rd.bigger')}>A+</Button>
          </span>
        </div>
      </div>
      <div className="field">
        <span className="seg-label">{t('rd.font')}</span>
        <div className="font-pick" role="radiogroup" aria-label={t('rd.font')}>
          {Object.keys(FONTS).map((k) => (
            <button type="button" key={k} role="radio" aria-checked={font === k} className={`font-opt ${font === k ? 'on' : ''}`} onClick={() => setPrefs({ font: k })}>
              <span className="fo-sample" style={{ fontFamily: `${STACK[k]}, sans-serif` }}>{SAMPLE}</span>
              <span className="fo-name">{t(`rd.f.${k}`)}</span>
            </button>
          ))}
        </div>
        <div className="field-msg">{t('rd.fontHint')}</div>
      </div>
      <Check label={t('rd.clear')} hint={t('rd.clearHint')} checked={!!prefs.clearText} onChange={(v) => setPrefs({ clearText: v })} />
      <div className="reading-preview" aria-hidden="true">
        <span className="rp-big">{t('rd.sampleTitle')}</span>
        <span>{t('rd.sampleLine', { m: fmt(125000) })}</span>
        <span className="muted small">{t('rd.sampleSub')}</span>
      </div>
      <div className="reading-foot">
        <span className="muted small">{t('rd.device')}</span>
        {!isDefault && <Button size="sm" icon="undo" onClick={() => setPrefs({ textSize: 'm', font: 'readex', clearText: false })}>{t('rd.reset')}</Button>}
      </div>
    </div>
  );
}
