# Permissions & Roles — مرجع من الباكند

**المصدر:** `OSE-backend/src/middleware/authorize.js` — كائن `PERMISSIONS` و `PERMISSION_ALIASES`.

## آلية التحقق

- **الأولوية:** إن وُجدت مصفوفة `permissions` في JWT تُستخدم مع `hasPermission` / `requirePermission`.
- **الاحتياطي:** المصفوفة الثابتة `PERMISSIONS` (ربط كل permission بأدوار مسموحة).
- **ORG_MANAGER:** يُعامل غالبًا مثل ADMIN لصفوف المصفوفة التي تتضمن `ADMIN`.
- **SUPER_ADMIN:** مسارات منفصلة تحت `/api/admin` مع `requireSuperAdmin` وليس بالضرورة نفس مصفوفة الـ tenant.

## جدول الصلاحيات (ملخص)

كل صف: **Permission key** → **الأدوار المسموحة** (من الكود).

| Permission | أدوار (مختصرة) |
|------------|----------------|
| BASIC_DATA_EDIT | ADMIN, ORG_MANAGER |
| BASIC_DATA_VIEW | ADMIN, STOREKEEPER, DEPT_MANAGER, COST_CONTROL, FINANCE_MANAGER, AUDITOR, GENERAL_MANAGER, ORG_MANAGER |
| INVENTORY_VIEW | نفس نطاق عرض البيانات الأساسية الواسع + أدوار المخزون |
| MOVEMENT_CREATE | ADMIN, ORG_MANAGER, STOREKEEPER |
| ISSUE_CREATE | + DEPT_MANAGER |
| ISSUE_APPROVE | ADMIN, ORG_MANAGER, DEPT_MANAGER, COST_CONTROL, FINANCE_MANAGER |
| TRANSFER_CREATE | ADMIN, ORG_MANAGER, STOREKEEPER |
| TRANSFER_APPROVE | ADMIN, ORG_MANAGER, DEPT_MANAGER, FINANCE_MANAGER |
| TRANSFER_DISPATCH_RECEIVE | ADMIN, ORG_MANAGER, STOREKEEPER |
| GRN_VIEW | أدوار تشغيلية وتدقيق واسعة |
| GRN_MANAGE | ADMIN, ORG_MANAGER, STOREKEEPER, COST_CONTROL |
| BREAKAGE_CREATE | ADMIN, ORG_MANAGER, STOREKEEPER, DEPT_MANAGER |
| ADJUSTMENT_CREATE | ADMIN, ORG_MANAGER, STOREKEEPER |
| APPROVE_BREAKAGE | + FINANCE_MANAGER, GENERAL_MANAGER |
| STOCK_COUNT_MANAGE / VIEW | حسب الكود |
| REPORTS_VIEW | واسع |
| BREAKAGE_VIEW | ADMIN, ORG_MANAGER, SUPER_ADMIN, DEPT_MANAGER |
| READ_BREAKAGE / READ_LOST | أدوار تكلفة/مالية/إدارة |
| LOST_ITEMS_VIEW | ADMIN, ORG_MANAGER, GENERAL_MANAGER, DEPT_MANAGER |
| APPROVE_LOST | مسار موافقات الضياع |
| REPORTS_EXPORT | من لديه تصدير |
| VIEW_DASHBOARD | يشمل SECURITY |
| DASHBOARD_VIEW | لوحة تحليلات أوسع |
| GET_PASS_* | إنشاء / عرض / موافقات متعددة المراحل |
| IMPORT_CREATE / IMPORT_EXCEL | استيراد |
| USERS_COMPANY_MANAGE | ADMIN, ORG_MANAGER |
| SETTINGS_MANAGE | ADMIN, ORG_MANAGER |
| AUDIT_LOG_VIEW | + FINANCE_MANAGER, AUDITOR, GENERAL_MANAGER |
| STOCK_MANAGE | ADMIN, ORG_MANAGER, STOREKEEPER |
| ITEM_MANAGE | ADMIN, ORG_MANAGER |
| BREAKAGE_APPROVE | مكرر/موازي لـ APPROVE_BREAKAGE في المصفوفة |
| LOST_CREATE | BREAKAGE_CREATE |
| USER_MANAGE / TENANT_MANAGE | إدارة مستخدمين/مستأجر |

## Aliases مهمة

- `MANAGE_SETTINGS` → يُحل إلى `SETTINGS_MANAGE` في المسارات (`setting.routes.js`).
- `READ_BREAKAGE` / `READ_LOST` في JWT قد تُحل إلى `INVENTORY_VIEW` للتحقق (انظر `PERMISSION_ALIASES`).

## ربط الواجهة (`app.routes.ts`)

- `permissionGuard` + `data.permission` أو `data.permissionsAny`.
- Breakage / Lost: `BREAKAGE_NAV_PERMISSIONS_ANY`, `LOST_ITEMS_NAV_PERMISSIONS_ANY` في `approvals-nav-permissions.ts`.

للتفصيل حسب الشاشة، انظر ملف الوحدة تحت `modules/`.
