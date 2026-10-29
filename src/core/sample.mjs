// A realistic sample farm for the walkthrough. Built through the same commands as real entries.
import { emptyFarm, addRecord, upsert } from './commands.mjs';
import { saleTotals, compute } from './ledger.mjs';
import { isoDay, addDays } from './species.mjs';

function rng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function sampleFarm(lang = 'ar', today = isoDay(), days = 40) {
  const ar = lang === 'ar';
  const R = rng(42);
  const vary = (base, spread) => Math.round((base + (R() - 0.5) * spread) * 10) / 10;
  let f = emptyFarm();
  f.settings = { ...f.settings, farmName: ar ? 'مزرعة الوادي' : 'Valley Farm', farmPhone: '+961 70 123 456', farmAddress: ar ? 'البقاع، زحلة' : 'Bekaa, Zahle',
    milkPriceC: 100, eggPriceC: 15, second: { code: 'LBP', rate: 89500 }, setupDone: true, demo: true, doc: { ...f.settings.doc, thanks: ar ? 'شكرًا لتعاملكم معنا' : 'Thank you for your business' } };
  const owner = { id: 'pro-demo-owner', name: ar ? 'باسم' : 'Basem', role: 'owner', avatar: '👨‍🌾', color: '#CFE3DA' };
  const book = { id: 'pro-demo-book', name: ar ? 'رنا' : 'Rana', role: 'book', avatar: '👩', color: '#F1DFB4' };
  const milker = { id: 'pro-demo-milker', name: ar ? 'علي' : 'Ali', role: 'milker', avatar: '🧔', color: '#D3DDE7' };
  f.profiles = [owner, book, milker];
  const start = addDays(today, -days);
  const at = (day, h) => new Date(`${day}T${String(h).padStart(2, '0')}:${String(Math.floor(R() * 50) + 5).padStart(2, '0')}:00`).getTime();

  f = upsert(f, 'people', { id: 'm-owner', name: owner.name, phone: '+961 70 123 456' }, owner);
  f = upsert(f, 'people', { id: 'm-khaled', name: ar ? 'خالد' : 'Khaled', phone: '+961 71 555 210' }, owner);
  f = upsert(f, 'customers', { id: 'c-fadi', accountNo: 'C-0001', name: ar ? 'ألبان أبو فادي' : 'Abu Fadi Dairy', phone: '+961 3 444 120', defaultPriceC: 85, defaultQty: 140 }, owner);
  f = upsert(f, 'customers', { id: 'c-hanan', accountNo: 'C-0002', name: ar ? 'متجر حنان' : "Hanan's Shop", phone: '+961 76 220 981', defaultPriceC: 100 }, owner);
  f = upsert(f, 'customers', { id: 'c-shams', accountNo: 'C-0003', name: ar ? 'مطعم شمس' : 'Shams Restaurant', phone: '+961 81 330 117', defaultPriceC: 95, openingC: 12000 }, owner);
  f = upsert(f, 'suppliers', { id: 's-feed', name: ar ? 'شركة أعلاف البقاع' : 'Bekaa Feed Co', tags: ['feed'], openingC: 45000 }, owner);
  f = upsert(f, 'suppliers', { id: 's-vet', name: ar ? 'صيدلية الريف البيطرية' : 'Rural Vet Pharmacy', tags: ['medicine'] }, owner);
  const cows = [
    ['101', ar ? 'زهرة' : 'Zahra', 'Holstein', 'lactating', 3], ['102', ar ? 'غزالة' : 'Ghazale', 'Holstein', 'lactating', 2], ['103', ar ? 'شامة' : 'Shama', 'Friesian', 'pregnant', 4],
    ['104', ar ? 'قمر' : 'Amar', 'Jersey', 'lactating', 1], ['105', ar ? 'لولو' : 'Lulu', 'Damascus', 'dry', 5], ['106', '', 'Baladi', 'served', 2],
  ];
  for (const [tag, name, breed, status, parity] of cows) {
    const repro = status === 'pregnant' ? { serviceDay: addDays(today, -150), method: 'ai', check: 'pregnant' } : status === 'served' ? { serviceDay: addDays(today, -26), method: 'natural', check: null } : status === 'dry' ? { serviceDay: addDays(today, -240), method: 'ai', check: 'pregnant' } : null;
    f = upsert(f, 'animals', { id: `a-${tag}`, species: 'cow', tag, name, breed, status, parity, weight: vary(560, 80), yieldL: status === 'lactating' ? 28 : 0, source: 'born', repro }, owner);
  }
  for (const [tag, name] of [['201', ar ? 'سمرا' : 'Samra'], ['202', ar ? 'بيضا' : 'Bayda'], ['203', '']]) f = upsert(f, 'animals', { id: `a-${tag}`, species: 'goat', tag, name, breed: 'Shami / Damascus', status: 'lactating', parity: 2, source: 'born' }, owner);
  f = upsert(f, 'animals', { id: 'a-flock', species: 'chicken', tag: ar ? 'الحظيرة الشمالية' : 'North coop', coop: ar ? 'الشمالية' : 'North', breed: 'ISA Brown', status: 'laying', birds: 120, startDay: start }, owner);
  f = upsert(f, 'workers', { id: 'w-samir', name: ar ? 'سمير' : 'Samir', pay: 'daily', wageC: 2000 }, owner);
  f = upsert(f, 'workers', { id: 'w-youssef', name: ar ? 'يوسف' : 'Youssef', pay: 'monthly', wageC: 45000 }, owner);
  f = upsert(f, 'obligations', { id: 'o-rent', party: ar ? 'إيجار الأرض' : 'Land rent', kind: 'rent', category: 'rent', amountC: 60000, nextDue: addDays(today, 2), freq: 'monthly' }, owner);
  f = upsert(f, 'obligations', { id: 'o-elec', party: ar ? 'اشتراك المولّد' : 'Generator subscription', kind: 'bill', category: 'electricity', amountC: 8500, nextDue: addDays(today, 9), freq: 'monthly' }, owner);

  const sale = (day, customerId, lines, paidNowC, by, hour, method = 'cash') => {
    const base = { type: 'sale', day, customerId, lines, discount: { kind: 'amount', valueC: 0 }, method };
    const tt = saleTotals(base);
    const paid = customerId ? paidNowC : tt.totalC;
    f = addRecord(f, { ...base, lines: lines.map((l, i) => ({ ...l, amountC: tt.lineAmounts[i] })), totalC: tt.totalC, discountC: 0, taxC: 0, paidNowC: paid, tenderC: customerId ? null : Math.ceil(tt.totalC / 500) * 500 }, by, at(day, hour));
  };
  f = addRecord(f, { type: 'capital', kind: 'inject', purpose: 'capital', personId: 'm-owner', amountC: 300000, account: 'cash', day: start, note: ar ? 'رأس مال الموسم' : 'Season capital' }, owner, at(start, 8));

  for (let i = 0; i <= days; i++) {
    const day = addDays(start, i);
    f = addRecord(f, { type: 'milk', day, species: 'cow', session: 'am', liters: vary(93, 8) }, milker, at(day, 6));
    f = addRecord(f, { type: 'milk', day, species: 'goat', session: 'am', liters: vary(8, 2) }, milker, at(day, 6));
    f = addRecord(f, { type: 'eggs', day, flockId: 'a-flock', count: Math.round(vary(96, 10)), broken: Math.round(R() * 4) }, milker, at(day, 9));
    sale(day, 'c-fadi', [{ product: 'milk', qty: 140, unit: 'L', priceC: 85 }], 0, milker, 10);
    sale(day, null, [{ product: 'milk', qty: Math.round(vary(14, 8)), unit: 'L', priceC: 100 }], 0, milker, 11);
    if (i % 2 === 1) sale(day, 'c-shams', [{ product: 'milk', qty: 30, unit: 'L', priceC: 95 }, { product: 'eggs', qty: 60, unit: 'egg', priceC: 15 }], 0, book, 12);
    if (i % 3 === 0) sale(day, 'c-hanan', [{ product: 'labneh', qty: 6, unit: 'kg', priceC: 550 }, { product: 'cheese', qty: 3, unit: 'kg', priceC: 800 }], i % 6 === 0 ? 2000 : 0, book, 13, 'cash');
    if (i % 2 === 1) sale(day, null, [{ product: 'eggs', qty: 30, unit: 'egg', priceC: 15 }], 0, milker, 15);
    f = addRecord(f, { type: 'milkUse', day, liters: 8, reason: 'calves' }, milker, at(day, 16));
    f = addRecord(f, { type: 'milk', day, species: 'cow', session: 'pm', liters: vary(80, 8) }, milker, at(day, 17));
    f = addRecord(f, { type: 'milk', day, species: 'goat', session: 'pm', liters: vary(6, 2) }, milker, at(day, 17));
    // Keep the tank realistic: sell the evening surplus to walk-in buyers.
    const stock = compute(f).milk.rawL;
    if (stock > 45) sale(day, null, [{ product: 'milk', qty: Math.floor(stock - 30), unit: 'L', priceC: 100 }], 0, milker, 19);
    f = addRecord(f, { type: 'attendance', day, workerId: 'w-samir', present: i % 7 !== 5 }, owner, at(day, 7));
    if (i % 7 === 3) {
      f = addRecord(f, { type: 'payment', day, customerId: 'c-fadi', cashC: 70000, method: 'cash', offsets: i === 10 ? [{ category: 'fuel', amountC: 4000, desc: ar ? 'وقود لشاحنة النقل' : 'Diesel for the pickup' }] : [] }, book, at(day, 18));
      f = addRecord(f, { type: 'expense', day, category: 'feed', amountC: 62000, paidC: i % 14 === 3 ? 62000 : 30000, supplierId: 's-feed', source: 'cash', qty: 40, unit: 'bag', dueDay: addDays(day, 14) }, book, at(day, 14));
      f = addRecord(f, { type: 'expense', day, category: 'labour', amountC: 12000, paidC: 12000, source: 'cash', payroll: true, note: ar ? 'أجر سمير' : "Samir's wages" }, owner, at(day, 19));
    }
    if (i % 7 === 6) f = addRecord(f, { type: 'payment', day, customerId: 'c-shams', cashC: 30000, method: 'transfer', offsets: [] }, book, at(day, 18));
    if (i % 9 === 4) f = addRecord(f, { type: 'payment', day, customerId: 'c-hanan', cashC: 10000, method: 'cash', offsets: [] }, book, at(day, 18));
    if (i % 10 === 2) f = addRecord(f, { type: 'expense', day, category: 'fuel', amountC: 3500, paidC: 3500, source: i === 22 ? 'person' : 'cash', personId: i === 22 ? 'm-khaled' : null, vendor: ar ? 'محطة الأمانة' : 'Amana station', qty: 20, unit: 'L' }, owner, at(day, 9));
    if (i === 15) f = addRecord(f, { type: 'medicine', day, animalId: 'a-102', kind: 'mastitis', name: 'Mastijet', costC: 1800 }, owner, at(day, 8));
    if (i === 20) f = addRecord(f, { type: 'expense', day, category: 'vet', amountC: 9000, paidC: 0, supplierId: 's-vet', source: 'cash', dueDay: addDays(day, 10) }, book, at(day, 11));
    if (i === 25) f = addRecord(f, { type: 'supplierPay', day, supplierId: 's-feed', amountC: 40000, source: 'person', personId: 'm-khaled' }, owner, at(day, 12));
    if (i === 28) f = addRecord(f, { type: 'expense', day, category: 'electricity', amountC: 8500, paidC: 8500, source: 'cash', vendor: ar ? 'اشتراك المولّد' : 'Generator', obligationId: 'o-elec' }, book, at(day, 10));
    if (i === 30) f = addRecord(f, { type: 'capital', kind: 'withdraw', purpose: 'personal', personId: 'm-owner', amountC: 20000, account: 'cash', day, note: ar ? 'مصروف منزلي' : 'Household' }, owner, at(day, 20));
    if (i === 33) f = addRecord(f, { type: 'transfer', day, fromAccount: 'cash', amountC: 150000 }, owner, at(day, 16));
  }
  f.rev = 1;
  return f;
}
