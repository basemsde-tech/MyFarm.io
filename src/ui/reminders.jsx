import React, { useMemo, useState } from 'react';
import { useApp } from './store.jsx';
import { Button, Icon, Pill, Empty, Stat, Seg, Sheet, TextArea, dayLabel } from './kit.jsx';
import { overdueCustomers, reminderText, logReminder } from '../core/messages.mjs';
import { docNo } from '../core/accounts.mjs';
import { openWhatsApp } from './share.jsx';

export function useOverdue() {
  const { farm, snap, today } = useApp();
  return useMemo(() => overdueCustomers(farm, snap, { today, termsDays: farm.settings.termsDays ?? 30, remindAfterDays: farm.settings.messaging?.remindAfterDays || 7 }), [farm, snap, today]);
}

/** Sales → Reminders: who is late, how much, when they were last reminded. */
export function RemindersPanel() {
  const { t, fmt, lang, ui, nav } = useApp();
  const rows = useOverdue();
  const [show, setShow] = useState('due');
  const list = rows.filter((r) => show === 'all' || r.remindNow);
  const total = rows.reduce((s, r) => s + r.overdueC, 0);
  const since = (r) => (r.last ? new Date(r.last.at).toLocaleDateString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' }) : null);
  return (
    <>
      <section className="stats-row">
        <Stat label={t('rem.late')} value={String(rows.length)} />
        <Stat label={t('rem.overdue')} value={fmt(total)} tone={total ? 'out' : null} />
        <Stat label={t('rem.dueNow')} value={String(rows.filter((r) => r.remindNow).length)} onClick={() => setShow('due')} />
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>{t('rem.title')}</h2>
          <Seg small value={show} onChange={setShow} options={[{ value: 'due', label: t('rem.toSend') }, { value: 'all', label: t('all') }]} />
        </div>
        <p className="muted small">{t('rem.hint', { n: rows[0] ? '' : '' })}</p>
        {list.length ? (
          <ul className="rem-list">
            {list.map((r) => (
              <li key={r.customer.id} className="rem">
                <button type="button" className="rem-main" onClick={() => nav('sales', r.customer.id)}>
                  <b>{r.customer.name}</b>
                  <span className="muted small">{r.invoices.length ? t('rem.invoices', { n: r.invoices.length }) : t('c.opening')}{r.daysLate != null ? ` · ${t('rem.daysLate', { n: r.daysLate })}` : ''}</span>
                  <span className="small">{r.last ? t('rem.lastSent', { d: since(r), by: r.last.byName, c: t(`rem.ch.${r.last.channel}`) }) : <span className="muted">{t('rem.never')}</span>}</span>
                </button>
                <div className="rem-amt"><b className="num out">{fmt(r.overdueC)}</b>{r.dueC > r.overdueC && <span className="muted small num">{t('rem.ofTotal', { a: fmt(r.dueC) })}</span>}</div>
                <div className="rem-act">
                  <Button size="sm" variant={r.remindNow ? 'primary' : 'quiet'} icon="whatsapp" onClick={() => ui.open('reminder', { customerId: r.customer.id })}>{t('rem.send')}</Button>
                  <Button size="sm" icon="file" onClick={() => ui.open('doc', { kind: 'statement', party: 'customer', partyId: r.customer.id })}>{t('cust.statement')}</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty title={rows.length ? t('rem.allSent') : t('rem.none')} icon="check" />}
      </section>
    </>
  );
}

/** Review and send one reminder (WhatsApp, or log a call / visit). */
export function ReminderSheet({ customerId, onClose }) {
  const { farm, t, fmt, lang, commit, actor } = useApp();
  const rows = useOverdue();
  const row = rows.find((r) => r.customer.id === customerId);
  const [text, setText] = useState(() => (row ? reminderText({ farm, row, t, fmt, lang, number: (s) => docNo(s, farm.settings) }) : ''));
  if (!row) return <Sheet title={t('rem.send')} onClose={onClose}><Empty title={t('rem.none')} icon="check" /></Sheet>;
  const log = (channel) => commit((f) => logReminder(f, customerId, { actor, channel, amountC: row.overdueC }), { label: t('rem.logged'), undoable: false });
  const phone = row.customer.phone;
  return (
    <Sheet title={`${t('rem.send')} · ${row.customer.name}`} sub={`${fmt(row.overdueC)} · ${row.daysLate != null ? t('rem.daysLate', { n: row.daysLate }) : ''}`} onClose={onClose}
      footer={<div className="foot-btns">
        <Button onClick={() => { log('call'); onClose(); }}>{t('rem.loggedCall')}</Button>
        <Button variant="primary" icon="whatsapp" className="btn-wa" disabled={!text.trim()} onClick={() => { openWhatsApp(phone, text, farm.settings.messaging?.countryCode); log('whatsapp'); onClose(); }}>{t('share.whatsapp')}</Button>
      </div>}>
      {!phone && <div className="note warn"><Icon name="alert" size={16} />{t('rem.noPhone')}</div>}
      <TextArea label={t('rem.message')} value={text} onChange={setText} rows={12} />
      {(row.customer.reminders || []).length > 0 && (
        <div className="sub-sec">
          <h3>{t('rem.history')}</h3>
          <ul className="rem-hist">
            {[...row.customer.reminders].reverse().slice(0, 10).map((h) => (
              <li key={h.at}><span className="num">{dayLabel(h.at.slice(0, 10), lang, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>{t(`rem.ch.${h.channel}`)}</span><span className="num">{fmt(h.amountC || 0)}</span><span className="muted">{h.byName}</span></li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
