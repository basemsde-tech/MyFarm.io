import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App.jsx';

createRoot(document.getElementById('root')).render(<App />);

const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
if (!framed && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').then((reg) => {
    window.__mzSw = reg;
    // A new version finished downloading while this one is open: let the app offer "Update now".
    const ready = () => { window.__mzUpdateReady = true; window.dispatchEvent(new Event('mz-update-ready')); };
    if (reg.waiting && navigator.serviceWorker.controller) ready();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ready(); });
    });
    const check = () => reg.update().catch(() => {});
    setInterval(check, 30 * 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch(() => {}));
}
