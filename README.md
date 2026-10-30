# مزرعتي · Mazraati 3.0

Arabic-first, English-capable farm office for cattle, goats, sheep and poultry: herd, milk and eggs, sales and customer accounts, expenses, suppliers, cash box, and a manager/funder ledger. Works offline as an installable PWA.

## Run and deploy

```
npm install
npm test          # ledger, stock, edit/delete, lock, permissions, sync, sample-farm checks
npm run build     # writes dist/ (the PWA) and preview/ (single-file preview page)
```

Deploy the contents of `dist/` to any static host (GitHub Pages works as-is: `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, icons, `.nojekyll`). The service worker cache name moves with `package.json` version.

## What changed from 2.9.59

**Transactions: one entry path for create, edit and delete**
- Every money record (sale, customer payment, expense, supplier payment, capital movement, medicine cost) opens in the same sheet for create and edit.
- An edit replaces the whole record in one commit. Because each record holds its full cluster (a payment carries its expense offsets; a sale carries its pay-now cash), cash, accounts and expenses can never half-update.
- Live "What will change" preview before every save, edit, delete or void, computed by diffing the ledger before and after.
- Changing a money field needs a written reason. The old values are kept in the record's edit history with who and when.
- Deletes are soft: rows go to Recently deleted for 30 days, can be restored, and show exactly what else changes. Permanent delete is owner-only and leaves a tombstone so sync cannot bring it back.
- Undo toast after every action, plus Ctrl+Z. Bulk select and delete with a combined total.
- Period lock: close a month; only the owner or bookkeeper can change it, and such edits are marked.
- Duplicate warning (same party, day and amount), drafts that survive closing the app, and "Save and add another".

**Data and safety**
- Money is parsed and stored as integer cents (Arabic digits accepted). No float accumulation.
- Real permissions: milkers and workers record production and cash sales; editing or deleting money needs owner or bookkeeper.
- Passcodes and a setup recovery code are stored hashed (SHA-256 with a farm salt).
- Configurable ledger currency with an optional second display currency.
- Per-record sync merge (`src/core/sync.mjs`): each record wins by its own timestamp, so two devices never erase each other's work.
- Automatic daily on-device snapshots (last three) and storage meter.
- Importer for the older single-document format (`entries[]`), with a mapped/skipped report.

**Design**
- Deep field-green rail, pale sage desk, one teal-and-gold cash band as the home anchor. Large tabular numbers; color only for status.
- Cash home: balance, today in/out, what customers owe, what we owe suppliers, a short "Needs attention" list, then the journal with running balance.
- Tap any row to open its full story: fields, what it did to balances, edit history, and Edit / Void / Delete in one place.
- Single "+ New" button and Ctrl+K command palette. Phone layout with bottom navigation and bottom sheets.

## Structure

```
src/core/   pure, tested modules
  money.mjs       cents parsing and formatting
  ledger.mjs      the engine: every balance derived from records
  commands.mjs    add / edit / delete / restore / purge / void / lock / preview
  validate.mjs    field and farm checks (errors block, warnings inform)
  milk.mjs        litre stock, session dedupe, FIFO lots and freshness
  statement.mjs   party statements: opening, running, closing
  sync.mjs        per-record merge with tombstones
  backup.mjs      backup envelope, restore, legacy import
  reports.mjs     period reports and CSV
  species.mjs     species catalogue and reproduction timeline
  catalog.mjs     products, expense groups, person purposes, permissions
  security.mjs    passcode and recovery-code hashing
  sample.mjs      sample farm for the walkthrough
src/ui/     React screens, sheets and the shell
src/i18n.js every string in Arabic and English
```

## Not yet connected

Company sync. The merge logic is written and tested, but the Firebase connection itself needs your project's config in `dist/firebase-config.js` and a small adapter. Until then each device keeps its own farm, and the backup file moves data between devices.

## 3.8 — office tools
- Purchase orders with deliveries, matching and supplier bills (Suppliers → Purchase orders).
- WhatsApp and PDF sending for invoices, receipts, statements and orders; payment reminders (Sales → Reminders).
- Attached documents with expiry alerts on animals, customers, suppliers, people and orders.
- IndexedDB storage, several farms per device, automatic backups to a cloud-synced folder, sign-in protection and an activity log.
- `dist/pdf.js` holds the PDF tools and loads only when a PDF is made.

## 3.9 — logo, guide and help
- Farm logo with quality check, used on every document and optionally in the app.
- Built-in user guide (searchable), first-visit guided tours, and a ? help mode with explanation bubbles. Toggle in Settings → Help & tutorials. Guide text lives in `src/guide-content.js`.
