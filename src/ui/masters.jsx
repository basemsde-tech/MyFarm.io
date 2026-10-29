import React, { useMemo, useState } from 'react';
import { useApp, inFrame } from './store.jsx';
import { Button, Icon, MoneyInput, QtyInput, DateInput, Seg, Select, TextInput, TextArea, Check, Sheet, Field, readImage, IconButton, Avatar, dayLabel } from './kit.jsx';
import { TxFooter } from './tx.jsx';
import { upsert, newId } from '../core/commands.mjs';
import { SPECIES, statusesFor, addDays } from '../core/species.mjs';
import { ROLES, EXPENSE_GROUPS } from '../core/catalog.mjs';
import { partyLines, statement, periodRange } from '../core/statement.mjs';
import { compute } from '../core/ledger.mjs';
import { docNo, invoiceRegister } from '../core/accounts.mjs';
import { hashCode, newSalt, validPasscode } from '../core/security.mjs';
import { fmtQty } from '../core/money.mjs';

function useSaveMaster(list, onClose) {
  const { commit, actor, t } = useApp();
  return (item, label) => {
    const next = commit((f) => upsert(f, list, item, actor), { label: label || t('saved') });
    if (next) onClose?.(next);
    return next;
  };
}
const nameTaken = (arr, name, id) => arr.some((x) => x.id !== id && x.name.trim().toLowerCase() === name.trim().toLowerCase());

export function CustomerSheet({ record, onClose }) {
  const { farm, t, nav, ui } = useApp();
  const [f, setF] = useState(record || { name: '', phone: '', defaultProduct: 'milk', defaultPriceC: farm.settings.milkPriceC, defaultQty: 0, openingC: 0, note: '' });
  const [created, setCreated] = useState(null);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = useSaveMaster('customers', () => {});
  const err = !f.name.trim() ? t('e.name.required') : nameTaken(farm.customers, f.name, record?.id) ? t('e.name.taken') : null;
  if (created) {
    return (
      <Sheet title={t('sales.newCustomer')} onClose={onClose}>
        <div className="success">
          <div className="success-check"><Icon name="check" size={32} /></div>
          <p>{t('cust.created', { n: created.accountNo })}</p>
          <div className="foot-btns center">
            <Button onClick={() => { setCreated(null); setF({ name: '', phone: '', defaultProduct: 'milk', defaultPriceC: farm.settings.milkPriceC, defaultQty: 0, openingC: 0, note: '' }); }}>{t('cust.addAnother')}</Button>
            <Button variant="primary" onClick={() => { onClose(); nav('sales', created.id); }}>{t('cust.openAccount')}</Button>
          </div>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title={record ? `${t('edit')} · ${record.name}` : t('sales.newCustomer')} onClose={onClose}
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={!!err} onClick={() => {
        const accountNo = record?.accountNo || `C-${String(farm.customers.length + 1).padStart(4, '0')}`;
        const id = record?.id || newId('cus');
        const next = save({ ...f, id, accountNo, name: f.name.trim() });
        if (next && !record) setCreated({ id, accountNo }); else if (next) onClose();
      }}>{t('save')}</Button></div>}>
      <TextInput label={t('name')} value={f.name} onChange={(v) => set({ name: v })} error={f.name ? err : null} autoFocus />
      <TextInput label={t('phone')} value={f.phone} onChange={(v) => set({ phone: v })} inputMode="tel" />
      <div className="grid2">
        <MoneyInput label={t('cust.defaultPrice')} cents={f.defaultPriceC} onCents={(c) => set({ defaultPriceC: c })} />
        <QtyInput label={`${t('qty')} (${t('optional')})`} value={f.defaultQty} onValue={(v) => set({ defaultQty: v })} unit={t('u.L')} />
      </div>
      {!record && <MoneyInput label={t('cust.opening')} cents={f.openingC} onCents={(c) => set({ openingC: c })} />}
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
    </Sheet>
  );
}

export function SupplierSheet({ record, onClose }) {
  const { farm, t } = useApp();
  const [f, setF] = useState(record || { name: '', phone: '', note: '', tags: ['feed'], openingC: 0, openingDay: '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = useSaveMaster('suppliers', onClose);
  const err = !f.name.trim() ? t('e.name.required') : nameTaken(farm.suppliers, f.name, record?.id) ? t('e.name.taken') : null;
  const toggle = (tag) => set({ tags: f.tags.includes(tag) ? f.tags.filter((x) => x !== tag) : [...f.tags, tag] });
  return (
    <Sheet title={record ? `${t('edit')} · ${record.name}` : t('sup.new')} onClose={onClose}
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={!!err} onClick={() => save({ ...f, name: f.name.trim() })}>{t('save')}</Button></div>}>
      <TextInput label={t('name')} value={f.name} onChange={(v) => set({ name: v })} error={f.name ? err : null} autoFocus />
      <TextInput label={t('phone')} value={f.phone} onChange={(v) => set({ phone: v })} inputMode="tel" />
      <Field label={t('sup.tags')}><div className="chips">{['feed', 'medicine', 'other'].map((x) => <button type="button" key={x} className={`chip ${f.tags.includes(x) ? 'on' : ''}`} onClick={() => toggle(x)}>{t(`tag.${x}`)}</button>)}</div></Field>
      <MoneyInput label={t('sup.opening')} hint={t('sup.openingHint')} cents={f.openingC} onCents={(c) => set({ openingC: c })} />
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
    </Sheet>
  );
}

export function PersonMasterSheet({ record, onClose }) {
  const { farm, t } = useApp();
  const [f, setF] = useState(record || { name: '', phone: '', openingC: 0, note: '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = useSaveMaster('people', onClose);
  const err = !f.name.trim() ? t('e.name.required') : nameTaken(farm.people, f.name, record?.id) ? t('e.name.taken') : null;
  return (
    <Sheet title={record ? `${t('edit')} · ${record.name}` : t('ppl.new')} onClose={onClose}
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={!!err} onClick={() => save({ ...f, name: f.name.trim() })}>{t('save')}</Button></div>}>
      <TextInput label={t('name')} value={f.name} onChange={(v) => set({ name: v })} error={f.name ? err : null} autoFocus />
      <TextInput label={t('phone')} value={f.phone} onChange={(v) => set({ phone: v })} inputMode="tel" />
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
    </Sheet>
  );
}

export function AnimalSheet({ record, species: presetSpecies, onClose }) {
  const { farm, t, today } = useApp();
  const [f, setF] = useState(record || { species: presetSpecies || 'cow', tag: '', name: '', breed: '', status: presetSpecies === 'chicken' ? 'laying' : 'healthy', dob: '', weight: 0, yieldL: 0, parity: 0, source: 'born', priceC: 0, birds: 0, coop: '', photo: '', medicine: '', notes: '', startDay: today });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = useSaveMaster('animals', onClose);
  const sp = SPECIES[f.species];
  const flock = sp.mode === 'flock';
  const taken = farm.animals.some((a) => a.id !== record?.id && a.tag.trim().toLowerCase() === f.tag.trim().toLowerCase());
  const err = !f.tag.trim() ? t('e.name.required') : taken ? t('ani.tagTaken') : null;
  const breedOther = f.breed && !sp.breeds.includes(f.breed);
  return (
    <Sheet title={record ? t('ani.edit') : t('ani.new')} onClose={onClose} wide
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={!!err} onClick={() => save({ ...f, tag: f.tag.trim() })}>{t('save')}</Button></div>}>
      {!record && <Seg value={f.species} onChange={(v) => set({ species: v, status: SPECIES[v].mode === 'flock' ? 'laying' : 'healthy', breed: '' })} options={Object.keys(SPECIES).map((s) => ({ value: s, label: t(`sp.${s}`) }))} />}
      <div className="animal-form">
        <label className="photo-pick">
          {f.photo ? <img src={f.photo} alt="" /> : <span className={`species-badge sp-${f.species}`}><Icon name={flock ? 'egg' : 'cow'} size={28} /></span>}
          <input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) set({ photo: await readImage(file, 360, 0.7) }); }} />
          <small>{t('ani.photo')}</small>
        </label>
        <div className="grid2 grow">
          <TextInput label={flock ? t('ani.flockName') : t('ani.tag')} value={f.tag} onChange={(v) => set({ tag: v })} error={f.tag ? err : null} autoFocus />
          {!flock && <TextInput label={`${t('ani.name')} (${t('optional')})`} value={f.name} onChange={(v) => set({ name: v })} />}
          {flock && <TextInput label={t('ani.coop')} value={f.coop} onChange={(v) => set({ coop: v })} />}
        </div>
      </div>
      <div className="grid2">
        <Select label={t('ani.breed')} value={breedOther ? '__other' : f.breed} onChange={(v) => set({ breed: v === '__other' ? ' ' : v })} options={[...sp.breeds.map((b) => ({ value: b, label: b })), { value: '__other', label: t('c.other') }]} placeholder="—" />
        {breedOther ? <TextInput label={t('ani.breed')} value={f.breed.trim()} onChange={(v) => set({ breed: v || ' ' })} /> : <Select label={t('ani.status')} value={f.status} onChange={(v) => set({ status: v })} options={statusesFor(f.species).map((s) => ({ value: s, label: t(`as.${s}`) }))} />}
      </div>
      {breedOther && <Select label={t('ani.status')} value={f.status} onChange={(v) => set({ status: v })} options={statusesFor(f.species).map((s) => ({ value: s, label: t(`as.${s}`) }))} />}
      {flock ? (
        <div className="grid2">
          <QtyInput label={t('ani.birds')} value={f.birds} onValue={(v) => set({ birds: Math.round(v) })} />
          <DateInput label={t('date')} value={f.startDay} onChange={(v) => set({ startDay: v })} />
        </div>
      ) : (
        <>
          <div className="grid3">
            <DateInput label={t('ani.dob')} value={f.dob} max={today} onChange={(v) => set({ dob: v })} />
            <QtyInput label={t('ani.weight')} value={f.weight} onValue={(v) => set({ weight: v })} unit={t('u.kg')} />
            <QtyInput label={t('ani.parity')} value={f.parity} onValue={(v) => set({ parity: Math.round(v) })} />
          </div>
          {sp.product === 'milk' && <QtyInput label={t('ani.yield')} value={f.yieldL} onValue={(v) => set({ yieldL: v })} unit={t('u.L')} />}
        </>
      )}
      <Seg label={t('ani.source')} value={f.source} onChange={(v) => set({ source: v })} options={[{ value: 'born', label: t('ani.born') }, { value: 'bought', label: t('ani.bought') }]} />
      {f.source === 'bought' && <MoneyInput label={t('ani.price')} cents={f.priceC} onCents={(c) => set({ priceC: c })} />}
      <TextInput label={t('ani.medicine')} value={f.medicine} onChange={(v) => set({ medicine: v })} />
      <TextArea label={t('note')} value={f.notes} onChange={(v) => set({ notes: v })} />
    </Sheet>
  );
}

/** Herd events: service, pregnancy check, dry-off, birth, loss, weight. */
export function AnimalEventSheet({ animalId, kind: presetKind, record, onClose }) {
  const { farm, t, today, actor } = useApp();
  const a = farm.animals.find((x) => x.id === (record?.animalId || animalId));
  const kind = record?.kind || presetKind;
  const [f, setF] = useState(record ? { day: record.day, ...record.data } : { day: today, method: 'natural', result: 'pregnant', birth: 'single', males: 0, females: 1, still: 0, addYoung: true, count: 1, reason: 'disease', weight: a?.weight || 0 });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  if (!a) return null;
  const { day, ...data } = f;
  const rec = { type: 'animalEvent', day, animalId: a.id, kind, data };
  const extraOp = record ? null : (x) => {
    const at = new Date().toISOString();
    const patch = { id: a.id };
    if (kind === 'service') Object.assign(patch, { repro: { serviceDay: day, method: f.method, check: null }, status: 'served' });
    if (kind === 'check') Object.assign(patch, { repro: { ...a.repro, check: f.result }, status: f.result === 'pregnant' ? 'pregnant' : 'healthy' });
    if (kind === 'dry') Object.assign(patch, { status: 'dry' });
    if (kind === 'birth') Object.assign(patch, { parity: (a.parity || 0) + 1, status: SPECIES[a.species].product === 'milk' ? 'lactating' : 'healthy', repro: null, lastBirth: day });
    if (kind === 'loss') Object.assign(patch, SPECIES[a.species].mode === 'flock' ? { birds: Math.max(0, (a.birds || 0) - (f.count || 0)) } : { status: 'dead' });
    if (kind === 'weight') Object.assign(patch, { weight: f.weight });
    let next = upsert(x, 'animals', patch, actor);
    if (kind === 'birth' && f.addYoung) {
      const n = (f.males || 0) + (f.females || 0);
      for (let i = 0; i < n; i++) {
        next = upsert(next, 'animals', { species: a.species, tag: `${a.tag}-${day.slice(5).replace('-', '')}-${i + 1}`, name: '', sex: i < f.males ? 'm' : 'f', status: 'healthy', dob: day, source: 'born', motherId: a.id, breed: a.breed, createdAt: at }, actor);
      }
    }
    return next;
  };
  return (
    <Sheet title={`${t(`ae.${kind}`)} · ${a.name || a.tag}`} onClose={onClose} footer={<TxFooter recs={[rec]} editing={record} extraOp={extraOp} saveAndNew={false} onDone={onClose} />}>
      <DateInput label={t('date')} value={f.day} max={today} onChange={(v) => set({ day: v })} />
      {kind === 'service' && <Seg value={f.method} onChange={(v) => set({ method: v })} options={[{ value: 'natural', label: t('ani.natural') }, { value: 'ai', label: t('ani.ai') }]} />}
      {kind === 'check' && <Seg value={f.result} onChange={(v) => set({ result: v })} options={[{ value: 'pregnant', label: t('ani.checkPreg') }, { value: 'open', label: t('ani.checkOpen') }]} />}
      {kind === 'birth' && (
        <>
          <Seg value={f.birth} onChange={(v) => set({ birth: v })} options={[{ value: 'single', label: t('b.single') }, { value: 'twins', label: t('b.twins') }, { value: 'triplets', label: t('b.triplets') }]} />
          <div className="grid3">
            <QtyInput label={t('birth.males')} value={f.males} onValue={(v) => set({ males: Math.round(v) })} />
            <QtyInput label={t('birth.females')} value={f.females} onValue={(v) => set({ females: Math.round(v) })} />
            <QtyInput label={t('birth.still')} value={f.still} onValue={(v) => set({ still: Math.round(v) })} />
          </div>
          {!record && <Check label={t('birth.addYoung')} checked={f.addYoung} onChange={(v) => set({ addYoung: v })} />}
        </>
      )}
      {kind === 'loss' && (
        <>
          {SPECIES[a.species].mode === 'flock' && <QtyInput label={t('loss.count')} value={f.count} onValue={(v) => set({ count: Math.round(v) })} />}
          <Seg wrap value={f.reason} onChange={(v) => set({ reason: v })} options={['disease', 'predator', 'heat', 'other'].map((r) => ({ value: r, label: t(`lr.${r}`) }))} />
        </>
      )}
      {kind === 'weight' && <QtyInput autoFocus label={t('ani.weight')} value={f.weight} onValue={(v) => set({ weight: v })} unit={t('u.kg')} />}
    </Sheet>
  );
}

export function WorkerSheet({ record, onClose }) {
  const { farm, t , ui } = useApp();
  const [f, setF] = useState(record || { name: '', pay: 'daily', wageC: farm.settings.wageC, phone: '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = useSaveMaster('workers', onClose);
  const err = !f.name.trim() ? t('e.name.required') : nameTaken(farm.workers, f.name, record?.id) ? t('e.name.taken') : null;
  return (
    <Sheet title={record ? `${t('edit')} · ${record.name}` : t('wk.new')} onClose={onClose}
      footer={<div className="foot-btns">{record && <Button variant="danger" icon="trash" onClick={() => { onClose(); ui.open('deleteMaster', { list: 'workers', id: record.id }); }}>{t('delete')}</Button>}<Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={!!err} onClick={() => save({ ...f, name: f.name.trim() })}>{t('save')}</Button></div>}>
      <TextInput label={t('name')} value={f.name} onChange={(v) => set({ name: v })} error={f.name ? err : null} autoFocus />
      <Seg value={f.pay} onChange={(v) => set({ pay: v })} options={[{ value: 'daily', label: t('wk.daily') }, { value: 'monthly', label: t('wk.monthly') }]} />
      <MoneyInput label={t('wk.wage')} cents={f.wageC} onCents={(c) => set({ wageC: c })} />
      <TextInput label={t('phone')} value={f.phone} onChange={(v) => set({ phone: v })} inputMode="tel" />
    </Sheet>
  );
}

export function ObligationSheet({ record, onClose }) {
  const { farm, t, today , ui } = useApp();
  const [f, setF] = useState(record || { party: '', kind: 'rent', category: 'rent', amountC: 0, nextDue: today, freq: 'monthly', note: '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = useSaveMaster('obligations', onClose);
  const cats = Object.values(EXPENSE_GROUPS).flat();
  return (
    <Sheet title={record ? `${t('edit')} · ${record.party}` : t('obl.new')} onClose={onClose}
      footer={<div className="foot-btns">{record && <Button variant="danger" icon="trash" onClick={() => { onClose(); ui.open('deleteMaster', { list: 'obligations', id: record.id }); }}>{t('delete')}</Button>}<Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={!f.party.trim() || !(f.amountC > 0)} onClick={() => save(f)}>{t('save')}</Button></div>}>
      <Seg value={f.kind} onChange={(v) => set({ kind: v })} options={['rent', 'bill', 'contract'].map((k) => ({ value: k, label: t(`ok.${k}`) }))} />
      <TextInput label={t('obl.party')} value={f.party} onChange={(v) => set({ party: v })} autoFocus />
      <div className="grid2">
        <MoneyInput label={t('amount')} cents={f.amountC} onCents={(c) => set({ amountC: c })} />
        <Select label={t('exp.item')} value={f.category} onChange={(v) => set({ category: v })} options={cats.map((c) => ({ value: c, label: t(`c.${c}`) }))} />
      </div>
      <div className="grid2">
        <DateInput label={t('obl.next')} value={f.nextDue} onChange={(v) => set({ nextDue: v })} />
        <Select label={t('obl.freq')} value={f.freq} onChange={(v) => set({ freq: v })} options={['once', 'weekly', 'monthly', 'yearly'].map((k) => ({ value: k, label: t(`f.${k}`) }))} />
      </div>
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
    </Sheet>
  );
}

export function ProfileSheet({ record, onClose }) {
  const { farm, t, commit, actor, ui } = useApp();
  const [f, setF] = useState(record ? { ...record, code: '' } : { name: '', role: 'worker', code: '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const owners = farm.profiles.filter((p) => p.role === 'owner');
  const lastOwner = record?.role === 'owner' && owners.length === 1;
  const err = !f.name.trim() ? t('e.name.required') : nameTaken(farm.profiles, f.name, record?.id) ? t('e.name.taken') : null;
  const codeErr = f.code && !validPasscode(f.code) ? t('su.passHint') : null;
  const save = async () => {
    const { code, avatar, color, ...rest } = f;
    const salt = farm.settings.salt || newSalt();
    const patch = { ...rest, name: f.name.trim() };
    if (code) { patch.passHash = await hashCode(code, salt); patch.salt = null; }
    const next = commit((x) => upsert({ ...x, settings: { ...x.settings, salt } }, 'profiles', patch, actor), { label: t('saved') });
    if (next) onClose();
  };
  const remove = () => commit((x) => ({ ...x, rev: (x.rev || 0) + 1, profiles: x.profiles.filter((p) => p.id !== record.id) }), { label: t('deleted') }) && onClose();
  return (
    <Sheet title={record ? record.name : t('set.addProfile')} sub={record ? t(`role.${record.role}`) : t('pf.newHint')} onClose={onClose}
      footer={<div className="foot-btns">
        {record && record.id !== actor?.id && !lastOwner && <Button variant="danger" icon="trash" onClick={remove}>{t('delete')}</Button>}
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="primary" disabled={!!err || !!codeErr} onClick={save}>{t('save')}</Button>
      </div>}>
      <div className="profile-preview">
        <Avatar p={f} size={56} ring />
        <div><b>{f.name.trim() || t('name')}</b><span>{t(`role.${f.role}`)}</span></div>
      </div>
      <TextInput label={t('name')} value={f.name} onChange={(v) => set({ name: v })} error={f.name ? err : null} autoFocus={!record} />
      <Field label={t('set.role')}>
        <div className="role-pick" role="radiogroup" aria-label={t('set.role')}>
          {ROLES.map((r) => {
            const locked = lastOwner && r !== 'owner';
            return (
              <button type="button" role="radio" aria-checked={f.role === r} key={r} disabled={locked} className={`role-opt ${f.role === r ? 'on' : ''}`} onClick={() => set({ role: r })}>
                <Avatar p={{ role: r }} size={36} />
                <span><b>{t(`role.${r}`)}</b><small>{t(`role.${r}.d`)}</small></span>
              </button>
            );
          })}
        </div>
        {lastOwner && <div className="field-msg">{t('pf.lastOwner')}</div>}
      </Field>
      <div className="sub-sec">
        <h3>{t('set.passcode')}</h3>
        <TextInput label={record?.passHash ? t('set.resetPass') : t('set.setPass')} hint={t('su.passHint')} value={f.code} onChange={(v) => set({ code: v.replace(/\D/g, '') })} inputMode="numeric" type="password" error={codeErr} />
        {record?.passHash && !f.code && (f.passHash
          ? <Button size="sm" icon="lock" onClick={() => set({ passHash: null })}>{t('set.removePass')}</Button>
          : <div className="note warn">{t('pf.codeRemoved')}</div>)}
      </div>
    </Sheet>
  );
}

/* ───────────── Printable documents ───────────── */
export function DocSheet({ kind, id, party, partyId, onClose }) {
  const app = useApp();
  const { farm, t, fmt, lang, today, names } = app;
  const s = farm.settings;
  const [period, setPeriod] = useState('month');
  const [range, setRange] = useState(periodRange('month', today));
  const [hidden, setHidden] = useState(new Set());
  const [custom, setCustom] = useState([]);
  const [meta, setMeta] = useState({ partyName: '', ref: '', footer: s.doc.footer || '' });
  const isStatement = kind === 'statement';
  const sale = !isStatement ? farm.records.find((r) => r.id === id) : null;
  const pName = isStatement ? (party === 'customer' ? names.customer(partyId) : party === 'supplier' ? names.supplier(partyId) : names.person(partyId)) : sale?.customerId ? names.customer(sale.customerId) : t('sale.walkin');
  const lines = useMemo(() => (isStatement ? partyLines(farm, party, partyId) : []), [farm, party, partyId, isStatement]);
  const st = isStatement ? statement(lines, { ...range, hidden, custom }) : null;
  const accountDue = isStatement ? (party === 'customer' ? (compute(farm, { to: range.to }).cust[partyId]?.dueC || 0) - (compute(farm, { to: range.to }).cust[partyId]?.creditBalC || 0) : null) : null;
  const lineDesc = (l) => {
    if (l.custom) return l.desc;
    const map = { opening: t('cash.opening'), sale: t('t.sale'), paidAtSale: t('sale.payNow'), payment: t('t.payment'), paymentKept: `${t('t.payment')} · ${t('pay.keptBy')} ${names.person(l.record?.keptBy)}`, offset: `${t(`c.${l.category}`)} · ${l.desc || ''}`, bill: `${t('sup.bill')} · ${t(`c.${l.category}`)}`, paidAtBill: t('exp.paid'), supplierPay: t('t.supplierPay'), inject: t('pp.inject'), cashOut: t('pp.cashOut'), personal: t('pp.personal'), outOfPocket: `${t('pp.outOfPocket')} · ${t(`c.${l.category}`)}`, supplierFromPocket: `${t('pp.supplier')} · ${names.supplier(l.record?.supplierId)}`, retained: `${t('pp.retained')} · ${names.customer(l.record?.customerId)}` };
    let d = map[l.kind] || l.kind;
    if (l.kind === 'sale') d += ` · ${l.record.lines.map((x) => `${t(`pr.${x.product}`)} ${fmtQty(x.qty)} ${t(`u.${x.unit}`)}`).join('، ')}`;
    return d;
  };
  const no = (r) => docNo(r, s) || `${s.doc.prefix || 'INV-'}${r.id.slice(-6).toUpperCase()}`;
  const isPayment = sale?.type === 'payment';
  const inv = !isStatement && !isPayment && sale ? invoiceRegister(farm, app.snap, { today, termsDays: s.termsDays }).find((x) => x.sale.id === sale.id) : null;
  const cust = sale?.customerId ? farm.customers.find((c) => c.id === sale.customerId) : null;
  const longDate = (d) => dayLabel(d, lang, { day: 'numeric', month: 'long', year: 'numeric' });
  const docTitle = isStatement ? t('cust.statement') : isPayment ? t('doc.paymentReceipt') : kind === 'receipt' ? t('sale.receipt') : t('sale.invoice');
  return (
    <Sheet title={docTitle} sub={!isStatement && sale ? no(sale) : undefined} onClose={onClose} wide
      footer={<div className="foot-btns">{inFrame ? <span className="muted small">{t('printNote')}</span> : <Button variant="primary" icon="print" onClick={() => window.print()}>{t('print')}</Button>}</div>}>
      {isStatement && (
        <div className="doc-controls">
          <Seg small wrap value={period} onChange={(v) => { setPeriod(v); if (v !== 'custom') setRange(periodRange(v, today)); }} options={['month', '30', 'lastMonth', 'year', 'all', 'custom'].map((p) => ({ value: p, label: t(`p.${p}`) }))} />
          {period === 'custom' && <div className="grid2"><DateInput label={t('from')} value={range.from} onChange={(v) => setRange({ ...range, from: v })} /><DateInput label={t('to')} value={range.to} onChange={(v) => setRange({ ...range, to: v })} /></div>}
          <div className="grid2">
            <TextInput label={t('name')} value={meta.partyName} placeholder={pName} onChange={(v) => setMeta({ ...meta, partyName: v })} />
            <TextInput label={t('set.footer')} value={meta.footer} onChange={(v) => setMeta({ ...meta, footer: v })} />
          </div>
          <div className="row-btns">
            <Button size="sm" icon="plus" onClick={() => setCustom([...custom, { day: range.to.startsWith('9999') ? today : range.to, desc: '', chargeC: 0, creditC: 0 }])}>{t('add')}</Button>
            {(hidden.size > 0 || custom.length > 0 || meta.partyName) && <Button size="sm" icon="undo" onClick={() => { setHidden(new Set()); setCustom([]); setMeta({ partyName: '', ref: '', footer: s.doc.footer || '' }); }}>{t('restore')}</Button>}
          </div>
          {custom.map((c, i) => (
            <div className="grid3" key={i}>
              <TextInput label={t('note')} value={c.desc} onChange={(v) => setCustom(custom.map((x, j) => (j === i ? { ...x, desc: v } : x)))} />
              <MoneyInput label={party === 'person' ? t('ppl.owedToThem') : t('cust.due')} cents={c.chargeC} onCents={(v) => setCustom(custom.map((x, j) => (j === i ? { ...x, chargeC: v } : x)))} />
              <MoneyInput label={t('t.payment')} cents={c.creditC} onCents={(v) => setCustom(custom.map((x, j) => (j === i ? { ...x, creditC: v } : x)))} />
            </div>
          ))}
        </div>
      )}
      <article className="print-doc" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <header className="doc-head">
          <div className="doc-farm">
            {s.logo && <img src={s.logo} alt="" className="doc-logo" />}
            <div><b>{s.farmName || t('brand')}</b><div>{[s.farmPhone, s.farmAddress].filter(Boolean).join(' · ')}</div>{s.tax.enabled && s.tax.number && <div>{t('set.taxNumber')}: {s.tax.number}</div>}</div>
          </div>
          <div className="doc-title">
            <h1>{docTitle}</h1>
            <div className="num">{isStatement ? `${dayLabel(range.from, lang, { day: 'numeric', month: 'short', year: 'numeric' })} – ${dayLabel(range.to.startsWith('9999') ? today : range.to, lang, { day: 'numeric', month: 'short', year: 'numeric' })}` : <b className="doc-no">{no(sale)}</b>}</div>
          </div>
        </header>
        {!isStatement && (
          <div className="doc-meta">
            <div className="doc-billto">
              <span className="doc-lbl">{isPayment ? t('doc.receivedFrom') : t('doc.billTo')}</span>
              <b>{meta.partyName || pName}</b>
              {cust?.phone && <span className="num">{cust.phone}</span>}
              {cust?.accountNo && <span className="num">{t('doc.account')} {cust.accountNo}</span>}
            </div>
            <dl className="doc-facts">
              <dt>{isPayment ? t('doc.receiptNo') : t('doc.invoiceNo')}</dt><dd className="num">{no(sale)}</dd>
              <dt>{t('doc.issued')}</dt><dd>{longDate(sale.day)}</dd>
              {inv && sale.customerId && <><dt>{t('doc.due')}</dt><dd>{longDate(inv.dueDay)}</dd></>}
              {isPayment && sale.keptBy && <><dt>{t('pay.keptBy')}</dt><dd>{names.person(sale.keptBy)}</dd></>}
            </dl>
          </div>
        )}
        {isStatement && s.doc.showParty !== false && <div className="doc-party"><span className="muted">{party === 'supplier' ? t('exp.supplier') : party === 'person' ? t('cap.person') : t('sale.customer')}</span> <b>{meta.partyName || pName}</b></div>}
        {isStatement ? (
          <table className="doc-table">
            <thead><tr><th>{t('date')}</th><th>{t('details')}</th><th className="num">{party === 'person' ? t('in') : party === 'supplier' ? t('sup.bill') : t('t.sale')}</th><th className="num">{party === 'person' ? t('out') : t('t.payment')}</th><th className="num">{t('balance')}</th><th className="no-print" /></tr></thead>
            <tbody>
              <tr className="doc-open"><td colSpan={4}>{t('cash.opening')}</td><td className="num">{fmt(st.openingC)}</td><td className="no-print" /></tr>
              {st.rows.map((r) => (
                <tr key={r.key}>
                  <td className="num">{r.day.startsWith('0000') ? '—' : r.day}</td><td>{lineDesc(r)}</td>
                  <td className="num">{r.chargeC ? fmt(r.chargeC) : ''}</td><td className="num">{r.creditC ? fmt(r.creditC) : ''}</td><td className="num">{fmt(r.balanceC)}</td>
                  <td className="no-print">{!r.custom && <IconButton icon="close" label={t('close')} onClick={() => setHidden(new Set([...hidden, r.key]))} />}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2}>{t('cash.closing')}</td><td className="num">{fmt(st.chargesC)}</td><td className="num">{fmt(st.creditsC)}</td><td className="num"><b>{fmt(st.closingC)}</b></td><td className="no-print" /></tr></tfoot>
          </table>
        ) : isPayment ? (
          <>
            <table className="doc-table">
              <thead><tr><th>{t('details')}</th><th className="num">{t('amount')}</th></tr></thead>
              <tbody>
                {sale.cashC > 0 && <tr><td>{t('doc.cashReceived')}</td><td className="num">{fmt(sale.cashC)}</td></tr>}
                {(sale.offsets || []).map((o, i) => <tr key={i}><td>{t('doc.paidForUs')} · {t(`c.${o.category}`)}{o.desc ? ` · ${o.desc}` : ''}</td><td className="num">{fmt(o.amountC)}</td></tr>)}
              </tbody>
            </table>
            <div className="doc-totals">
              <div className="grand"><span>{t('doc.totalCredited')}</span><span className="num">{fmt((sale.cashC || 0) + (sale.offsets || []).reduce((a, o) => a + o.amountC, 0))}</span></div>
              {sale.customerId && (() => { const c = compute(farm, { to: sale.day }).cust[sale.customerId] || {}; return <div><span>{t('doc.balanceAfter', { d: longDate(sale.day) })}</span><span className="num">{c.creditBalC ? `${t('st.credit')} ${fmt(c.creditBalC)}` : fmt(c.dueC || 0)}</span></div>; })()}
            </div>
            <div className="doc-stamp paid">{t('doc.received')}</div>
          </>
        ) : (
          <>
            <table className="doc-table">
              <thead><tr><th className="num">#</th><th>{t('sale.product')}</th><th className="num">{t('qty')}</th><th className="num">{t('price')}</th><th className="num">{t('total')}</th></tr></thead>
              <tbody>{sale.lines.map((l, i) => <tr key={i}><td className="num muted">{i + 1}</td><td>{t(`pr.${l.product}`)}</td><td className="num">{fmtQty(l.qty)} {t(`u.${l.unit}`)}</td><td className="num">{l.direct ? '' : fmt(l.priceC)}</td><td className="num">{fmt(l.amountC)}</td></tr>)}</tbody>
            </table>
            <div className="doc-totals">
              <div><span>{t('doc.subtotal')}</span><span className="num">{fmt(sale.lines.reduce((a, l) => a + (l.amountC || 0), 0))}</span></div>
              {sale.discountC > 0 && <div><span>{t('sale.discount')}{sale.discount?.reason ? ` · ${sale.discount.reason}` : ''}</span><span className="num">−{fmt(sale.discountC)}</span></div>}
              {sale.taxC > 0 && <div><span>{lang === 'ar' ? s.tax.labelAr : s.tax.label} {s.tax.rate}%{s.tax.inclusive ? ` (${t('doc.included')})` : ''}</span><span className="num">{fmt(sale.taxC)}</span></div>}
              <div className="grand"><span>{t('total')}</span><span className="num">{fmt(sale.totalC)}</span></div>
              {inv && <div><span>{t('doc.paidToDate')}</span><span className="num">{fmt(inv.paidC)}</span></div>}
              {sale.tenderC > sale.totalC && <div><span>{t('sale.change')}</span><span className="num">{fmt(sale.tenderC - sale.totalC)}</span></div>}
              {inv && inv.dueC > 0 && <div className="doc-due"><span>{t('doc.balanceDue')}</span><span className="num">{fmt(inv.dueC)}</span></div>}
            </div>
            {inv && <div className={`doc-stamp ${inv.status}`}>{t(`st.${inv.status}`)}</div>}
          </>
        )}
        {isStatement && accountDue != null && range.to >= today && Math.abs(accountDue - st.closingC) > 0 && hidden.size === 0 && custom.length === 0 && <div className="note warn no-print">≠ {fmt(accountDue)}</div>}
        <footer className="doc-foot">
          {s.doc.thanks && <p>{s.doc.thanks}</p>}
          {(meta.footer || s.doc.footer) && <p className="muted">{meta.footer || s.doc.footer}</p>}
          {s.doc.signatures && <div className="sigs"><span>{t('by')}</span><span>{party === 'supplier' ? t('exp.supplier') : t('sale.customer')}</span></div>}
        </footer>
      </article>
    </Sheet>
  );
}
