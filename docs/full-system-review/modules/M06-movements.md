# M06 — Movements (جميع أنواع المستندات بما فيها Opening Balance)

## الشاشات

| Screen ID | مسار | Component |
|-----------|------|-----------|
| MOV-LIST | `/movements` | `MovementListComponent` |
| MOV-NEW | `/movements/new` | `MovementFormComponent` |
| MOV-DOC | `/movements/:id` | `MovementFormComponent` |

## الهدف

إنشاء وتحرير وترحيل **مستندات حركة** (`movement_documents`) بأنواع: `OPENING_BALANCE`, `RECEIVE`, `ISSUE`, `TRANSFER`, `ADJUSTMENT`, `BREAKAGE`, `LOST`, … (حسب enum في `schema.prisma`).

## Workflow

```
DRAFT → (خطوات موافقة إن وُجدت لنوع معين) → POSTED
```

- مسار الترحيل للمسودات: `POST /movements/:id/post` — `movement.routes.js`.
- الأدوار: إنشاء/ترحيل `SUPER_ADMIN`, `ADMIN`, `STOREKEEPER`؛ **تحقق من PUT** لأن المسار يستخدم أسماء أدوار قديمة.

## Opening Balance — حرج

- اختيار النوع `OPENING_BALANCE` في النموذج (`movement-form.component.ts`).
- **التكلفة:** تُعرض كـ unit price للـ OB؛ إلزامية تكلفة > 0 عند الترحيل (`OB_ZERO_COST`).
- **السلوك المحاسبي:** يضبط الرصيد إلى الكمية المستهدفة per location — انظر `OPENING-BALANCE-AND-POSTING.md`.
- **القفل:** `checkOBAllowed` + إعدادات `allowOpeningBalance`.

## APIs

| Method | Path | وظيفة |
|--------|------|--------|
| GET | `/movements` | قائمة مع فلاتر |
| POST | `/movements` | إنشاء |
| GET | `/movements/:id` | تفاصيل |
| PUT | `/movements/:id` | تحديث مسودة |
| POST | `/movements/:id/post` | ترحيل |

## Database impact (عند Post)

- `movement_documents` (status → POSTED, `postedAt`)
- `inventory_ledger` (إنشاء)
- `stock_balances` (تحديث/upsert)
- قد يتولد `approval_requests` لأنواع معينة (حسب الخدمة)

## Validations (أمثلة)

- لا ترحيل لمسودة فارغة.
- لا ترحيل مرتين (`status !== DRAFT`).
- فحص فترة مغلقة (`periodGuard`).
- مخزون كافٍ للحركات الخارجة.

## Edge cases

- Concurrent edits على نفس المستند.
- تحديث الصفحة أثناء حفظ مسودة.
- فشل منتصف الترحيل — يجب أن تُرجع المعاملة كاملة (transaction في `postDocument`).

## Permissions

- إنشاء حركات عامة: غالبًا `MOVEMENT_CREATE` للمستخدمين التشغيليين؛ راقب واجهة الأزرار مقابل استجابة 403 من الـ API.

## UI/UX

- قائمة الحركات تعرض حالة OB للمستأجر (مثل المخزون).
- تسميات التكلفة تتغير حسب نوع الحركة.

## مراجع

- `OSE-Frontend/src/app/features/movements/`
- `OSE-backend/src/routes/movement.routes.js`
- `OSE-backend/src/services/movement.service.js`, `posting.service.js`

## 13 — Screenshots

قائمة، نموذج OB، ترحيل ناجح، خطأ فترة مغلقة، خطأ مخزون غير كافٍ.
