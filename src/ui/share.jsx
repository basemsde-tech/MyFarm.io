import React, { useEffect, useRef, useState } from 'react';
import { useApp } from './store.jsx';
import { Button } from './kit.jsx';
import { waUrl } from '../core/messages.mjs';
import { Help } from './help.jsx';

/* PDF libraries load only when someone asks for a PDF (the installed app ships them as
   pdf.js beside app.js; the preview page fetches them from cdnjs). */
let libs = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error(`load ${src}`)); document.head.appendChild(s); });
}
export function loadPdfLibs() {
  if (window.html2canvas && window.jspdf?.jsPDF) return Promise.resolve();
  if (!libs) {
    const srcs = window.MAZRAATI_PDF || ['pdf.js'];
    libs = srcs.reduce((p, s) => p.then(() => loadScript(s)), Promise.resolve()).catch((e) => { libs = null; throw e; });
  }
  return libs;
}

/** Render a document element to an A4 PDF Blob, page by page. */
export async function elementToPdf(el) {
  await loadPdfLibs();
  const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: Math.max(el.scrollWidth, 760) });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const margin = 10, pw = 210 - margin * 2, ph = 297 - margin * 2;
  const pagePx = Math.floor((ph * canvas.width) / pw);
  let y = 0;
  while (y < canvas.height) {
    const h = Math.min(pagePx, canvas.height - y);
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, h);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (y > 0) pdf.addPage();
    pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, pw, (h * pw) / canvas.width);
    y += h;
  }
  return pdf.output('blob');
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function openWhatsApp(phone, text, countryCode) {
  const url = phone ? waUrl(phone, text, countryCode).replace(/\?text=$/, '') : text ? `https://wa.me/?text=${encodeURIComponent(text)}` : 'https://web.whatsapp.com/';
  // Open without the 'noopener' flag (with it, the browser always answers null and we could not tell
  // a blocked pop-up from an opened one), then cut the link back to this page by hand.
  const w = window.open(url, '_blank');
  if (w) { try { w.opener = null; } catch { /* cross-origin already */ } } else location.href = url;
  return url;
}

/** Can this device hand a file to another app (phones, and Chrome/Edge/Safari on computers)? */
export function canShareFiles() {
  try { return typeof File !== 'undefined' && !!navigator.canShare?.({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] }); } catch { return false; }
}

/**
 * WhatsApp and PDF buttons for a printable document (invoice, receipt, statement, purchase order).
 * WhatsApp sends the document itself as a PDF — never a text summary:
 *  · phones and most computers: the share sheet opens with the PDF; pick WhatsApp and the chat;
 *  · elsewhere: the PDF is saved and the WhatsApp chat opens, ready for the file to be attached.
 * The PDF is made in the background as soon as the document shows, so the tap shares straight away
 * (phones only allow sharing right after a tap).
 */
export function ShareBar({ getEl, fileName, phone, onSent, compact }) {
  const { t, farm, toast, logEvent } = useApp();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false); // a made PDF waiting for one more tap
  const cache = useRef({ sig: null, blob: null, job: null });
  const cc = farm.settings.messaging?.countryCode;
  const direct = useRef(canShareFiles()).current;
  const label = fileName.replace(/\.pdf$/, '');

  const make = () => {
    const el = getEl?.();
    if (!el) return Promise.resolve(null);
    const sig = el.innerHTML;
    const c = cache.current;
    if (c.sig === sig && c.blob) return Promise.resolve(c.blob);
    if (c.sig === sig && c.job) return c.job;
    c.sig = sig; c.blob = null;
    c.job = elementToPdf(el).then((blob) => { if (cache.current.sig === sig) cache.current.blob = blob; return blob; })
      .catch((e) => { if (cache.current.sig === sig) cache.current.sig = null; throw e; });
    return c.job;
  };
  // Make the PDF ahead of time, and again shortly after the document changes (a statement's period, say).
  useEffect(() => {
    let timer = setTimeout(() => make().catch(() => {}), 500);
    const el = getEl?.();
    const mo = el && typeof MutationObserver === 'function' ? new MutationObserver(() => { clearTimeout(timer); setReady(false); timer = setTimeout(() => make().catch(() => {}), 900); }) : null;
    mo?.observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
    return () => { clearTimeout(timer); mo?.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const file = (blob) => new File([blob], fileName, { type: 'application/pdf' });
  const sent = (how) => { logEvent('sent', { label: `${how === 'whatsapp' ? 'WhatsApp' : 'PDF'} · ${label}` }); onSent?.(how); };
  const fail = () => { toast(t('share.pdfFailed'), { tone: 'bad' }); };

  const wa = async () => {
    setBusy(true);
    let blob;
    try { blob = await make(); } catch { setBusy(false); fail(); return; }
    setBusy(false);
    if (!blob) return;
    if (direct) {
      try {
        await navigator.share({ files: [file(blob)], title: label });
        setReady(false); sent('whatsapp');
      } catch (e) {
        if (e?.name === 'AbortError') return;
        // The phone wants a fresh tap (making the file took too long): the next tap shares at once.
        if (e?.name === 'NotAllowedError') { setReady(true); return; }
        saveBlob(blob, fileName); openWhatsApp(phone, '', cc); toast(t('share.attachHint'), { ms: 9000 }); sent('whatsapp');
      }
      return;
    }
    saveBlob(blob, fileName);
    openWhatsApp(phone, '', cc);
    toast(t('share.attachHint'), { ms: 9000 });
    sent('whatsapp');
  };
  const pdf = async () => {
    setBusy(true);
    try { const blob = await make(); if (blob) { saveBlob(blob, fileName); toast(t('share.pdfSaved')); sent('pdf'); } } catch { fail(); window.print(); } finally { setBusy(false); }
  };
  return (
    <div className={`share-bar ${compact ? 'compact' : ''}`}>
      <Button icon="whatsapp" className={`btn-wa ${ready ? 'is-ready' : ''}`} onClick={wa} disabled={busy || !getEl} title={t(direct ? 'share.waTipShare' : 'share.waTipSave')}>
        {busy ? t('share.making') : ready ? t('share.tapToSend') : t('share.whatsapp')}
      </Button>
      {getEl && <Button icon="download" onClick={pdf} disabled={busy}>{t('share.pdf')}</Button>}
      <Help k="share" />
    </div>
  );
}
