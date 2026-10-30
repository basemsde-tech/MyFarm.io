// Backup envelope, restore checks, and a best-effort import of the older Mazraati format.
import { syncAllAnimalSales } from './animals.mjs';
import { emptyFarm, FARM_VERSION, ensureNumbers, foldBank } from './commands.mjs';
import { importLegacy } from './legacy.mjs';

export function backupEnvelope(farm, now = new Date(), files = null) {
  const env = { app: 'mazraati', kind: 'farm-backup', version: FARM_VERSION, exportedAt: now.toISOString(), farm };
  if (files && Object.keys(files).length) env.files = files;
  return env;
}

export function readBackup(json, opts = {}) {
  let data = json;
  if (typeof json === 'string') {
    try { data = JSON.parse(json); } catch { return { ok: false, code: 'backup.notJson' }; }
  }
  let files = null;
  if (data?.kind === 'farm-backup' && data.farm) { opts = { ...opts, exportedAt: data.exportedAt }; files = data.files || null; data = data.farm; }
  if (data && Array.isArray(data.records) && data.settings) return { ok: true, farm: normalise(data), legacy: false, files };
  if (data && Array.isArray(data.entries) && data.settings) return { ok: true, ...importLegacy(data, opts), legacy: true };
  return { ok: false, code: 'backup.unknown' };
}

export function normalise(f) {
  const base = emptyFarm();
  return syncAllAnimalSales(foldBank(ensureNumbers({ ...base, ...f, settings: { ...base.settings, ...f.settings, tax: { ...base.settings.tax, ...f.settings?.tax }, doc: { ...base.settings.doc, ...f.settings?.doc }, messaging: { ...base.settings.messaging, ...f.settings?.messaging }, security: { ...base.settings.security, ...f.settings?.security }, backup: { ...base.settings.backup, ...f.settings?.backup } } })));
}

