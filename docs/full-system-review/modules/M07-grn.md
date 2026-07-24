# M07 — GRN (FutureLog Import & Approval)

## الشاشات

| Screen ID | مسار | ملاحظة |
|-----------|------|--------|
| GRN-LIST | `/grn` | يتطلب `GRN_VIEW` |
| GRN-DET | `/grn/:id` | تفاصيل + سير موافقات |
| GRN-CREATE | `/inventory/grn/new` | يتطلب `GRN_MANAGE` |
| (مسارات أخرى إن وُجدت) | — | راجع الفرونت |

## الهدف

استيراد فواتير/ملفات مورد، مطابقة الأصناف، اعتماد GRN، وترحيل إلى المخزون (حسب حالة المستند).

## APIs (من `grn.routes.js`)

| Method | Path | Permission | وظيفة |
|--------|------|------------|--------|
| GET | `/grn/template` | GRN_MANAGE | قالب Excel |
| POST | `/grn/import/preview` | GRN_MANAGE | معاينة Excel |
| POST | `/grn/import/pdf-preview` | GRN_MANAGE | معاينة PDF |
| POST | `/grn` | GRN_MANAGE | إنشاء GRN |
| GET | `/grn` | GRN_VIEW | قائمة |
| GET | `/grn/:id` | GRN_VIEW | تفاصيل |
| … | مسارات حالة أخرى | راجع الملف الكامل | submit/approve/reject/post |

> التفاصيل الكاملة لكل انتقال في **Swagger**.

## Workflow (مبسط)

```
DRAFT → VALIDATED → PENDING_APPROVAL → APPROVED → POSTED
```

(مع حالات REJECTED حسب التنفيذ — انظر `GrnStatus` في Prisma.)

## Business logic

- استيراد Excel/PDF مع تحقق صف-بصف.
- ربط بـ `item_mappings`, `uom_mappings`, `vendor_mappings` حيث ينطبق.
- الترحيل يلمس `inventory_ledger` و `stock_balances` عبر خدمة GRN/posting.

## OB

- GRN **ليس** OB؛ بعد إنهاء OB، تدفق الاستلام الطبيعي عبر GRN/Receive.

## Database

- `grn_imports`, `grn_lines`, مرفقات، `approval_requests` إن وُجدت، وترحيل مخزون.

## Edge cases

- PDF ممسوح ضوئيًا / مشفر — تحذير في OpenAPI.
- حدود حجم الملف (10MB Excel، 20MB PDF في التعليقات).

## UI/UX

- `grnCreateCanDeactivateGuard` — تنبيه عند مغادرة الصفحة بمسودة.

## مراجع

- `OSE-Frontend/src/app/features/grn/`
- `OSE-backend/src/routes/grn.routes.js`, `grn.service.js`

## 13 — Screenshots

قائمة GRN، تفاصيل خط، معاينة استيراد، موافقة، ترحيل.
