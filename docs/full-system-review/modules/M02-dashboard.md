# M02 — Dashboard

## الشاشات

### DASH / DASH-SLUG (`/dashboard`, `/:tenantSlug/dashboard`)

| البند | التفاصيل |
|--------|----------|
| **الهدف** | ملخص تشغيلي/تحليلي للمستأجر (حسب الصلاحيات). |
| **Guards** | `permissionGuard` + `VIEW_DASHBOARD`؛ المسار بـ slug يستخدم `tenantDashboardContextGuard`. |
| **APIs** | `GET /dashboard/*` — انظر `dashboard.routes.js`؛ الباكند يفرض `DASHBOARD_VIEW` على ملخصات/مخططات محددة. |
| **Permissions** | عرض: `VIEW_DASHBOARD` للمسار؛ تحليلات أعمق: `DASHBOARD_VIEW` (انظر `authorize.js`). |
| **OB** | N/A مباشرة؛ قد تعرض مؤشرات تعتمد على مخزون تم تهيئته عبر OB. |
| **Reports** | ليست تقارير تفصيلية؛ KPIs. |

## Business logic (عام)

- تجميع بيانات من خدمات المستأجر؛ قد يكون scoped حسب دور المستخدم (تحقق من `dashboard.service.js` في الباكند).

## Database impact

- قراءات غالبًا على aggregates؛ لا ترحيل مخزون من الشاشة نفسها.

## Edge cases

- مستخدم بلا `DASHBOARD_VIEW` قد يرى لوحة مخففة أو أقسام فارغة — سجّل السلوك الفعلي.

## مراجع

- `OSE-Frontend/src/app/features/dashboard/`
- `OSE-backend/src/routes/dashboard.routes.js`
- `OSE-backend/src/services/dashboard.service.js`

## 13 — Screenshots

لوحة فارغة vs ممتلئة، فلاتر التاريخ إن وُجدت.
