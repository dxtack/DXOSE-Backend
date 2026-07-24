# API Conventions — OSE Backend

## Base URL

- **Production / configured:** حسب `environment.apiUrl` في Angular (ينتهي عادة بـ `/api`).
- **Express:** المسارات تحت `app.use('/api', routes)` في `OSE-backend/src/server.js`.

## Response shape

يتوافق مع `OSE-Frontend/src/app/core/models/api-response.model.ts`:

```json
{
  "success": true,
  "message": "string",
  "data": { },
  "meta": { "page": 1, "limit": 20, "total": 100 },
  "autoPosted": true
}
```

- **`success: false`:** عادة مع `message` وربما `errors` من الـ validator (حسب المسار).
- **HTTP status:** 200 للنجاح؛ 400/401/403/404/422 شائعة للأعمال والتحقق.

## Authentication

- **JWT:** Header `Authorization: Bearer <accessToken>` لمعظم `/api/*` بعد `authenticate` middleware.
- **Refresh:** يدعم الباكند cookie لـ refresh (انظر `refreshCookie.js`)؛ الفرونت قد يرسل refresh في body أيضًا (انظر `auth.interceptor.ts`).

## Discovering endpoints

1. **`OSE-backend/src/routes/index.js`** — قائمة `router.use` لكل مجال.
2. **ملف المسار الفرعي** — مثل `movement.routes.js`, `setting.routes.js`.
3. **Swagger UI** — مثبت عبر `docs.routes` قبل سلسلة الـ API الرئيسية في `server.js`.

## Error codes (أمثلة من الكود)

| Code | معنى تقريبي | مصدر |
|------|-------------|------|
| `OB_ALREADY_FINALIZED` | لا إعادة فتح OB بعد snapshot النهائي | `setting.service.js` |
| `OB_FINALIZE_NO_ITEMS` | لا يوجد أصناف عند إنهاء OB | `setting.service.js` |
| `OB_FINALIZE_EMPTY_WAREHOUSE` | لا توجد كميات OB | `setting.service.js` |
| `OB_FINALIZE_VALIDATION_FAILED` | تكلفة/كمية صفر أو أصناف بدون وحدة أساس | `setting.service.js` |
| `OB_ZERO_COST` | سطر OB بدون unit cost | `posting.service.js` |
| `OB_LOCKED` | OB مقفل | `periodGuard.service.js` |
| `PERIOD_LOCKED_ANNUAL` | سنة مغلقة | `periodGuard.service.js` |
| `PERIOD_LOCKED_MONTHLY` | شهر مغلق | `periodGuard.service.js` |
| `PERIOD_LOCKED_PREV_YEAR` | سنة سابقة مغلقة | `periodGuard.service.js` |

> أضف أكواد جديدة أثناء الـ UAT عند اكتشافها من استجابات الشبكة أو `errorHandler`.
