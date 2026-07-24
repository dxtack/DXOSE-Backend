# M01 — Authentication & Password Recovery

## الشاشات

### AUTH-LOGIN (`/login`)

| البند | التفاصيل |
|--------|----------|
| **الهدف** | تسجيل الدخول (مستأجر + مستخدم) والحصول على JWT. |
| **Workflow** | إدخال بيانات → تحقق → توجيه حسب الصلاحيات/الدور (انظر `login.component.ts` و `navigation.service.ts`). |
| **Features** | تسجيل دخول، اختيار/تمرير tenant slug حسب التصميم، روابط نسيت كلمة المرور. |
| **OB** | N/A |
| **APIs (typical)** | `POST /auth/login` — انظر `auth.routes.js` / `auth.controller.js`. |
| **DB** | قراءة `users`, `tenant_members`, جلسات/refresh حسب التنفيذ. |
| **Permissions** | عامة قبل المصادقة. |
| **UI/UX** | تحميل، رسائل خطأ تسجيل الدخول، توجيه بعد النجاح. |

### AUTH-FORGOT (`/forgot-password`)

| البند | التفاصيل |
|--------|----------|
| **الهدف** | طلب إعادة تعيين (OTP/رابط حسب الباكند). |
| **APIs** | `POST /auth/forgot-password` (مع rate limit في `server.js`). |
| **Edge cases** | حد معدل الطلبات؛ عدم كشف وجود الإيميل (سياسة أمنية — تحقق من الاستجابة الفعلية). |

### AUTH-RESET (`/reset-password`)

| البند | التفاصيل |
|--------|----------|
| **الهدف** | إكمال إعادة التعيين بتوكن/OTP. |
| **APIs** | `POST /auth/reset-password` (rate limited). |

## Workflow mapping (Auth)

```
غير مصادق → Login → مصادق → Tenant layout
```

## مراجع كود

- `OSE-Frontend/src/app/features/auth/*`
- `OSE-backend/src/routes/auth.routes.js`
- `OSE-backend/src/controllers/auth.controller.js`

## 13 — Screenshots

أضف لقطات: شاشة الدخول، خطأ بيانات، نسيت كلمة المرور، إعادة التعيين.
