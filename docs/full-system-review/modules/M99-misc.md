# M99 — مسارات عامة وPlaceholder

## CORE-REDIRECT (`/`)

- `DefaultRedirectGuard` يوجّه المستخدم للمسار الصحيح (مثلاً حسب slug أو لوحة).
- **UAT:** تحقق من سلوك المستخدم الجديد مقابل المستخدم العائد.

## FORBIDDEN (`/forbidden`)

- صفحة صلاحية مرفوضة — بدون guard خاص في المسار؛ تُستخدم بعد توجيه من المنطق.

## COMING SOON (wildcard داخل layout)

- أي مسار غير معرف تحت `MainLayout` يصل إلى `ComingSoonComponent`.
- **UAT:** إن ظهرت هذه الصفحة لمسار متوقع، سجّل **فجوة توثيق/توجيه** وأضف المسار في `SCREEN-REGISTRY.md`.

## Catch-all خارج layout

- `**` → redirect إلى `/login` للمسارات غير المطابقة خارج التطبيق المصادق.

## مراجع

- `OSE-Frontend/src/app/core/pages/default-redirect/`
- `OSE-Frontend/src/app/core/pages/forbidden/`
- `OSE-Frontend/src/app/core/pages/coming-soon/`

## 13 — Screenshots

صفحة forbidden، صفحة قريبًا.
