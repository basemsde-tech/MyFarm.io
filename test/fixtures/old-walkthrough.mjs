/* Device-only walkthrough farm for client demos.
   Never upload this payload to company cloud — callers must set the hold
   flag and write with store.set(..., false). */

export const WALKTHROUGH_HOLD_KEY = "mazraati-walkthrough-hold";
export const PRE_WALKTHROUGH_KEY = "mazraati-pre-walkthrough-v1";

const iso = (d) => new Date(d).toISOString();
const dayKey = (v) => {
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function walkthroughHoldActive() {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(WALKTHROUGH_HOLD_KEY) === "1";
  } catch (e) {
    return false;
  }
}

export function setWalkthroughHold(on) {
  try {
    if (typeof localStorage === "undefined") return;
    if (on) localStorage.setItem(WALKTHROUGH_HOLD_KEY, "1");
    else localStorage.removeItem(WALKTHROUGH_HOLD_KEY);
  } catch (e) { /* private mode */ }
}

export function readPreWalkthrough() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(PRE_WALKTHROUGH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function savePreWalkthrough(farm) {
  try {
    if (typeof localStorage === "undefined" || !farm) return;
    if (localStorage.getItem(PRE_WALKTHROUGH_KEY)) return;
    if (farm.settings && farm.settings.demoWalkthrough) return;
    localStorage.setItem(PRE_WALKTHROUGH_KEY, JSON.stringify(farm));
  } catch (e) { /* quota */ }
}

export function clearPreWalkthrough() {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(PRE_WALKTHROUGH_KEY);
  } catch (e) { /* */ }
}

function atHours(now, daysAgo, hh, mm = 0) {
  const x = new Date(now - daysAgo * 86400000);
  x.setHours(hh, mm, 0, 0);
  return iso(x);
}

function ymdOffset(now, days) {
  return dayKey(now + days * 86400000);
}

/**
 * Build a realistic mixed farm covering animals, milk, eggs, sales, suppliers,
 * cash, workers and obligations so a client can see every main screen.
 */
export function buildWalkthroughFarm({ keep = {}, setupV = "1.6.4", now = Date.now() } = {}) {
  const demoMe = {
    id: "demo-me", name: "Walkthrough", role: "owner", emoji: "👨‍🌾",
    pin: null, salt: null, color: "#1B6B5A", at: iso(now),
  };
  const me = keep.me || (Array.isArray(keep.profiles) && keep.profiles[0]) || demoMe;
  let profiles = Array.isArray(keep.profiles) && keep.profiles.length
    ? keep.profiles.map((p) => ({ ...p }))
    : [me];
  if (me && !profiles.some((p) => p.id === me.id)) profiles = [me, ...profiles];

  const byId = me.id || "demo-me";
  const byName = me.name || "Walkthrough";
  const row = (partial, when) => ({
    id: partial.id, at: when, loggedAt: when, byId, byName, ...partial,
  });

  const cows = [
    { id: "demo-cow-101", species: "cow", tag: "101", name: "Laila", breed: "holstein",
      status: "lactating", expected: 22, weight: 580, parity: 3, source: "born",
      dob: ymdOffset(now, -1400), at: atHours(now, 60, 9) },
    { id: "demo-cow-102", species: "cow", tag: "102", name: "Nour", breed: "friesian",
      status: "pregnant", expected: 20, weight: 610, parity: 2, source: "bought", price: 1800,
      dob: ymdOffset(now, -1100), served: ymdOffset(now, -265), due: ymdOffset(now, 14),
      at: atHours(now, 55, 10) },
    { id: "demo-cow-103", species: "cow", tag: "103", name: "", breed: "shami",
      status: "served", expected: 18, weight: 490, parity: 1, source: "born",
      dob: ymdOffset(now, -900), served: ymdOffset(now, 8), at: atHours(now, 40, 11) },
  ];
  const goats = [
    { id: "demo-goat-201", species: "goat", tag: "201", name: "Rima", breed: "shami",
      status: "lactating", expected: 3.2, weight: 52, parity: 2, source: "born",
      dob: ymdOffset(now, -800), at: atHours(now, 50, 9) },
    { id: "demo-goat-202", species: "goat", tag: "202", name: "", breed: "baladi",
      status: "pregnant", expected: 2.8, weight: 48, parity: 1, source: "bought", price: 220,
      dob: ymdOffset(now, -600), served: ymdOffset(now, -130), due: ymdOffset(now, 22),
      at: atHours(now, 48, 10) },
  ];
  const sheep = [
    { id: "demo-sheep-301", species: "sheep", tag: "301", name: "", breed: "awassi",
      status: "healthy", expected: 1.5, weight: 62, parity: 1, source: "born",
      dob: ymdOffset(now, -500), at: atHours(now, 45, 9) },
  ];
  const poultry = [
    { id: "demo-flock-a", species: "chicken", tag: "", name: "Layer flock A", birds: 120,
      coop: "Coop 1", breed: "lohmann", status: "laying", expected: 90,
      dob: ymdOffset(now, -180), source: "bought", price: 420, at: atHours(now, 70, 8) },
  ];
  const animals = [...cows, ...goats, ...sheep, ...poultry];

  const customers = [
    { id: "demo-cust-ali", name: "Abu Ali", phone: "03 111 222", product: "milk",
      priceL: 0.48, defaultQty: 20, at: atHours(now, 50, 9) },
    { id: "demo-cust-bekaa", name: "Super Bekaa", phone: "08 333 444", product: "milk",
      priceL: 0, defaultQty: 40, at: atHours(now, 48, 9) },
    { id: "demo-cust-samir", name: "Hajj Samir", phone: "70 555 666", product: "eggs",
      priceL: 0.22, defaultQty: 60, at: atHours(now, 46, 9) },
    { id: "demo-cust-karim", name: "Mini Market Karim", phone: "81 777 888", product: "milk",
      priceL: 0.45, defaultQty: 12, at: atHours(now, 20, 9) },
  ];

  const suppliers = [
    { id: "demo-sup-feed", name: "FeedCo Bekaa", phone: "08 200 100", tags: ["feed"],
      note: "", at: atHours(now, 55, 9) },
    { id: "demo-sup-vet", name: "Dr. Hanna Vet", phone: "03 900 800", tags: ["med"],
      note: "", at: atHours(now, 40, 9) },
    { id: "demo-sup-fuel", name: "Station El-Masnaa", phone: "08 111 000", tags: ["other"],
      note: "", at: atHours(now, 30, 9) },
  ];

  const workers = [
    { id: "demo-w-hassan", name: "Hassan", type: "daily", salary: 0, at: atHours(now, 40, 9) },
    { id: "demo-w-fatima", name: "Fatima", type: "monthly", salary: 400, at: atHours(now, 40, 9) },
  ];

  const obligations = [
    { id: "demo-ob-elec", type: "bill", title: "Electricity", party: "EDL",
      amount: 85, frequency: "monthly", nextDue: ymdOffset(now, 5), notes: "",
      documents: [], active: true, rate: 89500, at: atHours(now, 30, 9) },
    { id: "demo-ob-rent", type: "rent", title: "Coop rent", party: "Landlord",
      amount: 150, frequency: "monthly", nextDue: ymdOffset(now, 18), notes: "",
      documents: [], active: true, rate: 89500, at: atHours(now, 30, 9) },
  ];

  const milkPrice = 0.45;
  const eggPrice = 0.20;
  const entries = [];

  animals.forEach((a) => {
    entries.push(row({ type: "animalAdd", id: `demo-add-${a.id}`, animalId: a.id, name: a.name || a.tag }, a.at));
  });
  customers.forEach((c) => {
    entries.push(row({ type: "customerAdd", id: `demo-cadd-${c.id}`, customerId: c.id, name: c.name }, c.at));
  });
  workers.forEach((w) => {
    entries.push(row({ type: "workerAdd", id: `demo-wadd-${w.id}`, workerId: w.id, name: w.name }, w.at));
  });

  for (let d = 13; d >= 0; d--) {
    const amL = +(48 + (d % 5) * 1.4).toFixed(1);
    const pmL = +(41 + (d % 4) * 1.1).toFixed(1);
    entries.push(row({
      type: "milkBulk", id: `demo-milk-am-${d}`, session: "am", liters: amL, unit: "L",
    }, atHours(now, d, 6, 30)));
    entries.push(row({
      type: "milkBulk", id: `demo-milk-pm-${d}`, session: "pm", liters: pmL, unit: "L",
    }, atHours(now, d, 18, 10)));
  }

  for (let d = 9; d >= 0; d--) {
    const count = 82 + (d % 7) * 2;
    entries.push(row({
      type: "eggs", id: `demo-eggs-${d}`, animalId: "demo-flock-a", count, broken: d % 4 === 0 ? 2 : 0,
    }, atHours(now, d, 8, 15)));
  }

  for (let d = 6; d >= 0; d--) {
    entries.push(row({
      type: "attend", id: `demo-att-h-${d}`, workerId: "demo-w-hassan", present: d !== 5,
    }, atHours(now, d, 7, 0)));
    entries.push(row({
      type: "attend", id: `demo-att-f-${d}`, workerId: "demo-w-fatima", present: true,
    }, atHours(now, d, 7, 5)));
  }

  entries.push(row({
    type: "med", id: "demo-med-1", animalId: "demo-cow-101", medType: "vitamin",
    name: "AD3E", cost: 18,
  }, atHours(now, 4, 11)));
  entries.push(row({
    type: "weight", id: "demo-wt-1", animalId: "demo-cow-101", kg: 580,
  }, atHours(now, 3, 10)));
  entries.push(row({
    type: "birth", id: "demo-birth-1", animalId: "demo-goat-201", count: 2, males: 1, females: 1, dead: 0,
  }, atHours(now, 12, 5, 40)));

  const sale = (id, customerId, product, qty, unit, price, daysAgo, hh = 9) => {
    const amount = +(qty * price).toFixed(2);
    const when = atHours(now, daysAgo, hh);
    entries.push(row({
      type: "sale", id, customerId, product, qty, unit, price, amount,
      currency: "usd", rateUsed: 89500,
    }, when));
    return { id, amount, when, customerId };
  };
  const pay = (id, customerId, saleId, amount, daysAgo, hh = 16) => {
    entries.push(row({
      type: "payment", id, customerId, saleId, amount, method: "cash",
      currency: "usd", rateUsed: 89500,
    }, atHours(now, daysAgo, hh)));
  };

  const ali1 = sale("demo-sale-ali-1", "demo-cust-ali", "milk", 20, "L", 0.48, 12, 8);
  pay("demo-pay-ali-1", "demo-cust-ali", ali1.id, ali1.amount, 12, 8);
  const ali2 = sale("demo-sale-ali-2", "demo-cust-ali", "milk", 20, "L", 0.48, 5, 8);
  pay("demo-pay-ali-2", "demo-cust-ali", ali2.id, ali2.amount, 5, 8);
  const ali3 = sale("demo-sale-ali-3", "demo-cust-ali", "milk", 20, "L", 0.48, 1, 8);
  pay("demo-pay-ali-3", "demo-cust-ali", ali3.id, ali3.amount, 1, 8);

  const bek1 = sale("demo-sale-bek-1", "demo-cust-bekaa", "milk", 40, "L", milkPrice, 10, 9);
  pay("demo-pay-bek-1", "demo-cust-bekaa", bek1.id, +(bek1.amount * 0.5).toFixed(2), 8, 14);
  sale("demo-sale-bek-2", "demo-cust-bekaa", "milk", 40, "L", milkPrice, 3, 9);

  sale("demo-sale-sam-1", "demo-cust-samir", "eggs", 60, "eggs", 0.22, 38, 10);
  sale("demo-sale-sam-2", "demo-cust-samir", "eggs", 60, "eggs", 0.22, 8, 10);

  sale("demo-sale-kar-1", "demo-cust-karim", "milk", 12, "L", 0.45, 2, 11);
  const stock = sale("demo-sale-kar-2", "demo-cust-karim", "animal", 1, "head", 520, 0, 10);
  pay("demo-pay-kar-2", "demo-cust-karim", stock.id, stock.amount, 0, 10);

  const bill = (id, supplierId, category, amount, daysAgo, extra = {}) => {
    const when = atHours(now, daysAgo, 11);
    entries.push(row({
      type: "expense", id, supplierId, category, amount, vendor: extra.vendor || "",
      feedType: extra.feedType, unit: extra.unit, qty: extra.qty, unitPrice: extra.unitPrice,
      payStatus: extra.payStatus || "unpaid", paidAmount: extra.paidAmount || 0,
      dueDate: extra.dueDate || dayKey(when), currency: "usd", rateUsed: 89500,
      note: extra.note || "", group: extra.group || (category === "feed" ? "feed" : "ops"),
    }, when));
    return { id, amount, when };
  };
  const supplierPay = (id, supplierId, expenseId, amount, daysAgo) => {
    entries.push(row({
      type: "supplierPay", id, supplierId, expenseId, amount, method: "cash",
      vendor: "", currency: "usd", rateUsed: 89500,
    }, atHours(now, daysAgo, 15)));
  };

  const feedPaid = bill("demo-bill-feed-1", "demo-sup-feed", "feed", 210, 20, {
    vendor: "FeedCo Bekaa", feedType: "hay", unit: "bag", qty: 6, unitPrice: 35,
    payStatus: "paid", paidAmount: 210, dueDate: ymdOffset(now, -20),
  });
  supplierPay("demo-spay-feed-1", "demo-sup-feed", feedPaid.id, 210, 20);
  bill("demo-bill-feed-2", "demo-sup-feed", "feed", 175, 6, {
    vendor: "FeedCo Bekaa", feedType: "concentrate", unit: "bag", qty: 5, unitPrice: 35,
    payStatus: "unpaid", paidAmount: 0, dueDate: ymdOffset(now, -12),
  });

  const vetPartial = bill("demo-bill-vet-1", "demo-sup-vet", "medicine", 95, 9, {
    vendor: "Dr. Hanna Vet", payStatus: "partial", paidAmount: 40, dueDate: ymdOffset(now, 4),
  });
  supplierPay("demo-spay-vet-1", "demo-sup-vet", vetPartial.id, 40, 8);

  const fuelPaid = bill("demo-bill-fuel-1", "demo-sup-fuel", "fuel", 55, 4, {
    vendor: "Station El-Masnaa", payStatus: "paid", paidAmount: 55, dueDate: ymdOffset(now, -4),
  });
  supplierPay("demo-spay-fuel-1", "demo-sup-fuel", fuelPaid.id, 55, 4);

  entries.push(row({
    type: "expense", id: "demo-exp-fuel-cash", category: "fuel", amount: 28,
    payStatus: "paid", paidAmount: 28, vendor: "Road diesel", dueDate: ymdOffset(now, -2),
    currency: "usd", rateUsed: 89500, group: "ops",
  }, atHours(now, 2, 13)));

  entries.sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    version: 3,
    settings: {
      rate: 89500,
      milkPrice,
      eggPrice,
      wage: 18,
      logo: "",
      farmName: "Mazraati — Walkthrough",
      farmPhone: "08 000 000",
      farmAddress: "Bekaa Valley",
      farmEmail: "",
      loc: null,
      milkMode: "total",
      milkUnit: "L",
      categories: [],
      saleReimburseTypes: [],
      setupV,
      demoWalkthrough: true,
      docTpl: {
        thanks: "", footerNote: "Walkthrough farm — this device only",
        showSigns: true, showParty: true, showRate: true, printMoney: "follow",
      },
    },
    profiles,
    animals,
    workers,
    customers,
    suppliers,
    obligations,
    entries,
  };
}

export function walkthroughCounts(farm) {
  const entries = (farm && farm.entries) || [];
  const types = {};
  entries.forEach((e) => { types[e.type] = (types[e.type] || 0) + 1; });
  return {
    animals: (farm.animals || []).length,
    customers: (farm.customers || []).length,
    suppliers: (farm.suppliers || []).length,
    workers: (farm.workers || []).length,
    obligations: (farm.obligations || []).length,
    entries: entries.length,
    types,
  };
}
