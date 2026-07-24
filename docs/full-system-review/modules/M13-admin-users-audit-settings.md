# M13 — Users, Audit Log, Inventory History, Settings

## USERS (`/users`)

| البند | التفاصيل |
|--------|----------|
| **Guard** | `USERS_COMPANY_MANAGE` |
| **الهدف** | إدارة مستخدمي المستأجر والعضويات |
| **APIs** | `/users`, `/roles` — راجع `users.routes.js`, `roles.routes.js` |
| **DB** | `users`, `tenant_members`, `roles` |

## AUDIT LOG (`/audit-log`)

| البند | التفاصيل |
|--------|----------|
| **Guard** | `AUDIT_LOG_VIEW` |
| **APIs** | `/audit-log` — `audit.routes.js` |
| **DB** | `audit_log` |

## INVENTORY HISTORY (`/inventory-history`)

| البند | التفاصيل |
|--------|----------|
| **Guard** | `INVENTORY_VIEW` |
| **الهدف** | سجل تغييرات/أحداث مخزونية (حسب التنفيذ) |
| **APIs** | راجع مكوّن الصفحة وخدماته — قد تستخدم `/audit-log` أو مسار مخصص |

## SETTINGS (`/settings`)

| البند | التفاصيل |
|--------|----------|
| **Guard** | `SETTINGS_MANAGE` |
| **الهدف** | إعدادات المستأجر، حالة المخزون/OB، مفاتيح أخرى |
| **APIs** | `/settings/*` — `setting.routes.js` |
| **OB APIs** | `GET /settings/inventory-status`, `POST /settings/ob-enable`, `ob-lock`, `ob-finalize` |
| **PATCH** | `/inventory/status` — تفعيل مرحلة OB (انظر `inventory.controller.js`) |

### أدوار تفعيل OB

- `PATCH /inventory/status`: أدوار تُسمح لها بـ `canManageTenantOpeningBalance` — SUPER_ADMIN, ADMIN, ORG_MANAGER.
- `ob-finalize` / `ob-lock`: SUPER_ADMIN, ADMIN؛ `ob-enable` يشمل ORG_MANAGER.

## Database

- `tenant_settings`, `audit_log`, سجلات `SuperAdminLog` لا تظهر هنا (تخص M14).

## Edge cases

- محاولة مستخدم عادي تغيير إعداد حساس — 403.
- تعارض بين واجهة الإعدادات وحالة OB الفعلية — اختبر إعادة التحميل بعد `finalize`.

## مراجع

- `OSE-Frontend/src/app/features/admin/`
- `OSE-backend/src/routes/setting.routes.js`, `inventory.routes.js`

## 13 — Screenshots

مستخدم جديد، سجل تدقيق، شاشة إعدادات مع حالة OB.
