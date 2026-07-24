# Gate B FINAL Findings

Generated: 2026-06-27T16:47:17Z

## FIND-001: Breakage workflow create returned HTTP 403 for DEPT_MANAGER_FB
- **Requirements:** C3-3.1-001, C3-3.3-002
- **Severity:** High
- **Expected:** Dept manager can create breakage in assigned department scope
- **Actual:** WF-BRK-CREATE HTTP 403
- **Root cause:** Unknown — permission/assignment or stock fixture scope
- **Evidence:** RS-GP-001=Passed (GATE_B_RUNTIME_RESULTS.json); RS-GP-002=Passed (GATE_B_RUNTIME_RESULTS.json); WF-BRK-CREATE=FAIL (WORKFLOW_RUNTIME_HARNESS.json); WF-GP-CREATE=PASS (WORKFLOW_RUNTIME_HARNESS.json); WF-GP-SUBMIT=PASS (WORKFLOW_RUNTIME_HARNESS.json); 

## FIND-002: Compliance gap: C23-23.6-002
- **Requirements:** C23-23.6-002
- **Severity:** High
- **Expected:** Tenant isolation — no cross-tenant data
- **Actual:** RS-XT-001 failed; XT-A-READ-B-getPass failed; XT-A-WRONG-TENANT-getPass failed; XT-A-MUT-B-getPass failed; XT-B-READ-A-getPass failed; RS-XT-001 failed; XT-A-READ-B-getPass failed; XT-A-WRONG-TENANT-getPass failed; XT-A-MUT-B-getPass failed; XT-B-READ-A-getPass failed
- **Root cause:** Unknown
- **Evidence:** RS-XT-001=Failed; XT-A-READ-B-getPass=FAIL; XT-A-WRONG-TENANT-getPass=FAIL; XT-A-MUT-B-getPass=FAIL; XT-B-READ-A-getPass=FAIL; RS-XT-001=Failed (GATE_B_RUNTIME_RESULTS.json); XT-A-READ-B-getPass=FAIL (CROSS_TENANT_HARNESS.json); XT-A-WRONG-TENANT-getPass=FAIL (CROSS_TENANT_HARNESS.json); XT-A-MUT-B-getPass=FAIL (CROSS_TENANT_HARNESS.json); XT-B-READ-A-getPass=FAIL (CROSS_TENANT_HARNESS.json); RS-XT-001=Failed (probe); XT-A-READ-B-getPass=FAIL (probe); XT-A-WRONG-TENANT-getPass=FAIL (probe); XT-A

## FIND-003: Compliance gap: C4-4.3-003
- **Requirements:** C4-4.3-003
- **Severity:** High
- **Expected:** Action Allowed = Permission + Workflow + Lifecycle + Business Rules + Scope.
- **Actual:** RS-WF-001 failed
- **Root cause:** Unknown
- **Evidence:** RS-WF-001=Failed (GATE_B_RUNTIME_RESULTS.json); 

## FIND-004: Governance process requirements documented but not CI-gated
- **Requirements:** C29-29.1-001, C29-29.3-001, C29-29.5-001, C29-29.6-001, C29-29.6-002, C29-29.7-001, C29-29.7-002, C29-29.8-001, C29-29.8-002, C29-29.8-003
- **Severity:** Low
- **Expected:** Release compliance automation per Ch29
- **Actual:** docs/governance present; no automated gate
- **Root cause:** Unknown
- **Evidence:** 

## FIND-005: Keyboard-first navigation directive not adopted on document shells
- **Requirements:** C17-17.2-001, C17-17.3-001, C23-23.4-001, C28-28.4-001
- **Severity:** Medium
- **Expected:** appKeyboardNav wired on governed create/edit/detail templates
- **Actual:** Directive exists; no template bindings outside directive file
- **Root cause:** Unknown
- **Evidence:** OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts:12-14 [appKeyboardNav] sha256=1CFF455B479AEEC6… — Keyboard nav directive adoption | OSE-Frontend/src/app/core/registries/keyboard-shortcut.registry.ts:2-4 [appKeyboardNav] sha256=9C49233B9C3BD5EA… — Keyboard nav directive adoption; OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts:12-14 [template usage] sha256=1CFF455B479AEEC6… — Pattern `\[appKeyboardNav\]` matched; 

## FIND-006: Lost items UI exposes raw LOST_ITEMS.STATUS enum keys
- **Requirements:** C2-2.1-005, C2-2.3-002
- **Severity:** High
- **Expected:** Constitution lifecycle mapper labels for user-facing status
- **Actual:** lost-items-list/detail use LOST_ITEMS.STATUS.{enum}
- **Root cause:** Confirmed — incomplete migration to constitution-lifecycle.util.ts
- **Evidence:** OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html:18-20 [LOST_ITEMS.STATUS] sha256=D60429F5FF64162B… — Raw enum keys in lost-items UI | OSE-Frontend/src/app/features/lost-items/lost-items-list/lost-items-list.component.html:144-146 [LOST_ITEMS.STATUS] sha256=88FF9E0A19759AB9… — Raw enum keys in lost-items UI | OSE-Frontend/src/app/features/lost-items/lost-items-list/lost-items-list.component.html:199-201 [LOST_ITEMS.STATUS] sha256=88FF9E0A19759AB9… — Raw

## FIND-007: Posted document immutability not enforced at database layer
- **Requirements:** C5-5.1-003, C6-6.5-009
- **Severity:** High
- **Expected:** DB prevents UPDATE/DELETE on posted business records
- **Actual:** Application guards only; no posted immutability trigger in schema
- **Root cause:** Confirmed — schema delegates immutability to application layer
- **Evidence:** RS-POST-001=Passed (GATE_B_RUNTIME_RESULTS.json); 
