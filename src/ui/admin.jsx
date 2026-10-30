import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LOGO } from './logo-data.js';
import { useApp, KEYS, readJSON, MAX_BYTES, inFrame } from './store.jsx';
import { Button, Icon, Pill, Empty, Seg, Select, TextInput, Check, Sheet, FilterPanel, DateInput, dayLabel, Avatar } from './kit.jsx';
import { PageHead, downloadText, usePeriod } from './screens-money.jsx';
import { backupEnvelope } from '../core/backup.mjs';
import { updateSettings } from '../core/commands.mjs';
import { activityLog } from '../core/audit.mjs';
import { toCSV } from '../core/reports.mjs';
import { can } from '../core/catalog.mjs';
import { vault, K } from './vault.js';
import { Help } from './help.jsx';

/* ───────────── Backups ───────────── */
const slug = (s) => (String(s || 'farm').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'farm');
const readBk = (id) => readJSON(KEYS.backups, {})[id] || {};
const writeBk = (id, patch) => { const all = readJSON(KEYS.backups, {}); all[id] = { ...(all[id] || {}), ...patch }; try { localStorage.setItem(KEYS.backups, JSON.stringify(all)); } catch { /* ignore */ } };
const fileHandles = new Map(); // this session's backup file per farm
export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window && !inFrame;

async function backupText(farm, files) {
  return JSON.stringify(backupEnvelope(farm, new Date(), await files.collect(farm)));
}

/** Writes latest + one dated copy per day into the chosen folder, keeping the newest `keep` dated copies. */
async function writeToFolder(dir, farm, text, keep = 14) {
  const base = `mazraati-${slug(farm.settings.farmName)}`;
  const day = new Date().toISOString().slice(0, 10);
  for (const name of [`${base}-latest.json`, `${base}-${day}.json`]) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }
  const dated = [];
  for await (const [name] of dir.entries()) if (name.startsWith(`${base}-2`) && name.endsWith('.json')) dated.push(name);
  dated.sort().reverse();
  for (const name of dated.slice(keep)) { try { await dir.removeEntry(name); } catch { /* keep going */ } }
  return `${base}-latest.json`;
}

/**
 * Automatic backups for this farm on this device.
 * folder: a folder the user picked once (put it inside Google Drive / OneDrive / Dropbox / iCloud
 * Drive and the copies reach the cloud on their own). Elsewhere: a reminder with one-tap share.
 */
export function useAutoBackup() {
  const app = useApp();
  const { farm, farmId, files, demo, logEvent, storageMode } = app;
  const [dir, setDir] = useState(null);
  const [perm, setPerm] = useState('none');
  const [state, setState] = useState(() => readBk(farmId));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setState(readBk(farmId)); }, [farmId]);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!folderSupported() || storageMode !== 'idb') { setDir(null); setPerm('none'); return; }
      const h = await vault.get(K.backupDir(farmId));
      if (!live) return;
      setDir(h || null);
      setPerm(h ? await h.queryPermission({ mode: 'readwrite' }) : 'none');
    })().catch(() => { setDir(null); setPerm('none'); });
    return () => { live = false; };
  }, [farmId, storageMode]);
  const keep = farm.settings.backup?.keep || 14;
  const everyMs = (farm.settings.backup?.everyDays || 1) * 86400000;
  const due = !demo && (farm.records.length > 0 || farm.customers.length > 0) && (!state.lastAt || Date.now() - new Date(state.lastAt).getTime() > everyMs);
  const mark = (patch) => { const n = { ...readBk(farmId), ...patch }; writeBk(farmId, patch); setState(n); };

  const toFolder = async (quiet) => {
    if (!dir || busy) return false;
    setBusy(true);
    try {
      const name = await writeToFolder(dir, farm, await backupText(farm, files), keep);
      mark({ lastAt: new Date().toISOString(), method: 'folder', name, error: null });
      if (!quiet) logEvent('backup', { label: name });
      return true;
    } catch (e) {
      mark({ error: String(e?.message || e) });
      return false;
    } finally { setBusy(false); }
  };
  // While the folder is connected, keep "latest" fresh: at most every 10 minutes after a change.
  const lastWrite = useRef(0);
  useEffect(() => {
    if (perm !== 'granted' || !dir || demo) return undefined;
    const id = setTimeout(() => {
      if (Date.now() - lastWrite.current < 10 * 60000 && !due) return;
      lastWrite.current = Date.now();
      toFolder(!due);
    }, 15000);
    return () => clearTimeout(id);
  }, [farm, perm, dir, demo]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFolder = async () => {
    try {
      const h = await window.showDirectoryPicker({ id: `mazraati-${farmId}`, mode: 'readwrite' });
      await vault.set(K.backupDir(farmId), h);
      setDir(h); setPerm('granted');
      mark({ folder: h.name });
      lastWrite.current = Date.now();
      setTimeout(() => toFolder(false), 50);
      return true;
    } catch { return false; }
  };
  const reconnect = async () => {
    if (!dir) return pickFolder();
    const p = await dir.requestPermission({ mode: 'readwrite' });
    setPerm(p);
    if (p === 'granted') return toFolder(false);
    return false;
  };
  const forget = async () => { await vault.del(K.backupDir(farmId)); setDir(null); setPerm('none'); mark({ folder: null }); };
  /** Share the backup file (phone: to Drive, WhatsApp, e-mail…) or download it. */
  const shareNow = async () => {
    setBusy(true);
    try {
      const text = await backupText(farm, files);
      const name = `mazraati-${slug(farm.settings.farmName)}-${new Date().toISOString().slice(0, 10)}.json`;
      const file = typeof File !== 'undefined' ? new File([text], name, { type: 'application/json' }) : null;
      let method = 'download';
      if (file && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); method = 'share'; } catch (e) { if (e?.name === 'AbortError') return false; downloadText(name, text, 'application/json'); }
      } else downloadText(name, text, 'application/json');
      mark({ lastAt: new Date().toISOString(), method, name, error: null });
      logEvent('backup', { label: name });
      return true;
    } finally { setBusy(false); }
  };
  /**
   * One backup file that is replaced every time (used when logging off).
   * First time: the user picks where it lives; after that the same file is overwritten.
   */
  const fileSupported = typeof window !== 'undefined' && 'showSaveFilePicker' in window && !inFrame && storageMode === 'idb';
  const toFile = async () => {
    setBusy(true);
    try {
      const text = await backupText(farm, files);
      let h = fileHandles.get(farmId) || await vault.get(K.backupFile(farmId)).catch(() => null);
      if (h && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') h = null;
      if (!h) {
        try {
          h = await window.showSaveFilePicker({ id: `mazraati-file-${farmId}`, suggestedName: `mazraati-${slug(farm.settings.farmName)}-backup.json`, types: [{ description: 'Mazraati backup', accept: { 'application/json': ['.json'] } }] });
        } catch (e) { if (e?.name === 'AbortError') return false; throw e; }
        fileHandles.set(farmId, h);
        await vault.set(K.backupFile(farmId), h).catch(() => {}); // remembered for next time where the browser allows it
      }
      const w = await h.createWritable();
      await w.write(text);
      await w.close();
      mark({ lastAt: new Date().toISOString(), method: 'file', name: h.name, file: h.name, error: null });
      logEvent('backup', { label: h.name });
      return h.name;
    } catch (e) {
      mark({ error: String(e?.message || e) });
      return false;
    } finally { setBusy(false); }
  };
  /** The best way to back up right now: the connected folder, the remembered file, or a download/share. */
  const backupNow = async () => {
    if (dir && perm !== 'none') {
      if (perm !== 'granted') { const p = await dir.requestPermission({ mode: 'readwrite' }); setPerm(p); if (p !== 'granted') return false; }
      return (await toFolder(false)) ? readBk(farmId).name : false;
    }
    if (fileSupported) return toFile();
    return (await shareNow()) ? readBk(farmId).name : false;
  };
  return { state, due, dir, perm, busy, pickFolder, reconnect, forget, toFolder, shareNow, toFile, backupNow, fileSupported, supported: folderSupported() && storageMode === 'idb' };
}

const BackupCtx = createContext(null);
/** One backup engine for the whole desk (banner, settings, auto-writes). */
export function BackupProvider({ children }) {
  const bk = useAutoBackup();
  return <BackupCtx.Provider value={bk}>{children}</BackupCtx.Provider>;
}
export const useBackup = () => useContext(BackupCtx);

export function BackupBanner({ bk }) {
  const { t, actor } = useApp();
  if (!bk.due || !can(actor?.role, 'settings')) return null;
  if (bk.dir && bk.perm !== 'granted') {
    return <div className="banner warn"><Icon name="alert" size={16} /><span>{t('bk.reconnectHint')}</span><button type="button" onClick={bk.reconnect}>{t('bk.reconnect')}</button></div>;
  }
  if (bk.dir) return null;
  return <div className="banner warn"><Icon name="download" size={16} /><span>{bk.state.lastAt ? t('bk.dueSince', { d: new Date(bk.state.lastAt).toLocaleDateString() }) : t('bk.never')}</span><button type="button" onClick={bk.shareNow} disabled={bk.busy}>{t('bk.now')}</button></div>;
}

export function BackupPanel({ canSet }) {
  const app = useApp();
  const bk = useBackup();
  const { t, farm, files, ui, replaceFarm, toast, snapshots, storageMode, logEvent, lang, commit } = app;
  const [snaps, setSnaps] = useState([]);
  const [est, setEst] = useState(null);
  useEffect(() => { snapshots().then(setSnaps); vault.estimate().then(setEst); }, [farm.rev]); // eslint-disable-line react-hooks/exhaustive-deps
  // Measuring by converting to text is only needed for the small browser store; the device store reports its own use.
  const size = useMemo(() => (storageMode === 'idb' ? 0 : JSON.stringify(farm).length), [farm, storageMode]);
  const exportBackup = async () => {
    const name = `mazraati-${slug(farm.settings.farmName)}-${new Date().toISOString().slice(0, 10)}.json`;
    downloadText(name, await backupText(farm, files), 'application/json');
    writeBk(app.farmId, { lastAt: new Date().toISOString(), method: 'download', name });
    logEvent('export', { label: name });
  };
  const s = farm.settings.backup || {};
  const setB = (patch) => commit((f) => updateSettings(f, { backup: { ...f.settings.backup, ...patch } }), { silent: true, undoable: false });
  const when = bk.state.lastAt ? new Date(bk.state.lastAt).toLocaleString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const quota = storageMode === 'idb' ? est?.quota : MAX_BYTES;
  const used = storageMode === 'idb' ? est?.used : size;
  return (
    <section className="panel">
      <h2>{t('set.backup')} <Help k="backup" more="backup" /></h2>
      <div className={`bk-status ${bk.due || !bk.state.lastAt ? 'due' : 'ok'}`}>
        <Icon name={bk.due || !bk.state.lastAt ? 'alert' : 'check'} size={18} />
        <div>
          <b>{when ? t('bk.last', { d: when }) : t('bk.never')}</b>
          <span className="muted small">{bk.state.method ? t(`bk.m.${bk.state.method}`) : ''}{bk.state.name ? ` · ${bk.state.name}` : ''}</span>
          {bk.state.error && <span className="out small">{t('bk.error')}: {bk.state.error}</span>}
        </div>
      </div>
      <div className="sub-sec">
        <h3>{t('bk.auto')}</h3>
        {bk.supported ? (
          bk.dir ? (
            <>
              <p className="small"><Icon name="file" size={14} /> {t('bk.folderOn', { f: bk.dir.name })}{bk.perm !== 'granted' && <> · <span className="out">{t('bk.needsOk')}</span></>}</p>
              <div className="row-btns">
                {bk.perm !== 'granted' ? <Button size="sm" variant="primary" onClick={bk.reconnect}>{t('bk.reconnect')}</Button> : <Button size="sm" variant="primary" icon="download" onClick={() => bk.toFolder(false)} disabled={bk.busy}>{t('bk.now')}</Button>}
                <Button size="sm" onClick={bk.pickFolder}>{t('bk.change')}</Button>
                <Button size="sm" variant="quiet" onClick={bk.forget}>{t('bk.stop')}</Button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small">{t('bk.folderHint')}</p>
              <Button size="sm" variant="primary" icon="file" onClick={bk.pickFolder} disabled={!canSet}>{t('bk.pick')}</Button>
            </>
          )
        ) : (
          <>
            <p className="muted small">{t('bk.shareHint')}</p>
            <Button size="sm" variant="primary" icon="upload" onClick={bk.shareNow} disabled={bk.busy}>{t('bk.share')}</Button>
          </>
        )}
        <div className="grid2 tight">
          <Select label={t('bk.every')} value={String(s.everyDays || 1)} onChange={(v) => setB({ everyDays: Number(v) })} options={[1, 3, 7].map((n) => ({ value: String(n), label: t('bk.everyN', { n }) }))} />
          <Select label={t('bk.keep')} value={String(s.keep || 14)} onChange={(v) => setB({ keep: Number(v) })} options={[7, 14, 30, 90].map((n) => ({ value: String(n), label: t('bk.keepN', { n }) }))} />
        </div>
      </div>
      <div className="row-btns">
        <Button icon="download" onClick={exportBackup}>{t('set.export')}</Button>
        <Button icon="upload" onClick={() => ui.open('restore')} disabled={!canSet}>{t('set.import')}</Button>
      </div>
      {snaps.length > 0 && (
        <div className="sub-sec">
          <h3>{t('set.autoSnap')}</h3>
          {snaps.map((x) => <div className="row-btns" key={x.at}><span className="num">{x.day} · {(x.size / 1024).toFixed(0)} KB</span>{canSet && <Button size="sm" onClick={async () => { await exportBackup(); replaceFarm(x.farm); toast(t('set.importOk')); }}>{t('set.snapRestore')}</Button>}</div>)}
        </div>
      )}
      <div className="sub-sec">
        <h3>{t('set.storage')}</h3>
        {quota ? <div className="meter"><span style={{ inlineSize: `${Math.min(100, ((used || 0) / quota) * 100)}%` }} className={(used || 0) > quota * 0.8 ? 'hot' : ''} /></div> : null}
        <div className="muted small num">{t('set.storageUsed', { u: `${((used || size) / 1024 / 1024).toFixed(2)} MB`, t: quota ? `${(quota / 1024 / 1024).toFixed(quota > 1e9 ? 0 : 1)} MB` : '—' })} · {t(`bk.store.${storageMode}`)}</div>
      </div>
    </section>
  );
}

/* ───────────── Login protection ───────────── */
export function SecurityPanel({ canSet }) {
  const { t, farm, commit } = useApp();
  const sec = farm.settings.security || {};
  const set = (patch) => commit((f) => updateSettings(f, { security: { ...f.settings.security, ...patch } }), { label: t('saved'), undoable: false });
  const noCode = farm.profiles.filter((p) => !p.passHash);
  return (
    <section className="panel">
      <h2>{t('sec.title')} <Help k="security" more="security" /></h2>
      <div className="grid2">
        <Select label={t('sec.autoLock')} value={String(sec.autoLockMin || 0)} onChange={(v) => set({ autoLockMin: Number(v) })} disabled={!canSet}
          options={[0, 5, 15, 30, 60].map((n) => ({ value: String(n), label: n ? t('sec.afterMin', { n }) : t('sec.never') }))} />
        <Select label={t('sec.attempts')} value={String(sec.maxAttempts || 5)} onChange={(v) => set({ maxAttempts: Number(v) })} disabled={!canSet}
          options={[3, 5, 10].map((n) => ({ value: String(n), label: t('sec.attemptsN', { n }) }))} />
      </div>
      <Check label={t('sec.requirePins')} checked={!!sec.requirePins} onChange={(v) => canSet && set({ requirePins: v })} />
      <p className="muted small">{t('sec.requireHint')}</p>
      {sec.requirePins && noCode.length > 0 && <div className="note warn"><Icon name="lock" size={16} />{t('sec.missing', { n: noCode.map((p) => p.name).join('، ') })}</div>}
    </section>
  );
}

/** Failed-code counter per profile on this device: { [profileId]: { n, until } } */
export function attemptState(id) { return readJSON(KEYS.attempts, {})[id] || { n: 0, until: 0 }; }
export function recordAttempt(id, ok, max = 5) {
  const all = readJSON(KEYS.attempts, {});
  if (ok) delete all[id];
  else {
    const cur = all[id] || { n: 0, until: 0 };
    const n = cur.n + 1;
    // After max tries: 30 s, then doubling, up to 30 min.
    const over = n - max;
    all[id] = { n, until: over >= 0 ? Date.now() + Math.min(30 * 60000, 30000 * 2 ** over) : 0 };
  }
  try { localStorage.setItem(KEYS.attempts, JSON.stringify(all)); } catch { /* ignore */ }
  return all[id] || { n: 0, until: 0 };
}

/* ───────────── Farms on this device ───────────── */
export function FarmsPanel() {
  const { t, farms, farmId, switchFarm, addFarm, ui, actor } = useApp();
  return (
    <section className="panel">
      <div className="panel-head"><h2>{t('farms.title')} <Help k="farms" more="farms" /></h2>{can(actor?.role, 'settings') && <Button size="sm" icon="plus" onClick={addFarm}>{t('farms.add')}</Button>}</div>
      <p className="muted small">{t('farms.hint')}</p>
      <ul className="farm-list">
        {farms.map((f) => (
          <li key={f.id} className={f.id === farmId ? 'on' : ''}>
            <span className="brand-mark app-logo sm"><img src={LOGO} alt="" /></span>
            <span className="fl-text"><b>{f.name || t('farms.unnamed')}</b><small className="muted">{f.id === farmId ? t('farms.current') : t('farms.since', { d: f.createdAt ? new Date(f.createdAt).toLocaleDateString() : '—' })}{f.demo ? ` · ${t('farms.demo')}` : ''}</small></span>
            {f.id !== farmId && <Button size="sm" onClick={() => switchFarm(f.id)}>{t('farms.open')}</Button>}
            {farms.length > 1 && actor?.role === 'owner' && <Button size="sm" variant="quiet" icon="trash" aria-label={t('farms.remove')} onClick={() => ui.open('removeFarm', { id: f.id, name: f.name })} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RemoveFarmDialog({ id, name, onClose }) {
  const { t, removeFarm, toast } = useApp();
  const [txt, setTxt] = useState('');
  const label = name || t('farms.unnamed');
  return (
    <Sheet title={t('farms.removeTitle', { n: label })} sub={t('farms.removeHint')} onClose={onClose}
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="danger" disabled={txt.trim() !== label} onClick={async () => { if (await removeFarm(id)) { toast(t('deleted')); onClose(); } }}>{t('farms.remove')}</Button></div>}>
      <TextInput label={t('farms.typeName', { n: label })} value={txt} onChange={setTxt} autoFocus />
    </Sheet>
  );
}

/** Farm switcher shown in the account menu when the device holds more than one farm. */
export function FarmSwitch({ onPick }) {
  const { t, farms, farmId, switchFarm, addFarm, actor } = useApp();
  return (
    <div className="farm-switch">
      <div className="fs-label">{t('farms.title')}</div>
      {farms.map((f) => (
        <button type="button" role="menuitem" key={f.id} className={f.id === farmId ? 'on' : ''} onClick={() => { onPick?.(); if (f.id !== farmId) switchFarm(f.id); }}>
          <span className="brand-mark app-logo xs"><img src={LOGO} alt="" /></span><span>{f.name || t('farms.unnamed')}</span>{f.id === farmId && <Icon name="check" size={15} />}
        </button>
      ))}
      {can(actor?.role, 'settings') && <button type="button" role="menuitem" onClick={() => { onPick?.(); addFarm(); }}><Icon name="plus" size={16} />{t('farms.add')}</button>}
    </div>
  );
}

/* ───────────── Messages ───────────── */
export function MessagingPanel({ canSet }) {
  const { t, farm, commit } = useApp();
  const m = farm.settings.messaging || {};
  const set = (patch) => commit((f) => updateSettings(f, { messaging: { ...f.settings.messaging, ...patch } }), { silent: true, undoable: false });
  return (
    <fieldset className="panel" disabled={!canSet}>
      <h2>{t('msg.settings')}</h2>
      <div className="grid3">
        <TextInput label={t('msg.cc')} value={m.countryCode || ''} onChange={(v) => set({ countryCode: v.replace(/\D/g, '') })} inputMode="numeric" hint={t('msg.ccHint')} />
        <Select label={t('msg.remindEvery')} value={String(m.remindAfterDays || 7)} onChange={(v) => set({ remindAfterDays: Number(v) })} options={[3, 7, 14, 30].map((n) => ({ value: String(n), label: t('msg.everyN', { n }) }))} />
        <TextInput label={t('msg.signature')} value={m.signature || ''} onChange={(v) => set({ signature: v })} hint={t('msg.signatureHint')} />
      </div>
    </fieldset>
  );
}

/* ───────────── Activity log ───────────── */
const KIND_ICON = { created: 'plus', edited: 'edit', deleted: 'trash', restored: 'undo', voided: 'alert', unvoided: 'undo', change: 'sliders', signin: 'user', signout: 'user', failed: 'lock', lockout: 'lock', autolock: 'lock', backup: 'download', export: 'download', restore: 'upload', switchFarm: 'swap', undo: 'undo', reminder: 'cash', sent: 'upload', pinSet: 'lock' };
const SEC = new Set(['signin', 'signout', 'failed', 'lockout', 'autolock', 'pinSet']);

export function ActivityScreen() {
  const { farm, t, lang, ui, actor } = useApp();
  const per = usePeriod('30');
  const [who, setWho] = useState('');
  const [kind, setKind] = useState('all');
  const [limit, setLimit] = useState(100);
  const all = useMemo(() => activityLog(farm), [farm]);
  if (!can(actor?.role, 'settings')) return <div className="screen"><Empty title={t('e.forbidden')} icon="lock" /></div>;
  const group = (e) => (SEC.has(e.kind) ? 'security' : ['backup', 'export', 'restore', 'switchFarm'].includes(e.kind) ? 'data' : e.kind === 'change' || e.kind === 'undo' ? 'lists' : 'records');
  const rows = all.filter((e) => {
    const d = e.at.slice(0, 10);
    return d >= per.range.from && d <= per.range.to && (!who || e.by === who) && (kind === 'all' || group(e) === kind);
  });
  const people = [...new Set(all.map((e) => e.by).filter((x) => x && x !== '—'))];
  const what = (e) => {
    if (e.type) return `${t(`act.${e.kind}`)} · ${t(`t.${e.type}`)}`;
    if (e.kind === 'change') return `${e.label || t('act.change')}`;
    return t(`act.${e.kind}`);
  };
  const detail = (e) => [
    e.reason && `${t('reason')}: ${e.reason}`,
    e.fields?.length && e.kind === 'edited' ? e.fields.map((f) => t(`fld.${f}`) !== `fld.${f}` ? t(`fld.${f}`) : f).join('، ') : null,
    e.lists?.length ? e.lists.map((l) => t(`act.list.${l}`)).join('، ') : null,
    e.label && e.kind !== 'change' ? e.label : null,
    e.day && e.type ? dayLabel(e.day, lang, { day: 'numeric', month: 'short', year: 'numeric' }) : null,
  ].filter(Boolean).join(' · ');
  const stamp = (at) => new Date(at).toLocaleString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const exportCSV = () => downloadText(`activity-${per.range.from}.csv`, toCSV([[t('date'), t('act.who'), t('act.what'), t('details')], ...rows.map((e) => [e.at.replace('T', ' ').slice(0, 16), e.by, what(e), detail(e)])]));
  const fails = rows.filter((e) => e.kind === 'failed' || e.kind === 'lockout').length;
  return (
    <div className="screen">
      <PageHead title={t('nav.activity')} sub={t('act.sub')} actions={<Button icon="download" onClick={exportCSV}>{t('rep.csv')}</Button>} />
      {fails > 0 && <div className="note warn"><Icon name="lock" size={16} />{t('act.fails', { n: fails })}</div>}
      <section className="panel">
        <FilterPanel id="activity" onReset={() => { per.reset(); setWho(''); setKind('all'); }}
          chips={[{ label: per.label, active: !per.isDefault }, who && { label: who, active: true }, kind !== 'all' && { label: t(`act.g.${kind}`), active: true }]}>
          <div className="period-bar"><Seg small wrap value={per.p} onChange={per.onChange} options={['today', 'week', '30', 'year', 'all', 'custom'].map((p) => ({ value: p, label: t(`p.${p}`) }))} />
            {per.p === 'custom' && <div className="grid2 tight"><DateInput label={t('from')} value={per.range.from} onChange={(v) => per.setRange({ ...per.range, from: v })} /><DateInput label={t('to')} value={per.range.to} onChange={(v) => per.setRange({ ...per.range, to: v })} /></div>}
          </div>
          <div className="filter-row">
            <Select className="compact" label={t('act.who')} value={who} onChange={setWho} options={people.map((p) => ({ value: p, label: p }))} placeholder={t('all')} />
            <Seg small label={t('flt.kind')} value={kind} onChange={setKind} options={['all', 'records', 'lists', 'security', 'data'].map((k) => ({ value: k, label: k === 'all' ? t('all') : t(`act.g.${k}`) }))} />
          </div>
        </FilterPanel>
        {rows.length ? (
          <ol className="act-list">
            {rows.slice(0, limit).map((e, i) => {
              const prof = farm.profiles.find((p) => p.id === e.byId);
              return (
                <li key={`${e.at}-${i}`} className={`act act-${group(e)} ${['failed', 'lockout'].includes(e.kind) ? 'bad' : ''}`}>
                  <span className="act-ico"><Icon name={KIND_ICON[e.kind] || 'file'} size={15} /></span>
                  <span className="act-body">
                    <b>{what(e)}</b>
                    {detail(e) && <span className="muted small">{detail(e)}</span>}
                  </span>
                  <span className="act-who">{prof ? <Avatar p={prof} size={22} /> : null}<span className="small">{e.by}</span></span>
                  <span className="act-at num small muted">{stamp(e.at)}</span>
                  {e.recordId && <button type="button" className="link small" onClick={() => ui.open('drawer', { id: e.recordId })}>{t('open')}</button>}
                </li>
              );
            })}
          </ol>
        ) : <Empty title={t('act.none')} icon="history" />}
        {rows.length > limit && <Button className="more-btn" onClick={() => setLimit(limit + 100)}>{t('more')} ({rows.length - limit})</Button>}
      </section>
    </div>
  );
}


/* ───────────── Log off ───────────── */
/** Asks for a backup (replacing the backup file), then logs off to the profile screen. */
export function LogOffDialog({ onClose }) {
  const { t, actor, demo, logEvent, setPrefs, toast, setToasts, lang } = useApp();
  const bk = useBackup();
  const [err, setErr] = useState('');
  const where = bk.dir && bk.perm !== 'none' ? t('lo.toFolder', { f: bk.dir.name }) : bk.fileSupported ? (bk.state.file ? t('lo.toFile', { f: bk.state.file }) : t('lo.pickFile')) : t('lo.download');
  const last = bk.state.lastAt ? new Date(bk.state.lastAt).toLocaleString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const out = (msg) => { onClose(); logEvent('signout'); setPrefs({ profileId: null }); setToasts([]); toast(msg || t('pf.loggedOff'), { sound: 'success' }); };
  const backupAndOut = async () => {
    setErr('');
    const name = await bk.backupNow();
    if (name) out(t('lo.doneBoth', { f: `\u2068${name}\u2069` }));
    else setErr(t('lo.failed'));
  };
  return (
    <Sheet title={t('pf.logOff')} onClose={onClose}>
      <div className="logoff">
        <div className="lo-who"><Avatar p={actor} size={52} /><div><b>{actor?.name}</b><small className="muted">{t(`role.${actor?.role}`)}</small></div></div>
        {demo ? <p className="muted">{t('lo.demo')}</p> : (
          <div className="lo-backup">
            <div className="lo-ico"><Icon name="download" size={22} /></div>
            <div>
              <b>{t('lo.ask')}</b>
              <p className="muted small">{where}</p>
              <p className="muted small">{last ? t('lo.last', { d: last }) : t('bk.never')}</p>
            </div>
          </div>
        )}
        {err && <div className="note bad">{err}</div>}
        <div className="lo-actions">
          {!demo && <Button variant="primary" icon="download" onClick={backupAndOut} disabled={bk.busy}>{bk.busy ? t('lo.saving') : t('lo.both')}</Button>}
          <Button icon="logout" onClick={() => out()} disabled={bk.busy}>{demo ? t('pf.logOff') : t('lo.skip')}</Button>
          <Button onClick={onClose} disabled={bk.busy}>{t('cancel')}</Button>
        </div>
      </div>
    </Sheet>
  );
}
