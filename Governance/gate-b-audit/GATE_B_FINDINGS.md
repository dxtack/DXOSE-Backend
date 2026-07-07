# Gate B Findings

Generated: 2026-06-27T16:23:37Z

## FIND-001: Keyboard-first navigation contract not adopted on governed document shells
- **Status:** PARTIAL
- **Severity:** Medium
- **Requirements:** C17-17.2-001, C17-17.2-002, C17-17.2-003, C17-17.3-001
- **Expected:** Enter advances focus; Alt+S/B shortcuts; keyboard-first on all modules (Ch17).
- **Actual:** Directive and registry exist but appKeyboardNav not wired in document create/edit/detail templates.
- **Evidence:** OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts; grep shows no template usage outside directive file.
- **Root cause:** Unknown — infrastructure landed without module adoption.
- **Impact:** Keyboard users inconsistent experience on operational documents.
- **Scope:** system-wide UX
- **Layer:** Code
- **Remediation proposal (not executed):** Wire appKeyboardNav on D1/D5 shells; add e2e keyboard regression.

## FIND-002: Validation orchestrator not integrated across governed forms
- **Status:** PARTIAL
- **Severity:** Medium
- **Requirements:** C18-18.2-001, C18-18.2-002, C18-18.2-003
- **Expected:** Unified validation channels, focus-first-error, no duplicate channels (Ch18).
- **Actual:** validation-orchestrator.service.ts and runGovernedFormValidation util exist with zero feature callers.
- **Evidence:** OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts; core/utils/document-form-validation.util.ts
- **Root cause:** Unknown — partial platform rollout.
- **Impact:** Inconsistent validation UX; risk of duplicate error channels on some screens.
- **Scope:** system-wide UX
- **Layer:** Code
- **Remediation proposal (not executed):** Adopt runGovernedFormValidation in GRN/transfer/breakage/create flows.

## FIND-003: Duplicate error channel dedupe service unused
- **Status:** PARTIAL
- **Severity:** Low
- **Requirements:** C19-19.2-002, C18-18.2-011
- **Expected:** Must not duplicate same error across channels (Ch18/Ch19).
- **Actual:** notification-dedupe.service.ts defined; no inject sites in features.
- **Evidence:** OSE-Frontend/src/app/core/services/notification-dedupe.service.ts
- **Root cause:** Unknown
- **Impact:** Potential duplicate toasts/banners under concurrent validation failures.
- **Scope:** system-wide
- **Layer:** Code
- **Remediation proposal (not executed):** Integrate dedupe in api-error interceptor + form validation paths.

## FIND-004: Long-running operation feedback service unused
- **Status:** PARTIAL
- **Severity:** Low
- **Requirements:** C21-21.2-002
- **Expected:** Must not block entire application for partial operations.
- **Actual:** long-running-operation.service.ts exists; no .watch() callers; modules use local spinners.
- **Evidence:** OSE-Frontend/src/app/core/services/long-running-operation.service.ts
- **Root cause:** Unknown
- **Impact:** Partial operations may block UI on slow paths without standardized continues feedback.
- **Scope:** system-wide UX
- **Layer:** Code
- **Remediation proposal (not executed):** Adopt long-running-operation.service for import/export/approval batches.

## FIND-005: Sensitive print logging — strong recommendation not verified
- **Status:** PARTIAL
- **Severity:** Low
- **Requirements:** C26-26.6-001
- **Expected:** Print of sensitive documents should be logged.
- **Actual:** No confirmed audit hook on all print/PDF export UI actions.
- **Evidence:** Static review of report-viewer-shell and document detail print handlers.
- **Root cause:** Unknown
- **Impact:** Audit trail gap for sensitive print/export.
- **Scope:** Reports + document modules
- **Layer:** Code+Configuration
- **Remediation proposal (not executed):** Add governed print audit events on PDF/print actions.

## FIND-006: Bilingual print/export preference not verified
- **Status:** PARTIAL
- **Severity:** Low
- **Requirements:** C26-26.7-001
- **Expected:** Arabic/English supported per property or user preference on print/export.
- **Actual:** i18n exists globally; print templates not verified for bilingual output.
- **Evidence:** Static review only; no runtime print capture in audit.
- **Root cause:** Unknown
- **Impact:** Localized print may be incomplete.
- **Scope:** Reporting/print
- **Layer:** Code
- **Remediation proposal (not executed):** Verify PDF/print templates with ar/en locales.

## FIND-007: Constitution compliance certification process not runtime-proven
- **Status:** PARTIAL
- **Severity:** Low
- **Requirements:** C29-29.1-001, C29-29.2-002, C29-29.4-001
- **Expected:** Release gating via compliance levels and exception register.
- **Actual:** Governance docs exist; no automated release gate tied to Gate B matrix in CI.
- **Evidence:** docs/governance/CONSTITUTION_v2_CONFORMANCE_MATRIX.md; Gate A Ch29 rows.
- **Root cause:** Unknown
- **Impact:** Process reliance on manual governance review.
- **Scope:** Governance process
- **Layer:** Governance
- **Remediation proposal (not executed):** Wire release checklist to Gate B matrix artifacts.

## FIND-008: Print/export authorization inconsistent across document modules
- **Status:** PARTIAL
- **Severity:** Medium
- **Requirements:** C26-26.3-001, C26-26.4-001
- **Expected:** Print/export subject to same permission model as view; sensitive data masked.
- **Actual:** GRN/transfer gate print on POSTED; breakage/get-pass/lost print always visible.
- **Evidence:** grn-detail.component.ts canDownloadEvidencePack; breakage-detail print buttons unconditional.
- **Root cause:** Unknown — module-by-module implementation drift.
- **Impact:** Potential unauthorized print/export on non-posted or sensitive docs.
- **Scope:** module-specific
- **Layer:** Code
- **Remediation proposal (not executed):** Unify print/export guards with ACC + document state.

## FIND-009: Lost items expose raw internal status labels
- **Status:** PARTIAL
- **Severity:** Medium
- **Requirements:** C2-2.2-014
- **Expected:** User-facing lifecycle labels via constitution mapper (Ch2).
- **Actual:** lost-items-list/detail render LOST_ITEMS.STATUS.{enum} not lostRowStatusLabel().
- **Evidence:** OSE-Frontend lost-items-list.component.html; lost-items-detail.component.html
- **Root cause:** Incomplete migration to constitution-lifecycle.util.ts
- **Impact:** Internal/status vocabulary may leak to users on Lost module.
- **Scope:** Lost Items module
- **Layer:** Code
- **Remediation proposal (not executed):** Apply constitution lifecycle mapper to lost items UI.

## FIND-010: Posted document immutability not enforced at database layer
- **Status:** PARTIAL
- **Severity:** High
- **Requirements:** C5-5.1-003, C13-13.4-001
- **Expected:** Business-immutable after posting except governed reversal.
- **Actual:** Application guards only; no DB triggers/CHECK preventing UPDATE/DELETE on posted lines.
- **Evidence:** prisma/schema.prisma MovementLine/GrnLine; migrations lack immutability triggers
- **Root cause:** Confirmed — schema design delegates immutability to application layer.
- **Impact:** Direct SQL or bypass could mutate posted data.
- **Scope:** system-wide data integrity
- **Layer:** Database+Code
- **Remediation proposal (not executed):** Add DB constraints or immutable views; strengthen service guards audit.

## FIND-011: Static evidence only — runtime/UI verification not completed for all module rules
- **Status:** PARTIAL
- **Severity:** Medium
- **Requirements:** (multiple product/UX rows)
- **Expected:** Full runtime proof per requirement where testable.
- **Actual:** Gate B B1 static code review + 2 static smokes; mutating API/UI scenarios blocked.
- **Evidence:** GATE_B_RUNTIME_SCENARIOS.csv RS-003..RS-005 Blocked
- **Root cause:** Audit scope limited to non-mutating verification in this session.
- **Impact:** PASS/PARTIAL distinctions for module-specific rules rely on code inspection not live proof.
- **Scope:** multi-module
- **Layer:** Process
- **Remediation proposal (not executed):** Execute controlled runtime test plan per module with tenant fixtures.

## FIND-012: Strong recommendations not fully implemented
- **Status:** PARTIAL
- **Severity:** Low
- **Requirements:** C26-26.6-001, C26-26.7-001, C25-25.4-001
- **Expected:** Should-level capabilities implemented where feasible.
- **Actual:** Spot-check only; no confirmed end-to-end behavior.
- **Evidence:** Gate A Strong Recommendation export rows
- **Root cause:** Unknown
- **Impact:** Non-blocking gaps vs mandatory rules.
- **Scope:** various
- **Layer:** Code
- **Remediation proposal (not executed):** Prioritize during hardening; not release blockers.
