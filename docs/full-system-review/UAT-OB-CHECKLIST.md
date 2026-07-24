# UAT Checklist — Opening Balance & Financial Integrity

استخدم هذا أثناء الجلسات مع [OPENING-BALANCE-AND-POSTING.md](./OPENING-BALANCE-AND-POSTING.md).

## تهيئة

- [ ] مستأجر تجريبي، قاعدة نظيفة أو نسخة معزولة.
- [ ] Master data: مواقع، أقسام، فئات، وحدات، أصناف **مع ItemUnit BASE** لكل صنف نشط.

## مرحلة OB مفتوحة

- [ ] `GET /settings/inventory-status` يعيد حالة متوقعة.
- [ ] تفعيل مرحلة OB: `POST /settings/ob-enable` أو `PATCH /inventory/status` (سبب مسجل).
- [ ] إنشاء حركة `OPENING_BALANCE` كمسودة مع سطور متعددة المواقع.
- [ ] رفض ترحيل سطر بتكلفة 0 (`OB_ZERO_COST`).
- [ ] ترحيل مسودة OB — التحقق من `stock_balances` و `inventory_ledger` لنفس الكميات/القيم.

## إنهاء OB

- [ ] فشل متوقع: لا أصناف (`OB_FINALIZE_NO_ITEMS`).
- [ ] فشل متوقع: مسودة بدون كميات (`OB_FINALIZE_EMPTY_WAREHOUSE`).
- [ ] فشل متوقع: صنف بدون وحدة أساس (`OB_FINALIZE_VALIDATION_FAILED`).
- [ ] نجاح: `POST /settings/ob-finalize` ثم حالة `FINALIZED` و snapshot.
- [ ] محاولة إعادة فتح بعد النهائي — `OB_ALREADY_FINALIZED`.

## بعد الإنهاء

- [ ] محاولة ترحيل OB جديد — رفض (`OB_LOCKED` من periodGuard عند وجود LOCKED).
- [ ] تقرير Summary / OMC يتضمن افتتاحي الفترة بشكل منطقي.
- [ ] حركة `RECEIVE` أو GRN تغيّر WAC كما هو متوقع (ليست منطق OB).

## فترة مغلقة

- [ ] إغلاق شهر من `/period-close` ثم محاولة حركة بتاريخ داخل الشهر — رفض `PERIOD_LOCKED_*`.

## توقيع المُراجع

| التاريخ | الاسم | النتيجة |
|---------|-------|---------|
| | | |
