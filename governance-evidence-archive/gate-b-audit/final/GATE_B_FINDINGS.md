# Gate B Closeout-Corrected Findings

Generated: 2026-06-27T16:57:03Z

## FIND-001: Lost Items expose raw internal status keys
- **Requirements:** C2-2.1-005, C2-2.3-002
- **Severity:** High
- **Classification:** Compliance
- **Expected:** User-facing lifecycle labels via constitution mapper
- **Actual:** lost-items-list/detail render LOST_ITEMS.STATUS.{enum}
- **Root cause:** Confirmed — incomplete migration to constitution-lifecycle.util.ts
- **Evidence:** OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html:18-20 [LOST_ITEMS.STATUS] — raw enum key in template, not constitutionUserFacingStateLabel() | OSE-Frontend/src/app/features/lost-items/lost-items-list/lost-items-list.component.html:144-146,199-201 [LOST_ITEMS.STATUS] — raw enum keys in list

## FIND-002: Cross-tenant Get Pass returns HTTP 500 — safe error handling failure
- **Requirements:** C23-23.6-002
- **Severity:** High
- **Classification:** Compliance
- **Expected:** Cross-tenant request denied with safe 403/404 authorization boundary response
- **Actual:** RS-XT-001: GET /get-passes/{hotelB_id} with Hotel A token → HTTP 500
- **Root cause:** Unknown
- **data_leak_confirmed:** False
- **tenant_isolation_failure_confirmed:** not proven
- **safe_error_handling_failure_confirmed:** True
- **Evidence:** GATE_B_CURRENT_SESSION_RUNTIME.json → scenarios[RS-XT-001]

## FIND-003: Keyboard navigation infrastructure present but not adopted on document shells
- **Requirements:** C17-17.2-001, C17-17.3-001, C23-23.4-001, C28-28.4-001
- **Severity:** Medium
- **Classification:** Compliance
- **Expected:** appKeyboardNav wired on governed create/edit/detail templates
- **Actual:** Directive exists; templates lack [appKeyboardNav] bindings on document shells
- **Root cause:** Unknown
- **Evidence:** OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts:13-14 [appKeyboardNav] — directive exists | limitation: no [appKeyboardNav] on governed document shell templates
