import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkthroughFarm } from './fixtures/old-walkthrough.mjs';
import { importLegacy, isLegacyFarm } from '../src/core/legacy.mjs';
import { readBackup } from '../src/core/backup.mjs';
import { compute } from '../src/core/ledger.mjs';
import { partyLines, statement } from '../src/core/statement.mjs';
import { supplierBills, customerInvoices } from '../src/core/ledger.mjs';
import { hashCode } from '../src/core/security.mjs';

const NOW = Date.parse('2026-10-20T12:00:00');
const fails = (r) => r.checks.filter((c) => !c.ok).map((c) => `${c.key} ${c.name}: old ${c.oldC} new ${c.newC}`);

test('2.x walkthrough farm restores with every balance matching', () => {
  const old = buildWalkthroughFarm({ now: NOW });
  assert.ok(isLegacyFarm(old));
  const env = { app: 'mazraati', kind: 'farm-backup', exportedAt: '2026-10-20T12:00:00Z', farm: old };
  const res = readBackup(JSON.stringify(env), { lang: 'en' });
  assert.equal(res.ok, true);
  assert.equal(res.legacy, true);
  const { farm, report } = res;
  assert.deepEqual(fails(report), []);
  assert.equal(report.exportedAt, '2026-10-20T12:00:00Z');
  assert.equal(farm.animals.length, 7);
  assert.equal(farm.customers.length, 4);
  assert.equal(farm.suppliers.length, 3);
  const s = compute(farm);
  // Abu Ali paid each sale at the counter: three sales, no separate payments, nothing owed.
  assert.equal(s.cust['demo-cust-ali'].dueC || 0, 0);
  assert.equal(farm.records.filter((r) => r.type === 'payment' && r.customerId === 'demo-cust-ali').length, 0);
  assert.equal(farm.records.find((r) => r.id === 'demo-sale-ali-1').paidNowC, 960);
  // Super Bekaa: 2 × $18 sales, $9 paid later → $27 owed, one standalone payment.
  assert.equal(s.cust['demo-cust-bekaa'].dueC, 2700);
  // Suppliers: unpaid feed bill $175, vet partial $95 − $40.
  assert.equal(s.sup['demo-sup-feed'].dueC, 17500);
  assert.equal(s.sup['demo-sup-vet'].dueC, 5500);
  const vet = supplierBills(farm, 'demo-sup-vet').bills[0];
  assert.equal(vet.status, 'partial');
  // Milk: 14 days of am/pm bulk rows; eggs per flock; attendance; medicine cost leaves the box.
  assert.equal(farm.records.filter((r) => r.type === 'milk').length, 28);
  assert.equal(s.eggs.collected, farm.records.filter((r) => r.type === 'eggs').reduce((a, r) => a + r.count, 0));
  assert.ok(s.expenses.some((e) => e.category === 'medicine' && e.amountC === 1800));
  // Breeding: served dates carried onto the animal.
  assert.equal(farm.animals.find((a) => a.id === 'demo-cow-102').repro.check, 'pregnant');
  assert.equal(farm.animals.find((a) => a.id === 'demo-cow-101').breed, 'Holstein');
  // Statements still match the account card.
  for (const c of farm.customers) {
    const st = statement(partyLines(farm, 'customer', c.id));
    assert.equal(st.closingC, (s.cust[c.id]?.dueC || 0) - (s.cust[c.id]?.creditBalC || 0));
  }
  // History-only rows are kept, not lost.
  assert.ok(report.kept.customerAdd >= 4);
  assert.equal(farm.legacyArchive.length, report.skipped);
});

/** Every money path the 2.x app could store. */
function richOld() {
  const at = (d, h = 10) => `2026-09-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00`;
  const by = { byId: 'p1', byName: 'Basem' };
  return {
    version: 3,
    settings: { rate: 89500, milkPrice: 0.5, eggPrice: 0.2, wage: 15, farmName: 'Hill Farm', milkMode: 'total', milkUnit: 'kg',
      categories: [{ key: 'c-vetvisit', ar: 'زيارة طبيب', en: 'Vet visit', icon: '🩺', group: 'feedLive' }],
      tax: { enabled: true, ratePct: 11, invoicePrefix: 'HF-' }, docTpl: { thanks: 'Thanks', footerNote: 'Bekaa' } },
    profiles: [{ id: 'p1', name: 'Basem', role: 'owner', emoji: '👨‍🌾', pin: null, salt: null }],
    customers: [{ id: 'c1', name: 'Ahmad', phone: '1', priceL: 0.5 }, { id: 'c2', name: 'Hanan' }, { id: 'cust-walkin', kind: 'walkin', name: 'Walk-in' }],
    suppliers: [{ id: 's1', name: 'Feed Co', tags: ['feed'], openingBalance: 300, openingAt: at(1) }, { id: 's2', name: 'Vet', tags: ['med'] }],
    funders: [{ id: 'm1', name: 'Khaled' }],
    managers: [],
    animals: [{ id: 'a1', species: 'cow', tag: '7', breed: 'jersey', status: 'lactating' }, { id: 'f1', species: 'chicken', tag: '', name: 'North coop', birds: 50 }],
    workers: [{ id: 'w1', name: 'Samir', type: 'daily' }, { id: 'w2', name: 'Youssef', type: 'monthly', salary: 400 }],
    obligations: [{ id: 'o1', type: 'rent', title: 'Land', party: 'Abu Nabil', amount: 200, frequency: 'monthly', nextDue: '2026-10-05', active: true }],
    entries: [
      { id: 'm-am', type: 'milkBulk', session: 'am', liters: 51.5, kg: 53.05, unit: 'kg', at: at(2, 6), ...by },
      { id: 'm-old-kg', type: 'milkBulk', session: 'pm', liters: 41.2, unit: 'kg', at: at(2, 17), ...by },
      { id: 'm-a1', type: 'milk', animalId: 'a1', session: 'am', liters: 9, at: at(3, 6), ...by },
      // Walk-in counter sale with change.
      { id: 'sale-w', type: 'sale', product: 'milk', qty: 10, unit: 'L', price: 1, amount: 10, oneTime: true, channel: 'pos', at: at(2, 9), ...by },
      { id: 'pay-w', type: 'payment', saleId: 'sale-w', amount: 10, amount_cash: 10, tenderAmount: 20, changeAmount: 10, method: 'cash', oneTime: true, channel: 'pos', at: at(2, 9), ...by },
      // Account sale with discount, partly paid at counter by card.
      { id: 'sale-1', type: 'sale', customerId: 'c1', product: 'cheese', qty: 2, unit: 'kg', price: 8, amount: 16, discountAmount: 1, at: at(4), ...by },
      { id: 'pay-1', type: 'payment', customerId: 'c1', saleId: 'sale-1', amount: 5, amount_cash: 5, method: 'card', at: at(4), ...by },
      // Later account payment with a fuel offset (customer paid diesel for us).
      { id: 'pay-2', type: 'payment', customerId: 'c1', amount: 4, amount_cash: 4, amount_expense_offset: 3, total_credited: 7, method: 'cash', at: at(6), ...by },
      { id: 'exp-off', type: 'expense', category: 'fuel', amount: 3, paidAmount: 3, payStatus: 'paid', customerId: 'c1', paymentId: 'pay-2', origin: 'payment_reimbursement', kind: 'DEDUCTION_REIMBURSEMENT', note: 'Diesel', at: at(6), ...by },
      // Legacy sale reimbursement on Hanan's sale and its customer-paid expense.
      { id: 'sale-2', type: 'sale', customerId: 'c2', product: 'eggs', qty: 60, unit: 'eggs', price: 0.25, amount: 15, at: at(5), ...by },
      { id: 'reimb-1', type: 'saleReimburse', saleId: 'sale-2', amount: 2.5, name: 'Egg trays', at: at(5), ...by },
      { id: 'exp-reimb', type: 'expense', category: 'packaging', amount: 2.5, paidBy: 'customer', saleReimburseId: 'reimb-1', at: at(5), ...by },
      // Payment kept by a manager.
      { id: 'pay-kept', type: 'payment', customerId: 'c2', amount: 5, amount_cash: 5, retainedBy: 'manager', funderId: 'm1', at: at(7), ...by },
      // Supplier bills: paid old bill with no supplierPay (implied), partial bill with a linked pay, opening paid by manager.
      { id: 'bill-old', type: 'expense', supplierId: 's1', category: 'feed', amount: 100, payStatus: 'paid', at: at(3), ...by },
      { id: 'bill-2', type: 'expense', supplierId: 's1', category: 'hay', amount: 80, payStatus: 'partial', paidAmount: 30, dueDate: '2026-09-20', at: at(8), ...by },
      { id: 'sp-2', type: 'supplierPay', supplierId: 's1', expenseId: 'bill-2', amount: 30, method: 'cash', at: at(8), ...by },
      { id: 'sp-open', type: 'supplierPay', supplierId: 's1', expenseId: 'opening-s1', amount: 120, paidBy: 'manager', managerId: 'm1', at: at(9), ...by },
      { id: 'bill-vet', type: 'expense', supplierId: 's2', category: 'service', amount: 40, payStatus: 'unpaid', at: at(9), ...by },
      { id: 'sp-acct', type: 'supplierPay', supplierId: 's2', amount: 50, method: 'transfer', at: at(10), ...by },
      // Farm expenses: plain, partial, owner-funded, manager out of pocket, cash take, old feed type, custom category.
      { id: 'e-fuel', type: 'expense', category: 'fuel', amount: 20, payStatus: 'paid', vendor: 'Station', at: at(3), ...by },
      { id: 'e-part', type: 'expense', category: 'electricity', amount: 60, payStatus: 'partial', paidAmount: 25, at: at(4), ...by },
      { id: 'e-owner', type: 'expense', category: 'feed', amount: 150, payStatus: 'paid', fundedBy: 'owner', funderId: 'm1', at: at(5), ...by },
      { id: 'e-oop', type: 'expense', category: 'transport', amount: 12, payStatus: 'paid', fundedBy: 'manager', managerId: 'm1', at: at(6), ...by },
      { id: 'e-take', type: 'expense', category: 'fuel', amount: 18, payStatus: 'paid', origin: 'cash_take', takenBy: 'm1', at: at(7), ...by },
      { id: 'e-feedtype', type: 'feed', cost: 35, at: at(8), ...by },
      { id: 'e-custom', type: 'expense', category: 'c-vetvisit', amount: 25, payStatus: 'unpaid', dueDate: '2026-10-01', at: at(9), ...by },
      // Capital in and out.
      { id: 'own-in', type: 'ownerFund', amount: 1000, funderId: 'm1', purpose: 'Season', at: at(1), ...by },
      { id: 'own-out', type: 'ownerFundWithdraw', amount: 200, contributorLabel: 'Khaled', at: at(12), ...by },
      // Medicine with cost; milk use; eggs; attendance; herd events; history rows.
      { id: 'med-1', type: 'med', animalId: 'a1', medType: 'vitamin', name: 'AD3E', cost: 7, at: at(4), ...by },
      { id: 'use-1', type: 'milkUse', liters: 5, reason: 'calves', at: at(3, 18), ...by },
      { id: 'use-2', type: 'milkUse', liters: 2, reason: 'custom:Cheese making', at: at(3, 19), ...by },
      { id: 'egg-1', type: 'eggs', animalId: 'f1', count: 40, broken: 2, at: at(3), ...by },
      { id: 'att-1', type: 'attend', workerId: 'w1', present: true, at: at(3), ...by },
      { id: 'birth-1', type: 'birth', animalId: 'a1', count: 2, males: 1, females: 1, dead: 0, at: at(10), ...by },
      { id: 'note-1', type: 'customerAdd', customerId: 'c1', at: at(1), ...by },
    ],
    archive: [
      { id: 'arch-milk', type: 'milkBulk', session: 'day', liters: 30, at: '2026-08-30T08:00:00', archivedAt: '2026-09-30', ...by },
      { id: 'm-am', type: 'milkBulk', session: 'am', liters: 51.5, kg: 53.05, unit: 'kg', at: at(2, 6), ...by },
    ],
  };
}

test('every 2.x money path lands in the right place and reconciles', () => {
  const { farm, report } = importLegacy(richOld(), { lang: 'en' });
  assert.deepEqual(fails(report), []);
  const s = compute(farm);
  const rec = (id) => farm.records.find((r) => r.id === id);
  // Walk-in: payment folded into the sale with tender and change.
  assert.equal(rec('sale-w').customerId, null);
  assert.equal(rec('sale-w').paidNowC, 1000);
  assert.equal(rec('sale-w').tenderC, 2000);
  assert.equal(rec('pay-w'), undefined);
  assert.equal(farm.customers.some((c) => c.id === 'cust-walkin'), false);
  // Card payment at the counter goes to the bank; the old single drawer equals cash + bank.
  assert.equal(rec('sale-1').paidNowC, 500);
  assert.equal(rec('sale-1').method, 'card');
  assert.equal(rec('sale-1').totalC, 1500);
  const cashCheck = report.checks.find((c) => c.key === 'cash');
  assert.equal(cashCheck.oldC, s.cashC + s.bankC);
  // Customer-paid diesel became an offset on the payment, not a drawer movement.
  assert.deepEqual(rec('pay-2').offsets, [{ category: 'fuel', amountC: 300, desc: 'Diesel' }]);
  assert.equal(rec('exp-off'), undefined);
  // Ahmad: 15 − 5 − 4 − 3 = 3 owed.
  assert.equal(s.cust.c1.dueC, 300);
  // Hanan: 15 − 2.5 (trays) − 5 (kept by Khaled) = 7.5; Khaled now holds that cash.
  assert.equal(s.cust.c2.dueC, 750);
  assert.equal(rec('pay-kept').keptBy, 'm1');
  assert.equal(rec('exp-reimb'), undefined);
  // Suppliers: opening 300 − 120 (Khaled) + 100 − 100 (implied) + 80 − 30 = 230; vet 40 − 50 = 10 credit.
  assert.equal(s.sup.s1.dueC, 23000);
  assert.equal(rec('implied-bill-old').amountC, 10000);
  assert.equal(rec('sp-open').source, 'person');
  assert.equal(rec('sp-open').billId, 'opening-s1');
  assert.equal(s.sup.s2.creditBalC, 1000);
  assert.equal(rec('sp-acct').source, 'bank');
  // Khaled: +1000 in, +120 supplier, +12 out of pocket, −5 kept, −18 cash take, −200 withdrawn = 909.
  assert.equal(s.people.m1.owedC, 90900);
  assert.equal(rec('e-oop').source, 'person');
  assert.equal(rec('e-take').takenBy, 'm1');
  assert.equal(rec('e-owner').capital, true);
  // Capital: 1000 − 150 owner-funded − 200 withdrawn = 650.
  assert.equal(s.capitalC, 65000);
  // Categories and old types.
  assert.equal(rec('bill-vet').category, 'servicing');
  assert.equal(rec('e-feedtype').category, 'feed');
  assert.equal(rec('e-feedtype').amountC, 3500);
  assert.equal(rec('e-custom').category, 'c-vetvisit');
  assert.equal(rec('e-part').paidC, 2500);
  // Milk: canonical litres kept; a legacy kg value in the litres field is converted; archive is merged without duplicates.
  assert.equal(rec('m-am').liters, 51.5);
  assert.equal(rec('m-old-kg').liters, 40);
  assert.equal(farm.records.filter((r) => r.id === 'm-am').length, 1);
  assert.equal(rec('arch-milk').session, 'day');
  assert.equal(rec('use-2').reason, 'other');
  assert.equal(rec('use-2').note, 'Cheese making');
  // Herd, workers, settings.
  assert.equal(rec('med-1').kind, 'vitamins');
  assert.equal(rec('egg-1').flockId, 'f1');
  assert.equal(rec('birth-1').data.birth, 'twins');
  assert.equal(farm.animals.find((a) => a.id === 'f1').tag, 'North coop');
  assert.equal(farm.workers.find((w) => w.id === 'w1').wageC, 1500);
  assert.equal(farm.workers.find((w) => w.id === 'w2').pay, 'monthly');
  assert.equal(farm.obligations[0].party, 'Land · Abu Nabil');
  assert.equal(farm.settings.second.rate, 89500);
  assert.equal(farm.settings.tax.rate, 11);
  assert.equal(farm.settings.doc.prefix, 'HF-');
  assert.equal(farm.settings.milkUnit, 'kg');
  assert.equal(farm.people[0].name, 'Khaled');
  assert.equal(report.kept.customerAdd, 1);
  // Days follow the original local date; author and time are preserved.
  assert.equal(rec('sale-1').day, '2026-09-04');
  assert.equal(rec('sale-1').createdByName, 'Basem');
  // Statements match accounts for every party.
  for (const id of ['c1', 'c2']) assert.equal(statement(partyLines(farm, 'customer', id)).closingC, (s.cust[id]?.dueC || 0) - (s.cust[id]?.creditBalC || 0));
  for (const id of ['s1', 's2']) assert.equal(statement(partyLines(farm, 'supplier', id)).closingC, (s.sup[id]?.dueC || 0) - (s.sup[id]?.creditBalC || 0));
  assert.equal(statement(partyLines(farm, 'person', 'm1')).closingC, s.people.m1.owedC);
  assert.equal(customerInvoices(farm, 'c1', s)[0].status, 'partial');
});

test('2.x passcodes keep working after restore', async () => {
  const old = richOld();
  old.profiles[0].salt = 'abc';
  old.profiles[0].pin = await hashCode('2468', 'abc');
  const { farm, report } = importLegacy(old);
  const p = farm.profiles[0];
  assert.equal(await hashCode('2468', p.salt), p.passHash);
  assert.ok(report.warnings.some((w) => w.code === 'pinsKept'));
});
