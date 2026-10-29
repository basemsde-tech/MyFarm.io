// Backup envelope, restore checks, and a best-effort import of the older Mazraati format.
import { emptyFarm, FARM_VERSION, newId, ensureNumbers } from './commands.mjs';
import { importLegacy } from './legacy.mjs';

export function backupEnvelope(farm, now = new Date()) {
  return { app: 'mazraati', kind: 'farm-backup', version: FARM_VERSION, exportedAt: now.toISOString(), farm };
}

export function readBackup(json, opts = {}) {
  let data = json;
  if (typeof json === 'string') {
    try { data = JSON.parse(json); } catch { return { ok: false, code: 'backup.notJson' }; }
  }
  if (data?.kind === 'farm-backup' && data.farm) { opts = { ...opts, exportedAt: data.exportedAt }; data = data.farm; }
  if (data && Array.isArray(data.records) && data.settings) return { ok: true, farm: normalise(data), legacy: false };
  if (data && Array.isArray(data.entries) && data.settings) return { ok: true, ...importLegacy(data, opts), legacy: true };
  return { ok: false, code: 'backup.unknown' };
}

export function normalise(f) {
  const base = emptyFarm();
  return ensureNumbers({ ...base, ...f, settings: { ...base.settings, ...f.settings, tax: { ...base.settings.tax, ...f.settings?.tax }, doc: { ...base.settings.doc, ...f.settings?.doc } } });
}

