# M05 — Stock Balances, Par Levels, Ledger

## STOCK (`/stock`) — `StockBalancesComponent`

| البند | التفاصيل |
|--------|----------|
| **الهدف** | عرض أرصدة `stock_balances` لكل صنف/موقع. |
| **Guard** | `INVENTORY_VIEW`. |
| **APIs** | `GET /stock-balances` (+ query params) — `stock.routes.js`. |
| **OB status UI** | يعرض ما إذا كان `isOpeningBalanceAllowed` مفتوحًا (مقارنة مع إعدادات المستأجر). |
| **Filters / Search** | حسب التنفيذ في المكوّن. |
| **DB** | قراءة `stock_balances` (+ joins للأسماء). |

## PAR (`/par-levels`) — `ParLevelsListComponent`

| البند | التفاصيل |
|--------|----------|
| **الهدف** | مستويات par / إعادة الطلب التشغيلية. |
| **APIs** | `/par-levels` — `parLevel.routes.js`. |
| **DB** | حقول par على `stock_balances` أو جداول مساعدة — راجع `parLevel.service.js`. |

## LEDGER (`/ledger`) — `LedgerViewerComponent`

| البند | التفاصيل |
|--------|----------|
| **الهدف** | عرض `inventory_ledger` مع فلاتر. |
| **APIs** | `GET /ledger` — `ledger.routes.js`. |
| **Movement types** | يشمل `OPENING_BALANCE` مع تنسيق مميز في الواجهة. |
| **OB** | مراجعة قيود OB هنا بعد الترحيل؛ يجب أن تطابق تغييرات `stock_balances`. |

## Business logic

- **لا ترحيل من هذه الشاشات** (قراءة فقط ما لم يُضف زر إجراء لاحقًا).
- الـ Ledger مصدر حقيقة لحركة المخزون الزمنية؛ الـ Stock لقطة رصيد حالية.

## Edge cases

- أداء عند آلاف الصفوف — ترقيم صفحات من الـ API (`meta`).
- فلاتر تاريخ تتقاطع مع `period_close` (عرض تاريخي لحركات داخل فترة مغلقة مسموح للقراءة عادة).

## مراجع

- `OSE-Frontend/src/app/features/stock/`, `par-levels/`, `ledger/`
- `OSE-backend/src/routes/stock.routes.js`, `parLevel.routes.js`, `ledger.routes.js`

## 13 — Screenshots

جدول مخزون مع OB badge، تفاصيل سطر، فلاتر دفتر الحساب.
