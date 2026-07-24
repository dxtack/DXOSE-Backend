# Opening Balance + Posting Engine — مرجع حرج للـ UAT

**الملفات الأساسية**

- `OSE-backend/src/services/setting.service.js` — حالة OB، التفعيل، الإنهاء، snapshot.
- `OSE-backend/src/services/posting.service.js` — ترحيل المستندات، WAC، Ledger، سلوك OB.
- `OSE-backend/src/services/periodGuard.service.js` — `checkOBAllowed`, `checkPeriodLock`.
- `OSE-backend/src/routes/setting.routes.js` — `ob-eligible`, `inventory-status`, `ob-lock`, `ob-enable`, `ob-finalize`.
- `OSE-backend/src/routes/inventory.routes.js` — `PATCH /inventory/status` (تفعيل مرحلة OB للمستأجر).
- **الواجهة:** حركات من نوع `OPENING_BALANCE` في `movement-form.component.ts`؛ عرض الحالة في `stock-balances`, `movement-list`, `ledger-viewer`.

---

## 1) مفاهيم الحالة (OB Phase)

| الحالة المنطقية | معنى تقريبي | مصدر |
|-----------------|-------------|------|
| `OPEN` | السماح بإدخال/تعديل OB وترحيلها | `allowOpeningBalance` = `OPEN` |
| `INITIAL_LOCK` | افتراضي/مقفل حتى يفعّل المسؤول | لا يوجد صف أو قيمة ليست OPEN |
| `FINALIZED` | أُنهي OB وحُفظ snapshot | `allowOpeningBalance` = `LOCKED` + وجود `obFinalizeSnapshot.finalizedAt` |

**دوال رئيسية**

- `getObStatus(tenantId)` — يحدد OPEN / FINALIZED / INITIAL_LOCK.
- `isOpeningBalanceAllowed(tenantId)` — للواجهات: هل مسموح استيراد/تعديل OB؟
- `enableOpeningBalanceStage` — يفتح OB، يضبط `isOpeningBalanceAllowed`, يمسح snapshot (ولا يسمح إن كان قد finalized).
- `finalizeOpeningBalance` — تحقق صارم + ترحيل كل مسودات OB + قفل + snapshot.

---

## 2) إنشاء Opening Balance

1. **مستند حركة** `MovementDocument` بنوع `OPENING_BALANCE` وحالة `DRAFT` (عبر واجهة الحركات أو تدفقات أخرى حسب المنتج).
2. **بنود** `MovementLine`: صنف، موقع، كمية بالوحدة الأساسية، **unitCost إلزامي** عند الترحيل.
3. عند **الترحيل** (`postDocument`):
   - `checkPeriodLock` على تاريخ المستند.
   - `checkOBAllowed`: إذا `allowOpeningBalance === 'LOCKED'` → خطأ `OB_LOCKED` (من `periodGuard`؛ الرسالة بالعربية في الكود).

---

## 3) سلوك المخزون عند OB (مختلف عن الاستلام العادي)

من `posting.service.js`:

- لـ `OPENING_BALANCE`، التحديث **ليس تراكميًا ببساطة**: يُعامل كـ **target quantity** للموقع.
- يُحسب `deltaQty = targetQty - currentQty` ويُنشأ قيد دفتر يعكس الفرق (qtyIn أو qtyOut).
- `StockBalance` يُحدَّث بـ **upsert**: `qtyOnHand = targetQty`, `wacUnitCost = receiveUnitCost` (من سطر الحركة).

> هذا يعني أن إعادة ترحيل/تعديل سلوك OB أثناء فتح المرحلة قد **يعيد ضبط** الرصيد نحو الكمية المستهدفة وليس “إضافة” فوق الرصيد القديم بنفس منطق RECEIVE.

---

## 4) WAC أثناء OB

- بعد الترحيل، **WAC للموقع** يصبح `receiveUnitCost` القادم من سطر OB (للسطر المعني).
- للحركات غير OB، المسار المعتاد: متوسط مرجح من `totalValueBefore + receiveTotalValue` على `newTotalQty`.

---

## 5) Ledger

- كل تعديل على `stock_balances` في `postDocument` يجب أن يقترن بـ `inventory_ledger.create` في **نفس معاملة DB** (تعليق معماري في `posting.service.js`).
- نوع الحركة في القيد للـ OB: `OPENING_BALANCE` مع qtyIn/qtyOut حسب الـ delta.

---

## 5b) قفل تلقائي بعد أول حركة ليست OB (حرج للـ UAT)

عند نجاح ترحيل **أي** مستند **ليست** من نوع `OPENING_BALANCE`، ينفّذ `postDocument` تحديثًا لـ `tenant_settings.allowOpeningBalance` إلى القيمة `LOCKED` مع سبب يشير إلى المستند (`posting.service.js` — تعليق "Auto-lock Opening Balance").

**النتيجة التشغيلية:** محاولات لاحقة لترحيل OB تفشل عند `checkOBAllowed` (`OB_LOCKED`) ما لم تُعاد فتح مرحلة OB عبر `ob-enable` / `PATCH /inventory/status` — مع احترام منع إعادة الفتح بعد `FINALIZED`.

---

## 6) إنهاء OB (`finalizeOpeningBalance`)

**شروط ما قبل الترحيل الجماعي**

- وجود أصناف في المستأجر (`itemCount > 0`).
- وجود بنود مسودة OB بكمية أساسية > 0.
- لا صفوف بكمية أو تكلفة غير صالحة؛ لا أصناف نشطة بدون `ItemUnit` من نوع `BASE`.

**ما يحدث داخل transaction**

1. جلب كل `MovementDocument` لـ `OPENING_BALANCE` + `DRAFT` وترتيبها.
2. لكل مستند: `postingService.postDocument(id, tenantId, userId, tx)`.
3. تحديث إعدادات:
   - `allowOpeningBalance` → `LOCKED`
   - `isOpeningBalanceAllowed` → `false`
4. حساب `snapshotSummary` من `stock_balances` (أصناف ذات qtyOnHand > 0، قيمة افتتاحية تقريبية).
5. حفظ `obFinalizeSnapshot` (JSON).
6. `auditTrail` بإجراء `FINALIZE_OB` على كيان الإعدادات.

**أكواد أخطاء:** `OB_FINALIZE_NO_ITEMS`, `OB_FINALIZE_EMPTY_WAREHOUSE`, `OB_FINALIZE_VALIDATION_FAILED`, وأخطاء ترحيل إن فشلت.

---

## 7) APIs مرتبطة بـ OB

| Method | Path | ملاحظة |
|--------|------|--------|
| GET | `/settings/ob-eligible` | أهلية OB |
| GET | `/settings/inventory-status` | حالة كاملة + snapshot |
| POST | `/settings/ob-lock` | قفل (سبب) — `authorize SUPER_ADMIN, ADMIN` |
| POST | `/settings/ob-enable` | تفعيل — `+ ORG_MANAGER` |
| POST | `/settings/ob-finalize` | إنهاء — `SUPER_ADMIN, ADMIN` |
| PATCH | `/inventory/status` | body: `isOpeningBalanceAllowed: true` + `reason` — يستدعي `enableOpeningBalanceStage`؛ لا يقبل `false` (يُوجّه لـ ob-lock) |

---

## 8) تأثير OB على التقارير والفترات

- **التقارير التي تعتمد على ledger:** تتعامل مع حركات `OPENING_BALANCE` صراحة في خدمات مثل `summaryReport.service.js`, `stockReport.service.js` (افتتاحي الفترة + قيود OB).
- **إغلاق الفترة:** `periodGuard` يمنع حركات ضمن فترات مغلقة؛ OB تخضع لنفس التحقق عند الترحيل.
- **بعد FINALIZED:** `checkOBAllowed` يرفض الترحيل إذا كان الإعداد `LOCKED` — التصحيح يتم عبر حركات أخرى (مثل Adjustment) حسب سياسة العمل.

---

## 9) حماية من الفساد (Guards)

- معاملة DB واحدة للترحيل.
- ربط إلزامي Ledger ↔ StockBalance في المحرك.
- منع تكلفة صفر لـ OB عند الترحيل (`OB_ZERO_COST`).
- تحقق finalize صارم قبل قفل نهائي.
- منع إعادة فتح OB بعد snapshot نهائي (`OB_ALREADY_FINALIZED`).

---

## 10) فروقات يجب مراقبتها في الـ UAT

- **Default `getSetting('allowOpeningBalance')`** يعيد `LOCKED` عند عدم وجود صف، بينما **`checkOBAllowed`** يسمح إذا **لا يوجد صف** في `tenant_setting`. هذه حالة انتقالية/legacy — سجّل السلوك الفعلي عند أول ترحيل OB في بيئة نظيفة.
- **أدوار `movement.routes` على PUT** تستخدم أسماء قديمة (`inventory_manager`) — تحقق من توافقها مع أدوار الإنتاج أثناء الاختبار.

---

## 11) جداول DB شائعة التأثر

| الجدول | متى |
|--------|-----|
| `movement_documents`, `movement_lines` | إنشاء/تحديث مسودة OB؛ تحديث status عند الترحيل |
| `stock_balances` | upsert/update عبر `postDocument` |
| `inventory_ledger` | إنشاء قيود |
| `tenant_settings` | مفاتيح OB + snapshot |
| `audit_log` / سجلات الإعدادات | تفعيل، قفل، إنهاء |

(انظر `schema.prisma` للأسماء الدقيقة.)
