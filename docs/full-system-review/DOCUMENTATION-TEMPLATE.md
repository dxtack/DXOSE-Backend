# قالب التوثيق لكل شاشة (نسخ ولصق لكل Screen ID)

استبدل `{SCREEN_ID}` و `{MODULE}` قبل الاستخدام.

---

## 1. Screen Overview

| الحقل | القيمة |
|--------|--------|
| **Screen ID** | `{SCREEN_ID}` |
| **اسم الشاشة (عربي)** | |
| **اسم الشاشة (i18n key)** | |
| **المسار (URL)** | |
| **المكوّن (Angular)** | `path/to/component.ts` |
| **الهدف** | |
| **نوع الوحدة (Module)** | `{MODULE}` |
| **Workflow مرتبط** | (مثال: حركة مخزون → موافقات → ترحيل) |

---

## 2. Features & Functions

| الوظيفة | وصف | شرط الظهور | ملاحظات |
|---------|-----|------------|---------|
| Add | | | |
| Edit | | | |
| Delete | | | |
| Post | | | |
| Approve | | | |
| Import | | | |
| Export | | | |
| Filters | | | |
| Search | | | |
| Actions (سطر/مجموعة) | | | |
| Status flow | | | |
| أزرار | | | |
| Validation (واجهة) | | | |

---

## 3. Business Logic

- **حسابات:** (معادلات، حقول مشتقة)
- **تحديث المخزون:** (متى يحدث، قبل/بعد الترحيل)
- **WAC:** (إن وُجد)
- **Ledger entries:** (نوع الحركة، qtyIn/qtyOut)
- **حسابات تلقائية**
- **معالجة خلفية** (cron، طوابير بريد، إلخ)
- **قفل فترة / تجميد**
- **منع تكرار**
- **قيود الموافقة**

---

## 4. Opening Balance Logic (CRITICAL)

- **ينطبق على هذه الشاشة؟** نعم / لا — ولماذا
- إن نعم: ارجع إلى [OPENING-BALANCE-AND-POSTING.md](./OPENING-BALANCE-AND-POSTING.md) وأضف **فقط** السلوك الخاص بهذه الشاشة هنا.
- إن لا: اكتب `N/A`.

---

## 5. Database Impact

لكل عملية رئيسية في الشاشة:

| العملية | جداول متأثرة | Insert / Update / Delete | StockBalance | InventoryLedger | AuditLog / SuperAdminLog |
|---------|----------------|---------------------------|--------------|-----------------|---------------------------|
| | | | | | |

---

## 6. API Details

| Method | Path (نسبة لـ `/api`) | الغرض | Body/Query | أهم validations | أخطاء مميزة (code) |
|--------|------------------------|-------|------------|-------------------|---------------------|
| | | | | | |

**Response shape:** `{ success, message, data, meta? }` — انظر [API-CONVENTIONS.md](./API-CONVENTIONS.md).

---

## 7. Workflow Mapping

```
Draft → … → Posted
```

- الحالات المعتمدة في النظام لهذا الـ flow: Draft / Submitted / Approved / Posted / Cancelled / Locked / Reversed (ما ينطبق فعليًا من الكود)
- أين تُعرض كل حالة في الواجهة؟

---

## 8. Edge Cases & Protection

- منع الترحيل المزدوج
- race conditions (إن وُجدت معالجة)
- مخزون سالب
- استيراد مكرر
- كميات غير صالحة
- مستخدمون متزامنون
- تحديث المتصفح / فقدان مسودة
- فشل الترحيل والاسترداد

---

## 9. Reports & Calculations

(للشاشات التقريرية فقط)

- مصدر البيانات (جداول / خدمات)
- منطق OMC / التقييم
- تصدير Excel
- فلاتر وتجميع

---

## 10. Permissions & Roles

| إجراء | Permission / Role (من الباكند) | ملاحظة |
|--------|-------------------------------|--------|
| عرض | | |
| إنشاء | | |
| تعديل | | |
| ترحيل | | |
| موافقة | | |

انظر [PERMISSIONS-REFERENCE.md](./PERMISSIONS-REFERENCE.md).

---

## 11. UI/UX Notes

- Loading / skeletons
- Toasts / رسائل نجاح وخطأ
- رسائل validation
- Auto-refresh / polling
- أداء (قوائم كبيرة، lazy load)

---

## 12. Known Limitations / Pending Issues

- أخطاء معروفة
- Workarounds
- ميزات غير مكتملة
- ديون تقنية

---

## 13. Screenshots / Workflow Samples

- [ ] لقطة للحالة الرئيسية
- [ ] تسلسل خطوات UAT (مرقّم)
- [ ] (اختياري) رابط فيديو قصير
