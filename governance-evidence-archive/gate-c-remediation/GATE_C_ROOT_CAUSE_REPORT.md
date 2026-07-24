# Gate C — Root Cause Report

## FIND-002 — Cross-tenant Get Pass HTTP 500

| Field | Value |
|---|---|
| **Finding ID** | FIND-002 |
| **Root cause** | `getGetPassById` in `OSE-backend/src/services/getPass.service.js` calls `findReadablePass()`. When a pass ID belongs to another tenant (or is otherwise unreadable), the service threw `new Error('Get Pass not found')` **without** `status` / `statusCode`. Global `errorHandler.js` defaults missing status to **HTTP 500** (`err.statusCode \|\| err.status \|\| 500`). |
| **Service path** | `getGetPassById` → `findReadablePass` → `throw new Error(...)` → `errorHandler` → 500 |
| **Reproduction (before fix)** | User: `finance@grandhorizon.com` (Hotel A). Foreign pass: `e6eb9ddf-bd9d-431e-9a6b-5d876e93e7f9` (Hotel B). `GET /api/get-passes/{id}` → **HTTP 500**. |
| **Reproduction (after fix)** | Same request → **HTTP 404** `{ success: false, message: "Get Pass not found." }`. No foreign document fields. Random UUID → same 404 (non-disclosure consistent). |
| **Fix (minimal)** | Introduced `passNotFoundErr()` returning `Error` with `{ status: 404 }`; replaced bare `throw new Error('Get Pass not found')` throws in tenant-boundary paths. |
| **Final status** | REMEDIATED |

---

## FIND-001 — Lost Items raw status keys

| Field | Value |
|---|---|
| **Finding ID** | FIND-001 |
| **Root cause** | List and detail templates rendered `{{ 'LOST_ITEMS.STATUS.' + row.status \| translate }}`, exposing internal enum keys when i18n keys were missing or unmapped. Backend already returned `userFacingState` via `withUserFacingState('LOST', ...)`. |
| **Surfaces affected** | List/grid status badge; detail/header badge. Filters use workflow tab i18n keys (not row status). Timeline uses shared `ReturnsWorkflowTimelineComponent` (step labels, not raw enum). PDF/print are evidence attachments (no status key rendering). |
| **Fix (minimal)** | Added `lostRowStatusLabel()` using `constitutionUserFacingStateLabel()` with safe `COMMON.UNKNOWN` fallback (never raw key). Wired `statusLabel()` in list/detail components. |
| **Final status** | REMEDIATED |

---

## FIND-003 — Keyboard navigation not wired

| Field | Value |
|---|---|
| **Finding ID** | FIND-003 |
| **Root cause** | `KeyboardNavigationDirective` (`appKeyboardNav`) existed but was referenced only in its own file and registry comment — zero document shell adoption. |
| **Fix (minimal)** | Imported directive and added `appKeyboardNav` on all applicable editable document shells (see `GATE_C_KEYBOARD_SHELL_INVENTORY.csv`). Extended directive with Esc handler for open ng-zorro selects. |
| **Final status** | REMEDIATED |
