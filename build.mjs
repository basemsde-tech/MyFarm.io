// Builds two outputs:
//   dist/      the installable offline PWA (React 19 bundled, service worker, manifest, icons)
//   preview/   a single self-contained page for previews (React from cdnjs, no service worker)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const VERSION = pkg.version;
const css = readFileSync('src/styles.css', 'utf8');
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;500;600;700&family=Reem+Kufi:wght@500;600;700&display=swap">';
const BOOT = `<script>try{var p=JSON.parse(localStorage.getItem('mazraati-device-v4')||'{}');var l=p.lang||'ar';document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr';if(p.theme&&p.theme!=='system')document.documentElement.setAttribute('data-theme',p.theme);}catch(e){document.documentElement.dir='rtl';}</script>`;

mkdirSync('dist', { recursive: true });
mkdirSync('preview', { recursive: true });

// PWA bundle
const pwa = await build({ entryPoints: ['src/main.jsx'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, jsx: 'transform', define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'none' });
writeFileSync('dist/app.js', pwa.outputFiles[0].text);
// PDF tools, fetched only when a document is saved or shared as PDF.
const pdfLib = await build({ entryPoints: ['src/pdf-entry.js'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none', external: ['canvg', 'dompurify'], logLevel: 'error' });
writeFileSync('dist/pdf.js', pdfLib.outputFiles[0].text);
writeFileSync('dist/index.html', `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>مزرعتي · Mazraati</title>
<meta name="theme-color" content="#1B6B5A">
<meta name="description" content="Farm office for herd, milk and eggs, sales, cash and suppliers.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="favicon.png">
<link rel="icon" sizes="192x192" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
${FONTS}
${BOOT}
<style>${css}</style>
</head>
<body><div id="root"></div><script src="app.js?v=${VERSION}"></script></body>
</html>`);
writeFileSync('dist/manifest.webmanifest', JSON.stringify({
  name: 'مزرعتي · Mazraati', short_name: 'مزرعتي', start_url: './', scope: './', display: 'standalone', orientation: 'portrait',
  dir: 'rtl', lang: 'ar', theme_color: '#1B6B5A', background_color: '#FBFAF5',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
}, null, 2));
writeFileSync('dist/sw.js', `// Cache name moves with the version so an update replaces the shell.
// Own prefix: the old Mazraati 2 lives on the same site and keeps its own caches.
const CACHE = 'mazraati3-v${VERSION}';
const SHELL = ['./', './index.html', './app.js?v=${VERSION}', './manifest.webmanifest', './icon-192.png', './icon-512.png', './favicon.png', './logo.png', './pdf.js'];
// A first install takes over at once; an update waits until the user taps "Update now".
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => { if (!self.registration.active) return self.skipWaiting(); return undefined; })); });
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
// A tapped notification opens (or focuses) the app on the page it is about.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const go = e.notification.data && e.notification.data.go;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list[0];
    if (c) { if (go) c.postMessage({ type: 'mz-nav', go }); return c.focus(); }
    return self.clients.openWindow('./' + (go ? '#' + go.filter(Boolean).join('-') : ''));
  }));
});
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('mazraati3-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match('./index.html'))));
  } else if (/fonts\\.(googleapis|gstatic)\\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }))));
  }
});
`);
for (const f of readdirSync('public')) copyFileSync(`public/${f}`, `dist/${f}`);
writeFileSync('dist/.nojekyll', '');

// Preview page: React 18.3.1 UMD from cdnjs as globals; the app code avoids React 19-only APIs.
const shim = {
  name: 'react-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/client)?$/ }, (a) => ({ path: a.path, namespace: 'g' }));
    b.onLoad({ filter: /.*/, namespace: 'g' }, (a) => ({ contents: a.path.startsWith('react-dom') ? 'module.exports = window.ReactDOM;' : 'module.exports = window.React;', loader: 'js' }));
  },
};
const prev = await build({ entryPoints: ['src/main.jsx'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, jsx: 'transform', plugins: [shim], legalComments: 'none' });
const js = prev.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
writeFileSync('preview/index.html', `<title>Mazraati Farm Office</title>
<meta name="claude:viewport-fit-sides" content="cover">
${FONTS}
${BOOT}
<style>${css}
#root{min-height:100%}
</style>
<div id="root"></div>
<script>window.MAZRAATI_PDF=['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js','https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`);
console.log('dist/app.js', (pwa.outputFiles[0].text.length / 1024).toFixed(0), 'KB · preview', (js.length / 1024).toFixed(0), 'KB');

// GitHub Pages serves the app from docs/ on the main branch.
import { rmSync, cpSync } from 'node:fs';
rmSync('docs', { recursive: true, force: true });
cpSync('dist', 'docs', { recursive: true });
// …and from the repository root too, so the app opens whichever Pages folder is chosen.
for (const f of readdirSync('dist')) cpSync(`dist/${f}`, f, { recursive: true });
