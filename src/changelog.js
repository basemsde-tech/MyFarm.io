// What's new, newest first. Shown once after an update, and any time from Settings → About.
// Each item: [icon, Arabic, English]. Keep items short — one line each.

export const CHANGELOG = [
  { v: '3.15.0', date: '2026-10-31', items: [
    ['milk', 'الحليب حسب الحيوان: كل نوع بنسبته، وكل حيوان بكميته ومتوسطه ورسم لأيامه، في قسم قابل للطي', 'Milk by animal: each type with its share, and each animal with its amount, average and a small chart, in a section that folds away'],
    ['alert', 'تنبيه عند انخفاض إنتاج حيوان، وقائمة بالحيوانات الحلوب دون تسجيل', 'A flag when an animal’s yield drops, and a list of milking animals with no entries'],
  ] },
  { v: '3.14.4', date: '2026-10-31', items: [
    ['help', 'دليل الاستخدام محدَّث بكل الميزات الجديدة، مع قسم للإشعارات وآخر للتنقل', 'The user guide now covers every new feature, with sections on notifications and navigation'],
  ] },
  { v: '3.14.3', date: '2026-10-31', items: [
    ['milk', 'إصلاح: الحليب المضاف يظهر في الخزان فورًا حتى لو سُجّل بيع قديم دون حليب مقابل', 'Fix: milk you add shows in the tank straight away, even after an old sale with no milk recorded for it'],
  ] },
  { v: '3.14.2', date: '2026-10-30', items: [
    ['check', 'فحص شامل: إصلاح أخطاء صغيرة وإزالة شيفرة غير مستخدمة', 'A full check-up: small fixes and unused code removed'],
    ['milk', 'سعر الحليب يتبع وحدة المزرعة (كغ أو لتر) ويتحوّل عند تغيير الوحدة في البيع', 'Milk price follows the farm unit (kg or L) and converts when a sale line switches unit'],
    ['gear', 'أُزيل قسم «مزامنة الشركة» غير المفعّل من الإعدادات', 'The unused “Company sync” section was removed from Settings'],
  ] },
  { v: '3.14.1', date: '2026-10-30', items: [
    ['print', 'طباعة أنيقة: المستند يبدأ من أعلى الصفحة بهوامش متساوية، دون عنوان الموقع وتاريخ المتصفح', 'Clean printing: documents start at the top with even margins, without the web address or browser date'],
    ['print', 'رأس الجدول يتكرر في كل صفحة، والمجاميع مرة واحدة في النهاية، والأرقام تحت عناوينها', 'Table headings repeat on every page, totals print once at the end, and numbers line up under their headings'],
  ] },
  { v: '3.14.0', date: '2026-10-30', items: [
    ['alert', 'جرس الإشعارات: ما يحتاج إلى متابعة ونشاط الفريق في قائمة واحدة ذكية', 'A notification bell: what needs attention and team activity in one smart list'],
    ['alert', 'إشعارات على الجهاز تفتح الصفحة المعنية عند النقر (تُفعَّل من الجرس أو الإعدادات)', 'Device notifications that open the right page (turn on from the bell or Settings)'],
    ['cow', 'تنبيهات القطيع: الولادات القريبة، وفحص الحمل، والتجفيف', 'Herd alerts: births coming up, pregnancy checks and dry-off'],
    ['history', 'سجل النشاط صار داخل الجرس، مع رابط للسجل الكامل', 'The activity log now lives in the bell, with a link to the full log'],
    ['image', 'شعار كبير في وسط شاشة الدخول', 'A big logo in the middle of the sign-in screen'],
  ] },
  { v: '3.13.0', date: '2026-10-30', items: [
    ['ledger', 'الأقسام مترابطة بحساب واحد: كل تكلفة تُحسب مرة واحدة، والدفع للمورد يسدّد الفاتورة دون تكرار', 'One set of books: every cost counts once, and paying a supplier settles the bill without double counting'],
    ['receipt', 'الفواتير المدفوعة لاحقًا للمورد تظهر مدفوعة في المصروفات', 'Supplier bills paid later now show as paid in Expenses'],
    ['truck', 'الدفع للمورد بأكثر من المستحق: سجّل الزيادة مشتريات جديدة أو دفعة مقدّمة', 'Paying a supplier more than is open: record the extra as a purchase or an advance'],
    ['cow', 'شراء حيوان يُسجَّل في المصروفات تلقائيًا ويتبع السعر', 'Buying an animal goes into Expenses and follows its price'],
    ['chart', 'التقارير تطابق الأرباح والخسائر تمامًا، والضريبة خارج المبيعات', 'Reports match the profit and loss exactly, with tax kept out of sales'],
    ['image', 'النقر على الشعار يعيدك إلى الصفحة الرئيسية (الصندوق)', 'Tap the logo to go home (the cash box)'],
  ] },
  { v: '3.12.3', date: '2026-10-30', items: [
    ['image', 'الشعار يتحرك عند مرور المؤشر عليه: تمايل خفيف ولمعة', 'The logo comes alive on hover: a gentle sway and a shine'],
  ] },
  { v: '3.12.2', date: '2026-10-30', items: [
    ['image', 'الشعار الجديد بخلفية شفافة يظهر بوضوح على الخلفيات الفاتحة والداكنة', 'The new logo now has a clear background and sits cleanly on light and dark screens'],
  ] },
  { v: '3.12.1', date: '2026-10-30', items: [
    ['image', 'شعار جديد لمزرعتي: ورقة نبات ودائرة رقمية', 'A new Mazraati logo: a leaf and a digital circuit'],
  ] },
  { v: '3.12.0', date: '2026-10-30', items: [
    ['milk', 'بطاقات «استُخدم في» للحليب: أنشئ بطاقاتك وسمّها واختر لها رمزًا', 'Milk “Used for” cards: create your own, name them and pick an icon'],
    ['logout', 'تسجيل الخروج يعود إلى شاشة اختيار الملف، مع رمز الدخول أو دونه', 'Log off returns to the profile screen, with or without a passcode'],
    ['download', 'عند الخروج: نسخة احتياطية بنقرة تحل محل ملف النسخة السابق', 'On log off: a one-tap backup that replaces the previous backup file'],
  ] },
  { v: '3.11.1', date: '2026-10-30', items: [
    ['swap', 'أبقِ المؤشر على أي مبلغ لحظة لتظهر قيمته بـ LBP في فقاعة صغيرة', 'Rest on any amount for a moment and its LBP value pops up in a small bubble'],
  ] },
  { v: '3.11.0', date: '2026-10-30', items: [
    ['sliders', 'تصميم جديد للتنقل: إبراز متحرك، وأقسام قابلة للطي، وشارات لما يحتاج إلى متابعة', 'New navigation: a gliding highlight, folding groups and badges for what needs attention'],
    ['menu', 'شريط سفلي عائم على الهاتف مع زر «+» في الوسط، يختفي أثناء التمرير', 'A floating phone dock with “+” in the middle that tucks away while you scroll'],
    ['cash', 'أصوات للنجاح والخطأ، ورنّة صندوق المحاسبة عند كل بيع (تُطفأ من الإعدادات)', 'Sounds for success and errors, and a cash-register ring on every sale (switch off in Settings)'],
    ['globe', 'الأرقام ورموز العملات بالإنجليزية دائمًا (USD، LBP)', 'Numbers and currency codes always in English (USD, LBP)'],
    ['milk', 'سجل الحليب: فرز وتصفية، وملخص ذكي، وإخفاء القوائم الطويلة بسلاسة', 'Milk log: sort and filter, a smart summary, and long lists that fold away smoothly'],
    ['milk', 'وحدة الحليب الافتراضية الكيلوغرام (يمكن تغييرها إلى اللتر من الإعدادات)', 'Milk unit now defaults to kilograms (switch to litres in Settings)'],
  ] },
  { v: '3.10.2', date: '2026-10-30', items: [
    ['history', 'استيراد بيانات مزرعتي القديمة من الجهاز نفسه بنقرة واحدة، مع مطابقة الأرصدة', 'One-click import of the old Mazraati data on the same device, with balance checks'],
  ] },
  { v: '3.10.1', date: '2026-10-30', items: [
    ['check', 'أسرع بكثير مع سنوات من البيانات: الكتابة فورية، والحفظ يظهر خلال لحظة', 'Much faster with years of data: typing is instant and saves confirm in a moment'],
    ['lock', 'حماية إضافية عند الحفظ السريع المتتالي', 'Extra protection when saving several entries in quick succession'],
  ] },
  { v: '3.10.0', date: '2026-10-30', items: [
    ['download', 'إشعار عند توفر تحديث جديد، مع زر «تحديث الآن»', 'A prompt when a new version is ready, with “Update now”'],
    ['check', 'شاشة «ما الجديد» بعد كل تحديث ناجح', 'A “What’s new” screen after every successful update'],
    ['history', 'سجل كامل للتحديثات من الإعدادات ← حول التطبيق', 'Full update history in Settings → About'],
  ] },
  { v: '3.9.0', date: '2026-10-30', items: [
    ['image', 'شعار المزرعة على كل المستندات، مع فحص جودة الصورة ونصائح للتحسين', 'Your farm logo on every document, with an image quality check and tips'],
    ['help', 'دليل استخدام شامل قابل للبحث', 'A complete, searchable user guide'],
    ['sliders', 'جولات تعليمية قصيرة عند فتح كل صفحة أول مرة', 'Short guided tours the first time you open each page'],
    ['help', 'زر ؟ يشرح أي ميزة بنقرة', 'A ? button that explains any feature in one tap'],
  ] },
  { v: '3.8.0', date: '2026-10-30', items: [
    ['truck', 'أوامر الشراء وتسجيل الاستلام ومطابقة فواتير الموردين', 'Purchase orders, deliveries and supplier bill matching'],
    ['whatsapp', 'إرسال الفواتير والكشوفات عبر واتساب أو كملف PDF', 'Send invoices and statements by WhatsApp or as PDF'],
    ['cash', 'تذكيرات السداد للعملاء المتأخرين', 'Payment reminders for late customers'],
    ['file', 'إرفاق الشهادات والمستندات مع تنبيه قبل انتهائها', 'Attach certificates and documents, with expiry alerts'],
    ['download', 'نسخ احتياطي تلقائي إلى مجلد سحابي', 'Automatic backups to a cloud folder'],
    ['lock', 'حماية الدخول وسجل النشاط', 'Sign-in protection and an activity log'],
    ['swap', 'إدارة أكثر من مزرعة على الجهاز نفسه', 'Several farms on one device'],
  ] },
  { v: '3.7.0', date: '2026-10-30', items: [
    ['cow', 'الحيوانات المُباعة تبقى في السجل مع كل تفاصيل البيع', 'Sold animals stay on record with every sale detail'],
    ['chart', 'سجل المُباعة: الأسعار والأوزان والأرباح', 'Sold register: prices, weights and gains'],
  ] },
  { v: '3.6.0', date: '2026-10-30', items: [
    ['cash', 'التطبيق نقدي بالكامل: كل الحركات عبر الصندوق', 'Cash only: every payment goes through the cash box'],
  ] },
  { v: '3.5.1', date: '2026-10-30', items: [
    ['globe', 'الواجهة كلها بالعربية الفصحى', 'The whole interface in formal Arabic'],
  ] },
  { v: '3.5.0', date: '2026-10-30', items: [
    ['ledger', 'قسم الحسابات: الأرباح والخسائر، والميزانية، وأعمار الذمم، ودفتر اليومية', 'Accounts: profit & loss, balance sheet, aging and journal'],
    ['file', 'فواتير وإيصالات مرقّمة مع تواريخ الاستحقاق', 'Numbered invoices and receipts with due dates'],
  ] },
  { v: '3.4.0', date: '2026-10-29', items: [
    ['sliders', 'أدوات الفرز والتصفية مطوية لشاشة أهدأ', 'Sort and filter tools fold away for a calmer screen'],
  ] },
  { v: '3.3.0', date: '2026-10-29', items: [
    ['user', 'رموز للأدوار وتسجيل دخول جديد', 'Role symbols and a new sign-in'],
  ] },
];

/** 3.10.0 > 3.9.0 */
export function cmpVersion(a, b) {
  const pa = String(a || '0').split('.').map(Number), pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Releases newer than `since` (all when since is empty), newest first. */
export function releasesSince(since, upTo) {
  return CHANGELOG.filter((r) => (!since || cmpVersion(r.v, since) > 0) && (!upTo || cmpVersion(r.v, upTo) <= 0));
}
