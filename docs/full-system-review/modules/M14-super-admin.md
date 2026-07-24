# M14 — Super Admin (منصة)

## الشاشات

| مسار | Component |
|------|-----------|
| `/admin/tenants` | `TenantsListComponent` |
| `/admin/logs` | `SuperAdminLogsComponent` |

## Guards

- `authGuard` + `requireSuperAdminGuard` — دور `SUPER_ADMIN` فقط.

## APIs

- Base: `/api/admin` — `superAdmin.routes.js` (ملاحظة: يُحمّل تحت `/api/admin` في `server.js` منفصل عن `routes/index.js`).

### أمثلة endpoints

- `GET/POST /admin/tenants` — إدارة فنادق/مستأجرين
- `POST /admin/tenants/full-organization` — إنشاء منظومة كاملة
- `PUT /admin/tenants/:id` — تحديث اشتراك/حالة
- `POST /admin/tenants/:id/impersonate` — انتحال لدعم UAT (بحذر)
- `GET /admin/logs` — سجلات المنصة

## OB من منظور المنصة

- عند إنشاء مستأجر جديد قد تُضبط إعدادات `allowOpeningBalance` — راجع `superAdmin.service.js` / `tenant.service.js` (إشارات `allowOpeningBalance`).

## Database

- `tenants`, `users`, `super_admin_logs`, جداول اشتراك، إلخ.

## Edge cases

- انتحال المستخدم يسجل في التدقيق؛ لا تستخدم على بيانات إنتاج إلا بسياسة واضحة.

## مراجع

- `OSE-Frontend/src/app/features/admin/tenants-list/`, `super-admin-logs/`
- `OSE-backend/src/routes/superAdmin.routes.js`

## 13 — Screenshots

قائمة المستأجرين، نموذج إنشاء، سجلات المنصة.
