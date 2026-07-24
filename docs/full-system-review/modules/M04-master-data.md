# M04 — Master Data (Departments, Suppliers, Categories, Units, Locations)

## الشاشات المشتركة

| Screen ID | مسار | Component |
|-----------|------|-----------|
| DEPT | `/departments` | `DepartmentsListComponent` |
| SUPP | `/suppliers` | `SuppliersListComponent` |
| CAT | `/categories` | `CategoriesListComponent` |
| UNITS | `/units-manage` | `UnitsListComponent` |
| LOC | `/locations` | `LocationsListComponent` |

## الهدف التشغيلي

تهيئة البيانات المرجعية قبل المخزون والحركات والـ GRN.

## APIs (نمطي)

| المورد | Base path |
|--------|-----------|
| أقسام | `/departments` |
| موردون | `/suppliers` |
| فئات | `/categories` |
| وحدات | `/units` |
| مواقع | `/locations` |

راجع ملفات `*.routes.js` المقابلة في `OSE-backend/src/routes/`.

## Permissions

- مصفوفة `BASIC_DATA_EDIT` / `BASIC_DATA_VIEW` — انظر `PERMISSIONS-REFERENCE.md`.
- الواجهة قد لا تضع `permissionGuard` على كل مسار — **اختبر رفض API** لدور قارئ فقط.

## Business logic

- تفرد الأسماء/الأكواد لكل مستأجر (قيود `@@unique` في `schema.prisma` للكيانات المناسبة).
- المواقع لها نوع (`LocationType`: MAIN_STORE, OUTLET_STORE, DEPARTMENT) يؤثر على العمليات اللاحقة.

## OB / Stock

- **مواقع متعددة:** OB يُدخل لكل `locationId` في سطور الحركة.
- حذف موقع مستخدم في مخزون قد يكون مقيدًا — تحقق من قيود FK في الترحيلات.

## Database impact

| الجدول | عمليات |
|--------|--------|
| `departments`, `suppliers`, `categories`, `units`, `locations` | CRUD |
| `audit_log` | عند التدقيق المفعّل للتغييرات الحساسة |

## Edge cases

- تعطيل `isActive` بدل الحذف الفيزيائي حيث ينطبق.
- فئات مرتبطة بأقسام (`departmentId`).

## مراجع

- `OSE-Frontend/src/app/features/master-data/`
- Services: `departments.service.ts`, `suppliers.service.ts`, إلخ.

## 13 — Screenshots

كل كيان: قائمة، نموذج إضافة، رسالة تفرد/خطأ.
