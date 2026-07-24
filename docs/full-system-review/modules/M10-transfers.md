# M10 — Inter-Store Transfers

## الشاشات

| Screen ID | مسار |
|-----------|------|
| TRF-LIST | `/transfers` |
| TRF-NEW | `/transfers/new` |
| TRF-EDIT | `/transfers/:id/edit` |
| TRF-DET | `/transfers/:id` |

## الهدف

نقل مخزون بين مواقع مع سير موافقة وإرسال/استلام.

## APIs (`transfer.routes.js`)

| Method | Path | Permission |
|--------|------|------------|
| POST | `/transfers` | TRANSFER_CREATE |
| GET | `/transfers` | INVENTORY_VIEW |
| GET | `/transfers/:id` | INVENTORY_VIEW |
| PATCH | `/transfers/:id` | TRANSFER_CREATE (DRAFT فقط) |
| DELETE | `/transfers/:id` | TRANSFER_CREATE (DRAFT فقط) |
| POST | `/transfers/:id/submit` | TRANSFER_CREATE |
| POST | `/transfers/:id/approve` | TRANSFER_APPROVE |
| POST | `/transfers/:id/reject` | TRANSFER_APPROVE |
| POST | `/transfers/:id/dispatch` | TRANSFER_DISPATCH_RECEIVE |
| POST | `/transfers/:id/receive` | TRANSFER_DISPATCH_RECEIVE |

## Workflow

```
DRAFT → SUBMITTED → … (موافقات) → APPROVED → IN_TRANSIT → RECEIVED → CLOSED
```

(راجع `TransferStatus` في Prisma للحالات الدقيقة.)

## Business logic

- التحقق من توفر الكمية عند الإرسال.
- عند الاستلام تحديث الرصيد في الموقع الوجهة؛ قيود `TRANSFER_OUT` / `TRANSFER_IN` في الـ ledger عبر محرك الترحيل المرتبط.

## OB

- لا ينبغي تجاوز سياسة OB المقفلة؛ التحويل حركة تشغيلية بعد الرصيد الافتتاحي.

## Database

- `store_transfers`, `store_transfer_lines`, قد ترتبط `approval_requests`.

## Edge cases

- تعديل مسودة فقط؛ حذف مسودة.
- رفض بعد إرسال جزئي — سلوك حسب الخدمة.

## مراجع

- `OSE-Frontend/src/app/features/transfers/`
- `OSE-backend/src/routes/transfer.routes.js`, `transfer.service.js`

## 13 — Screenshots

قائمة، نموذج، اعتماد، إرسال، استلام.
