# Screen Registry — جميع الشاشات (من `app.routes.ts`)

**قاعدة:** المسارات أدناه تفترض المستخدم داخل التطبيق بعد تسجيل الدخول (`MainLayoutComponent`) ما لم يُذكر `/admin` أو صفحات auth.

| Screen ID | مسار تقريبي | Angular Component | Guard / Permission | وثائق الوحدة |
|-----------|-------------|-------------------|-------------------|--------------|
| AUTH-LOGIN | `/login` | `LoginComponent` | — | [M01](./modules/M01-auth.md) |
| AUTH-FORGOT | `/forgot-password` | `ForgotPasswordComponent` | — | M01 |
| AUTH-RESET | `/reset-password` | `ResetPasswordComponent` | — | M01 |
| SA-LAYOUT | `/admin/*` | `SuperAdminLayoutComponent` | `authGuard`, `requireSuperAdminGuard` | [M14](./modules/M14-super-admin.md) |
| SA-TENANTS | `/admin/tenants` | `TenantsListComponent` | كما فوق | M14 |
| SA-LOGS | `/admin/logs` | `SuperAdminLogsComponent` | كما فوق | M14 |
| CORE-REDIRECT | `/` | `DefaultRedirectComponent` | `defaultRedirectGuard` | [M99](./modules/M99-misc.md) |
| DASH-SLUG | `/:tenantSlug/dashboard` | `DashboardComponent` | `tenantDashboardContextGuard`, `permission: VIEW_DASHBOARD` | [M02](./modules/M02-dashboard.md) |
| DASH | `/dashboard` | `DashboardComponent` | `permission: VIEW_DASHBOARD` | M02 |
| ITEM-NEW | `/items/new` | `ItemFormComponent` | — (عام للمستخدم المسجّل) | [M03](./modules/M03-items-import-inventory.md) |
| ITEM-EDIT | `/items/:id/edit` | `ItemFormComponent` | — | M03 |
| ITEM-LIST | `/items` | `ItemsListComponent` | — | M03 |
| INV-HOME | `/inventory` | `InventoryComponent` | — | M03 (placeholder) |
| ITEM-IMPORT | `/inventory/items/import` | `ItemImportComponent` | — | M03 |
| GRN-CREATE-ALT | `/inventory/grn/new` | `GrnCreateComponent` | `GRN_MANAGE` | [M07](./modules/M07-grn.md) |
| STOCK | `/stock` | `StockBalancesComponent` | `INVENTORY_VIEW` | [M05](./modules/M05-stock-par-ledger.md) |
| PAR | `/par-levels` | `ParLevelsListComponent` | — | M05 |
| MOV-LIST | `/movements` | `MovementListComponent` | — | [M06](./modules/M06-movements.md) |
| MOV-NEW | `/movements/new` | `MovementFormComponent` | — | M06 |
| MOV-DOC | `/movements/:id` | `MovementFormComponent` | — | M06 |
| LEDGER | `/ledger` | `LedgerViewerComponent` | — | M05 |
| MD-SHELL | `/master-data/*` | `MasterDataShellComponent` | redirects | [M04](./modules/M04-master-data.md) |
| DEPT | `/departments` | `DepartmentsListComponent` | — | M04 |
| SUPP | `/suppliers` | `SuppliersListComponent` | — | M04 |
| CAT | `/categories` | `CategoriesListComponent` | — | M04 |
| UNITS | `/units-manage` | `UnitsListComponent` | — | M04 |
| LOC | `/locations` | `LocationsListComponent` | — | M04 |
| GRN-LIST | `/grn` | `GrnListComponent` | `GRN_VIEW` | M07 |
| GRN-DET | `/grn/:id` | `GrnDetailComponent` | `GRN_VIEW` | M07 |
| BRK-LIST | `/breakage` | `BreakageListComponent` | `permissionsAny` (انظر M08) | [M08](./modules/M08-breakage-lost-lostfound.md) |
| BRK-NEW | `/breakage/new` | `BreakageCreateModalComponent` | كما فوق | M08 |
| BRK-DET | `/breakage/:id` | `BreakageDetailComponent` | كما فوق | M08 |
| LOST-LIST | `/lost-items` | `LostItemsListComponent` | `permissionsAny` (انظر M08) | M08 |
| LOST-NEW | `/lost-items/new` | `LostCreateModalComponent` | كما فوق | M08 |
| LOST-DET | `/lost-items/:id` | `LostItemsDetailComponent` | كما فوق | M08 |
| LF-LIST | `/lost-found` | `LostFoundListComponent` | `LOST_ITEMS_VIEW` | M08 |
| GP-LIST | `/get-passes` | `GetPassListComponent` | — | [M09](./modules/M09-get-pass.md) |
| GP-NEW | `/get-passes/new` | `GetPassFormComponent` | — | M09 |
| GP-EDIT | `/get-passes/:id/edit` | `GetPassFormComponent` | — | M09 |
| GP-DET | `/get-passes/:id` | `GetPassDetailComponent` | — | M09 |
| TRF-LIST | `/transfers` | `TransferListComponent` | — | [M10](./modules/M10-transfers.md) |
| TRF-NEW | `/transfers/new` | `TransferFormComponent` | — | M10 |
| TRF-EDIT | `/transfers/:id/edit` | `TransferFormComponent` | — | M10 |
| TRF-DET | `/transfers/:id` | `TransferDetailComponent` | — | M10 |
| RPT-SUMMARY | `/reports/summary` | `SummaryInventoryReportComponent` | — | [M11](./modules/M11-reports.md) |
| RPT-DETAIL | `/reports/detail` | `ReportEngineComponent` (`reportType: DETAIL`) | — | M11 |
| RPT-BRK | `/reports/breakage` | `ReportEngineComponent` (`BREAKAGE`) | — | M11 |
| RPT-OMC | `/reports/omc` | `ReportEngineComponent` (`OMC`) | — | M11 |
| RPT-TRF | `/reports/transfers` | `ReportEngineComponent` (`TRANSFERS`) | — | M11 |
| RPT-AGING | `/reports/aging` | `ReportEngineComponent` (`AGING`) | — | M11 |
| RPT-VAL | `/reports/valuation` | `ValuationReportComponent` | — | M11 |
| SR-PAGE | `/stock-report` | `StockReportPageComponent` | — | [M12](./modules/M12-stock-report-period-close.md) |
| SR-DET | `/stock-report/:id` | `StockReportDetailComponent` | — | M12 |
| PERIOD | `/period-close` | `PeriodClosePageComponent` | — | M12 |
| USERS | `/users` | `UsersListComponent` | `USERS_COMPANY_MANAGE` | [M13](./modules/M13-admin-users-audit-settings.md) |
| AUDIT | `/audit-log` | `AuditLogPageComponent` | `AUDIT_LOG_VIEW` | M13 |
| INV-HIST | `/inventory-history` | `InventoryHistoryPageComponent` | `INVENTORY_VIEW` | M13 |
| SETTINGS | `/settings` | `SettingsPageComponent` | `SETTINGS_MANAGE` | M13 |
| FORBIDDEN | `/forbidden` | `ForbiddenComponent` | — | [M99](./modules/M99-misc.md) |
| COMING | `/**` (داخل layout) | `ComingSoonComponent` | — | M99 |

### API Base

الواجهة تستخدم `environment.apiUrl` (مثال محلي: `http://localhost:4000/api`). المسارات في أعمدة الـ API في ملفات الوحدات تُذكر **نسبةً إلى** `/api`.

### ملاحظات تغطية

- **Requisitions / Issues:** مسارات واجهة مستخدم صريحة غير موجودة في `app.routes.ts` الحالي؛ إن وُجدت في نسخة لاحقة تُضاف للجدول.
- **Stock Count:** قد يكون عبر مسارات أخرى أو غير معروض في الـ registry الحالي — راجع `OSE-backend/src/routes/stockCount.routes.js` عند توسعة التوثيق.
