import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App.jsx';

createRoot(document.getElementById('root')).render(<App />);

const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
if (!framed && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
