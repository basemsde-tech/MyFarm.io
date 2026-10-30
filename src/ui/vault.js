// Device storage for farms, snapshots and attached files.
// IndexedDB gives room for several farms and their documents (hundreds of MB); where it
// is missing or blocked (some previews, private windows) the vault falls back to
// localStorage and keeps working within its ~5 MB.

const DB = 'mazraati';
const STORE = 'kv';
const LS = 'mz:';
let dbp = null;
let mode = null; // 'idb' | 'ls'

function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('no idb');
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
      setTimeout(() => reject(new Error('timeout')), 4000);
    } catch (e) { reject(e); }
  });
  return dbp;
}

async function ready() {
  if (mode) return mode;
  try {
    const db = await openDb();
    // A write probe: some sandboxes open the database but refuse writes.
    await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(1, '__probe'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    mode = 'idb';
  } catch {
    mode = 'ls';
  }
  return mode;
}

function idb(kind, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, kind);
    const st = tx.objectStore(STORE);
    let out;
    const r = fn(st);
    if (r) r.onsuccess = () => { out = r.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('abort'));
  }));
}

export const vault = {
  async mode() { return ready(); },
  async get(key) {
    if ((await ready()) === 'idb') return (await idb('readonly', (s) => s.get(key))) ?? null;
    try { const v = localStorage.getItem(LS + key); return v == null ? null : JSON.parse(v); } catch { return null; }
  },
  async set(key, value) {
    if ((await ready()) === 'idb') return idb('readwrite', (s) => s.put(value, key));
    localStorage.setItem(LS + key, JSON.stringify(value)); // throws QuotaExceededError when full
    return undefined;
  },
  async del(key) {
    if ((await ready()) === 'idb') return idb('readwrite', (s) => s.delete(key));
    try { localStorage.removeItem(LS + key); } catch { /* ignore */ }
    return undefined;
  },
  async keys(prefix = '') {
    if ((await ready()) === 'idb') return ((await idb('readonly', (s) => s.getAllKeys())) || []).filter((k) => typeof k === 'string' && k.startsWith(prefix));
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(LS + prefix)) out.push(k.slice(LS.length)); } } catch { /* ignore */ }
    return out;
  },
  async estimate() {
    try { if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } } catch { /* ignore */ }
    return null;
  },
};

/* Keys */
export const K = {
  farm: (id) => `farm:${id}`,
  snaps: (id) => `snaps:${id}`,
  held: (id) => `held:${id}`,
  file: (id) => `file:${id}`,
  backupDir: (id) => `backupDir:${id}`,
  backupFile: (id) => `backupFile:${id}`,
};

/** Read a File as a data URL. */
export function fileToDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
}

export function dataUrlToBlob(url) {
  const [head, body] = String(url).split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(body || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
