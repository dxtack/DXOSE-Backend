# M12 — Stock Report (جرد/تقرير مخزون) & Period Close

## Stock Report — واجهة المستأجر

### الشاشات

- `SR-PAGE` `/stock-report` — `StockReportPageComponent`
- `SR-DET` `/stock-report/:id` — `StockReportDetailComponent`

### APIs (`stockReport.routes.js`)

- `GET /stock-report` — قائمة/بيانات التقرير
- `GET /stock-report/export` — تصدير
- `POST /stock-report/upload` — رفع Excel/CSV لكميات الجرد (انظر OpenAPI في الملف)
- مسارات إضافية للاعتماد/الترحيل إن وُجدت — راجع الملف كاملًا و `stockReport.controller.js`

### Business logic

- يربط الصفوف بمواقع/أقسام وسنة.
- قد يمر بسير موافقة مرتبط بـ `saved_stock_reports` و `approval_requests` (حسب التنفيذ).

### OB

- الافتتاحي يدخل في **book qty** مقابل **counted qty** عند مقارنة الجرد — تتبع من `stockReport.service.js`.

### DB

- `saved_stock_reports`, `saved_stock_report_lines`, جداول كميات لكل موقع، إلخ.

---

## Period Close

### الشاشة

- `PERIOD` `/period-close` — `PeriodClosePageComponent`

### APIs (`periodClose.routes.js`)

| Method | Path | Authorization |
|--------|------|----------------|
| GET | `/period-close` | authenticated |
| GET | `/period-close/:id` | authenticated |
| POST | `/period-close/close` | ADMIN, FINANCE_MANAGER |
| POST | `/period-close/:id/reopen` | ADMIN |

### Business logic

- إغلاق سنة/شهر يمنع حركات جديدة ضمن الفترة — `periodGuard.service.js`.
- إعادة فتح تتطلب دور ADMIN فقط (حسب المسار).

### OB interaction

- بعد إغلاق فترات، OB مسموح أو ممنوح حسب الإعدادات؛ رسائل `OB_LOCKED` تظهر عند محاولة ترحيل OB بعد قفل السياسة.

### DB

- `period_closes`, `period_snapshots`

---

## Edge cases

- محاولة ترحيل حركة بتاريخ داخل فترة مغلقة.
- رفع ملف جرد بصيغة غير مدعومة (filter في multer).

## مراجع

- `OSE-Frontend/src/app/features/stock-report/`, `period-close/`
- `OSE-backend/src/routes/stockReport.routes.js`, `periodClose.routes.js`

## 13 — Screenshots

صفحة الجرد، رفع الملف، تفاصيل تقرير، شاشة إغلاق الفترة، خطأ فترة مغلقة.
