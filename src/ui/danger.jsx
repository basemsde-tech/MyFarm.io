// Settings → Danger zone: everything that removes data, in one clearly marked place.
// Every action shows exactly what it removes, offers a backup first, saves a restore point on this
// device, and asks for a typed confirmation.
import React, { useMemo, useState } from 'react';
import { useApp } from './store.jsx';
import { Button, Icon, Seg, DateInput, Check, Sheet, TextInput } from './kit.jsx';
import { useBackup } from './admin.jsx';
import { ImpactList } from './tx.jsx';
import { preview, updateSettings, emptyFarm } from '../core/commands.mjs';
import { compute } from '../core/ledger.mjs';
import { entriesInRange, rangeSummary, moveRangeToTrash, closeBefore, emptyTrash, startFresh, yearsAgo, TRASH_CHOICES, trashDaysOf } from '../core/danger.mjs';

export function DangerZone({ locked }) {
  const { farm, t, ui, commit, rawFarm } = useApp();
  const [open, setOpen] = useState(false);
  const keep = trashDaysOf(farm);
  const trashed = rawFarm.records.filter((r) => r.deletedAt && r.deleteReason !== 'replaced').length;
  const setKeep = (v) => commit((f) => updateSettings(f, { trashDays: Number(v) }), { label: t('dz.keepSaved', { n: v }) });
  const oldest = farm.records.reduce((m, r) => (!r.deletedAt && (!m || r.day < m) ? r.day : m), '');
  return (
    <section className={`panel danger-zone ${open ? 'open' : ''}`} id="danger">
      <button type="button" className="dz-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="dz-ico"><Icon name="alert" size={18} /></span>
        <span className="dz-title"><b>{t('dz.title')}</b><small className="muted">{t('dz.sub')}</small></span>
        <Icon name="down" size={16} className="dz-chev" />
      </button>
      <div className="dz-body"><div>
        {locked ? <p className="dz-locked"><Icon name="lock" size={16} /> {t(locked === 'demo' ? 'dz.demoLocked' : 'dz.ownerOnly')}</p> : <>
        <div className="dz-row">
          <div><b>{t('dz.keep')}</b><small className="muted">{t('dz.keepHint')}</small></div>
          <Seg small wrap value={String(keep)} onChange={setKeep} options={TRASH_CHOICES.map((n) => ({ value: String(n), label: n === 365 ? t('dz.year1') : t('fold.nDays', { n }) }))} />
        </div>
        <div className="dz-row">
          <div><b>{t('dz.empty')}</b><small className="muted">{trashed ? t('dz.emptyHint', { n: trashed }) : t('trash.none')}</small></div>
          <Button variant="danger" disabled={!trashed} onClick={() => ui.open('dangerConfirm', { kind: 'empty', count: trashed })}>{t('dz.emptyBtn')}</Button>
        </div>
        <div className="dz-row">
          <div><b>{t('dz.range')}</b><small className="muted">{t('dz.rangeHint')}{oldest ? ` ${t('dz.oldest', { d: oldest })}` : ''}</small></div>
          <Button variant="danger" onClick={() => ui.open('dangerRange')}>{t('dz.rangeBtn')}</Button>
        </div>
        <div className="dz-row">
          <div><b>{t('dz.fresh')}</b><small className="muted">{t('dz.freshHint')}</small></div>
          <Button variant="danger" onClick={() => ui.open('dangerConfirm', { kind: 'fresh', count: farm.records.length })}>{t('dz.freshBtn')}</Button>
        </div>
        <div className="dz-row">
          <div><b>{t('dz.copies')}</b><small className="muted">{t('dz.copiesHint')}</small></div>
          <Button variant="danger" onClick={() => ui.open('dangerConfirm', { kind: 'copies' })}>{t('dz.copiesBtn')}</Button>
        </div>
        <div className="dz-row last">
          <div><b>{t('set.reset')}</b><small className="muted">{t('dz.allHint')}</small></div>
          <Button variant="danger" onClick={() => ui.open('dangerConfirm', { kind: 'all', count: farm.records.length })}>{t('dz.allBtn')}</Button>
        </div>
        </>}
      </div></div>
    </section>
  );
}

/** Backup first + restore point + typed word; then run. */
function useSafety() {
  const { saveRestorePoint, toast, t } = useApp();
  const bk = useBackup();
  const [backup, setBackup] = useState(true);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const target = t('dz.word');
  const ok = word.trim() === target;
  const run = async (label, fn) => {
    setBusy(true);
    try {
      if (backup) { const name = await bk.backupNow(); if (!name) { toast(t('dz.backupFailed'), { tone: 'bad' }); return false; } }
      await saveRestorePoint(label);
      await fn();
      return true;
    } finally { setBusy(false); }
  };
  const ui = (
    <div className="dz-safety">
      <Check label={t('dz.backupFirst')} hint={t('dz.backupFirstHint')} checked={backup} onChange={setBackup} />
      <p className="muted small"><Icon name="history" size={14} /> {t('dz.restorePoint')}</p>
      <TextInput label={t('dz.typeWord', { w: target })} value={word} onChange={setWord} autoComplete="off" />
    </div>
  );
  return { ok, busy, run, ui };
}

export function DangerConfirm({ kind, count, onClose }) {
  const { t, commit, actor, replaceFarm, setPrefs, clearDeviceCopies, toast, logEvent } = useApp();
  const s = useSafety();
  const text = { empty: ['dz.empty', 'dz.emptyWhat'], fresh: ['dz.fresh', 'dz.freshWhat'], copies: ['dz.copies', 'dz.copiesWhat'], all: ['set.reset', 'dz.allWhat'] }[kind];
  const go = async () => {
    const done = await s.run(t(text[0]), async () => {
      if (kind === 'empty') commit((f) => emptyTrash(f, actor), { label: t('dz.emptied', { n: count }) });
      if (kind === 'fresh') commit((f) => startFresh(f, actor), { label: t('dz.freshDone') });
      if (kind === 'copies') { await clearDeviceCopies(); toast(t('dz.copiesDone')); }
      if (kind === 'all') { await clearDeviceCopies(); replaceFarm(emptyFarm()); setPrefs({ profileId: null }); }
      logEvent('change', { label: t(text[0]) });
    });
    if (done) onClose();
  };
  return (
    <Sheet title={t(text[0])} onClose={onClose}
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="danger" icon="trash" disabled={!s.ok || s.busy} onClick={go}>{s.busy ? t('lo.saving') : t(text[0])}</Button></div>}>
      <div className="dz-warn"><Icon name="alert" size={18} /><span>{t(text[1], { n: count })}</span></div>
      {s.ui}
    </Sheet>
  );
}

/** Delete by date range: move to Recently deleted, or close old years for good with balances carried forward. */
export function DangerRange({ onClose }) {
  const { farm, t, today, commit, actor, names, lang } = useApp();
  const s = useSafety();
  const [preset, setPreset] = useState('1');
  const [mode, setMode] = useState('close');
  const [from, setFrom] = useState(yearsAgo(today, 2));
  const [to, setTo] = useState(yearsAgo(today, 1));
  const [groups, setGroups] = useState({ money: true, production: true, herd: false });
  const custom = preset === 'custom';
  const cutoff = custom ? null : yearsAgo(today, Number(preset));
  const realMode = custom ? 'trash' : mode;
  const range = custom ? { from, to } : { from: '0000-00-00', to: cutoffMinus(cutoff) };
  const gl = Object.keys(groups).filter((k) => groups[k]);
  const list = useMemo(() => entriesInRange(farm, { ...range, groups: gl }), [farm, range.from, range.to, gl.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = rangeSummary(list);
  const op = useMemo(() => (realMode === 'close'
    ? (f) => closeBefore(f, cutoff, actor, { groups: gl })
    : (f) => moveRangeToTrash(f, { ...range, groups: gl }, actor, t('dz.range'))), [realMode, cutoff, range.from, range.to, gl.join(), actor]); // eslint-disable-line react-hooks/exhaustive-deps
  const pv = useMemo(() => (sum.total ? preview(farm, op, { names, today }) : null), [farm, op, sum.total]); // eslint-disable-line react-hooks/exhaustive-deps
  // Closing must keep the books whole: every balance must come out the same.
  const kept = useMemo(() => {
    if (realMode !== 'close' || !pv?.next) return null;
    const a = compute(farm), b = compute(pv.next);
    return a.cashC === b.cashC && a.receivableC === b.receivableC && a.supplierDueC === b.supplierDueC && a.payablesC === b.payablesC;
  }, [realMode, pv, farm]);
  const fmtDay = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const go = async () => {
    const done = await s.run(t('dz.range'), async () => {
      commit(op, { label: realMode === 'close' ? t('dz.closed', { n: sum.total, d: fmtDay(cutoff) }) : t('dz.moved', { n: sum.total }) });
    });
    if (done) onClose();
  };
  const disabled = !s.ok || s.busy || !sum.total || (realMode === 'close' && kept === false) || (custom && from > to);
  return (
    <Sheet title={t('dz.range')} onClose={onClose} wide
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="danger" icon="trash" disabled={disabled} onClick={go}>{s.busy ? t('lo.saving') : realMode === 'close' ? t('dz.closeBtn', { n: sum.total }) : t('dz.moveBtn', { n: sum.total })}</Button></div>}>
      <div className="field">
        <span className="seg-label">{t('dz.which')}</span>
        <div className="dz-presets">
          {['1', '2', '3', 'custom'].map((p) => (
            <button type="button" key={p} className={`dz-preset ${preset === p ? 'on' : ''}`} onClick={() => setPreset(p)}>
              <b>{p === 'custom' ? t('dz.custom') : p === '1' ? t('dz.older1') : p === '2' ? t('dz.older2') : t('dz.olderN', { n: p })}</b>
              <small className="muted">{p === 'custom' ? t('dz.customHint') : t('dz.before', { d: fmtDay(yearsAgo(today, Number(p))) })}</small>
              {p === '1' && <span className="dz-rec">{t('dz.recommended')}</span>}
            </button>
          ))}
        </div>
      </div>
      {custom && <div className="grid2"><DateInput label={t('from')} value={from} max={to} onChange={setFrom} /><DateInput label={t('to')} value={to} max={today} onChange={setTo} /></div>}
      <div className="field">
        <span className="seg-label">{t('dz.what')}</span>
        <div className="dz-groups">
          {['money', 'production', 'herd'].map((g) => <Check key={g} label={t(`dz.g.${g}`)} hint={t(`dz.g.${g}Hint`)} checked={groups[g]} onChange={(v) => setGroups({ ...groups, [g]: v })} />)}
        </div>
      </div>
      {!custom && (
        <Seg value={mode} onChange={setMode} options={[{ value: 'close', label: t('dz.modeClose') }, { value: 'trash', label: t('dz.modeTrash') }]} />
      )}
      <p className="muted small">{realMode === 'close' ? t('dz.modeCloseHint') : t('dz.modeTrashHint', { n: trashDaysOf(farm) })}</p>
      <div className={`dz-summary ${sum.total ? '' : 'empty'}`}>
        {sum.total ? (
          <>
            <b className="num">{t('dz.found', { n: sum.total })}</b>
            <span className="muted small">{fmtDay(sum.first)} – {fmtDay(sum.last)}</span>
            <span className="dz-chips">{['money', 'production', 'herd'].filter((g) => sum.by[g]).map((g) => <span key={g} className="chip">{t(`dz.g.${g}`)} · <b className="num">{sum.by[g]}</b></span>)}</span>
          </>
        ) : <span className="muted">{t('dz.nothing')}</span>}
      </div>
      {pv && realMode === 'trash' && pv.impact.length > 0 && <div className="dz-impact"><b className="small">{t('imp.title')}</b><ImpactList impact={pv.impact} compact /></div>}
      {realMode === 'close' && kept === true && <p className="note ok small"><Icon name="check" size={14} /> {t('dz.balancesKept')}</p>}
      {realMode === 'close' && kept === false && <p className="note bad small">{t('dz.balancesOff')}</p>}
      {sum.total > 0 && s.ui}
    </Sheet>
  );
}
const cutoffMinus = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
