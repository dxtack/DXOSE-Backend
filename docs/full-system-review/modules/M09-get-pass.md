# M09 — Get Pass (إذن خروج/عهد)

## الشاشات

| Screen ID | مسار |
|-----------|------|
| GP-LIST | `/get-passes` |
| GP-NEW | `/get-passes/new` |
| GP-EDIT | `/get-passes/:id/edit` |
| GP-DET | `/get-passes/:id` |

## الهدف

إدارة إذن خروج الأصول/العهد بين مواقع أو فنادق (نقل داخلي، إرجاع، إلخ) مع سير موافقات متعدد.

## APIs

- Base: `/get-passes` — `getPass.routes.js`
- تنظيم/فنادق شقيقة: `/organization/*` — `organization.portal.routes.js` (يستخدمها الفرونت في تفاصيل Get Pass).

## Permissions (مصفوفة)

- `GET_PASS_CREATE`, `GET_PASS_VIEW`, `GET_PASS_APPROVE`, `GET_PASS_APPROVE_FINAL`, `GET_PASS_APPROVE_EXIT`, `GET_PASS_APPROVE_RETURN`, `GET_PASS_CONFIRM_DESTINATION` — راجع `PERMISSIONS-REFERENCE.md`.

## Workflow (حالات عالية المستوى)

حسب `GetPassStatus` في Prisma: من `DRAFT` عبر خطوات موافقة متعددة إلى `OUT`, `RETURNED`, `CLOSED`, `REJECTED`, إلخ.

## Business logic & Stock

- حركات مرتبطة بـ `GET_PASS_OUT`, `GET_PASS_RETURN` في الـ ledger عند التنفيذ الفعلي (انظر enum `MovementType`).
- قد توجد إشعارات نظام — `/notifications`.

## OB

- N/A (يأتي بعد تهيئة المخزون).

## Database

- `get_passes`, `get_pass_lines`, `get_pass_returns`, روابط `movement_documents`.

## Edge cases

- نقل داخلي بين مستأجرين (`targetTenantId`) — تحقق من صلاحيات الوجهة.
- صور تلفيات في الإرجاع (JSON في المخطط).

## مراجع

- `OSE-Frontend/src/app/features/get-pass/`
- `OSE-backend/src/routes/getPass.routes.js`, `getPass.service.js`

## 13 — Screenshots

مسار كامل: إنشاء → موافقات → خروج → استلام في الوجهة → إرجاع.
