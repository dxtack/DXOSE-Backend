# M03 — Item Master, Import & Inventory Shell

## الشاشات

### ITEM-LIST (`/items`)

| البند | التفاصيل |
|--------|----------|
| **الهدف** | إدارة كتالوج الأصناف. |
| **Features** | قائمة، بحث، فلاتر، CRUD حسب التصميم، ربط أقسام/فئات/موردين. |
| **APIs** | `GET/POST /items`, `GET/PUT/DELETE /items/:id` — `item.routes.js`. |
| **Permissions** | واجهة: غير مضبوطة بـ `permissionGuard` على المسار؛ الباكند يفرض صلاحيات على العمليات الحساسة — اختبر بأدوار مختلفة. |
| **OB** | إنشاء صنف قد يدعم أعلام OB (انظر `items.service.ts`: `asOpeningBalance`, `openingBalanceReason`) — ربط مع حركة OB. |
| **DB** | `items`, `item_units`, روابط فئات، إلخ. |

### ITEM-NEW / ITEM-EDIT (`/items/new`, `/items/:id/edit`)

| البند | التفاصيل |
|--------|----------|
| **Validation** | كود فريد لكل مستأجر، وحدات، أسعار، إلزامية الحقول حسب النموذج. |
| **APIs** | `POST /items`, `PUT /items/:id`. |

### ITEM-IMPORT (`/inventory/items/import`)

| البند | التفاصيل |
|--------|----------|
| **الهدف** | استيراد Excel/CSV للأصناف. |
| **Permissions** | `IMPORT_EXCEL` / `IMPORT_CREATE` في المصفوفة. |
| **APIs** | مسارات الاستيراد تحت `items` أو `import` — راجع `item.routes.js` والـ controller. |
| **Edge cases** | صفوف مكررة، أعمدة ناقصة، ترميز الملف. |

### INV-HOME (`/inventory`)

| البند | التفاصيل |
|--------|----------|
| **الحالة** | **Placeholder** — القالب يعرض عنوان ونص ترجمة فقط (`inventory.component.ts`). |
| **UAT** | سجّل كـ known limitation؛ التنقل الفعلي عبر القائمة الجانبية لباقي المسارات. |

### GRN-CREATE-ALT (`/inventory/grn/new`)

| البند | التفاصيل |
|--------|----------|
| **ملاحظة** | نفس وظيفة إنشاء GRN مع مسار بديل؛ يتطلب `GRN_MANAGE`. |
| **التفصيل الكامل** | انظر [M07-grn.md](./M07-grn.md). |

## Opening Balance (ارتباط)

- الأصناف بدون **وحدة أساس (BASE)** تفشل تحقق **finalize OB** — انظر `OPENING-BALANCE-AND-POSTING.md`.

## مراجع

- `OSE-Frontend/src/app/features/items/`
- `OSE-Frontend/src/app/features/inventory/`
- `OSE-backend/src/routes/item.routes.js`

## 13 — Screenshots

قائمة أصناف، نموذج صنف، معالج الاستيراد، صفحة inventory placeholder.
