import React, { useState } from 'react';
import { useApp } from './store.jsx';
import { Button } from './kit.jsx';
import { waUrl } from '../core/messages.mjs';

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
  const url = phone ? waUrl(phone, text, countryCode) : `https://wa.me/?text=${encodeURIComponent(text)}`;
  const w = window.open(url, '_blank', 'noopener');
  if (!w) location.href = url;
  return url;
}

/**
 * WhatsApp and PDF buttons for a printable document.
 * getEl: () => the element to turn into a PDF · text: the WhatsApp message · phone: recipient
 */
export function ShareBar({ getEl, fileName, text, phone, onSent, compact }) {
  const { t, farm, toast, logEvent } = useApp();
  const [busy, setBusy] = useState(false);
  const cc = farm.settings.messaging?.countryCode;
  const wa = () => {
    openWhatsApp(phone, text, cc);
    logEvent('sent', { label: `WhatsApp · ${fileName.replace(/\.pdf$/, '')}` });
    onSent?.('whatsapp');
  };
  const pdf = async () => {
    const el = getEl?.();
    if (!el) return;
    setBusy(true);
    try {
      const blob = await elementToPdf(el);
      const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: 'application/pdf' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: fileName, text }); onSent?.('pdf-share'); logEvent('sent', { label: `PDF · ${fileName}` }); return; } catch (e) { if (e?.name === 'AbortError') return; }
      }
      saveBlob(blob, fileName);
      toast(t('share.pdfSaved'));
      logEvent('sent', { label: `PDF · ${fileName}` });
      onSent?.('pdf');
    } catch {
      toast(t('share.pdfFailed'), { tone: 'bad' });
      window.print();
    } finally { setBusy(false); }
  };
  return (
    <div className={`share-bar ${compact ? 'compact' : ''}`}>
      <Button icon="whatsapp" className="btn-wa" onClick={wa} disabled={!text}>{t('share.whatsapp')}</Button>
      {getEl && <Button icon="file" onClick={pdf} disabled={busy}>{busy ? t('share.making') : t('share.pdf')}</Button>}
      {phone ? null : <span className="muted small">{t('share.noPhone')}</span>}
    </div>
  );
}
