# M08 — Breakage, Lost Items, Lost & Found

## Breakage

### الشاشات

- `BRK-LIST` `/breakage`
- `BRK-NEW` `/breakage/new`
- `BRK-DET` `/breakage/:id`

### Guards (واجهة)

- `permissionGuard` + `permissionsAny`: `INVENTORY_VIEW`, `BREAKAGE_VIEW`, `READ_BREAKAGE`, `APPROVE_BREAKAGE` (انظر `approvals-nav-permissions.ts`).

### APIs (`breakage.routes.js`)

| Method | Path | Permission |
|--------|------|------------|
| POST | `/breakage/` | BREAKAGE_CREATE (+ upload photo) |
| GET | `/breakage/` | VIEW_INVENTORY أو BREAKAGE_VIEW أو READ_BREAKAGE |
| GET | `/breakage/:id` | كما فوق |
| POST | `/breakage/:id/submit` | MANAGE_INVENTORY |
| POST | `/breakage/:id/approve-dept` | APPROVE_BREAKAGE |
| POST | `/breakage/:id/approve-cost` | APPROVE_BREAKAGE |
| POST | `/breakage/:id/approve-finance` | APPROVE_BREAKAGE |
| POST | `/breakage/:id/approve-gm` | APPROVE_BREAKAGE |
| POST | `/breakage/:id/approve` | APPROVE_BREAKAGE |
| POST | `/breakage/:id/reject` | APPROVE_BREAKAGE |
| POST | `/breakage/:id/void` | MANAGE_INVENTORY |
| POST | `/breakage/:id/attachment` | راجع الملف |

### Workflow

سير متعدد الخطوات حتى اعتماد نهائي ثم ترحيل مخزون (نوع `BREAKAGE`).

### DB

- `movement_documents` + `movement_lines`, `approval_requests`, مرفقات.

---

## Lost Items

### الشاشات

- `LOST-LIST` `/lost-items`
- `LOST-NEW` `/lost-items/new`
- `LOST-DET` `/lost-items/:id`

### Guards

- `LOST_ITEMS_VIEW`, `READ_LOST`, `APPROVE_LOST` — `approvals-nav-permissions.ts`.

### APIs

- `OSE-backend/src/routes/lostItems.routes.js` — نمط مشابه (إنشاء، موافقات، رفض).

### OB

- N/A مباشرة؛ يقلل المخزون عند الاعتماد النهائي.

---

## Lost & Found

### الشاشة

- `LF-LIST` `/lost-found` — `LostFoundListComponent`
- **Permission:** `LOST_ITEMS_VIEW`

### APIs

- `/lost-found` — `lostFound.routes.js`

### طبيعة البيانات

- سجلات مفقودات/موجودات (`lost_found_items`) — تمييز عن حركات الضياع المحاسبية.

---

## Edge cases مشتركة

- رفع صور/مرفقات وحجم الملف.
- منع التعديل بعد حالات نهائية (VOID / POSTED — تحقق من الخدمة).

## مراجع

- `OSE-Frontend/src/app/features/breakage/`, `lost-items/`, `lost-found/`
- `OSE-backend/src/routes/breakage.routes.js`, `lostItems.routes.js`, `lostFound.routes.js`

## 13 — Screenshots

كل مسار: قائمة، إنشاء، تفاصيل، خطوة موافقة، رفض.
