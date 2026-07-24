# Final Full System Review — UAT Documentation Pack

هذا المجلد يجهّز مراجعة شاملة قبل **Pilot / Go-Live**: وظيفي + تقني، مع تتبع مباشر لملفات الكود في `OSE-Frontend` و `OSE-backend`.

## كيفية الاستخدام في الـ UAT

1. ابدأ من **[SCREEN-REGISTRY.md](./SCREEN-REGISTRY.md)** للتأكد أن كل مسار واجهة مغطى.
2. لكل وحدة، افتح الملف تحت `modules/` واتبع الأقسام 1–12 لكل شاشة (القسم 13 لقطات/سيناريوهات يُكمل يدويًا أثناء الجلسات).
3. راجع **[OPENING-BALANCE-AND-POSTING.md](./OPENING-BALANCE-AND-POSTING.md)** قبل أي اختبار مالي (حرج).
4. راجع **[PERMISSIONS-REFERENCE.md](./PERMISSIONS-REFERENCE.md)** و **[API-CONVENTIONS.md](./API-CONVENTIONS.md)** عند اختبار الصلاحيات والـ API.

## هيكل الملفات

| الملف | الغرض |
|--------|--------|
| [DOCUMENTATION-TEMPLATE.md](./DOCUMENTATION-TEMPLATE.md) | القالب الموحّد (13 بندًا) لكل شاشة |
| [SCREEN-REGISTRY.md](./SCREEN-REGISTRY.md) | سجل كل الشاشات والمسارات والمكوّنات |
| [PERMISSIONS-REFERENCE.md](./PERMISSIONS-REFERENCE.md) | مصفوفة الصلاحيات من الباكند |
| [API-CONVENTIONS.md](./API-CONVENTIONS.md) | شكل الاستجابة، التوثيق، الأخطاء |
| [OPENING-BALANCE-AND-POSTING.md](./OPENING-BALANCE-AND-POSTING.md) | OB + محرك الترحيل + WAC + Ledger |
| `modules/M*.md` | تفصيل حسب الوحدات |

## مصادر الحقيقة في الكود

- **مسارات الواجهة:** `OSE-Frontend/src/app/app.routes.ts`
- **تجميع API تحت `/api`:** `OSE-backend/src/routes/index.js`
- **الصلاحيات:** `OSE-backend/src/middleware/authorize.js`
- **ترحيل المخزون والـ OB:** `OSE-backend/src/services/posting.service.js`
- **قفل/تفعيل/إنهاء OB:** `OSE-backend/src/services/setting.service.js` + `OSE-backend/src/routes/setting.routes.js`
- **فترات الإغلاق:** `OSE-backend/src/services/periodGuard.service.js`
- **مخطط قاعدة البيانات:** `OSE-backend/prisma/schema.prisma`

## ملاحظة عن الاكتمال

- بعض الشاشات **placeholder** (مثل صفحة `/inventory` الرئيسية) — مذكور في الوثائق.
- تفاصيل **Request/Response** الكاملة لكل endpoint: راجع **Swagger** على الخادم (يُعرّف في `OSE-backend/src/server.js` و `docs.routes`).
- القسم **13 (Screenshots)** يُملأ أثناء الـ UAT أو التدريب.

### فجوات مكتشفة أثناء التوثيق (يُراجع في الـ UAT)

- **تصدير Valuation Excel:** الواجهة تستدعي `GET /reports/valuation/excel` بينما `reports.routes.js` الحالي لا يعرّف هذا المسار — راجع [M11](./modules/M11-reports.md).
- **تحديث الحركة (PUT):** `movement.routes.js` يستخدم أسماء أدوار قديمة على المسار — تحقق من التوافق مع أدوار الإنتاج.
- **مسارات Requisition/Issue:** غير ظاهرة في `app.routes.ts`؛ إن كانت مطلوبة للـ Pilot أضفها للسجل والتوثيق.

## قائمة تحقق سريعة

- [UAT-OB-CHECKLIST.md](./UAT-OB-CHECKLIST.md) — سيناريو OB وإغلاق الفترة.

## Guided UAT (جلسات مراجعة موجّهة)

- [../guided-uat/README.md](../guided-uat/README.md) — نقطة البداية للمراجعة خطوة بخطوة (Session 01: OB + Posting Engine).
