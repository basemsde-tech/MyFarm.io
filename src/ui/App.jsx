import React, { useEffect, useMemo, useRef, useState } from 'react';
import { initMoneyFlip } from './moneyflip.js';
import { RestoreSheet } from './restore.jsx';
import { SCREENS, Crumb, TabBar, WindowLayer, Taskbar } from './workspace.jsx';
import { routeKey } from './ws.mjs';
import { AppProvider, useApp, KEYS, storage } from './store.jsx';
import { Button, Icon, IconButton, Seg, TextInput, Sheet, Avatar, Select } from './kit.jsx';
import { RecordDrawer, DeleteDialog, PurgeDialog, VoidDialog, MasterDeleteDialog } from './tx.jsx';
import { SaleSheet, PaymentSheet, ExpenseSheet, SupplierPaySheet, PersonSheet, MilkSheet, MilkUseSheet, EggsSheet, MedicineSheet, TransferSheet, NewMenu } from './forms.jsx';
import { CustomerSheet, SupplierSheet, PersonMasterSheet, AnimalSheet, AnimalEventSheet, WorkerSheet, ObligationSheet, ProfileSheet, DocSheet } from './masters.jsx';
import { CashScreen, SalesScreen, ExpensesScreen, SuppliersScreen, PeopleScreen } from './screens-money.jsx';
import { ProductionScreen, AnimalsScreen, ReportsScreen, SettingsScreen, TrashScreen } from './screens-farm.jsx';
import { emptyFarm, upsert, updateSettings, newId } from '../core/commands.mjs';
import { hashCode, newSalt, newRecoveryCode, validPasscode } from '../core/security.mjs';
import { CURRENCIES } from '../core/money.mjs';
import { sampleFarm } from '../core/sample.mjs';

const NAV = [
  { group: 'grp.cash', items: [['cash', 'cash'], ['people', 'people']] },
  { group: 'grp.farm', items: [['animals', 'cow'], ['production', 'milk'], ['expenses', 'receipt'], ['suppliers', 'truck']] },
  { group: 'grp.office', items: [['sales', 'cart'], ['reports', 'chart'], ['options', 'gear'], ['trash', 'trash']] },
];
const navLabel = (k) => (k === 'options' ? 'nav.settings' : `nav.${k}`);

const SHEETS = {
  sale: SaleSheet, payment: PaymentSheet, expense: ExpenseSheet, supplierPay: SupplierPaySheet, capital: PersonSheet, milk: MilkSheet, milkUse: MilkUseSheet,
  eggs: EggsSheet, medicine: MedicineSheet, transfer: TransferSheet, new: NewMenu, drawer: RecordDrawer, delete: DeleteDialog, purge: PurgeDialog, void: VoidDialog,
  customer: CustomerSheet, supplier: SupplierSheet, person: PersonMasterSheet, animal: AnimalSheet, animalEvent: AnimalEventSheet, worker: WorkerSheet,
  obligation: ObligationSheet, profile: ProfileSheet, restore: RestoreSheet, deleteMaster: MasterDeleteDialog, doc: DocSheet, palette: Palette, erase: EraseDialog, attendance: () => null,
};

function ModalHost() {
  const { stack, ui } = useApp();
  return stack.map((m, i) => {
    const C = SHEETS[m.kind];
    if (!C) return null;
    const close = () => ui.closeTop();
    return <div key={m.key} className="modal-layer" style={{ zIndex: 50 + i }}><C {...m.props} onClose={close} /></div>;
  });
}

function Toasts() {
  const { toasts, setToasts } = useApp();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast ${x.tone === 'bad' ? 'bad' : ''}`}>
          <span>{x.msg}</span>
          {x.action && <button type="button" onClick={() => { x.action.run(); setToasts((all) => all.filter((y) => y.id !== x.id)); }}>{x.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

function Palette({ onClose }) {
  const { t, farm, nav, ui } = useApp();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const items = useMemo(() => {
    const out = [];
    for (const g of NAV) for (const [k, ic] of g.items) out.push({ label: t(navLabel(k)), hint: t('cmd.go'), icon: ic, run: (o) => nav(k, null, null, o) });
    for (const k of ['sale', 'payment', 'expense', 'milk', 'eggs', 'supplierPay', 'milkUse', 'medicine', 'transfer']) out.push({ label: t(`new.${k}`), hint: t('cmd.do'), icon: 'plus', run: () => ui.open(k) });
    out.push({ label: t('new.person'), hint: t('cmd.do'), icon: 'plus', run: () => ui.open('capital') });
    for (const c of farm.customers) out.push({ label: c.name, hint: t('sale.customer'), icon: 'user', run: (o) => nav('sales', c.id, null, o) });
    for (const s of farm.suppliers) out.push({ label: s.name, hint: t('exp.supplier'), icon: 'truck', run: (o) => nav('suppliers', s.id, null, o) });
    for (const p of farm.people) out.push({ label: p.name, hint: t('cap.person'), icon: 'people', run: (o) => nav('people', p.id, null, o) });
    for (const a of farm.animals) out.push({ label: a.name ? `${a.name} · ${a.tag}` : a.tag, hint: t(`sp.${a.species}`), icon: 'cow', run: (o) => nav('animals', a.id, null, o) });
    return out;
  }, [farm, t, nav, ui]);
  const { ws, names: nm } = useApp();
  const recent = q ? [] : ws.tabs.filter((tb) => tb.id !== ws.active).map((tb) => ({ label: tb.route.id ? (tb.route.name === 'sales' ? nm.customer(tb.route.id) : tb.route.name === 'suppliers' ? nm.supplier(tb.route.id) : tb.route.name === 'people' ? nm.person(tb.route.id) : nm.animal(tb.route.id)) : t(navLabel(tb.route.name)), hint: t('ws.tabs'), icon: 'file', run: (o) => nav(tb.route.name, tb.route.id, tb.route.tab, o) }));
  const list = [...recent, ...items].filter((x) => !q || `${x.label} ${x.hint}`.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  const go = (x, e) => { onClose(); x.run({ newTab: !!(e && (e.ctrlKey || e.metaKey)), window: !!(e && e.shiftKey) }); };
  return (
    <div className="scrim top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label={t('search')}>
        <div className="palette-in"><Icon name="search" /><input autoFocus placeholder={t('cmd.placeholder')} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(i + 1, list.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); } if (e.key === 'Enter' && list[i]) go(list[i], e); }} /></div>
        <div className="palette-list">
          {list.map((x, n) => <button type="button" key={n} className={n === i ? 'on' : ''} onMouseEnter={() => setI(n)} onClick={(e) => go(x, e)}><Icon name={x.icon} size={16} /><span>{x.label}</span><small>{x.hint}</small></button>)}
          {!list.length && <div className="picker-empty">{t('cmd.none')}</div>}
        </div>
      </div>
    </div>
  );
}

function EraseDialog({ onClose }) {
  const { t, replaceFarm, setPrefs, farm } = useApp();
  const [txt, setTxt] = useState('');
  const ok = txt.trim() && txt.trim() === (farm.settings.farmName || t('brand'));
  return (
    <Sheet title={t('set.reset')} sub={t('set.resetHint')} onClose={onClose}
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="danger" disabled={!ok} onClick={() => { storage.del(KEYS.snaps); storage.del(KEYS.drafts); replaceFarm(emptyFarm()); setPrefs({ profileId: null }); onClose(); }}>{t('delete')}</Button></div>}>
      <TextInput label={farm.settings.farmName || t('brand')} value={txt} onChange={setTxt} autoFocus />
    </Sheet>
  );
}

/* ───────────── First run ───────────── */
function Setup() {
  const { t, prefs, setPrefs, replaceFarm, lang } = useApp();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ farmName: '', currency: 'USD', name: '', code: '' });
  const [recovery] = useState(() => newRecoveryCode());
  const [restoring, setRestoring] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const finish = async () => {
    const salt = newSalt();
    let farm = emptyFarm();
    const id = newId('pro');
    const profile = { id, name: f.name.trim(), role: 'owner', passHash: f.code ? await hashCode(f.code, salt) : null };
    farm = updateSettings(farm, { farmName: f.farmName.trim(), currency: f.currency, second: { code: f.currency === 'LBP' ? 'USD' : 'LBP', rate: f.currency === 'USD' ? 89500 : 0 }, salt, setupDone: true });
    farm = upsert(farm, 'profiles', profile, profile);
    farm = upsert(farm, 'people', { name: profile.name }, profile);
    farm = { ...farm, recovery: await hashCode(recovery, salt) };
    replaceFarm(farm);
    setPrefs({ profileId: id });
  };
  const demo = () => { storage.set(KEYS.held, JSON.stringify(emptyFarm())); replaceFarm(sampleFarm(lang)); setPrefs({ profileId: 'pro-demo-owner' }); };
  return (
    <div className="setup">
      <div className="setup-card">
        <div className="brand-lockup"><span className="brand-mark">م</span><div><div className="brand-name">{t('brand')}</div><div className="muted small">{t('tagline')}</div></div></div>
        <div className="muted small num">{t('su.step', { a: step, b: 4 })}</div>
        {step === 1 && (
          <>
            <h1>{t('su.welcome')}</h1>
            <p>{t('su.welcomeHint')}</p>
            <Seg label={t('su.lang')} value={prefs.lang} onChange={(v) => setPrefs({ lang: v })} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
            <div className="foot-btns"><Button onClick={demo}>{t('su.orDemo')}</Button><Button icon="upload" onClick={() => setRestoring(true)}>{t('su.restore')}</Button><Button variant="primary" onClick={() => setStep(2)}>{t('start')}</Button></div>
            {restoring && <RestoreSheet fromSetup onClose={() => setRestoring(false)} />}
          </>
        )}
        {step === 2 && (
          <>
            <h1>{t('su.farm')}</h1>
            <TextInput label={t('set.farmName')} hint={t('su.farmHint')} value={f.farmName} onChange={(v) => set({ farmName: v })} autoFocus />
            <Select label={t('set.currency')} value={f.currency} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <div className="foot-btns"><Button onClick={() => setStep(1)}>{t('back')}</Button><Button variant="primary" disabled={!f.farmName.trim()} onClick={() => setStep(3)}>{t('next')}</Button></div>
          </>
        )}
        {step === 3 && (
          <>
            <h1>{t('su.you')}</h1>
            <p className="muted">{t('su.youHint')}</p>
            <TextInput label={t('name')} value={f.name} onChange={(v) => set({ name: v })} autoFocus />
            <div className="role-note"><Avatar p={{ role: 'owner' }} size={40} /><div><b>{t('role.owner')}</b><span>{t('role.owner.d')}</span></div></div>
            <TextInput label={`${t('set.passcode')} (${t('optional')})`} hint={t('su.passHint')} value={f.code} onChange={(v) => set({ code: v.replace(/\D/g, '') })} inputMode="numeric" type="password" error={f.code && !validPasscode(f.code) ? t('su.passHint') : null} />
            <div className="foot-btns"><Button onClick={() => setStep(2)}>{t('back')}</Button><Button variant="primary" disabled={!f.name.trim() || (f.code && !validPasscode(f.code))} onClick={() => setStep(4)}>{t('next')}</Button></div>
          </>
        )}
        {step === 4 && (
          <>
            <h1>{t('su.recovery')}</h1>
            <p>{t('su.recoveryHint')}</p>
            <div className="recovery num">{recovery}</div>
            <div className="foot-btns"><Button onClick={() => setStep(3)}>{t('back')}</Button><Button variant="primary" onClick={finish}>{t('su.finish')}</Button></div>
          </>
        )}
      </div>
    </div>
  );
}

function PinPad({ value, onChange, onSubmit, error, max = 8 }) {
  const { t } = useApp();
  const press = (k) => {
    if (k === 'del') return onChange(value.slice(0, -1));
    if (value.length < max) onChange(value + k);
  };
  useEffect(() => {
    const fn = (e) => {
      if (/^[0-9٠-٩]$/.test(e.key)) { e.preventDefault(); press(String('٠١٢٣٤٥٦٧٨٩'.indexOf(e.key) >= 0 ? '٠١٢٣٤٥٦٧٨٩'.indexOf(e.key) : e.key)); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
      else if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  });
  return (
    <div className={`pin ${error ? 'pin-err' : ''}`}>
      <div className="pin-dots" aria-label={t('set.passcode')} aria-live="polite">
        {Array.from({ length: Math.max(4, value.length) }).map((_, i) => <span key={i} className={i < value.length ? 'on' : ''} />)}
      </div>
      <div className="pin-msg">{error || '\u00a0'}</div>
      <div className="pin-pad" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => <button type="button" key={k} onClick={() => press(k)}>{k}</button>)}
        <button type="button" className="pin-fn" onClick={() => press('del')} aria-label={t('pf.erase')}><Icon name="backspace" size={22} /></button>
        <button type="button" onClick={() => press('0')}>0</button>
        <button type="button" className="pin-go" onClick={onSubmit} disabled={value.length < 4} aria-label={t('open')}><Icon name="check" size={22} /></button>
      </div>
    </div>
  );
}

function ProfileGate() {
  const { farm, t, setPrefs, commit, lang } = useApp();
  const [pick, setPick] = useState(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [forgot, setForgot] = useState(false);
  const [q, setQ] = useState('');
  const enter = async (p, c = code) => {
    if (!p.passHash) return setPrefs({ profileId: p.id });
    const h = await hashCode(c, p.salt != null ? p.salt : farm.settings.salt);
    if (h === p.passHash) setPrefs({ profileId: p.id }); else { setErr(t('pf.wrong')); setCode(''); }
  };
  const recover = async () => {
    const h = await hashCode(code.trim().toUpperCase(), farm.settings.salt);
    if (farm.recovery && h === farm.recovery) {
      commit((f) => upsert(f, 'profiles', { id: pick.id, passHash: null }, pick), { label: t('restored') });
      setPrefs({ profileId: pick.id });
    } else setErr(t('pf.wrong'));
  };
  const back = () => { setPick(null); setCode(''); setForgot(false); setErr(''); };
  const order = { owner: 0, book: 1, health: 2, milker: 3, worker: 4 };
  const people = [...farm.profiles].sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.name.localeCompare(b.name))
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const greet = (() => { const h = new Date().getHours(); return h < 12 ? 'pf.morning' : h < 18 ? 'pf.afternoon' : 'pf.evening'; })();
  return (
    <div className="signin">
      <aside className="signin-side">
        <div className="brand-lockup"><span className="brand-mark">م</span><div><div className="brand-name">{t('brand')}</div><div className="signin-farm">{farm.settings.farmName}</div></div></div>
        <div className="signin-pitch">
          <h2>{t(greet)}</h2>
          <p>{t('pf.pitch')}</p>
        </div>
        <div className="signin-foot">{new Date().toLocaleDateString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </aside>
      <main className="signin-main">
        <div className="signin-card" key={pick ? pick.id + forgot : 'list'}>
          {!pick ? (
            <>
              <header className="signin-head">
                <h1>{t('pf.who')}</h1>
                <p className="muted">{t('pf.whoHint')}</p>
              </header>
              {farm.profiles.length > 6 && <input className="input search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />}
              <ul className="acct-list">
                {people.map((p, i) => (
                  <li key={p.id} style={{ animationDelay: `${i * 35}ms` }}>
                    <button type="button" className="acct" onClick={() => (p.passHash ? (setPick(p), setErr('')) : enter(p))}>
                      <Avatar p={p} size={42} />
                      <span className="acct-text"><b>{p.name}</b><small>{t(`role.${p.role}`)}</small></span>
                      {p.passHash ? <span className="acct-lock" title={t('pf.locked')}><Icon name="lock" size={15} /></span> : <span className="acct-open">{t('pf.noCode')}</span>}
                      <Icon name="chev" size={18} className="flip-rtl acct-go" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <button type="button" className="signin-back" onClick={back}><Icon name="back" size={16} className="flip-rtl" />{t('pf.otherAccount')}</button>
              <div className="signin-who">
                <Avatar p={pick} size={64} ring />
                <b>{pick.name}</b>
                <span className="muted">{t(`role.${pick.role}`)}</span>
              </div>
              {forgot ? (
                <>
                  <p className="muted center">{t('pf.forgotHint')}</p>
                  <TextInput autoFocus value={code} onChange={(v) => { setErr(''); setCode(v); }} placeholder="XXXX-XXXX-XXXX-XXXX" error={err}
                    onKeyDown={(e) => e.key === 'Enter' && recover()} className="recovery-in" />
                  <div className="foot-btns center">
                    <Button onClick={() => { setForgot(false); setCode(''); setErr(''); }}>{t('back')}</Button>
                    <Button variant="primary" onClick={recover} disabled={code.trim().length < 8}>{t('pf.reset')}</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted center">{t('pf.enterCode', { n: pick.name })}</p>
                  <PinPad value={code} onChange={(v) => { setErr(''); setCode(v); }} onSubmit={() => code.length >= 4 && enter(pick)} error={err} />
                  <button type="button" className="link center" onClick={() => { setForgot(true); setCode(''); setErr(''); }}>{t('pf.forgot')}</button>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/** Account chip in the sidebar and top bar: who is signed in, and a short menu. */
function AccountMenu({ compact }) {
  const { actor, t, setPrefs, nav, farm } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', fn); window.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', fn); window.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className={`acct-menu ${compact ? 'compact' : ''}`} ref={ref}>
      <button type="button" className={compact ? 'me-mini' : 'me'} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title={actor?.name}>
        <Avatar p={actor} size={compact ? 32 : 36} />
        {!compact && <span><b>{actor?.name}</b><small>{t(`role.${actor?.role}`)}</small></span>}
        {!compact && <Icon name="down" size={16} />}
      </button>
      {open && (
        <div className="acct-pop" role="menu">
          <div className="acct-pop-head">
            <Avatar p={actor} size={44} />
            <div><b>{actor?.name}</b><span>{t(`role.${actor?.role}`)}</span><small>{farm.settings.farmName}</small></div>
          </div>
          <p className="acct-pop-role">{t(`role.${actor?.role}.d`)}</p>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); nav('options'); }}><Icon name="people" size={17} />{t('pf.team')}</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setPrefs({ profileId: null }); }}><Icon name="swap" size={17} />{t('pf.switch')}</button>
          {actor?.passHash && <button type="button" role="menuitem" onClick={() => { setOpen(false); setPrefs({ profileId: null }); }}><Icon name="lock" size={17} />{t('pf.lockNow')}</button>}
        </div>
      )}
    </div>
  );
}

/* ───────────── The desk ───────────── */
function Shell() {
  const app = useApp();
  const { t, route, nav, ui, prefs, setPrefs, actor, farm, demo, saveError, retrySave, undo, stack, replaceFarm, ws, wsApi } = app;
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [more, setMore] = useState(false);
  const cfgRef = useRef(null);
  const wsRef = useRef(ws); wsRef.current = ws;
  const routeRef = useRef(route); routeRef.current = route;
  cfgRef.current = { enabled: farm.settings.currency === 'USD' && farm.settings.second?.code === 'LBP' && farm.settings.second?.rate > 0, rate: farm.settings.second?.rate || 0, symbol: 'ل.ل' };
  useEffect(() => { initMoneyFlip(() => cfgRef.current); }, []);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const key = (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ui.open('palette'); return; }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); (document.dir === 'rtl' ? wsApi.forward : wsApi.back)(); return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); (document.dir === 'rtl' ? wsApi.back : wsApi.forward)(); return; }
      if (e.altKey && /^[1-9]$/.test(e.key)) { const tb = wsRef.current.tabs[Number(e.key) - 1]; if (tb) { e.preventDefault(); wsApi.activate(tb.id); } return; }
      if (e.altKey && e.key.toLowerCase() === 'w') { e.preventDefault(); wsApi.closeTab(wsRef.current.active); return; }
      if (e.altKey && e.key.toLowerCase() === 't') { e.preventDefault(); nav('cash', null, null, { newTab: true }); return; }
      if (e.altKey && e.key.toLowerCase() === 'o') { e.preventDefault(); wsApi.openWindow(routeRef.current); return; }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n' && !document.querySelector('.scrim')) { e.preventDefault(); ui.open('new'); }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('keydown', key); };
  }, [ui, undo, wsApi, nav]);
  const Screen = SCREENS[route.name] || SCREENS.cash;
  const trashCount = farm.records.filter((r) => r.deletedAt && r.deleteReason !== 'replaced').length;
  const go = (k) => { setMore(false); nav(k); };
  const theme = prefs.theme === 'system' ? 'system' : prefs.theme;
  return (
    <div className={`desk has-tabs ${prefs.rail === 'mini' ? 'rail-mini' : ''} ${ws.windows.length ? 'has-taskbar' : ''}`}>
      <aside className="sidebar" aria-label={t('brand')}>
        <button type="button" className="rail-toggle" onClick={() => setPrefs({ rail: prefs.rail === 'mini' ? 'full' : 'mini' })} aria-label={t('nav.more')} title={t('nav.more')}><Icon name="menu" size={18} /></button>
        <div className="brand-lockup small"><span className="brand-mark">م</span><div><div className="brand-name">{t('brand')}</div><div className="farm-name">{farm.settings.farmName}</div></div></div>
        <nav>
          {NAV.map((g) => (
            <div className="nav-group" key={g.group}>
              <div className="nav-group-label">{t(g.group)}</div>
              {g.items.map(([k, ic]) => (
                <button type="button" key={k} title={t(navLabel(k))} data-tip={t(navLabel(k))} className={`nav-item ${route.name === k ? 'on' : ''}`} onClick={() => go(k)} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); nav(k, null, null, { newTab: true }); } }} aria-current={route.name === k ? 'page' : undefined}>
                  <Icon name={ic} /><span>{t(navLabel(k))}</span>{k === 'trash' && trashCount > 0 && <span className="nav-count num">{trashCount}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <AccountMenu />
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Crumb />
          <button type="button" className="search-btn" onClick={() => ui.open('palette')}><Icon name="search" size={16} /><span>{t('cmd.placeholder')}</span><kbd>Ctrl K</kbd></button>
          <div className="top-actions">
            <span className="ccy-chip" title={farm.settings.second?.rate > 0 ? t('flip.hint') : undefined}>{farm.settings.currency}</span>
            <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={t('set.theme')} onClick={() => setPrefs({ theme: theme === 'dark' ? 'light' : 'dark' })} />
            <button type="button" className="chip lang-toggle" onClick={() => setPrefs({ lang: prefs.lang === 'ar' ? 'en' : 'ar' })}>{prefs.lang === 'ar' ? 'EN' : 'ع'}</button>
            <AccountMenu compact />
          </div>
        </header>
        <TabBar />
        {demo && <div className="banner info"><span>{t('set.demoOn')}</span><button type="button" onClick={() => { const held = JSON.parse(storage.get(KEYS.held) || 'null'); storage.del(KEYS.held); replaceFarm(held || emptyFarm()); setPrefs({ profileId: held?.profiles?.[0]?.id || null }); }}>{t('set.demoExit')}</button></div>}
        {!online && <div className="banner warn"><Icon name="wifi" size={16} /><span>{t('offline')}</span></div>}
        {saveError && <div className="banner bad"><Icon name="alert" size={16} /><span>{t(`e.${saveError.code}`)}</span><button type="button" onClick={retrySave}>{t('e.retry')}</button></div>}
        {!demo && !prefs.dismissed?.deviceOnly && <div className="banner quiet"><span>{t('deviceOnly')}</span><button type="button" onClick={() => setPrefs({ dismissed: { ...prefs.dismissed, deviceOnly: true } })}>{t('dismiss')}</button></div>}
        <main className="content" id="main"><Screen key={routeKey(route)} /></main>
        <WindowLayer />
        <Taskbar />
      </div>
      <button type="button" className="fab" onClick={() => ui.open('new')} aria-label={t('new')}><Icon name="plus" size={26} /><span>{t('new')}</span></button>
      <nav className="bottom-nav" aria-label={t('nav.more')}>
        {[['cash', 'cash'], ['sales', 'cart'], ['production', 'milk'], ['animals', 'cow']].map(([k, ic]) => (
          <button type="button" key={k} className={route.name === k ? 'on' : ''} onClick={() => go(k)}><Icon name={ic} /><span>{t(navLabel(k))}</span></button>
        ))}
        <button type="button" className={more ? 'on' : ''} onClick={() => setMore(!more)}><Icon name="menu" /><span>{t('nav.more')}</span></button>
      </nav>
      {more && (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setMore(false)}>
          <div className="more-sheet">
            {NAV.flatMap((g) => g.items).filter(([k]) => !['cash', 'sales', 'production', 'animals'].includes(k)).map(([k, ic]) => (
              <button type="button" key={k} onClick={() => go(k)}><Icon name={ic} /><span>{t(navLabel(k))}</span></button>
            ))}
            <button type="button" onClick={() => { setMore(false); setPrefs({ profileId: null }); }}><Icon name="swap" /><span>{t('pf.switch')}</span></button>
          </div>
        </div>
      )}
      <ModalHost />
      <Toasts />
    </div>
  );
}

function Root() {
  const { farm, actor, prefs, dir, lang } = useApp();
  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = dir;
    if (prefs.theme === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', prefs.theme);
    el.setAttribute('data-palette', prefs.palette || 'sage');
  }, [lang, dir, prefs.theme, prefs.palette]);
  if (!farm.settings.setupDone) return <><Setup /><Toasts /></>;
  if (!actor) return <><ProfileGate /><Toasts /></>;
  return <Shell />;
}

export default function App() {
  return <AppProvider><Root /></AppProvider>;
}
