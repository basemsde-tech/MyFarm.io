// What's new, newest first. Shown once after an update, and any time from Settings → About.
// Each item: [icon, Arabic, English]. Keep items short — one line each.

export const CHANGELOG = [
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
