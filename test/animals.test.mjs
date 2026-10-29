import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFarm, addRecord, editRecord, deleteRecords, restoreRecords, voidSale, unvoidSale, upsert } from '../src/core/commands.mjs';
import { animalSaleInfo, soldRegister } from '../src/core/animals.mjs';
import { deleteMaster, setArchived } from '../src/core/removal.mjs';
import { normalise } from '../src/core/backup.mjs';

const owner = { id: 'o', name: 'Owner', role: 'owner' };
function farmWithCow() {
  let f = emptyFarm();
  f = upsert(f, 'customers', { id: 'c1', name: 'Butcher', accountNo: 'C-0001' }, owner);
  f = upsert(f, 'animals', { id: 'a1', species: 'cow', tag: '101', name: 'Zahra', breed: 'Holstein', status: 'lactating', dob: '2022-03-01', source: 'bought', priceC: 80000, weight: 520 }, owner);
  f = addRecord(f, { type: 'medicine', day: '2026-02-01', animalId: 'a1', kind: 'vaccine', costC: 1500 }, owner);
  f = addRecord(f, { type: 'milk', day: '2026-02-02', animalId: 'a1', species: 'cow', session: 'day', liters: 20 }, owner);
  f = addRecord(f, { type: 'animalEvent', day: '2026-03-01', animalId: 'a1', kind: 'weight', data: { weight: 545 } }, owner);
  return f;
}
const sale = (extra = {}) => ({ type: 'sale', day: '2026-03-10', customerId: 'c1', lines: [{ product: 'animal', qty: 1, unit: 'head', priceC: 120000, amountC: 120000 }], discountC: 0, taxC: 0, totalC: 120000, paidNowC: 120000, method: 'cash', animalId: 'a1', ...extra });

test('a sale naming an animal marks it sold and keeps the full sale record', () => {
  const f = addRecord(farmWithCow(), sale(), owner);
  const a = f.animals.find((x) => x.id === 'a1');
  assert.equal(a.status, 'sold');
  assert.equal(a.prevStatus, 'lactating');
  assert.equal(a.sold.priceC, 120000);
  assert.equal(a.sold.no, 1);
  const i = animalSaleInfo(f, a);
  assert.equal(i.day, '2026-03-10');
  assert.equal(i.customerId, 'c1');
  assert.equal(i.weightKg, 545, 'weight from the last weigh-in before the sale');
  assert.equal(i.ageDays, 1470);
  assert.equal(i.purchaseC, 80000);
  assert.equal(i.treatC, 1500);
  assert.equal(i.milkL, 20);
  assert.equal(i.gainC, 120000 - 80000 - 1500);
  assert.equal(soldRegister(f).length, 1);
});

test('deleting or voiding the sale puts the animal back; restoring sells it again', () => {
  let f = addRecord(farmWithCow(), sale(), owner);
  const id = f.records.find((r) => r.type === 'sale').id;
  const status = (x) => x.animals.find((a) => a.id === 'a1').status;
  f = deleteRecords(f, [id], owner, 'mistake');
  assert.equal(status(f), 'lactating');
  f = restoreRecords(f, [id], owner);
  assert.equal(status(f), 'sold');
  f = voidSale(f, id, 'restore', 'returned', owner);
  assert.equal(status(f), 'lactating');
  f = unvoidSale(f, id, owner);
  assert.equal(status(f), 'sold');
  const g = voidSale(f, id, 'writeoff', 'died in transport', owner);
  assert.equal(status(g), 'sold', 'a write-off void means the animal still left');
});

test('editing the price updates the record; moving the sale to another animal frees the first', () => {
  let f = addRecord(farmWithCow(), sale(), owner);
  f = upsert(f, 'animals', { id: 'a2', species: 'cow', tag: '102', status: 'healthy' }, owner);
  const id = f.records.find((r) => r.type === 'sale').id;
  f = editRecord(f, id, { lines: [{ product: 'animal', qty: 1, unit: 'head', priceC: 110000, amountC: 110000 }], totalC: 110000, paidNowC: 110000 }, owner, 'agreed lower');
  assert.equal(f.animals.find((a) => a.id === 'a1').sold.priceC, 110000);
  f = editRecord(f, id, { animalId: 'a2' }, owner, 'wrong cow');
  assert.equal(f.animals.find((a) => a.id === 'a1').status, 'lactating');
  assert.equal(f.animals.find((a) => a.id === 'a2').status, 'sold');
});

test('sold animals cannot be deleted, only archived, and stay in the register', () => {
  let f = addRecord(farmWithCow(), sale(), owner);
  assert.throws(() => deleteMaster(f, 'animals', 'a1', owner, { mode: 'only' }), /soldAnimalKept/);
  f = setArchived(f, 'animals', 'a1', true, owner);
  assert.equal(soldRegister(f).length, 1);
});

test('loading a farm fills in the sale record for animals sold before this version', () => {
  let f = addRecord(farmWithCow(), sale(), owner);
  f = { ...f, animals: f.animals.map((a) => { const { sold, ...rest } = a; return rest; }) };
  const n = normalise(f);
  assert.equal(n.animals.find((a) => a.id === 'a1').sold.priceC, 120000);
});
