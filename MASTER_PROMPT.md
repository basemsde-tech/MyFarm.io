# Mazraati 3 · Master build prompt

One standing brief that combines every instruction given for this build. Use it when designing, building, reviewing or extending Mazraati. It replaces the separate requests; where they overlap, the later and stricter wording wins. Ledger rules are invariants: if a change would break one, keep the rule unless the owner explicitly replaces it.

## 1. Product

Mazraati (مزرعتي, "my farm") is a bilingual, Arabic-first farm office for cattle, goats, sheep and poultry, ready for paying clients. It records the herd, daily milk and eggs, sales (walk-in and on account), what customers owe, purchases and supplier bills, expenses, one cash box plus a bank account, owner capital, and each manager/funder as one personal account. It prints A4 invoices, receipts and statements that match the account. It runs as an installable offline PWA on phone, tablet and desktop from one farm data model.

Not a generic ERP, marketplace, clinical vet system or full HR suite. Medicine is a cost and a herd note; tax is an optional invoice line; payroll is attendance and wages.

Base specification: the "Mazraati full details prompt" (v2.9.59, First Season). Everything in it stays true unless this brief changes it.

## 2. Ledger invariants (never weaken)

1. Every balance is derived from records in integer cents. No stored balance that can drift. Money is parsed straight to cents (Arabic digits accepted).
2. One record is one complete money cluster: a sale carries its pay-now cash; a customer payment carries its expense offsets; an expense carries its paid part and source. Create, edit, delete and restore act on the whole cluster in one atomic commit.
3. No banks: the farm works in cash only, and every payment in or out goes through the cash box. Only drawer cash moves the cash box. Expense offsets, manager out-of-pocket spending, manager supplier payments and retained collections never move the drawer.
4. A customer payment is one amount on the account, never auto-split across invoices. Invoice status (paid/partial/unpaid/overdue) is shown by applying the account pool oldest-first, capped so no invoice can look more overdue than the real account due.
5. Supplier payments go to a bill only when the user picks one; otherwise oldest-first. Opening supplier debt is a bill like any other.
6. Manager/funder is one person. Purposes post into real departments: capital in, cash out for the farm, out-of-pocket expense, supplier paid from pocket, customer money kept, personal use/advance.
7. Owner withdrawal is not an operating expense; owner-funded spend is an expense and reduces capital.
8. Milk stock is litres (1 L ≈ 1.03 kg), deduplicated per day/session, consumed FIFO, never oversold on save. Void "restore" returns milk; void "write off" keeps it out. Both need a reason of 3+ characters and can be undone.
9. Walk-in sales never create customer debt and must be paid in full; change is never income.
10. Statements, reports and CSV match the account screens.

## 3. Transactions: input, editing and deletion

- One sheet per transaction type for both create and edit; edit opens pre-filled.
- Live "What will change" preview on every create, edit, void and delete (cash, capital, each customer/supplier/person balance, open bills, milk and egg stock).
- Changing any money field requires a written reason; the record keeps a revision history (who, when, reason, old values), shown in the record's detail drawer.
- Blocked changes explain why (oversell, locked period, permission, overpayment without the credit option).
- Deletes are soft: Recently deleted keeps rows 30 days, restorable; the confirmation lists every balance that changes. Permanent delete is owner-only and leaves a tombstone. Undo toast after every action and Ctrl+Z.
- Bulk select with a floating total bar and bulk delete.
- Period lock: the owner closes a month; only owner or bookkeeper can change locked days, and those edits are marked "edited after close".
- Faster input: cashier keypad, quick-cash chips, smart defaults (customer's usual product and price), duplicate warning, "Save and add another", drafts that survive closing the app, field errors shown only after the user starts typing.

## 4. Data, security and client readiness

- Real permissions: owner (everything), bookkeeper (all money and settings, no permanent delete), milker/worker (production and cash sales; no money edits), herd health (herd and production).
- Passcodes (4–8 digits) and a one-time recovery code stored hashed with a farm salt.
- Configurable ledger currency (USD default) with LBP as the second currency at a farm rate (default 89,500).
- Per-record sync merge with tombstones so two devices never erase each other's work. Company sync uses Firebase email/password and Realtime Database once a client's config is supplied; the device always works offline without it.
- Backup and restore (JSON envelope), automatic daily on-device snapshots (last three), storage meter with a soft cap, and import of the older single-document format with a mapped/skipped report.
- Sample farm for demos that holds the real farm safely until "Back to my farm".

## 5. Design: ultra-premium enterprise desk

- Visual identity: ink-green rail, porcelain desk, layered white surfaces with soft shadows and hairline borders, teal as the action colour, gold reserved for money highlights. Colour otherwise means status only (paid, partial, unpaid, overdue, clear, owing, credit).
- Type: Readex Pro for UI and numbers (tabular figures everywhere digits align), Reem Kufi only for the brand. Large readable amounts, short plain labels, formal Modern Standard Arabic (فصحى) throughout — labels, messages, documents and sample data, full English parallel.
- One job per screen, one primary button, quiet secondary actions; empty states say what is missing and offer the fix.
- Cash home: animated cash balance with a 30-day trend line, today in/out, owed to us, we owe suppliers, a short "Needs attention" list, then the journal with running balance, filters and month groups.
- Every row opens a detail drawer: what the record did, linked effects, edit history, and Edit / Void / Delete in one place.
- Single "+ New" action, Ctrl+K command palette, keyboard shortcuts (N new, Ctrl+Z undo, Ctrl+K search).
- Micro-interactions, lightweight and purposeful: press-scale on buttons and tiles, hover lift on cards, sliding tab underline, sheets that spring in and ease out, page enter transitions, staggered impact rows, count-up figures, drawn sparkline, success check that draws itself, field shake on error. All motion respects reduced-motion.
- Fully responsive:
  - Phone (≤ 720px): bottom navigation, floating New button, bottom sheets with a grab handle, single-column forms.
  - Tablet (721–1100px): icon rail with tooltips, side sheets sized to the viewport.
  - Desktop (1101–1499px): full rail that can be collapsed to icons.
  - Widescreen (≥ 1500px): wider canvas, two-column cash desk with a sticky attention panel, wider sheets.
- Arabic RTL and English LTR, light and dark, both verified on every screen.

## 6. Currency display: USD with an LBP flip

- USD is the displayed currency across the whole UI; there is no global currency toggle.
- Hovering any USD amount for 2 seconds triggers a smooth 3D flip card that reveals the same amount in Lebanese pounds at the farm rate. A thin gold progress line shows the 2-second hold.
- Moving away before 2 seconds cancels the flip. Ending the hover flips the card back to USD smoothly.
- On touch screens, pressing and holding for 2 seconds does the same; lifting the finger flips back.
- Works on every money figure without changing how amounts are stored. Turned off when the rate is 0.

## 9. Restoring backups from the old app

- Settings → Restore from backup, and on the welcome screen of a new install, accept a JSON backup from Mazraati 2.x or 3.x (file picker or drag and drop).
- Nothing is replaced until the person reviews the file: farm name, save date, what will be restored (customers, suppliers, people, animals, workers, obligations, users, sales, payments, expenses, milk records) and a balance check.
- The 2.x importer rebuilds each linked group as one 3.x record: a sale with its counter payment; a payment with the customer-paid costs it carried; supplier bills with every payment, including the cash-out 2.x implied for older paid bills; owner capital in and out; manager out-of-pocket costs, supplier payments and kept collections; cash taken from the drawer by a named person.
- Every balance is recomputed with the 2.x rules and compared with the restored farm: cash box, owner capital, each customer, each supplier and each manager. Card and transfer receipts from the old app are counted as cash in the box (the app has no bank), with a note in the review.
- Old passcodes keep working (same SHA-256 "salt:pin" scheme). History-only rows are kept in an archive, not dropped. The current farm can be downloaded first.

## 10. Smart deletion and archiving

- Deleting a sale that took milk or eggs out of stock asks what happened to the produce: return it to stock (the sale never happened) or keep it out (given away or spoiled), which posts a write-off that a later restore removes again.
- Deleting production rows that would leave sold milk uncovered is blocked with an explanation.
- Customers, suppliers, managers, animals, workers and obligations offer: archive (recommended when entries exist), delete alone (refused for parties with entries, whose balance would be lost), or delete with their entries. Animals take only their herd and production rows; money stays.
- Sold and dead animals can be archived one by one or all at once; archived animals are hidden until "Show archived".
- Every deletion goes to Recently deleted for 30 days, including list items with the entries removed alongside them, and restores as one unit.

## 11. Workspace and navigation

- Page tabs under the top bar, each with its own back and forward history. Opening a page that is already open focuses that tab instead of duplicating it. Tabs can be reordered by dragging and closed with a middle click.
- Floating windows on desktop (≥ 1100px): Shift-click any page or link, or "Open in window". Windows navigate independently, drag, resize, snap to the left or right half or maximise by dragging to an edge, minimise to a taskbar, and dock back into a tab. Each window has an accent colour so several stay distinct. Layout is remembered per device.
- Ctrl/⌘-click opens a page in a new tab. Keyboard: Alt+←/→ back and forward, Alt+1–9 switch tabs, Alt+T new tab, Alt+W close tab, Alt+O open the current page in a window. The command palette lists open pages first; Ctrl+Enter opens a result in a tab, Shift+Enter in a window.
- Breadcrumb shows farm › department › account. Every record's detail view links to the customer, supplier, person or animal it belongs to.

## 12. Visual comfort

- Fields, segmented controls, chips and selectable rows have clear 1.5px outlines, a visible hover edge and a teal focus ring; selected rows are outlined, not only tinted.
- Light mode offers four palettes chosen for long sessions: soft sage (default, low glare), warm sand, cool mist and classic white. Dark mode is unchanged.

## 13. People and sign-in

- No photos or emoji. Each profile shows a symbol for its role in a tinted tile: owner (crown, gold), bookkeeper (calculator, blue), milker (milk pail, teal), worker (pitchfork, earth), herd health (shield with cross, rose).
- Sign-in is a two-part screen: a branded side panel with a time-of-day greeting and the date, and an account list ordered by role, each showing whether it has a passcode. Choosing a protected account shows a passcode step with dots and a keypad (physical keys and Arabic digits work too), a clear wrong-code state, and recovery by code.
- The profile editor previews the person, picks the role from cards that state what each role can do, and manages the passcode. The last owner cannot be demoted or deleted.
- The account chip in the sidebar (and top bar on phones) opens a menu: who is signed in, what the role allows, Team and roles, Switch user, Lock now.
- Settings → Team shows people as cards with role, "You" marker and passcode status.

## 14. Sort and filter controls stay folded

- Every list's sort and filter controls (period, account, direction, type, search, species, status, sort order, archived) sit behind one "Sort & filter" toggle, closed by default.
- While closed, a quiet line of chips shows what is applied; non-default choices are highlighted and counted on the toggle's badge; "Clear" resets them in one tap. Tapping a chip opens the panel.
- Each screen remembers on this device whether its panel was left open.
- Lists that had no sort options gained them: customers and suppliers by balance, name or latest activity; animals by tag, name or next birth.

## 15. Accounting and invoicing
- Every entry posts a balanced double-entry journal automatically; nobody types debits and credits. Accounts: cash box, customer receivables, supplier payables, unpaid bills, managers & funders, tax payable, opening balances, adjustments, sales by product, expenses by item.
- An **Accounts** department (office group) with plain-language tabs: Profit & loss (period, compared with the previous period, expenses grouped), Balance sheet ("what the farm owns / what it owes / net worth" as of any day, with a balanced check), Aging (customers owe us / we owe, in not-yet-due, 1–30, 31–60, 61–90, 90+ buckets; rows open the account), Journal with Trial balance, and Tax when tax is used. Each exports CSV.
- Sales get sequential invoice numbers (INV-0001…) and customer payments sequential receipt numbers (RCT-0001…), prefixes set in Settings; numbers never reuse, old data is numbered by date on load.
- Account sales carry a due date (default from payment terms). Sales → Invoices is an invoice register: number, customer, issued, due, total, balance, status (paid/partial/unpaid/overdue/voided), with invoiced/collected/outstanding/overdue totals, search, status filter, print and collect actions.
- Printed invoices show bill-to, number, issue and due dates, subtotal, discount, tax, paid to date, balance due and a status stamp; payments print as a receipt with amount, offsets, total credited and balance after.

## 16. Sold animals stay on record
- A sale that names an animal marks it sold and stores a sale snapshot on the animal (sale, date, buyer, price, invoice no., weight at sale). Deleting the sale, or voiding it with stock returned, puts the animal back in the herd at its previous status; restoring or un-voiding sells it again. A write-off void keeps it sold. Moving a sale to another animal frees the first.
- Sold animals cannot be deleted, only archived; they are never lost from the record. The sale owns the status and price while it exists.
- The animal page of a sold animal shows a Sale record: date, buyer (link), invoice no., price, payment status, weight at sale, price per kg, age at sale, time on farm, purchase price, treatment costs, milk/eggs produced, births, status before sale, notes, and gain = price − purchase − treatments; print the invoice or open the sale from there. Production quick actions and the breeding panel are hidden for sold animals.
- Animals has two tabs: Current herd and Sold. Sold is a register of every sold animal (archived included) with period, species and search filters, totals (count, sales, average, gain) and CSV export.
- Animals sold before this version, or by hand without a money entry, keep their details; hand-recorded sales can hold date, price, buyer, weight and notes. Every delete or edit preview shows an animal's status change.

## 17. Office tools: orders, messages, documents, backups, security, several farms
- **Purchase orders (Suppliers → Purchase orders).** Numbered PO-0001…, lines of item, description, quantity, unit and agreed price, expected date. An order moves no money. "Receive delivery" records what arrived (date, delivery-note no., quantity and billed amount per line, paid now from the cash box or a person, or on account with a due date); each line becomes an ordinary supplier bill linked to the order, so balances, aging and accounts need no new rules. The order shows ordered vs received vs billed per line, price differences and over-deliveries, every delivery, and status open · partly received · received · closed (short, with reason) · cancelled (only before deliveries). Late orders reach Needs attention. Printable, PDF, WhatsApp.
- **Sending.** Invoices, receipts, payment receipts, statements and purchase orders have WhatsApp (a ready message to the party's number, local numbers completed with the farm's country code) and PDF (a real A4 PDF; on phones it opens the share sheet so it can go straight to WhatsApp, elsewhere it downloads). PDF tools load only when asked (pdf.js in the installed app, cdnjs in the preview). Every send is logged.
- **Payment reminders (Sales → Reminders).** Customers with invoices past due, overdue amount, days late, last reminder (when, how, by whom). A formal reminder message lists each overdue invoice; send by WhatsApp or log a phone call. Reminders repeat after a set number of days (Settings → Messages).
- **Documents.** Attach photos or PDFs (up to 8 MB; large photos shrunk) to animals, customers, suppliers, people and orders with type (health certificate, vaccination, purchase papers, ear-tag registration, sale papers, contract, ID, invoice, other), number, issue and expiry dates and notes. Expired or soon-expiring documents reach Needs attention. Files live in the device file store and travel inside backups.
- **Storage.** Farms, snapshots and files live in IndexedDB (hundreds of MB); where it is unavailable the app falls back to localStorage. Older single-farm data moves over on first start.
- **Automatic backup.** On computers that allow it, pick a folder once — inside Google Drive, OneDrive, Dropbox or iCloud Drive so copies reach the cloud — and the app keeps "latest" fresh after changes and writes one dated copy a day, keeping the newest N. Elsewhere a due reminder offers one-tap share of the backup file. Status, frequency and copies kept are in Settings → Backups; backups include attached files.
- **Sign-in protection.** Auto-lock after idle minutes; a pause after N wrong codes (30 s, doubling, survives reload); optional rule that every user must have a code (asked to choose one at next sign-in). **Activity log** (owner/accountant): every entry created, edited (with reason), deleted, restored or voided, list and settings changes, sign-ins, wrong codes, locks, backups, restores, sends and farm switches — filter by period, user and kind, CSV export. The log is never undone.
- **Several farms on one device.** Each farm or branch keeps its own data, users, documents, snapshots and backup folder. Add a farm from the account menu (runs setup; cancel removes it), switch from the account menu or the sign-in screen, remove one (owner, typed confirmation).

## 18. Farm logo, user guide, tours and help marks
- **Farm logo (Settings → Farm logo).** Upload by tap or drag-and-drop (PNG, SVG, WebP, JPG up to 12 MB). The app checks pixels, transparency, shape and size and rates it great / acceptable / low with specific advice (≥600 px on the short side, transparent PNG or SVG, near-square, margin around the mark, reads in black and white). Logos are kept sharp: SVG as is, raster up to 1000 px, PNG kept when transparent. Shape: as is · rounded · circle. Toggles: show on every document (invoice, receipt, payment receipt, statement, purchase order — also in their PDFs) and use in the app instead of the م mark. Live document-header preview.
- **User guide (sidebar → User guide, or ? → User guide).** Searchable sections for every part of the app (getting started, cash, sales, collecting, reminders, expenses, suppliers & orders, production, animals, accounts, editing & locking, documents, logo, backups, security, several farms, tabs & windows and shortcuts), each with numbered steps, tips, "Open page" and "Guided tour". Sticky contents on desktop, scrolling chips on phones. Links into sections (#guide-<id>).
- **Guided tours.** When tutorials are on, the first visit to Cash, Sales, Expenses, Suppliers, Production, Animals, Accounts and Settings runs a short spotlight tour (step count, dots, back / next / skip, arrow keys, Esc). Card sits beside the highlighted area on desktop and docks at the bottom on phones or for tall areas. Remembered per device; never starts over an open sheet.
- **Help marks (the ? toolkit).** The ? button in the top bar toggles help mode, starts this page's tour and opens the guide. In help mode small ? marks appear beside features (page titles, filters, currency flip, needs-attention, invoices, reminders, orders and matching, sharing, documents, sale record, accounting reports, tank, breeding, team, period lock, logo, backups, security, farms); tapping one opens a cloud bubble with a short explanation and a link to the guide section.
- **Settings → Help & tutorials:** tutorials on/off, help marks on/off, restart tutorials, open the guide. These are per device.

## 19. Updates feel like an app update
- The service worker checks for a new version on start, every 30 minutes and whenever the app comes back to the foreground. A first install takes over at once; an update downloads in the background and waits.
- When it is ready, a card says "A new update is ready — new features and improvements; your data stays as it is" with **Update now** and **Later**. Update now shows a short "Installing the update…" screen, switches to the new version and reloads.
- After loading a newer version, a **What's new** card celebrates it once per device: animated check with a small burst, "Updated successfully", the version and season, and short bullet points with icons for every release since the version this device last saw (up to four releases, newest first), then "Great, let's go". Brand-new farms skip it. Settings → About → What's new shows the full update history.
- Release notes live in `src/changelog.js` (`[icon, Arabic, English]` per bullet); every release adds its bullets there.

## 7. Engineering shape

- Pure, tested core modules in `src/core/` (money, ledger, commands, validate, milk, statement, sync, backup, reports, species, catalog, security, sample). A new money rule never lives only in a click handler.
- React UI in `src/ui/`; every string in `src/i18n.js` in both languages; one stylesheet with design tokens.
- `npm test` must pass and must cover the acceptance checks; `npm run build` produces `dist/` (PWA) and `preview/` (single page).

## 8. Acceptance checks

1. Morning and evening milk, part sold (including a kg sale), part used on calves: tank equals production minus both, in litres.
2. Walk-in sale collects cash, shows change, hits the cash box, creates no customer due.
3. Account sale unpaid, one partial payment shows a single payment and the remaining due; a clearing payment marks the sale paid.
4. Payment with a fuel offset: due falls by cash plus offset, cash rises only by cash, a paid fuel expense appears.
5. Supplier bill paid in part shows "we owe" for the rest; opening balance behaves the same.
6. Manager pays a supplier from pocket: supplier due falls, drawer unchanged, the person is owed more.
7. Owner injects capital, spends some on feed, withdraws the rest: drawer, capital and expenses each tell that story once.
8. Void a milk sale with restore and with write-off; undo both; stock and cash match.
9. Statement opening, charges, credits and closing match the account card for the same dates.
10. Editing a sale amount updates cash and due together, keeps the old value in history, and requires a reason.
11. Deleting a payment shows its impact, can be undone, and leaves the invoice in place; permanent delete is owner-only.
12. Editing or deleting cannot make milk stock negative; a locked month rejects non-owner edits.
13. Two devices' edits merge per record; a purged row stays gone.
14. Every screen renders in Arabic RTL and English LTR, light and dark, at phone, tablet, desktop and widescreen widths with no horizontal scroll.
15. Hovering an amount for 2 s flips it to LBP; leaving early cancels; leaving after flips back.
16. A 2.x backup restores with every balance matching the old app, and old passcodes still open their profiles.
17. Deleting a sale either returns its milk and eggs to stock or keeps them out with a write-off; restoring the sale removes the write-off.
18. A customer with entries cannot be deleted alone; archiving or deleting with entries is reversible from Recently deleted.
19. A page opened in a window navigates on its own, snaps, minimises and docks back into a tab without changing the main page.
20. The trial balance and balance sheet balance on the sample farm and on a restored 2.x backup, and cash, customer, supplier and people balances in Accounts equal the ones on their own pages.
21. Every sale and customer payment has a unique number; the invoice register's outstanding total equals what customers owe.
22. Nothing in the app offers a bank, card or transfer option; restoring data that used them puts that money in the cash box and the totals still match.
23. Selling an animal moves it to Animals → Sold with its full sale record; deleting the sale returns it to the herd; a sold animal cannot be deleted.
24. A purchase order received in two deliveries shows partly received then received, each delivery is a supplier bill, and the trial balance still balances.
25. Every invoice, receipt, statement and order can be sent by WhatsApp and saved as a PDF; a late customer appears under Reminders until reminded.
26. A document attached to an animal survives reload and a backup → restore round trip; an expiring one appears in Needs attention.
27. Wrong codes pause sign-in after the set number of tries, idle sessions lock, and both appear in the Activity log.
28. Two farms on one device keep separate data; switching asks for that farm's sign-in.
29. A low-resolution JPG logo is rated low with advice; a transparent 800 px PNG is rated great and appears on invoices and their PDF.
30. A new user sees the Cash tour once; turning tutorials off stops tours; help mode shows ? marks that open explanation bubbles; the guide searches and links to tours.
31. Publishing a new build makes an open installed app show the update card; Update now reloads into the new version and shows What's new with that release's bullets.
32. With 5 years of a busy farm (54,000 entries) on a 4× slower processor: keys respond under 150 ms, a saved entry confirms within 0.25 s, totals refresh within 2 s, and quick successive saves are never lost.

## 20. 3.11 — Navigation, sounds, currency display, milk log
- Navigation: side rail with one gliding highlight, folding groups (remembered), live badges (overdue customers on Sales, open purchase orders on Suppliers, expiring documents on Settings, trash count); arrow-key movement. Phones: a floating dock (Cash, Sales, +, Production, Animals, More) that tucks away while scrolling down; More opens a grouped sheet with a page filter.
- Sounds (synthesised, offline): soft success on every labelled save, low knock on errors and wrong PINs, a cash-register ring on every new sale. Settings → Appearance → Sounds, with test buttons.
- Currency: resting on an amount for 1.2 s pops up a chat-style bubble with the LBP value (3.11.1; the flip was removed). Numbers are always Latin digits; currencies without a Latin symbol show their English code (LBP, SAR…), never Arabic abbreviations.
- Milk unit defaults to kilograms (storage stays in litres; display converts). Production: tank lots, daily milk log and egg log fold away to a one-line summary with a sparkline; the milk log has period, species, milking and sort controls, totals/average/best day, and paged rows.

## 21. 3.12 — Milk use cards, log off with backup
- Milk use: "Used for" cards (built-ins + the farm's own). Create, rename, pick an emoji, remove. A removed card that entries point to is hidden, never deleted, so old entries keep their name. Each card shows the last 30 days' amount. Quantity is typed in the farm's milk unit and stored in litres.
- Log off (account menu, phone More sheet): a dialog offers "Back up and log off" — writes to the connected backup folder, or to one remembered backup file that is replaced each time (picked once), or downloads — then "Log off without backup" or Cancel. Log off returns to the profile screen; profiles with a passcode ask for it, others enter with one tap.

## 22. 3.13 — One set of books across departments
- Rule: a cost is counted once, when the bill (expense) is recorded. Paying a supplier later (supplierPay) moves cash and settles the bill; it is never a second expense. Customer-paid costs (payment offsets) and medicine costs are expenses once.
- Supplier payments are allocated to bills (named bill first, then oldest first, opening balance as the oldest bill) inside the ledger snapshot, so the Expenses list shows real paid status; the same allocation drives the supplier statement and payables aging.
- Reports take income, expenses and profit from the journal P&L (tax kept out of sales; customer-paid costs as other income), so Reports = Accounts P&L = Expenses total. "We owe" everywhere (cash box, reports, expenses, balance sheet, aging) = supplier balances + other unpaid bills.
- Expenses screen explains each period: costs = paid when recorded + on credit / paid later, plus what was paid to suppliers.
- Paying a supplier more than is open asks what the extra is: a new purchase (a paid supplier bill, counted once) or an advance (supplier credit, not an expense until billed).
- A bought animal's price becomes a linked livestock expense (opt-out to avoid duplicates); later price edits update it.
- Home is the cash box: the logo (sidebar, phone top bar) goes there.
- test/integration.test.mjs builds a farm with every flow and checks the screens against each other (with and without tax).

## 23. Release rule — keep the user guide current
- Every release that changes what the user sees also updates src/guide-content.js (sections, tours, "?" help, in both Arabic and English), then sets GUIDE_VERSION to the new version. test/guide.test.mjs fails until GUIDE_VERSION equals package.json's version, and checks that both languages have the same sections and help keys.
- Release checklist: code → tests → guide → changelog (What's new) → MASTER_PROMPT → version bump (store.jsx VERSION + package.json) → build → push.

## 24. 3.16 — Danger zone (Settings, owner only)
- Trash retention: 7 / 30 / 90 / 180 / 365 days (settings.trashDays; autoPurge honours it; Recently deleted shows the period).
- Delete by date range (src/core/danger.mjs): presets older than 1 (recommended) / 2 / 3 years or a custom range; groups money / production / herd. Modes: move to Recently deleted (restorable), or close old years — entries before the cutoff are purged and balances carried forward (customer/supplier/person openings, an `opening` record for cash and capital, milk and egg stock), the period is locked, sold animals keep an archived sale record. Closing runs only when cash, receivables, supplier dues and open bills come out identical.
- Also: empty Recently deleted, start fresh (entries go, lists and settings stay), clear device copies, erase the farm from this device.
- Every action: backup first (default on), a labelled restore point (listed in Settings → Backup), typed DELETE / حذف. test/danger.test.mjs proves balances, P&L and the journal survive closing.

## 25. 3.17 — Production rebuilt, clock & weather, backup replace prompt
- Production → Milk is entries only: a "Milk of the day" card (date arrows, species, herd total or per-animal table; Save/Update replaces that day's entries) and "Milk entries" grouped by day (milking + milk use, tap to edit; tank balance in the header). No charts or statistics on this page. Eggs tab = egg entries with stock.
- Home: SkyClock — digital clock (sliding digits) and weather from the device's precise location (Open-Meteo forecast, BigDataCloud place name), animated CSS sky art, 3-day forecast, refreshed every 30 min, last reading cached for offline.
- "Back up now" (banner, Settings) always asks: replace the existing file (recommended) or save to a new file; the backup folder keeps one replaced file by default (settings.backup.keep = 0), dated copies optional.
- The Danger zone always renders; locked with a note in the sample farm and for non-owners.
