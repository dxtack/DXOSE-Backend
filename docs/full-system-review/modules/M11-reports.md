# M11 — Reports (Summary, Engine, Valuation)

## الشاشات

| مسار | Component | ملاحظة |
|------|-----------|--------|
| `/reports/summary` | `SummaryInventoryReportComponent` | تقرير ملخص |
| `/reports/detail` | `ReportEngineComponent` | `reportType: DETAIL` |
| `/reports/breakage` | `ReportEngineComponent` | `BREAKAGE` |
| `/reports/omc` | `ReportEngineComponent` | `OMC` |
| `/reports/transfers` | `ReportEngineComponent` | `TRANSFERS` |
| `/reports/aging` | `ReportEngineComponent` | `AGING` |
| `/reports/valuation` | `ValuationReportComponent` | تقييم كما في تاريخ |

## مصادر البيانات والحساب

- **Summary:** `GET /reports/summary-inventory` — `summaryReport.service.js` (يفسر OB + حركات الفترة — انظر تعليقات `OPENING BALANCE` في الملف).
- **Report engine:** `POST /reports/generate` مع `reportType` ثم `GET /reports/:id` لعرض JSON المحفوظ.
- **Valuation:** `GET /reports/valuation` — `report.controller` / خدمة التقييم.
- **تصدير:** `GET /reports/:id/excel`, `GET /reports/:id/pdf` — يتطلب `REPORTS_EXPORT`.

## Permissions

- عرض: `REPORTS_VIEW`
- تصدير PDF/Excel للتقارير المولّدة: `REPORTS_EXPORT`

## OMC logic

- تقرير OMC يعتمد على اتساق **Opening + Movements + Closing** مع `inventory_ledger`؛ أي كسر في ترحيل OB أو قيود ناقصة يظهر هنا — راجع `OPENING-BALANCE-AND-POSTING.md`.

## Frontend service

- `InventoryReportsService` → `${apiUrl}/reports/*`

### ملاحظة تغطية (Known check)

- الفرونت يستدعي `GET /reports/valuation/excel` في `downloadValuationExcel`؛ **لم يُعثر على مسار مطابق في `reports.routes.js` الحالي**. سجّل في UAT: إما إضافة مسار في الباكند أو تعديل الواجهة — حتى لا يفشل التصدير صامتًا.

## Database

- تقارير مولّدة: `generated_reports` (JSON)
- قراءات على `inventory_ledger`, `stock_balances`, لقطات فترة عند الاقتضاء

## Edge cases

- نطاقات تاريخ كبيرة — الأداء.
- فلاتر أقسام/فئات فارغة = كل البيانات؟ — تحقق من السلوك.

## مراجع

- `OSE-Frontend/src/app/features/reports/`
- `OSE-backend/src/routes/reports.routes.js`
- `OSE-backend/src/services/summaryReport.service.js`, `report.service.js`

## 13 — Screenshots

كل تبويب تقرير، فلاتر، مخرجات، محاولة تصدير.
