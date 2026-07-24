# Semantic Evidence Correction Changelog

Generated: 2026-06-27T22:53:16.751Z

**Classification changes:** 26
**Scenario links removed:** 57
**Scenario links added:** 45

## Lock correction (latest)

- Allowlist: scope scenarios → `C04-4.3-003`; removed `V2-C-WF-EFFECTIVE` from `C05-5.2-011`.
- Cross-cutting: `V2-C-WF-EFFECTIVE` (Configuration Drift), `V2-CF-LEG-LOST-DEPT` (Operational Legacy).
- Reject: removed `V3-H-REJECT-GETPASS`/`IC` from `C03-3.4-007`/`008`.
- Artifacts: `C01-1.2-003`–`009` → Static Verified — Appropriate.
- Evidence: all `supportingEvidence[]` now include `doesNotProve`.

## C01-1.1-001

- **Primary evidence:** `docs/governance/scripts/constitution-base.md`
- **Implemented part:** docs/governance/scripts/constitution-base.md — §1.1 technology-neutral SSOT text
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** docs/governance/scripts/constitution-base.md — §1.1 technology-neutral SSOT text. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C01-1.1-001
- **Remediation front:** Targeted runtime matrix for Platform — C01-1.1-001

## C01-1.1-002

- **Primary evidence:** `docs/governance/scripts/constitution-base.md`
- **Implemented part:** docs/governance/scripts/constitution-base.md — §1.1 governing principles and mandatory rules
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** docs/governance/scripts/constitution-base.md — §1.1 governing principles and mandatory rules. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C01-1.1-002
- **Remediation front:** Targeted runtime matrix for Platform — C01-1.1-002

## C01-1.1-003

- **Primary evidence:** `docs/governance/scripts/constitution-base.md`
- **Implemented part:** docs/governance/scripts/constitution-base.md — §1.1–§1.2 subordinate document conformance hierarchy
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Gap:** docs/governance/scripts/constitution-base.md — §1.1–§1.2 subordinate document conformance hierarchy. Not proven: Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C01-1.1-003
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C01-1.1-003

## C01-1.2-001

- **Primary evidence:** `docs/governance/scripts/constitution-base.md`
- **Implemented part:** docs/governance/scripts/constitution-base.md — §1.2 normative stack order table
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** docs/governance/scripts/constitution-base.md — §1.2 normative stack order table. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C01-1.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C01-1.2-001

## C01-1.2-002

- **Primary evidence:** `docs/governance/scripts/constitution-base.md`
- **Implemented part:** docs/governance/scripts/constitution-base.md — §1.2 no subordinate override clause
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** docs/governance/scripts/constitution-base.md — §1.2 no subordinate override clause. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C01-1.2-002
- **Remediation front:** Targeted runtime matrix for Platform — C01-1.2-002

## C01-1.2-003

- **Classification:** Partial → **Static Verified — Appropriate**
- **Primary evidence:** `docs/governance/scripts/constitution-base.md`

## C01-1.2-004

- **Classification:** Partial → **Static Verified — Appropriate**
- **Primary evidence:** `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md`

## C01-1.2-005

- **Classification:** Partial → **Static Verified — Appropriate**
- **Primary evidence:** `docs/governance/EXCEPTION_REGISTER.md`

## C01-1.2-006

- **Classification:** Partial → **Static Verified — Appropriate**
- **Primary evidence:** `docs/governance/WORKFLOW_MATRIX.md`

## C01-1.2-007

- **Classification:** Partial → **Static Verified — Appropriate**
- **Primary evidence:** `OSE-backend/src/acc-authority/catalog.constitution.js`

## C01-1.2-008

- **Classification:** Partial → **Static Verified — Appropriate**
- **Primary evidence:** `docs/governance/DX_OSE_ARCHITECTURE_IMPLEMENTATION_GUIDE.md`

## C01-1.2-009

- **Classification:** Partial → **Static Verified — Appropriate**
- **Primary evidence:** `docs/governance/DX_OSE_ARCHITECTURE_IMPLEMENTATION_GUIDE.md`

## C01-1.4-001

- **Primary evidence:** `docs/governance/scripts/constitution-base.md`
- **Implemented part:** docs/governance/scripts/constitution-base.md — §1.4 Mandatory Language table (Must/Shall/Should/May/Must not/Will)
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** docs/governance/scripts/constitution-base.md — §1.4 Mandatory Language table (Must/Shall/Should/May/Must not/Will). Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C01-1.4-001
- **Remediation front:** Targeted runtime matrix for Platform — C01-1.4-001

## C02-2.1-001

- **Primary evidence:** `OSE-backend/src/platform/lifecyclePresentation.service.js`
- **Implemented part:** OSE-backend/src/platform/lifecyclePresentation.service.js — mapUserFacingState()
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/src/platform/lifecyclePresentation.service.js — mapUserFacingState(). Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.1-001
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.1-001

## C02-2.1-002

- **Classification:** Governance Conflict → **Partial**
- **Removed scenarios:** V2-C-WF-EFFECTIVE
- **Primary evidence:** `OSE-backend/src/platform/lifecyclePresentation.service.js`
- **Implemented part:** OSE-backend/src/platform/lifecyclePresentation.service.js — withUserFacingState()
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/platform/lifecyclePresentation.service.js — withUserFacingState(). Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.1-002
- **Remediation front:** Targeted runtime matrix for Workflow — C02-2.1-002

## C02-2.1-003

- **Classification:** Governance Conflict → **Partial**
- **Removed scenarios:** V2-C-WF-EFFECTIVE
- **Primary evidence:** `OSE-backend/src/services/grn-workflow-presentation.util.js`
- **Implemented part:** OSE-backend/src/services/grn-workflow-presentation.util.js — buildGrnWorkflowTimeline()
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/grn-workflow-presentation.util.js — buildGrnWorkflowTimeline(). Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.1-003
- **Remediation front:** Targeted runtime matrix for Workflow — C02-2.1-003

## C02-2.1-004

- **Primary evidence:** `OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html — LOST_ITEMS.STATUS.* bindings
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html — LOST_ITEMS.STATUS.* bindings. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C02-2.1-004
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.1-004

## C02-2.2-001

- **Primary evidence:** `OSE-backend/src/platform/lifecyclePresentation.service.js`
- **Implemented part:** OSE-backend/src/platform/lifecyclePresentation.service.js — GRN_USER_STATE / TRANSFER_USER_STATE maps
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/lifecyclePresentation.service.js — GRN_USER_STATE / TRANSFER_USER_STATE maps. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.2-001

## C02-2.2-002

- **Primary evidence:** `OSE-Frontend/src/app/features/lost-items/lost-items-list/lost-items-list.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/lost-items/lost-items-list/lost-items-list.component.html — LOST_ITEMS.STATUS.* row badges
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/lost-items/lost-items-list/lost-items-list.component.html — LOST_ITEMS.STATUS.* row badges. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C02-2.2-002
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.2-002

## C02-2.2-003

- **Primary evidence:** `OSE-Frontend/src/app/features/movements/utils/movement-register-display.util.ts`
- **Implemented part:** OSE-Frontend/src/app/features/movements/utils/movement-register-display.util.ts — MovementRegisterDisplayStatus CANCELLED
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/movements/utils/movement-register-display.util.ts — MovementRegisterDisplayStatus CANCELLED. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C02-2.2-003
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.2-003

## C02-2.2-004

- **Primary evidence:** `OSE-backend/src/platform/lifecyclePresentation.service.js`
- **Implemented part:** OSE-backend/src/platform/lifecyclePresentation.service.js — mapUserFacingState() MOVEMENT VOID → Void
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/lifecyclePresentation.service.js — mapUserFacingState() MOVEMENT VOID → Void. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.2-004
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.2-004

## C02-2.3-001

- **Classification:** Governance Conflict → **Partial**
- **Removed scenarios:** V2-C-WF-EFFECTIVE
- **Primary evidence:** `OSE-backend/src/platform/lifecyclePresentation.service.js`
- **Implemented part:** OSE-backend/src/platform/lifecyclePresentation.service.js — mapUserFacingState()
- **Missing part:** Behavior not runtime-probed on modules in scope: Workflow
- **Gap:** OSE-backend/src/platform/lifecyclePresentation.service.js — mapUserFacingState(). Not proven: Behavior not runtime-probed on modules in scope: Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.3-001
- **Remediation front:** Targeted runtime matrix for Workflow — C02-2.3-001

## C02-2.3-002

- **Classification:** Governance Conflict → **Partial**
- **Removed scenarios:** V2-C-WF-EFFECTIVE
- **Primary evidence:** `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.ts — constitutionUserFacingStateLabel()
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.ts — constitutionUserFacingStateLabel(). Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C02-2.3-002
- **Remediation front:** Targeted runtime matrix for Workflow — C02-2.3-002

## C02-2.3-003

- **Primary evidence:** `OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html — d.status badge
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html — d.status badge. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C02-2.3-003
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.3-003

## C02-2.3-004

- **Classification:** Configuration Drift → **Partial**
- **Removed scenarios:** V2-C-WF-EFFECTIVE
- **Primary evidence:** `OSE-Frontend/src/app/features/lost-items/models/lost-items.model.ts`
- **Implemented part:** OSE-Frontend/src/app/features/lost-items/models/lost-items.model.ts — LostWorkflowStatus enum union
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/lost-items/models/lost-items.model.ts — LostWorkflowStatus enum union. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C02-2.3-004
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.3-004

## C02-2.3-005

- **Primary evidence:** `OSE-backend/src/platform/documentTimeline.service.js`
- **Implemented part:** OSE-backend/src/platform/documentTimeline.service.js — approvalStepsToSlots()
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/platform/documentTimeline.service.js — approvalStepsToSlots(). Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.3-005
- **Remediation front:** Targeted runtime matrix for Workflow — C02-2.3-005

## C02-2.3-006

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — getGrn() returns status + userFacingState
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — getGrn() returns status + userFacingState. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.3-006
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.3-006

## C02-2.3-007

- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Root cause group:** POSTING-LIFECYCLE-01

## C02-2.4.1-001

- **Primary evidence:** `OSE-backend/src/services/postingEngine.service.js`
- **Implemented part:** OSE-backend/src/services/postingEngine.service.js — postGrnInTransaction / postTransferInTransaction exports
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingEngine.service.js — postGrnInTransaction / postTransferInTransaction exports. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.4.1-001
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.4.1-001

## C02-2.4.1-002

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — postGrnInTransaction()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — postGrnInTransaction(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.4.1-002
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.4.1-002

## C02-2.4.2-001

- **Added scenarios:** V2-F-RPT-DRAFT-OUT
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Root cause group:** POSTING-LIFECYCLE-01

## C02-2.5-001

- **Primary evidence:** `OSE-backend/src/platform/lifecyclePresentation.service.js`
- **Implemented part:** OSE-backend/src/platform/lifecyclePresentation.service.js — isEditableUserState()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/lifecyclePresentation.service.js — isEditableUserState(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.5-001
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.5-001

## C02-2.5-002

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — saveGrnDraft()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — saveGrnDraft(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.5-002
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.5-002

## C02-2.5-003

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — sendBackGrn()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — sendBackGrn(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.5-003
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.5-003

## C02-2.5-004

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — updateGrn() line change blocked
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — updateGrn() line change blocked. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.5-004
- **Remediation front:** Targeted runtime matrix for Workflow — C02-2.5-004

## C02-2.5-005

- **Primary evidence:** `OSE-backend/src/platform/lifecyclePresentation.service.js`
- **Implemented part:** OSE-backend/src/platform/lifecyclePresentation.service.js — isEditableUserState()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/lifecyclePresentation.service.js — isEditableUserState(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.5-005
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.5-005

## C02-2.5-006

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — updateGrn() POSTED guard
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — updateGrn() POSTED guard. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.5-006
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.5-006

## C02-2.5-007

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — updateGrn() REJECTED guard
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — updateGrn() REJECTED guard. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.5-007
- **Remediation front:** Targeted runtime matrix for Workflow — C02-2.5-007

## C02-2.5-008

- **Primary evidence:** `OSE-backend/src/platform/lifecyclePresentation.service.js`
- **Implemented part:** OSE-backend/src/platform/lifecyclePresentation.service.js — assertDocumentEditableByLifecycle()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/lifecyclePresentation.service.js — assertDocumentEditableByLifecycle(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.5-008
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.5-008

## C02-2.5-009

- **Primary evidence:** `OSE-backend/src/platform/lifecyclePresentation.service.js`
- **Implemented part:** OSE-backend/src/platform/lifecyclePresentation.service.js — TRANSFER_USER_STATE CLOSED / GET_PASS CLOSED
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/lifecyclePresentation.service.js — TRANSFER_USER_STATE CLOSED / GET_PASS CLOSED. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.5-009
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.5-009

## C02-2.6-001

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — deleteGrn() DRAFT-only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — deleteGrn() DRAFT-only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.6-001
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.6-001

## C02-2.6-002

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — deleteGrn() status check
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — deleteGrn() status check. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.6-002
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.6-002

## C02-2.6-003

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — rejectGrn()
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — rejectGrn(). Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.6-003
- **Remediation front:** Targeted runtime matrix for Workflow — C02-2.6-003

## C02-2.6-004

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — deleteGrn() DRAFT-only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — deleteGrn() DRAFT-only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.6-004
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.6-004

## C02-2.7-001

- **Removed scenarios:** V3-H-SB-LOST, V3-H-SB-GETPASS, V3-H-SB-IC, V2-D-GRN-SB
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Gap:** Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **Root cause group:** SEND-BACK-PLATFORM-01

## C02-2.7-002

- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`

## C02-2.7-003

- **Classification:** Failed Runtime → **Partial**
- **Added scenarios:** V3-H-SB-GRN, V3-H-SB-TRANSFER
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Implemented part:** GRN V2-D-GRN-SUBMIT-AFTER-SB PASS — Submit after Send Back re-enters workflow
- **Missing part:** Transfer/Breakage/Lost/GetPass/IC Submit-after-Return blocked — Send Back HTTP 404
- **Gap:** Submit-entering-workflow after Return verified GRN only
- **Evidence scope:** Runtime partial — modules: GRN, Workflow Pipeline, Transfer
- **Root cause group:** SEND-BACK-PLATFORM-01
- **Remediation front:** Unified Send Back runtime across Transfer/Breakage/Lost/GetPass/IC

## C02-2.7-004

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — updateGrn() REJECTED guard
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — updateGrn() REJECTED guard. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.7-004
- **Remediation front:** Targeted runtime matrix for Workflow — C02-2.7-004

## C02-2.7-005

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — updateGrn() rejected message
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — updateGrn() rejected message. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.7-005
- **Remediation front:** Targeted runtime matrix for Workflow — C02-2.7-005

## C02-2.8-001

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — app-returns-workflow-timeline
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — app-returns-workflow-timeline. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C02-2.8-001
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.8-001

## C02-2.8-002

- **Primary evidence:** `OSE-backend/src/platform/documentTimeline.service.js`
- **Implemented part:** OSE-backend/src/platform/documentTimeline.service.js — getGetPassTimeline()
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Gap:** OSE-backend/src/platform/documentTimeline.service.js — getGetPassTimeline(). Not proven: Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.8-002
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C02-2.8-002

## C02-2.8-003

- **Primary evidence:** `OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.html`
- **Implemented part:** OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.html — slot.actorName display
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.html — slot.actorName display. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C02-2.8-003
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.8-003

## C02-2.8-004

- **Primary evidence:** `OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.html`
- **Implemented part:** OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.html — actedAt
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.html — actedAt. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C02-2.8-004
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.8-004

## C02-2.8-005

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — rejectionReason banner
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — rejectionReason banner. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C02-2.8-005
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.8-005

## C02-2.8-006

- **Primary evidence:** `OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts`
- **Implemented part:** OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts — WorkflowTimelineEntry.comment
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Gap:** OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts — WorkflowTimelineEntry.comment. Not proven: Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C02-2.8-006
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C02-2.8-006

## C02-2.8-007

- **Primary evidence:** `OSE-backend/src/platform/documentTimeline.service.js`
- **Implemented part:** OSE-backend/src/platform/documentTimeline.service.js — fetchAuditEvents()
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/src/platform/documentTimeline.service.js — fetchAuditEvents(). Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.8-007
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.8-007

## C02-2.8-008

- **Primary evidence:** `OSE-backend/src/platform/timelineDuration.util.js`
- **Implemented part:** OSE-backend/src/platform/timelineDuration.util.js — enrichTimelineSlotsWithDuration()
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/src/platform/timelineDuration.util.js — enrichTimelineSlotsWithDuration(). Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C02-2.8-008
- **Remediation front:** Targeted runtime matrix for Platform — C02-2.8-008

## C03-3.1-001

- **Primary evidence:** `OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html — *appHasPermission MOVEMENT_CREATE + registerView().readOnly
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html — *appHasPermission MOVEMENT_CREATE + registerView().readOnly. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C03-3.1-001
- **Remediation front:** Targeted runtime matrix for Platform — C03-3.1-001

## C03-3.1-002

- **Primary evidence:** `OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts`
- **Implemented part:** OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts — userCanActOnReturnsWorkflowWithPermission()
- **Missing part:** Behavior not runtime-probed on modules in scope: Workflow
- **Gap:** OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts — userCanActOnReturnsWorkflowWithPermission(). Not proven: Behavior not runtime-probed on modules in scope: Workflow
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C03-3.1-002
- **Remediation front:** Targeted runtime matrix for Workflow — C03-3.1-002

## C03-3.1-003

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — COMMON.SUBMIT_ACTION on draft validate
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — COMMON.SUBMIT_ACTION on draft validate. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C03-3.1-003
- **Remediation front:** Targeted runtime matrix for Platform — C03-3.1-003

## C03-3.2-001

- **Primary evidence:** `OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts — cancelDraft()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts — cancelDraft(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C03-3.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C03-3.2-001

## C03-3.2-002

- **Primary evidence:** `OSE-backend/src/acc-authority/catalog.constitution.js`
- **Implemented part:** OSE-Frontend/src/app/features/admin/user-rights/user-rights.component.ts — confirmDirtyNavigation footer Leave without saving
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/admin/user-rights/user-rights.component.ts — confirmDirtyNavigation footer Leave without saving. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C03-3.2-002
- **Remediation front:** Targeted runtime matrix for Platform — C03-3.2-002

## C03-3.3-001

- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`

## C03-3.4-001

- **Removed scenarios:** V2-D-GRN-SUBMIT-AFTER-SB
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Gap:** Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **Root cause group:** SEND-BACK-PLATFORM-01

## C03-3.4-002

- **Removed scenarios:** V3-H-SB-TRANSFER, V3-H-SB-BREAKAGE, V3-H-SB-LOST, V3-H-SB-GETPASS, V3-H-SB-IC, V2-D-GRN-SUBMIT-AFTER-SB
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Gap:** Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **Root cause group:** SEND-BACK-PLATFORM-01

## C03-3.4-003

- **Removed scenarios:** V3-H-SB-TRANSFER, V3-H-SB-BREAKAGE, V3-H-SB-LOST, V3-H-SB-GETPASS, V3-H-SB-IC, V2-D-GRN-SUBMIT-AFTER-SB
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Gap:** Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **Root cause group:** SEND-BACK-PLATFORM-01

## C03-3.4-004

- **Removed scenarios:** V2-D-GRN-SUBMIT-AFTER-SB
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Gap:** Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **Root cause group:** SEND-BACK-PLATFORM-01

## C03-3.4-005

- **Removed scenarios:** V3-H-SB-TRANSFER, V3-H-SB-BREAKAGE, V3-H-SB-LOST, V3-H-SB-GETPASS, V3-H-SB-IC, V2-D-GRN-SUBMIT-AFTER-SB
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Gap:** Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **Root cause group:** SEND-BACK-PLATFORM-01

## C03-3.4-006

- **Added scenarios:** V3-H-REJECT-TRANSFER, V3-H-REJECT-BREAKAGE, V3-H-REJECT-LOST
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`

## C03-3.4-007

- **Classification:** Failed Runtime → **Partial**
- **Removed scenarios:** V3-H-REJECT-GETPASS, V3-H-REJECT-IC
- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** Reject PASS scenarios on Transfer/Breakage/Lost prove REJECTED terminal state; no v3 probe attempted edit-after-reject on Get Pass or IC
- **Missing part:** Get Pass and IC post-reject editability not tested; V3-H-REJECT-GETPASS/IC failed before reaching rejected-edit probe
- **Gap:** Reject-end proven on 3 modules; edit-block-after-reject not directly runtime-probed on GP/IC
- **Evidence scope:** Runtime partial — Transfer/Breakage/Lost Reject PASS only; GP/IC Reject execution failed
- **Root cause group:** REJECT-FLOW-01
- **Remediation front:** Reject flow hardening — GP rejectionReason validation + IC permission; then edit-after-reject matrix

## C03-3.4-008

- **Classification:** Failed Runtime → **Partial**
- **Removed scenarios:** V3-H-REJECT-GETPASS, V3-H-REJECT-IC
- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** V3-H-REJECT-GETPASS actual cites missing rejectionReason — partial reason validation signal only
- **Missing part:** No isolated runtime probe verifying reason required/persisted on Transfer/Breakage/Lost/IC successful Reject paths
- **Gap:** Reject reason enforcement observed only indirectly on failed GP Reject; not matrix-tested on all modules
- **Evidence scope:** Runtime partial — Get Pass Reject failure message only
- **Root cause group:** REJECT-FLOW-01
- **Remediation front:** Reject flow hardening — mandatory reason capture runtime matrix all modules

## C03-3.4-009

- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`

## C03-3.4-010

- **Added scenarios:** V3-H-REJECT-TRANSFER, V3-H-REJECT-BREAKAGE, V3-H-REJECT-LOST
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`

## C03-3.5-001

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — single primary per bar block
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — single primary per bar block. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C03-3.5-001
- **Remediation front:** Targeted runtime matrix for Platform — C03-3.5-001

## C03-3.6-001

- **Primary evidence:** `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html — DRAFT Submit primary before Delete danger
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html — DRAFT Submit primary before Delete danger. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C03-3.6-001
- **Remediation front:** Targeted runtime matrix for Platform — C03-3.6-001

## C04-4.1-001

- **Primary evidence:** `OSE-backend/src/middleware/authorize.js`
- **Implemented part:** OSE-backend/src/middleware/authorize.js — requirePermission()
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Gap:** OSE-backend/src/middleware/authorize.js — requirePermission(). Not proven: Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C04-4.1-001
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C04-4.1-001

## C04-4.1-002

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — _assertGrnDualGate()
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — _assertGrnDualGate(). Not proven: Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C04-4.1-002
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C04-4.1-002

## C04-4.1-003

- **Primary evidence:** `OSE-backend/src/platform/lifecyclePresentation.service.js`
- **Implemented part:** OSE-backend/src/platform/lifecyclePresentation.service.js — assertDocumentEditableByLifecycle()
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Gap:** OSE-backend/src/platform/lifecyclePresentation.service.js — assertDocumentEditableByLifecycle(). Not proven: Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C04-4.1-003
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C04-4.1-003

## C04-4.1-004

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — line/qty validation before post
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — line/qty validation before post. Not proven: Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C04-4.1-004
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C04-4.1-004

## C04-4.1-005

- **Primary evidence:** `OSE-backend/src/acc-authority/runtime-permission-matrix.js`
- **Implemented part:** OSE-backend/src/acc-authority/runtime-permission-matrix.js — buildPermissionToRolesMatrix()
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Gap:** OSE-backend/src/acc-authority/runtime-permission-matrix.js — buildPermissionToRolesMatrix(). Not proven: Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C04-4.1-005
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C04-4.1-005

## C04-4.2-001

- **Classification:** Failed Runtime → **Static Verified — Appropriate**
- **Primary evidence:** `OSE-backend/src/routes/grn.routes.js`

## C04-4.3-001

- **Removed scenarios:** V2-CF-GP-NEVER-SUBMIT, V2-A-NEVER-SUBMIT, V2-A-INACTIVE-SUBMIT, V2-A-DELETED-SUBMIT, V2-A-WRONG-PROP-SUBMIT, V2-A-STALE-JWT, V2-CF-WP-NEVER-LIST, V2-B-NEVER-LIST, V2-B-DASH-NEVER, V2-CF-LEG-LOST-DEPT, V2-G-WRONG-SCOPE
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`

## C04-4.3-002

- **Primary evidence:** `OSE-backend/src/acc-authority/step-permission-enforcement.js`
- **Implemented part:** OSE-backend/src/acc-authority/step-permission-enforcement.js — assertDualGateApproval()
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Gap:** OSE-backend/src/acc-authority/step-permission-enforcement.js — assertDualGateApproval(). Not proven: Behavior not runtime-probed on modules in scope: Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C04-4.3-002
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C04-4.3-002

## C04-4.3-003

- **Classification:** Partial → **Failed Runtime**
- **Added scenarios:** V2-CF-GP-NEVER-SUBMIT, V2-CF-WP-NEVER-LIST, V2-CF-WP-NEVER-SUMMARY, V2-CF-WP-NEVER-ALERTS, V2-A-NEVER-SUBMIT, V2-A-INACTIVE-SUBMIT, V2-A-DELETED-SUBMIT, V2-A-WRONG-PROP-SUBMIT, V2-A-VALID-SUBMIT, V2-A-STALE-JWT, V2-B-NEVER-LIST, V2-B-NEVER-SUMMARY, V2-B-NEVER-ALERTS, V2-B-FIN-POS, V2-B-DASH-NEVER, V2-G-NO-ASSIGN, V2-G-WRONG-SCOPE
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Root cause group:** SCOPE-ENFORCEMENT-01

## C04-4.3-004

- **Added scenarios:** V2-I-REQ-PIPELINE, V2-I-STOCK-RPT
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Implemented part:** V2-I-REQ-PIPELINE, V2-I-STOCK-RPT PASS on Workflow Pipeline/Reports
- **Missing part:** No runtime probe on: GRN, Transfer, Breakage/Lost, Get Pass, Inventory Count, Movements
- **Gap:** V2-I-REQ-PIPELINE, V2-I-STOCK-RPT PASS on Workflow Pipeline/Reports. Not proven: No runtime probe on: GRN, Transfer, Breakage/Lost, Get Pass, Inventory Count, Movements
- **Evidence scope:** Runtime partial — modules: Workflow Pipeline, Reports
- **Root cause group:** PARTIAL-C04-4.3-004
- **Remediation front:** Targeted runtime matrix for Platform — C04-4.3-004

## C05-5.1-001

- **Primary evidence:** `OSE-backend/src/services/postingEngine.service.js`
- **Implemented part:** OSE-backend/src/services/postingEngine.service.js — delegates to postingGoverned*
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingEngine.service.js — delegates to postingGoverned*. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.1-002

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — postingEngine.postGrnInTransaction
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — postingEngine.postGrnInTransaction. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.1-003

- **Primary evidence:** `OSE-backend/src/services/breakage.service.js`
- **Implemented part:** OSE-backend/src/services/breakage.service.js — APPROVED immutable lock
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/breakage.service.js — APPROVED immutable lock. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-001

- **Primary evidence:** `OSE-backend/src/routes/grn.routes.js`
- **Implemented part:** OSE-backend/src/routes/grn.routes.js — approval routes requirePermission GRN_MANAGE
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/routes/grn.routes.js — approval routes requirePermission GRN_MANAGE. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-002

- **Classification:** Governance Conflict → **Partial**
- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** grn.service.js + transfer.service.js static workflow-state guards before post
- **Missing part:** Breakage, Lost, Get Pass, Movements, IC posting-path workflow-state runtime verification
- **Gap:** Posting workflow-state check traced on GRN+Transfer only
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-003

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — validatePostingDate before post
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — validatePostingDate before post. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-004

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — line mapping/qty checks in postGrnInTransaction
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — line mapping/qty checks in postGrnInTransaction. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-005

- **Primary evidence:** `OSE-backend/src/services/postingGovernedTransfer.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedTransfer.service.js — source stock check per line
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedTransfer.service.js — source stock check per line. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-006

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — pre-post line validation loop
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — pre-post line validation loop. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-007

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — _advanceGrnApprovalStep() prisma.$transaction
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — _advanceGrnApprovalStep() prisma.$transaction. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-008

- **Primary evidence:** `OSE-backend/src/services/posting.service.js`
- **Implemented part:** OSE-backend/src/services/posting.service.js — postDocument single transactionWork
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/posting.service.js — postDocument single transactionWork. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-009

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — postGrnInTransaction in parent $transaction
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — postGrnInTransaction in parent $transaction. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-010

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — assertNoDuplicateGrnPost
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — assertNoDuplicateGrnPost. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-011

- **Added scenarios:** V2-E-BRK-SUBMIT, V2-E-BRK-AP-CC, V2-E-BRK-AP-FIN, V2-E-BRK-AP-GM, V2-E-LOST-CREATE, V2-E-LOST-AP-CC, V2-E-LOST-AP-FIN, V2-E-LOST-AP-GM, V2-G-PERM-CHECK, V2-G-CREATE, V2-G-VALIDATE, V2-G-NEG-INV, V2-G-POST, V2-G-IDEMP, V2-G-MODEL
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Root cause group:** POSTING-LIFECYCLE-01

## C05-5.2-012

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts — approveFinanceAndPost()
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts — approveFinanceAndPost(). Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-013

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts — approveFinanceAndPost single action
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts — approveFinanceAndPost single action. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C05-5.2-014

- **Primary evidence:** `OSE-backend/src/services/postingEngine.service.js`
- **Implemented part:** OSE-backend/src/services/postingEngine.service.js — single delegation surface
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingEngine.service.js — single delegation surface. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** POSTING-LIFECYCLE-01
- **Remediation front:** Posting state/report alignment — POSTED lifecycle when ledger effects occur

## C06-6.3-001

- **Primary evidence:** `OSE-backend/prisma/schema.prisma`
- **Implemented part:** OSE-backend/prisma/schema.prisma — GrnImport.receivingDate
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/prisma/schema.prisma — GrnImport.receivingDate. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.3-001

## C06-6.3-002

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — postGrnInTransaction() sets postingDate
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — postGrnInTransaction() sets postingDate. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.3-002
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.3-002

## C06-6.3-003

- **Primary evidence:** `OSE-backend/src/platform/postingPeriod.util.js`
- **Implemented part:** OSE-backend/src/platform/postingPeriod.util.js — resolvePostingPeriod()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/postingPeriod.util.js — resolvePostingPeriod(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.3-003
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.3-003

## C06-6.3-004

- **Primary evidence:** `OSE-backend/prisma/schema.prisma`
- **Implemented part:** OSE-backend/prisma/schema.prisma — receivingDate/documentDate vs postingDate columns
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/prisma/schema.prisma — receivingDate/documentDate vs postingDate columns. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.3-004
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.3-004

## C06-6.5-001

- **Primary evidence:** `OSE-backend/src/services/periodGuard.service.js`
- **Implemented part:** OSE-backend/src/services/periodGuard.service.js — validatePostingDate()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/periodGuard.service.js — validatePostingDate(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.5-001
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.5-001

## C06-6.5-002

- **Primary evidence:** `OSE-backend/src/services/periodGuard.service.js`
- **Implemented part:** OSE-backend/src/services/periodGuard.service.js — checkFuturePostingDate() throws FUTURE_POSTING_DATE
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/periodGuard.service.js — checkFuturePostingDate() throws FUTURE_POSTING_DATE. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.5-002
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.5-002

## C06-6.5-003

- **Primary evidence:** `OSE-backend/src/services/periodGuard.service.js`
- **Implemented part:** OSE-backend/src/services/periodGuard.service.js — checkPeriodLock() via validatePostingDate()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/periodGuard.service.js — checkPeriodLock() via validatePostingDate(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.5-003
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.5-003

## C06-6.5-004

- **Primary evidence:** `OSE-backend/src/services/periodGuard.service.js`
- **Implemented part:** OSE-backend/src/services/periodGuard.service.js — assertSequentialCloseAllowed() throws PERIOD_CLOSE_NOT_SEQUENTIAL
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/periodGuard.service.js — assertSequentialCloseAllowed() throws PERIOD_CLOSE_NOT_SEQUENTIAL. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.5-004
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.5-004

## C06-6.5-005

- **Primary evidence:** `OSE-backend/prisma/schema.prisma`
- **Implemented part:** OSE-backend/prisma/schema.prisma — PeriodClose @@unique([tenantId, year, month])
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/prisma/schema.prisma — PeriodClose @@unique([tenantId, year, month]). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.5-005
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.5-005

## C06-6.5-006

- **Primary evidence:** `OSE-backend/src/services/periodGuard.service.js`
- **Implemented part:** OSE-backend/src/services/periodGuard.service.js — central period validation exports
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/periodGuard.service.js — central period validation exports. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.5-006
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.5-006

## C06-6.5-007

- **Primary evidence:** `OSE-backend/src/services/periodGuard.service.js`
- **Implemented part:** OSE-backend/src/services/periodGuard.service.js — checkPeriodLock() / validatePostingDate()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/periodGuard.service.js — checkPeriodLock() / validatePostingDate(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.5-007
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.5-007

## C06-6.5-008

- **Primary evidence:** `OSE-backend/src/platform/postingPeriod.util.js`
- **Implemented part:** OSE-backend/src/platform/postingPeriod.util.js — assertPostingPeriodFieldsImmutable()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/postingPeriod.util.js — assertPostingPeriodFieldsImmutable(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.5-008
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.5-008

## C06-6.6-001

- **Primary evidence:** `OSE-backend/src/services/periodClose.service.js`
- **Implemented part:** OSE-backend/src/services/periodClose.service.js — monthEndChecklist in close response
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/periodClose.service.js — monthEndChecklist in close response. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.6-001
- **Remediation front:** Targeted runtime matrix for Platform — C06-6.6-001

## C06-6.6-002

- **Primary evidence:** `OSE-backend/src/platform/periodResolution.service.js`
- **Implemented part:** OSE-backend/src/platform/periodResolution.service.js — getPeriodResolutionWorkspace()
- **Missing part:** End-to-end runtime behavior not executed for Platform, Workflow
- **Gap:** OSE-backend/src/platform/periodResolution.service.js — getPeriodResolutionWorkspace(). Not proven: End-to-end runtime behavior not executed for Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C06-6.6-002
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C06-6.6-002

## C07-7.1-001

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — saveGrnDraft / listFamilyDrafts
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — saveGrnDraft / listFamilyDrafts. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C07-7.1-001
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.1-001

## C07-7.10-001

- **Primary evidence:** `OSE-Frontend/src/app/app.routes.ts`
- **Implemented part:** OSE-Frontend/src/app/app.routes.ts — canDeactivate on governed create/edit routes
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/app.routes.ts — canDeactivate on governed create/edit routes. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.10-001
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.10-001

## C07-7.10-002

- **Primary evidence:** `OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts`
- **Implemented part:** OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts — window:beforeunload HostListener
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts — window:beforeunload HostListener. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.10-002
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.10-002

## C07-7.10-003

- **Primary evidence:** `OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts`
- **Implemented part:** OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts — beforeunload on dirty forms
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts — beforeunload on dirty forms. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.10-003
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.10-003

## C07-7.10-004

- **Primary evidence:** `OSE-Frontend/src/app/core/utils/document-draft-leave.util.ts`
- **Implemented part:** OSE-Frontend/src/app/core/utils/document-draft-leave.util.ts — confirmDocumentDeactivate()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/utils/document-draft-leave.util.ts — confirmDocumentDeactivate(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.10-004
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.10-004

## C07-7.10-005

- **Primary evidence:** `OSE-Frontend/src/app/core/interceptors/auth.interceptor.ts`
- **Implemented part:** OSE-Frontend/src/app/core/interceptors/auth.interceptor.ts — flushBeforeSessionEnd on 401 refresh failure
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/interceptors/auth.interceptor.ts — flushBeforeSessionEnd on 401 refresh failure. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.10-005
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.10-005

## C07-7.10-006

- **Classification:** Failed Runtime → **Partial**
- **Removed scenarios:** V2-CF-GP-NEVER-SUBMIT
- **Primary evidence:** `OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts — afterSave sets skipDeactivate
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts — afterSave sets skipDeactivate. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.10-006
- **Remediation front:** Targeted runtime matrix for Workflow — C07-7.10-006

## C07-7.11-001

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — createGrnServerDraft -> generateDocNumber
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — createGrnServerDraft -> generateDocNumber. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C07-7.11-001
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.11-001

## C07-7.2-001

- **Classification:** Governance Conflict → **Partial**
- **Added scenarios:** V2-D-GRN-EDIT
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Implemented part:** draftGovernance.service.js — GRN, Transfer, Get Pass, Breakage create default DRAFT
- **Missing part:** Lost Items, Movements, Inventory Count server-draft create runtime proof
- **Gap:** Server-recognized draft at create verified for 4 families not all operational documents
- **Evidence scope:** Runtime partial — GRN module only
- **Root cause group:** PARTIAL-C07-7.2-001
- **Remediation front:** Targeted runtime matrix for Workflow — C07-7.2-001

## C07-7.4-001

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — DRAFT_OWNER_FIELD + resolveDraftOwnerId()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — DRAFT_OWNER_FIELD + resolveDraftOwnerId(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C07-7.4-001
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.4-001

## C07-7.4-002

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — assertDraftEditable() OWNER_OR_FAMILY_MANAGE_PERMISSION
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — assertDraftEditable() OWNER_OR_FAMILY_MANAGE_PERMISSION. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C07-7.4-002
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.4-002

## C07-7.4-003

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — transferDraftOwnership() + DRAFT_OWNERSHIP_TRANSFER_PERMITTED
- **Missing part:** End-to-end runtime behavior not executed for Platform, Transfer
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — transferDraftOwnership() + DRAFT_OWNERSHIP_TRANSFER_PERMITTED. Not proven: End-to-end runtime behavior not executed for Platform, Transfer
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C07-7.4-003
- **Remediation front:** Targeted runtime matrix for Platform, Transfer — C07-7.4-003

## C07-7.4-004

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — assertDraftOwnerActive() DRAFT_OWNER_INACTIVE
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — assertDraftOwnerActive() DRAFT_OWNER_INACTIVE. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C07-7.4-004
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.4-004

## C07-7.5-001

- **Primary evidence:** `OSE-backend/src/platform/concurrency.service.js`
- **Implemented part:** OSE-backend/src/platform/concurrency.service.js — assertConcurrencyVersion({ required: true })
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/concurrency.service.js — assertConcurrencyVersion({ required: true }). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C07-7.5-001
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.5-001

## C07-7.7-001

- **Primary evidence:** `OSE-Frontend/src/app/core/services/draft-auto-save.service.ts`
- **Implemented part:** OSE-Frontend/src/app/core/services/draft-auto-save.service.ts — createDebouncedSaver()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/services/draft-auto-save.service.ts — createDebouncedSaver(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.7-001
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.7-001

## C07-7.7-002

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — addItem/removeLine -> queueServerDraftSave
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — addItem/removeLine -> queueServerDraftSave. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.7-002
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.7-002

## C07-7.7-003

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — updateLine -> queueServerDraftSave
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — updateLine -> queueServerDraftSave. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.7-003
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.7-003

## C07-7.7-004

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — onSupplierChange/onWarehouseChange
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — onSupplierChange/onWarehouseChange. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.7-004
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.7-004

## C07-7.7-005

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — onInvoiceSelected
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — onInvoiceSelected. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.7-005
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.7-005

## C07-7.7-006

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — onNotesChange
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — onNotesChange. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.7-006
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.7-006

## C07-7.7-007

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — confirmDeactivate -> performServerDraftSave
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — confirmDeactivate -> performServerDraftSave. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.7-007
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.7-007

## C07-7.8-001

- **Primary evidence:** `OSE-Frontend/src/app/core/services/draft-recovery.service.ts`
- **Implemented part:** OSE-Frontend/src/app/core/services/draft-recovery.service.ts — promptRecoverGrnDraft()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/services/draft-recovery.service.ts — promptRecoverGrnDraft(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C07-7.8-001
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.8-001

## C07-7.8-002

- **Classification:** Failed Runtime → **Partial**
- **Removed scenarios:** V2-CF-WP-NEVER-LIST, V2-CF-WP-NEVER-SUMMARY, V2-CF-WP-NEVER-ALERTS, V2-B-NEVER-LIST, V2-B-NEVER-SUMMARY, V2-B-NEVER-ALERTS, V2-B-DASH-NEVER
- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — validateRecoveredDraft() DRAFT_RECOVERY_VALIDATION_FAILED
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — validateRecoveredDraft() DRAFT_RECOVERY_VALIDATION_FAILED. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C07-7.8-002
- **Remediation front:** Targeted runtime matrix for Workflow — C07-7.8-002

## C07-7.9-001

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — listFamilyDrafts()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — listFamilyDrafts(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C07-7.9-001
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.9-001

## C07-7.9-002

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — DEFAULT_DRAFT_RETENTION_DAYS + expireStaleDrafts()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — DEFAULT_DRAFT_RETENTION_DAYS + expireStaleDrafts(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C07-7.9-002
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.9-002

## C07-7.9-003

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — getDraftRetentionPolicy() expirationAction
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — getDraftRetentionPolicy() expirationAction. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C07-7.9-003
- **Remediation front:** Targeted runtime matrix for Platform — C07-7.9-003

## C08-8.10-001

- **Primary evidence:** `OSE-backend/src/platform/concurrency.service.js`
- **Implemented part:** OSE-backend/src/platform/concurrency.service.js — assertConcurrencyVersion() audit CONCURRENCY_CONFLICT
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/concurrency.service.js — assertConcurrencyVersion() audit CONCURRENCY_CONFLICT. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.10-001
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.10-001

## C08-8.2-001

- **Primary evidence:** `OSE-backend/src/platform/concurrency.service.js`
- **Implemented part:** OSE-backend/src/platform/concurrency.service.js — assertConcurrencyVersion({ required: true })
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/concurrency.service.js — assertConcurrencyVersion({ required: true }). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.2-001

## C08-8.3-001

- **Primary evidence:** `OSE-backend/src/platform/concurrency.service.js`
- **Implemented part:** OSE-backend/src/platform/concurrency.service.js — assertConcurrencyVersion({ required: true })
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/concurrency.service.js — assertConcurrencyVersion({ required: true }). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.3-001

## C08-8.4-001

- **Primary evidence:** `OSE-backend/src/platform/concurrency.service.js`
- **Implemented part:** OSE-backend/src/platform/concurrency.service.js — versionRequiredError() when required:true
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/concurrency.service.js — versionRequiredError() when required:true. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.4-001
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.4-001

## C08-8.4-002

- **Primary evidence:** `OSE-backend/src/platform/concurrency.service.js`
- **Implemented part:** OSE-backend/src/platform/concurrency.service.js — concurrencyConflictError() 409
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/concurrency.service.js — concurrencyConflictError() 409. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.4-002
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.4-002

## C08-8.4-003

- **Primary evidence:** `OSE-backend/src/services/breakage.service.js`
- **Implemented part:** OSE-backend/src/services/breakage.service.js — submitBreakage() assertConcurrencyVersion required
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/breakage.service.js — submitBreakage() assertConcurrencyVersion required. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.4-003
- **Remediation front:** Targeted runtime matrix for Workflow — C08-8.4-003

## C08-8.4-004

- **Primary evidence:** `OSE-Frontend/src/app/core/utils/concurrency-conflict.util.ts`
- **Implemented part:** OSE-Frontend/src/app/core/utils/concurrency-conflict.util.ts — reloadOnConcurrencyConflict()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/utils/concurrency-conflict.util.ts — reloadOnConcurrencyConflict(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C08-8.4-004
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.4-004

## C08-8.5-001

- **Classification:** Failed Runtime → **Partial**
- **Removed scenarios:** V2-CF-GP-NEVER-SUBMIT, V2-A-NEVER-SUBMIT, V2-A-INACTIVE-SUBMIT
- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — saveGrnDraft() required version
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — saveGrnDraft() required version. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.5-001
- **Remediation front:** Targeted runtime matrix for Workflow — C08-8.5-001

## C08-8.6-001

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — saveGrnDraft() bumpConcurrencyUpdate
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — saveGrnDraft() bumpConcurrencyUpdate. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.6-001
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.6-001

## C08-8.6-002

- **Classification:** Failed Runtime → **Partial**
- **Removed scenarios:** V2-A-DELETED-SUBMIT, V2-A-STALE-JWT
- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — submitForApproval() required version
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — submitForApproval() required version. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.6-002
- **Remediation front:** Targeted runtime matrix for Workflow — C08-8.6-002

## C08-8.6-003

- **Classification:** Governance Conflict → **Partial**
- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** grn.service.js concurrencyVersion on approve; get-pass FE sends version
- **Missing part:** Duplicate-approve rejection runtime test on Transfer/Breakage/Lost/IC
- **Gap:** Version field present on GRN/GetPass; duplicate approve prevention not runtime-proven platform-wide
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.6-003
- **Remediation front:** Targeted runtime matrix for Workflow — C08-8.6-003

## C08-8.6-004

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — _rejectGrnApproval() required version
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — _rejectGrnApproval() required version. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.6-004
- **Remediation front:** Targeted runtime matrix for Workflow — C08-8.6-004

## C08-8.6-005

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — sendBackGrn() assertConcurrencyVersion required
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — sendBackGrn() assertConcurrencyVersion required. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.6-005
- **Remediation front:** Targeted runtime matrix for Workflow — C08-8.6-005

## C08-8.6-006

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — deleteGrn() required version
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — deleteGrn() required version. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.6-006
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.6-006

## C08-8.6-007

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — assertNoDuplicateGrnPost()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — assertNoDuplicateGrnPost(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.6-007
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.6-007

## C08-8.7-001

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — _advanceGrnApprovalStep() version before post
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — _advanceGrnApprovalStep() version before post. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.7-001
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.7-001

## C08-8.8-001

- **Primary evidence:** `OSE-backend/src/platform/concurrency.service.js`
- **Implemented part:** OSE-backend/src/platform/concurrency.service.js — assertConcurrencyVersion() + audit
- **Missing part:** End-to-end runtime behavior not executed for Platform, Workflow
- **Gap:** OSE-backend/src/platform/concurrency.service.js — assertConcurrencyVersion() + audit. Not proven: End-to-end runtime behavior not executed for Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.8-001
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C08-8.8-001

## C08-8.8-002

- **Primary evidence:** `OSE-backend/src/platform/concurrency.service.js`
- **Implemented part:** OSE-backend/src/platform/concurrency.service.js — concurrencyConflictError()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/concurrency.service.js — concurrencyConflictError(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C08-8.8-002
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.8-002

## C08-8.8-003

- **Primary evidence:** `OSE-Frontend/src/app/core/utils/concurrency-conflict.util.ts`
- **Implemented part:** OSE-Frontend/src/app/core/utils/concurrency-conflict.util.ts — reloadOnConcurrencyConflict()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/utils/concurrency-conflict.util.ts — reloadOnConcurrencyConflict(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C08-8.8-003
- **Remediation front:** Targeted runtime matrix for Platform — C08-8.8-003

## C09-9.2-001

- **Primary evidence:** `OSE-backend/src/services/docNumbering.service.js`
- **Implemented part:** OSE-backend/src/services/docNumbering.service.js — generateDocNumber()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/docNumbering.service.js — generateDocNumber(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.2-001

## C09-9.2-002

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — supplier invoice field + SYSTEM_GRN_HINT only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — supplier invoice field + SYSTEM_GRN_HINT only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C09-9.2-002
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.2-002

## C09-9.2-003

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — no grnNumber form control
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — no grnNumber form control. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C09-9.2-003
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.2-003

## C09-9.2-004

- **Primary evidence:** `OSE-backend/src/platform/draftGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/draftGovernance.service.js — createGrnServerDraft()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/draftGovernance.service.js — createGrnServerDraft(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.2-004
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.2-004

## C09-9.2-005

- **Primary evidence:** `OSE-backend/src/services/docNumbering.service.js`
- **Implemented part:** OSE-backend/src/services/docNumbering.service.js — return `${prefix}-${year}-${padded}`
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/docNumbering.service.js — return `${prefix}-${year}-${padded}`. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.2-005
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.2-005

## C09-9.2-006

- **Primary evidence:** `OSE-backend/prisma/schema.prisma`
- **Implemented part:** OSE-backend/prisma/schema.prisma — GrnImport.supplierInvoiceNumber
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/prisma/schema.prisma — GrnImport.supplierInvoiceNumber. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.2-006
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.2-006

## C09-9.3-001

- **Primary evidence:** `OSE-backend/prisma/schema.prisma`
- **Implemented part:** OSE-backend/prisma/schema.prisma — GrnImport @@unique([tenantId, grnNumber])
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/prisma/schema.prisma — GrnImport @@unique([tenantId, grnNumber]). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-001

## C09-9.3-002

- **Primary evidence:** `OSE-backend/src/services/docNumbering.service.js`
- **Implemented part:** OSE-backend/src/services/docNumbering.service.js — INSERT ON CONFLICT increment lastSeq
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/docNumbering.service.js — INSERT ON CONFLICT increment lastSeq. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-002
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-002

## C09-9.3-003

- **Primary evidence:** `OSE-backend/src/services/docNumbering.service.js`
- **Implemented part:** OSE-backend/src/services/docNumbering.service.js — lastSeq + 1 only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/docNumbering.service.js — lastSeq + 1 only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-003
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-003

## C09-9.3-004

- **Primary evidence:** `OSE-backend/src/services/docNumbering.service.js`
- **Implemented part:** OSE-backend/src/services/docNumbering.service.js — monotonic lastSeq increment
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/docNumbering.service.js — monotonic lastSeq increment. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-004
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-004

## C09-9.3-005

- **Primary evidence:** `OSE-backend/src/services/docNumbering.service.js`
- **Implemented part:** OSE-backend/src/services/docNumbering.service.js — generateDocNumber()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/docNumbering.service.js — generateDocNumber(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-005
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-005

## C09-9.3-006

- **Primary evidence:** `OSE-backend/src/services/docNumbering.service.js`
- **Implemented part:** OSE-backend/src/services/docNumbering.service.js — DocPrefix object
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/docNumbering.service.js — DocPrefix object. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-006
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-006

## C09-9.3-007

- **Primary evidence:** `OSE-backend/src/services/docNumbering.service.js`
- **Implemented part:** OSE-backend/src/services/docNumbering.service.js — DocPrefix + prefixFromMovementType()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/docNumbering.service.js — DocPrefix + prefixFromMovementType(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-007
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-007

## C09-9.3-008

- **Primary evidence:** `OSE-backend/src/services/docNumbering.service.js`
- **Implemented part:** OSE-backend/src/services/docNumbering.service.js — atomic increment may leave gaps on rollback
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/docNumbering.service.js — atomic increment may leave gaps on rollback. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-008
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-008

## C09-9.3-009

- **Primary evidence:** `OSE-backend/prisma/schema.prisma`
- **Implemented part:** OSE-backend/prisma/schema.prisma — grnNumber/transferNo/documentNo/passNo fields
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/prisma/schema.prisma — grnNumber/transferNo/documentNo/passNo fields. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-009
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-009

## C09-9.3-010

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — logGovernedEvent CREATE afterValue.grnNumber
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — logGovernedEvent CREATE afterValue.grnNumber. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-010
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-010

## C09-9.3-011

- **Primary evidence:** `OSE-backend/src/services/docNumbering.service.js`
- **Implemented part:** OSE-backend/src/services/docNumbering.service.js — generateDocNumber()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/docNumbering.service.js — generateDocNumber(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-011
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-011

## C09-9.3-012

- **Primary evidence:** `OSE-backend/src/services/docNumbering.service.js`
- **Implemented part:** OSE-backend/src/services/docNumbering.service.js — year from date in sequence key
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/docNumbering.service.js — year from date in sequence key. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C09-9.3-012
- **Remediation front:** Targeted runtime matrix for Platform — C09-9.3-012

## C10-10.1-001

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — postGrnInTransaction() no outbound stock check
- **Missing part:** End-to-end runtime behavior not executed for Movements
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — postGrnInTransaction() no outbound stock check. Not proven: End-to-end runtime behavior not executed for Movements
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.1-001
- **Remediation front:** Targeted runtime matrix for Movements — C10-10.1-001

## C10-10.1-002

- **Primary evidence:** `OSE-backend/src/services/postingGovernedTransfer.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedTransfer.service.js — Insufficient source stock check
- **Missing part:** End-to-end runtime behavior not executed for Movements
- **Gap:** OSE-backend/src/services/postingGovernedTransfer.service.js — Insufficient source stock check. Not proven: End-to-end runtime behavior not executed for Movements
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.1-002
- **Remediation front:** Targeted runtime matrix for Movements — C10-10.1-002

## C10-10.2-001

- **Primary evidence:** `OSE-backend/src/services/postingGovernedTransfer.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedTransfer.service.js — findUnique stockBalance at post time
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedTransfer.service.js — findUnique stockBalance at post time. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C10-10.2-001

## C10-10.2-002

- **Primary evidence:** `OSE-backend/src/services/postingGovernedMovement.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedMovement.service.js — Insufficient stock throws on post
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedMovement.service.js — Insufficient stock throws on post. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-002
- **Remediation front:** Targeted runtime matrix for Platform — C10-10.2-002

## C10-10.2-003

- **Primary evidence:** `OSE-backend/src/services/movement.service.js`
- **Implemented part:** OSE-backend/src/services/movement.service.js — assertPositiveLineQty() on draft lines
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/movement.service.js — assertPositiveLineQty() on draft lines. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-003
- **Remediation front:** Targeted runtime matrix for Platform — C10-10.2-003

## C10-10.2-004

- **Primary evidence:** `OSE-backend/src/services/movement.service.js`
- **Implemented part:** OSE-backend/src/services/movement.service.js — assertPositiveLineQty() blocks qty<=0
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/movement.service.js — assertPositiveLineQty() blocks qty<=0. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-004
- **Remediation front:** Targeted runtime matrix for Platform — C10-10.2-004

## C10-10.2-005

- **Primary evidence:** `OSE-backend/prisma/schema.prisma`
- **Implemented part:** OSE-backend/prisma/schema.prisma — qtyOnHand Decimal(15,4)
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/prisma/schema.prisma — qtyOnHand Decimal(15,4). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-005
- **Remediation front:** Targeted runtime matrix for Platform — C10-10.2-005

## C10-10.2-006

- **Primary evidence:** `OSE-backend/src/services/postingGovernedTransfer.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedTransfer.service.js — srcBalance at sourceLocationId
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedTransfer.service.js — srcBalance at sourceLocationId. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-006
- **Remediation front:** Targeted runtime matrix for Platform — C10-10.2-006

## C10-10.2-007

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — line.qtyInBaseUnit
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — line.qtyInBaseUnit. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-007
- **Remediation front:** Targeted runtime matrix for Platform — C10-10.2-007

## C10-10.2-008

- **Primary evidence:** `OSE-backend/src/services/postingGovernedMovement.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedMovement.service.js — stock integrity on breakage post
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedMovement.service.js — stock integrity on breakage post. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-008
- **Remediation front:** Targeted runtime matrix for Platform — C10-10.2-008

## C10-10.2-009

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — inventoryLedger.create in post
- **Missing part:** End-to-end runtime behavior not executed for Movements
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — inventoryLedger.create in post. Not proven: End-to-end runtime behavior not executed for Movements
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-009
- **Remediation front:** Targeted runtime matrix for Movements — C10-10.2-009

## C10-10.2-010

- **Primary evidence:** `OSE-backend/src/services/movementRegisterGuard.service.js`
- **Implemented part:** OSE-backend/src/services/movementRegisterGuard.service.js — assertMovementRegisterMutable()
- **Missing part:** End-to-end runtime behavior not executed for Movements
- **Gap:** OSE-backend/src/services/movementRegisterGuard.service.js — assertMovementRegisterMutable(). Not proven: End-to-end runtime behavior not executed for Movements
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-010
- **Remediation front:** Targeted runtime matrix for Movements — C10-10.2-010

## C10-10.2-011

- **Primary evidence:** `OSE-backend/src/services/movementRegisterGuard.service.js`
- **Implemented part:** OSE-backend/src/services/movementRegisterGuard.service.js — GOVERNED_POST_FORBIDDEN direct register post
- **Missing part:** End-to-end runtime behavior not executed for Movements
- **Gap:** OSE-backend/src/services/movementRegisterGuard.service.js — GOVERNED_POST_FORBIDDEN direct register post. Not proven: End-to-end runtime behavior not executed for Movements
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-011
- **Remediation front:** Targeted runtime matrix for Movements — C10-10.2-011

## C10-10.2-012

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — no outbound stock availability check
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — no outbound stock availability check. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-012
- **Remediation front:** Targeted runtime matrix for Platform — C10-10.2-012

## C10-10.2-013

- **Primary evidence:** `OSE-backend/src/services/postingGovernedTransfer.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedTransfer.service.js — Insufficient source stock throws
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedTransfer.service.js — Insufficient source stock throws. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-013
- **Remediation front:** Targeted runtime matrix for Platform — C10-10.2-013

## C10-10.2-014

- **Primary evidence:** `OSE-backend/src/services/stock.service.js`

## C10-10.2-015

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — WAC on receive
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — WAC on receive. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C10-10.2-015
- **Remediation front:** Targeted runtime matrix for Platform — C10-10.2-015

## C11-11.3-001

- **Primary evidence:** `OSE-Frontend/src/app/core/services/constitution-platform.service.ts`
- **Implemented part:** OSE-Frontend/src/app/core/services/constitution-platform.service.ts — formatAmount()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/services/constitution-platform.service.ts — formatAmount(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C11-11.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.3-001

## C11-11.3-002

- **Primary evidence:** `OSE-backend/src/platform/displayCurrency.service.js`

## C11-11.3-003

- **Primary evidence:** `OSE-Frontend/src/app/core/pipes/display-currency.pipe.ts`

## C11-11.3-004

- **Primary evidence:** `OSE-backend/src/services/reports.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — inventoryLedger uses numeric values not display currency
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — inventoryLedger uses numeric values not display currency. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.3-004
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.3-004

## C11-11.3-005

- **Primary evidence:** `OSE-backend/src/services/reports.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedTransfer.service.js — wac from stockBalance
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedTransfer.service.js — wac from stockBalance. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.3-005
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.3-005

## C11-11.3-006

- **Primary evidence:** `OSE-backend/src/services/reports.service.js`
- **Implemented part:** OSE-Frontend/src/app/core/pipes/display-currency.pipe.ts — transform() format only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/pipes/display-currency.pipe.ts — transform() format only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.3-006
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.3-006

## C11-11.3-007

- **Primary evidence:** `OSE-backend/src/platform/displayCurrency.service.js`

## C11-11.3-008

- **Primary evidence:** `OSE-backend/src/services/stock.service.js`
- **Implemented part:** OSE-backend/src/services/inventoryValuation.service.js — valuation basis logic
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/inventoryValuation.service.js — valuation basis logic. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.3-008
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.3-008

## C11-11.3-009

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — post path no displayCurrency import
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — post path no displayCurrency import. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.3-009
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.3-009

## C11-11.3-010

- **Primary evidence:** `OSE-backend/src/platform/displayCurrency.service.js`
- **Implemented part:** OSE-backend/src/platform/displayCurrency.service.js — display-only service surface
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/displayCurrency.service.js — display-only service surface. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.3-010
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.3-010

## C11-11.3-011

- **Primary evidence:** `OSE-backend/src/platform/displayCurrency.service.js`
- **Implemented part:** OSE-backend/src/platform/displayCurrency.service.js — tenant setting key displayCurrency only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/displayCurrency.service.js — tenant setting key displayCurrency only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.3-011
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.3-011

## C11-11.4-001

- **Primary evidence:** `OSE-Frontend/src/app/core/services/constitution-platform.service.ts`
- **Implemented part:** OSE-Frontend/src/app/features/dashboard/dashboard.component.ts — fmtSAR()
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/features/dashboard/dashboard.component.ts — fmtSAR(). Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C11-11.4-001
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.4-001

## C11-11.4-002

- **Primary evidence:** `OSE-backend/src/services/reports.service.js`
- **Implemented part:** OSE-Frontend/src/app/features/reports/report-engine/report-views/detail-report-table.component.ts — SAR in column headers comment
- **Missing part:** End-to-end runtime behavior not executed for Platform, Reports
- **Gap:** OSE-Frontend/src/app/features/reports/report-engine/report-views/detail-report-table.component.ts — SAR in column headers comment. Not proven: End-to-end runtime behavior not executed for Platform, Reports
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.4-002
- **Remediation front:** Targeted runtime matrix for Platform, Reports — C11-11.4-002

## C11-11.4-003

- **Primary evidence:** `OSE-Frontend/src/app/features/dashboard/dashboard.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/dashboard/dashboard.component.ts — fmtSAR -> platform.formatAmount
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/dashboard/dashboard.component.ts — fmtSAR -> platform.formatAmount. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C11-11.4-003
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.4-003

## C11-11.4-004

- **Primary evidence:** `OSE-backend/src/services/report.service.js`
- **Implemented part:** OSE-Frontend/src/app/features/reports/report-engine/report-views/detail-report-table.component.html — REPORTS.DETAIL.COL_VALUE_SAR hardcoded headers
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/reports/report-engine/report-views/detail-report-table.component.html — REPORTS.DETAIL.COL_VALUE_SAR hardcoded headers. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.4-004
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.4-004

## C11-11.4-005

- **Primary evidence:** `OSE-backend/src/services/pdf.service.js`
- **Implemented part:** OSE-backend/src/services/pdf/report-pdf-components.js — const currency = 'SAR'
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/pdf/report-pdf-components.js — const currency = 'SAR'. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.4-005
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.4-005

## C11-11.4-006

- **Primary evidence:** `OSE-backend/src/services/reports.service.js`
- **Implemented part:** OSE-backend/src/controllers/constitution.controller.js — getCurrency/putCurrency
- **Missing part:** End-to-end runtime behavior not executed for Platform, Reports
- **Gap:** OSE-backend/src/controllers/constitution.controller.js — getCurrency/putCurrency. Not proven: End-to-end runtime behavior not executed for Platform, Reports
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.4-006
- **Remediation front:** Targeted runtime matrix for Platform, Reports — C11-11.4-006

## C11-11.6-001

- **Primary evidence:** `OSE-backend/src/platform/displayCurrency.service.js`
- **Implemented part:** OSE-backend/src/platform/displayCurrency.service.js — setDisplayCurrency tenant_setting only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/displayCurrency.service.js — setDisplayCurrency tenant_setting only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C11-11.6-001
- **Remediation front:** Targeted runtime matrix for Platform — C11-11.6-001

## C11-11.6-002

- **Primary evidence:** `OSE-backend/src/platform/displayCurrency.service.js`

## C12-12.2-001

- **Primary evidence:** `OSE-Frontend/src/app/shared/styles/_document-page-shell.scss`
- **Implemented part:** OSE-Frontend/src/app/shared/styles/_document-page-shell.scss — .document-page-header__slot--reserved
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/shared/styles/_document-page-shell.scss — .document-page-header__slot--reserved. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C12-12.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C12-12.2-001

## C12-12.3-001

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — grnNumber/status/importedBy/postedBy display spans
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — grnNumber/status/importedBy/postedBy display spans. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C12-12.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C12-12.3-001

## C12-12.4-001

- **Primary evidence:** `OSE-backend/src/platform/lifecyclePresentation.service.js`
- **Implemented part:** OSE-backend/src/platform/lifecyclePresentation.service.js — isEditableUserState()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/lifecyclePresentation.service.js — isEditableUserState(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C12-12.4-001
- **Remediation front:** Targeted runtime matrix for Platform — C12-12.4-001

## C12-12.5-001

- **Primary evidence:** `OSE-Frontend/src/app/core/utils/document-header-context.util.ts`
- **Implemented part:** OSE-Frontend/src/app/core/utils/document-header-context.util.ts — confirmGovernedHeaderContextChange()
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-Frontend/src/app/core/utils/document-header-context.util.ts — confirmGovernedHeaderContextChange(). Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C12-12.5-001
- **Remediation front:** Targeted runtime matrix for Workflow — C12-12.5-001

## C12-12.5-002

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — onWarehouseChange() clears lines after confirm
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — onWarehouseChange() clears lines after confirm. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C12-12.5-002
- **Remediation front:** Targeted runtime matrix for Workflow — C12-12.5-002

## C12-12.6-001

- **Primary evidence:** `OSE-backend/src/services/getPass.service.js`
- **Implemented part:** OSE-backend/src/services/getPass.service.js — assertGetPassLinesAtSourceLocations()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/getPass.service.js — assertGetPassLinesAtSourceLocations(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C12-12.6-001
- **Remediation front:** Targeted runtime matrix for Platform — C12-12.6-001

## C12-12.7-001

- **Primary evidence:** `OSE-Frontend/src/app/core/registries/document-header-order.registry.ts`
- **Implemented part:** OSE-Frontend/src/app/core/registries/document-header-order.registry.ts — DOCUMENT_HEADER_ORDER
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/registries/document-header-order.registry.ts — DOCUMENT_HEADER_ORDER. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C12-12.7-001
- **Remediation front:** Targeted runtime matrix for Platform — C12-12.7-001

## C13-13.10-001

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts — pagedLines / linesPageSize
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts — pagedLines / linesPageSize. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C13-13.10-001
- **Remediation front:** Targeted runtime matrix for Platform — C13-13.10-001

## C13-13.2-001

- **Primary evidence:** `OSE-backend/prisma/schema.prisma`
- **Implemented part:** OSE-backend/prisma/schema.prisma — MovementLine.id @id @default(uuid())
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/prisma/schema.prisma — MovementLine.id @id @default(uuid()). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C13-13.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C13-13.2-001

## C13-13.4-001

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — updateGrn() blocks line changes
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — updateGrn() blocks line changes. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C13-13.4-001
- **Remediation front:** Targeted runtime matrix for Platform — C13-13.4-001

## C13-13.4-002

- **Primary evidence:** `docs/governance/POSTING_GOVERNANCE_ENFORCEMENT.md`
- **Implemented part:** docs/governance/POSTING_GOVERNANCE_ENFORCEMENT.md — corrections via governed transactions
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** docs/governance/POSTING_GOVERNANCE_ENFORCEMENT.md — corrections via governed transactions. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C13-13.4-002
- **Remediation front:** Targeted runtime matrix for Platform — C13-13.4-002

## C13-13.5-001

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — lineTotal() / manualGrandTotal()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — lineTotal() / manualGrandTotal(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C13-13.5-001
- **Remediation front:** Targeted runtime matrix for Platform — C13-13.5-001

## C13-13.6-001

- **Primary evidence:** `OSE-backend/src/services/getPass.service.js`
- **Implemented part:** OSE-backend/src/services/getPass.service.js — assertGetPassLinesAtSourceLocations() on create/update
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/getPass.service.js — assertGetPassLinesAtSourceLocations() on create/update. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C13-13.6-001
- **Remediation front:** Targeted runtime matrix for Platform — C13-13.6-001

## C13-13.7-001

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — manualGrandTotal computed
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — manualGrandTotal computed. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C13-13.7-001
- **Remediation front:** Targeted runtime matrix for Platform — C13-13.7-001

## C13-13.7-002

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — {{ lineTotal(line)
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — {{ lineTotal(line). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C13-13.7-002
- **Remediation front:** Targeted runtime matrix for Platform — C13-13.7-002

## C13-13.8-001

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — addItem() duplicate itemId guard
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — addItem() duplicate itemId guard. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C13-13.8-001
- **Remediation front:** Targeted runtime matrix for Platform — C13-13.8-001

## C13-13.9-001

- **Primary evidence:** `OSE-backend/src/services/auditGoverned.service.js`
- **Implemented part:** OSE-backend/src/services/auditGoverned.service.js — logGovernedEvent()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/auditGoverned.service.js — logGovernedEvent(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C13-13.9-001
- **Remediation front:** Targeted runtime matrix for Platform — C13-13.9-001

## C14-14.3-001

- **Primary evidence:** `OSE-backend/src/platform/attachmentGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/attachmentGovernance.service.js — assertAttachmentMutable()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/attachmentGovernance.service.js — assertAttachmentMutable(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C14-14.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C14-14.3-001

## C14-14.3-002

- **Primary evidence:** `OSE-backend/src/platform/attachmentGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/attachmentGovernance.service.js — error: modified/replaced/deleted
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/attachmentGovernance.service.js — error: modified/replaced/deleted. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C14-14.3-002
- **Remediation front:** Targeted runtime matrix for Platform — C14-14.3-002

## C14-14.3-003

- **Primary evidence:** `OSE-backend/src/platform/attachmentGovernance.service.js`
- **Implemented part:** OSE-backend/src/platform/attachmentGovernance.service.js — assertAttachmentMutable()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/attachmentGovernance.service.js — assertAttachmentMutable(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C14-14.3-003
- **Remediation front:** Targeted runtime matrix for Platform — C14-14.3-003

## C14-14.3-004

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — validateGrn() invoice attachment required
- **Missing part:** End-to-end runtime behavior not executed for Platform, Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — validateGrn() invoice attachment required. Not proven: End-to-end runtime behavior not executed for Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C14-14.3-004
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C14-14.3-004

## C14-14.4-001

- **Primary evidence:** `OSE-backend/src/middleware/upload.middleware.js`
- **Implemented part:** OSE-backend/src/middleware/upload.middleware.js — attachmentFilter / imageFilter
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/middleware/upload.middleware.js — attachmentFilter / imageFilter. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C14-14.4-001
- **Remediation front:** Targeted runtime matrix for Platform — C14-14.4-001

## C14-14.4-002

- **Primary evidence:** `OSE-backend/src/platform/attachmentPolicy.platform.js`
- **Implemented part:** OSE-backend/src/platform/attachmentPolicy.platform.js — ATTACHMENT_MAX_FILE_SIZE_BYTES
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/attachmentPolicy.platform.js — ATTACHMENT_MAX_FILE_SIZE_BYTES. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C14-14.4-002
- **Remediation front:** Targeted runtime matrix for Platform — C14-14.4-002

## C14-14.4-003

- **Primary evidence:** `OSE-backend/src/platform/attachmentPolicy.platform.js`
- **Implemented part:** OSE-backend/src/platform/attachmentPolicy.platform.js — ATTACHMENT_MAX_COUNT_PER_DOCUMENT
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/attachmentPolicy.platform.js — ATTACHMENT_MAX_COUNT_PER_DOCUMENT. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C14-14.4-003
- **Remediation front:** Targeted runtime matrix for Platform — C14-14.4-003

## C14-14.5-001

- **Primary evidence:** `OSE-backend/src/middleware/upload.middleware.js`
- **Implemented part:** OSE-backend/src/middleware/upload.middleware.js — memoryStorage + filters
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/middleware/upload.middleware.js — memoryStorage + filters. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C14-14.5-001
- **Remediation front:** Targeted runtime matrix for Platform — C14-14.5-001

## C14-14.6-001

- **Primary evidence:** `OSE-backend/src/routes/file.routes.js`
- **Implemented part:** OSE-backend/src/routes/file.routes.js — GET /files/signed-url authenticate + tenant prefix
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/routes/file.routes.js — GET /files/signed-url authenticate + tenant prefix. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C14-14.6-001
- **Remediation front:** Targeted runtime matrix for Platform — C14-14.6-001

## C14-14.8-001

- **Primary evidence:** `OSE-backend/src/middleware/upload.middleware.js`
- **Implemented part:** OSE-backend/src/middleware/upload.middleware.js — buildAttachmentKey() / buildItemImageKey() uuid
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/middleware/upload.middleware.js — buildAttachmentKey() / buildItemImageKey() uuid. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C14-14.8-001
- **Remediation front:** Targeted runtime matrix for Platform — C14-14.8-001

## C14-14.9-001

- **Primary evidence:** `OSE-backend/src/services/breakage.service.js`
- **Implemented part:** OSE-backend/src/services/breakage.service.js — addAttachment() logAction ATTACHMENT_ADD
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/breakage.service.js — addAttachment() logAction ATTACHMENT_ADD. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C14-14.9-001
- **Remediation front:** Targeted runtime matrix for Platform — C14-14.9-001

## C15-15.2-001

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — rejectGrn() reason required 400
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — rejectGrn() reason required 400. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C15-15.2-001
- **Remediation front:** Targeted runtime matrix for Workflow — C15-15.2-001

## C15-15.2-002

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — sendBackGrn() reason required
- **Missing part:** End-to-end runtime behavior not executed for Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — sendBackGrn() reason required. Not proven: End-to-end runtime behavior not executed for Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C15-15.2-002
- **Remediation front:** Targeted runtime matrix for Workflow — C15-15.2-002

## C15-15.2-003

- **Primary evidence:** `docs/governance/WORKFLOW_MATRIX.md`
- **Implemented part:** docs/governance/WORKFLOW_MATRIX.md — cancel/void reason required (Ch.15.2)
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** docs/governance/WORKFLOW_MATRIX.md — cancel/void reason required (Ch.15.2). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C15-15.2-003
- **Remediation front:** Targeted runtime matrix for Platform — C15-15.2-003

## C15-15.3-001

- **Classification:** Governance Conflict → **Partial**
- **Primary evidence:** `OSE-backend/prisma/schema.prisma`
- **Implemented part:** approvalChain.service.js single write of ApprovalStep.comment
- **Missing part:** DB immutability constraint + update/delete API audit on all modules
- **Gap:** Comment write-once in one service; platform immutability not exhaustively verified
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C15-15.3-001
- **Remediation front:** Targeted runtime matrix for Workflow — C15-15.3-001

## C15-15.3-002

- **Primary evidence:** `OSE-backend/src/services/auditWriter.service.js`
- **Implemented part:** OSE-backend/src/services/auditWriter.service.js — writeAuditLog() append-only create
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/auditWriter.service.js — writeAuditLog() append-only create. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C15-15.3-002
- **Remediation front:** Targeted runtime matrix for Platform — C15-15.3-002

## C15-15.3-003

- **Primary evidence:** `OSE-backend/src/services/auditWriter.service.js`
- **Implemented part:** OSE-backend/src/services/auditWriter.service.js — auditLog.create only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/auditWriter.service.js — auditLog.create only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C15-15.3-003
- **Remediation front:** Targeted runtime matrix for Platform — C15-15.3-003

## C15-15.4-001

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — sendBackGrn appends [Send Back] system marker
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — sendBackGrn appends [Send Back] system marker. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C15-15.4-001
- **Remediation front:** Targeted runtime matrix for Platform — C15-15.4-001

## C15-15.4-002

- **Primary evidence:** `OSE-backend/src/services/auditWriter.service.js`
- **Implemented part:** OSE-backend/src/services/auditWriter.service.js — writeAuditLog internal only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/auditWriter.service.js — writeAuditLog internal only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C15-15.4-002
- **Remediation front:** Targeted runtime matrix for Platform — C15-15.4-002

## C15-15.4-003

- **Primary evidence:** `OSE-backend/scripts/smoke-audit-facade-static.js`
- **Implemented part:** OSE-backend/scripts/smoke-audit-facade-static.js — audit immutability static check
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/scripts/smoke-audit-facade-static.js — audit immutability static check. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C15-15.4-003
- **Remediation front:** Targeted runtime matrix for Platform — C15-15.4-003

## C15-15.5-001

- **Primary evidence:** `OSE-backend/src/platform/documentTimeline.service.js`
- **Implemented part:** OSE-backend/src/platform/documentTimeline.service.js — fetchAuditEvents orderBy changedAt asc
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/src/platform/documentTimeline.service.js — fetchAuditEvents orderBy changedAt asc. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C15-15.5-001
- **Remediation front:** Targeted runtime matrix for Platform — C15-15.5-001

## C16-16.2-001

- **Primary evidence:** `OSE-backend/prisma/schema.prisma`
- **Implemented part:** OSE-backend/prisma/schema.prisma — Item.imageUrl
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/prisma/schema.prisma — Item.imageUrl. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C16-16.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C16-16.2-001

## C16-16.2-002

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — line payload includes item imageUrl read-only
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/src/services/grn.service.js — line payload includes item imageUrl read-only. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C16-16.2-002
- **Remediation front:** Targeted runtime matrix for Platform — C16-16.2-002

## C16-16.2-003

- **Primary evidence:** `OSE-backend/src/controllers/item.controller.js`
- **Implemented part:** OSE-backend/src/controllers/item.controller.js — uploadItemImage() only item route
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/src/controllers/item.controller.js — uploadItemImage() only item route. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C16-16.2-003
- **Remediation front:** Targeted runtime matrix for Platform — C16-16.2-003

## C16-16.3-001

- **Primary evidence:** `OSE-backend/src/services/item.service.js`
- **Implemented part:** OSE-backend/src/services/item.service.js — attachImageDisplayUrl() / getSignedUrl
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/src/services/item.service.js — attachImageDisplayUrl() / getSignedUrl. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C16-16.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C16-16.3-001

## C16-16.3-002

- **Primary evidence:** `OSE-Frontend/src/app/features/items/items-list/items-list.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/items/items-list/items-list.component.html — thumb--placeholder with package icon
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/features/items/items-list/items-list.component.html — thumb--placeholder with package icon. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C16-16.3-002
- **Remediation front:** Targeted runtime matrix for Platform — C16-16.3-002

## C16-16.3-003

- **Primary evidence:** `OSE-Frontend/src/app/features/items/items-list/items-list.component.scss`
- **Implemented part:** OSE-Frontend/src/app/features/items/items-list/items-list.component.scss — .thumb 36x36
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/features/items/items-list/items-list.component.scss — .thumb 36x36. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C16-16.3-003
- **Remediation front:** Targeted runtime matrix for Platform — C16-16.3-003

## C16-16.3-004

- **Primary evidence:** `OSE-backend/src/platform/mediaPolicy.platform.js`
- **Implemented part:** OSE-backend/src/platform/mediaPolicy.platform.js — ITEM_IMAGE_MAX_FILE_SIZE_BYTES = 1 MB
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/src/platform/mediaPolicy.platform.js — ITEM_IMAGE_MAX_FILE_SIZE_BYTES = 1 MB. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C16-16.3-004
- **Remediation front:** Targeted runtime matrix for Platform — C16-16.3-004

## C16-16.3-005

- **Primary evidence:** `OSE-backend/src/middleware/upload.middleware.js`
- **Implemented part:** OSE-backend/src/middleware/upload.middleware.js — imageFilter allowed extensions
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/src/middleware/upload.middleware.js — imageFilter allowed extensions. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C16-16.3-005
- **Remediation front:** Targeted runtime matrix for Platform — C16-16.3-005

## C16-16.3-006

- **Primary evidence:** `OSE-backend/src/services/report.service.js`
- **Implemented part:** OSE-backend/src/services/report.service.js — delete optimized.imageUrl for some exports
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/src/services/report.service.js — delete optimized.imageUrl for some exports. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C16-16.3-006
- **Remediation front:** Targeted runtime matrix for Platform — C16-16.3-006

## C17-17.2-001

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.2-002

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.2-003

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.2-004

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.2-005

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.2-006

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.2-007

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.2-008

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.2-009

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.3-001

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.3-002

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.3-003

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.3-004

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.3-005

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.3-006

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C17-17.3-007

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C18-18.1-001

- **Primary evidence:** `OSE-Frontend/src/app/core/registries/validation-channel.registry.ts`
- **Implemented part:** OSE-Frontend/src/app/core/registries/validation-channel.registry.ts — VALIDATION_CHANNEL_BY_CODE + resolveValidationChannel()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/registries/validation-channel.registry.ts — VALIDATION_CHANNEL_BY_CODE + resolveValidationChannel(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-001

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — clearLineValidationUi()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — clearLineValidationUi(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-002

- **Primary evidence:** `OSE-Frontend/src/app/core/utils/document-form-validation.util.ts`
- **Implemented part:** OSE-Frontend/src/app/core/utils/document-form-validation.util.ts — runGovernedFormValidation() focusFirstIssue
- **Missing part:** End-to-end runtime behavior not executed for Platform, Workflow
- **Gap:** OSE-Frontend/src/app/core/utils/document-form-validation.util.ts — runGovernedFormValidation() focusFirstIssue. Not proven: End-to-end runtime behavior not executed for Platform, Workflow
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-003

- **Primary evidence:** `OSE-Frontend/public/i18n/en.json`
- **Implemented part:** OSE-Frontend/public/i18n/en.json — COMMON.VALIDATION_SUMMARY
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/public/i18n/en.json — COMMON.VALIDATION_SUMMARY. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-004

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — invalidLineIndexes signal
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — invalidLineIndexes signal. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-005

- **Primary evidence:** `OSE-Frontend/public/i18n/en.json`
- **Implemented part:** OSE-Frontend/public/i18n/en.json — COMMON.CONCURRENCY_CONFLICT / INVALID_FILE_TYPE
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/public/i18n/en.json — COMMON.CONCURRENCY_CONFLICT / INVALID_FILE_TYPE. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-006

- **Primary evidence:** `OSE-backend/src/middleware/errorHandler.js`
- **Implemented part:** OSE-backend/src/middleware/errorHandler.js — responseBody.code / errorFamily
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/middleware/errorHandler.js — responseBody.code / errorFamily. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-007

- **Primary evidence:** `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts`
- **Implemented part:** OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts — translate.instant COMMON.CONCURRENCY_CONFLICT
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts — translate.instant COMMON.CONCURRENCY_CONFLICT. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-008

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — validateGrn() fixed rule set
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — validateGrn() fixed rule set. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-009

- **Primary evidence:** `OSE-Frontend/src/app/shared/components/shared-upload/shared-upload.component.ts`
- **Implemented part:** OSE-Frontend/src/app/shared/components/shared-upload/shared-upload.component.ts — isAcceptedType on pick
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/shared/components/shared-upload/shared-upload.component.ts — isAcceptedType on pick. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-010

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — validateGrn / submitForApproval guards
- **Missing part:** End-to-end runtime behavior not executed for Platform, Workflow
- **Gap:** OSE-backend/src/services/grn.service.js — validateGrn / submitForApproval guards. Not proven: End-to-end runtime behavior not executed for Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-011

- **Primary evidence:** `OSE-backend/src/services/postingGovernedGrn.service.js`
- **Implemented part:** OSE-backend/src/services/postingGovernedGrn.service.js — posting validation chain
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/postingGovernedGrn.service.js — posting validation chain. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-012

- **Primary evidence:** `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts`
- **Implemented part:** OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts — client requireFields assist
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts — client requireFields assist. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-013

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — server validation on workflow/post
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — server validation on workflow/post. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-014

- **Primary evidence:** `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts`
- **Implemented part:** OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts — sortByPresentationOrder()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts — sortByPresentationOrder(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-015

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — nz-alert warning for invoice link fail
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — nz-alert warning for invoice link fail. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-016

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — validateGrn throws 422 on errors
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — validateGrn throws 422 on errors. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C18-18.2-017

- **Primary evidence:** `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts`
- **Implemented part:** OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts — 400 validation toast
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts — 400 validation toast. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C19-19.2-001

- **Primary evidence:** `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts`
- **Implemented part:** OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts — toast-only for 400/409 mutations
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts — toast-only for 400/409 mutations. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C19-19.2-002

- **Primary evidence:** `Governance/requirements.json`
- **Implemented part:** Governance/requirements.json — C18-18.2-017 related duplicate-channel rule
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** Governance/requirements.json — C18-18.2-017 related duplicate-channel rule. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C19-19.3-001

- **Primary evidence:** `OSE-Frontend/src/app/core/utils/http-error.util.ts`
- **Implemented part:** OSE-Frontend/src/app/core/utils/http-error.util.ts — formErrorKeyFromHttp()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/utils/http-error.util.ts — formErrorKeyFromHttp(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C19-19.3-002

- **Primary evidence:** `OSE-backend/src/middleware/errorHandler.js`
- **Implemented part:** OSE-backend/src/middleware/errorHandler.js — production 500 sanitization
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/middleware/errorHandler.js — production 500 sanitization. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C19-19.3-003

- **Primary evidence:** `OSE-backend/src/middleware/errorHandler.js`
- **Implemented part:** OSE-backend/src/middleware/errorHandler.js — stack only when NODE_ENV=development in logger
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/middleware/errorHandler.js — stack only when NODE_ENV=development in logger. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C19-19.3-004

- **Primary evidence:** `OSE-backend/src/middleware/errorHandler.js`
- **Implemented part:** OSE-backend/src/middleware/errorHandler.js — P2002/P2025/P2003 mappings
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/middleware/errorHandler.js — P2002/P2025/P2003 mappings. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C19-19.3-005

- **Primary evidence:** `OSE-backend/src/middleware/errorHandler.js`
- **Implemented part:** OSE-backend/src/middleware/errorHandler.js — existingTenantId in responseBody
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/middleware/errorHandler.js — existingTenantId in responseBody. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C19-19.5-001

- **Primary evidence:** `OSE-backend/src/platform/errorRegistry.js`
- **Implemented part:** OSE-backend/src/platform/errorRegistry.js — classifyCode()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/errorRegistry.js — classifyCode(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C19-19.7-001

- **Primary evidence:** `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts`
- **Implemented part:** OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts — firstMessage() only returns text
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts — firstMessage() only returns text. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C19-19.7-002

- **Primary evidence:** `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.html — role="alert" on field errors
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.html — role="alert" on field errors. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** VALIDATION-UX-01
- **Remediation front:** Validation UX — i18n + error channel matrix across modules

## C20-20.2-001

- **Primary evidence:** `OSE-Frontend/src/app/core/components/notification-bell/notification-bell.component.ts`
- **Implemented part:** OSE-Frontend/src/app/core/components/notification-bell/notification-bell.component.ts — workflow-pipeline/alerts feed
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/core/components/notification-bell/notification-bell.component.ts — workflow-pipeline/alerts feed. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C20-20.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C20-20.2-001

## C20-20.2-002

- **Primary evidence:** `OSE-Frontend/src/app`
- **Implemented part:** OSE-Frontend/src/app — grep: no notification deduplication layer
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app — grep: no notification deduplication layer. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C20-20.2-002
- **Remediation front:** Targeted runtime matrix for Platform — C20-20.2-002

## C20-20.2-003

- **Primary evidence:** `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts`
- **Implemented part:** OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts — warning vs error message types
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts — warning vs error message types. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C20-20.2-003
- **Remediation front:** Targeted runtime matrix for Platform — C20-20.2-003

## C20-20.5-001

- **Primary evidence:** `OSE-backend/src/services/workflow-pipeline/workflow-pipeline.service.js`
- **Implemented part:** OSE-backend/src/services/workflow-pipeline/workflow-pipeline.service.js — getWorkflowPipelineAlerts() no permission filter
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/workflow-pipeline/workflow-pipeline.service.js — getWorkflowPipelineAlerts() no permission filter. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C20-20.5-001
- **Remediation front:** Targeted runtime matrix for Platform — C20-20.5-001

## C21-21.1-001

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts — loading signal on fetch only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts — loading signal on fetch only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C21-21.1-001
- **Remediation front:** Targeted runtime matrix for Platform — C21-21.1-001

## C21-21.1-002

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-list/grn-list.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-list/grn-list.component.html — [nzLoading]=loading()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-list/grn-list.component.html — [nzLoading]=loading(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C21-21.1-002
- **Remediation front:** Targeted runtime matrix for Platform — C21-21.1-002

## C21-21.1-003

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — [disabled]=acting()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html — [disabled]=acting(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C21-21.1-003
- **Remediation front:** Targeted runtime matrix for Platform — C21-21.1-003

## C21-21.1-004

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — submit() sets loading without early return if already loading
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — submit() sets loading without early return if already loading. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C21-21.1-004
- **Remediation front:** Targeted runtime matrix for Platform — C21-21.1-004

## C21-21.2-001

- **Primary evidence:** `OSE-Frontend/src/app/core/layout/main-layout/main-layout.component.ts`
- **Implemented part:** OSE-Frontend/src/app/core/layout/main-layout/main-layout.component.ts — layout remains while child routes load
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/layout/main-layout/main-layout.component.ts — layout remains while child routes load. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C21-21.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C21-21.2-001

## C21-21.3-001

- **Primary evidence:** `OSE-Frontend/src/app`
- **Implemented part:** OSE-Frontend/src/app — grep: no long-running operation continuation messaging
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app — grep: no long-running operation continuation messaging. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C21-21.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C21-21.3-001

## C22-22.2-001

- **Classification:** Governance Conflict → **Partial**
- **Added scenarios:** V2-D-GRN-AUDIT
- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Implemented part:** auditTrail.service.js + auditGoverned.service.js; partial GRN/Transfer/IC wiring
- **Missing part:** Breakage create/submit paths lack audit calls per traceability grep
- **Gap:** Audit helpers exist; not every workflow action on every module wired
- **Evidence scope:** Runtime partial — GRN module only
- **Root cause group:** AUDIT-COVERAGE-01
- **Remediation front:** Audit — wire logGovernedEvent on all workflow actions all modules

## C22-22.2-002

- **Primary evidence:** `OSE-backend/src/services/breakage.service.js`
- **Implemented part:** OSE-backend/src/services/breakage.service.js — addAttachment() no logAction
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/breakage.service.js — addAttachment() no logAction. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** AUDIT-COVERAGE-01
- **Remediation front:** Audit — wire logGovernedEvent on all workflow actions all modules

## C22-22.2-003

- **Primary evidence:** `OSE-backend/src/services/grn.service.js`
- **Implemented part:** OSE-backend/src/services/grn.service.js — logGovernedEvent on key transitions
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/grn.service.js — logGovernedEvent on key transitions. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** AUDIT-COVERAGE-01
- **Remediation front:** Audit — wire logGovernedEvent on all workflow actions all modules

## C22-22.3-001

- **Primary evidence:** `OSE-backend/src/platform/documentTimeline.service.js`
- **Implemented part:** OSE-backend/src/platform/documentTimeline.service.js — getGrnTimeline()/fetchAuditEvents()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/platform/documentTimeline.service.js — getGrnTimeline()/fetchAuditEvents(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** AUDIT-COVERAGE-01
- **Remediation front:** Audit — wire logGovernedEvent on all workflow actions all modules

## C22-22.3-002

- **Primary evidence:** `OSE-backend/src/services/auditWriter.service.js`
- **Implemented part:** OSE-backend/src/services/auditWriter.service.js — writeAuditLog() insert-only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/auditWriter.service.js — writeAuditLog() insert-only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** AUDIT-COVERAGE-01
- **Remediation front:** Audit — wire logGovernedEvent on all workflow actions all modules

## C22-22.3-003

- **Primary evidence:** `OSE-backend/prisma/schema.prisma`
- **Implemented part:** OSE-backend/prisma/schema.prisma — AuditLog.changedAt @default(now())
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/prisma/schema.prisma — AuditLog.changedAt @default(now()). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** AUDIT-COVERAGE-01
- **Remediation front:** Audit — wire logGovernedEvent on all workflow actions all modules

## C22-22.3-004

- **Primary evidence:** `OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.ts`
- **Implemented part:** OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.ts — DatePipe default locale formatting
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.ts — DatePipe default locale formatting. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** AUDIT-COVERAGE-01
- **Remediation front:** Audit — wire logGovernedEvent on all workflow actions all modules

## C22-22.3-005

- **Primary evidence:** `OSE-backend/src/services/audit.service.js`
- **Implemented part:** OSE-backend/src/services/audit.service.js — filtered findMany on audit log
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/audit.service.js — filtered findMany on audit log. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** AUDIT-COVERAGE-01
- **Remediation front:** Audit — wire logGovernedEvent on all workflow actions all modules

## C23-23.1-001

- **Primary evidence:** `OSE-Frontend/src/app/core/services/shared-lookup.service.ts`
- **Implemented part:** OSE-Frontend/src/app/core/services/shared-lookup.service.ts — searchItems()
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/core/services/shared-lookup.service.ts — searchItems(). Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C23-23.1-001
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.1-001

## C23-23.2-001

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — custom item dropdown
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — custom item dropdown. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C23-23.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.2-001

## C23-23.3-001

- **Primary evidence:** `OSE-backend/src/services/item.service.js`
- **Implemented part:** OSE-backend/src/services/item.service.js — getItems() OR name/barcode contains
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/item.service.js — getItems() OR name/barcode contains. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C23-23.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.3-001

## C23-23.3-002

- **Primary evidence:** `OSE-backend/src/services/item.service.js`
- **Implemented part:** OSE-backend/src/services/item.service.js — orderBy: { name: 'asc' }
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/item.service.js — orderBy: { name: 'asc' }. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C23-23.3-002
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.3-002

## C23-23.3-003

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — search$.pipe(debounceTime(300))
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — search$.pipe(debounceTime(300)). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C23-23.3-003
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.3-003

## C23-23.3-004

- **Primary evidence:** `OSE-backend/src/services/item.service.js`
- **Implemented part:** OSE-backend/src/services/item.service.js — mode: 'insensitive' contains
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/item.service.js — mode: 'insensitive' contains. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C23-23.3-004
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.3-004

## C23-23.4-001

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C23-23.4-002

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C23-23.4-003

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C23-23.4-004

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — dropdown toggled by focus/query only
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — dropdown toggled by focus/query only. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C23-23.4-004
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.4-004

## C23-23.4-005

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — onWarehouseChange closes dropdown
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — onWarehouseChange closes dropdown. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C23-23.4-005
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.4-005

## C23-23.4-006

- **Primary evidence:** `OSE-Frontend/src/app`
- **Implemented part:** OSE-Frontend/src/app — grep: no single-open lookup coordinator/registry
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app — grep: no single-open lookup coordinator/registry. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C23-23.4-006
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.4-006

## C23-23.4-007

- **Primary evidence:** `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json`
- **Implemented part:** Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells
- **Missing part:** Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention
- **Gap:** Keyboard constitution claims platform-wide; probes cover create shells only
- **Evidence scope:** Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)
- **Root cause group:** KEYBOARD-SCOPE-01
- **Remediation front:** Keyboard verification for Detail/List/Settings screens beyond 7 create shells

## C23-23.5-001

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — loading icon + NO_ITEMS empty
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — loading icon + NO_ITEMS empty. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C23-23.5-001
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.5-001

## C23-23.5-002

- **Primary evidence:** `OSE-Frontend/public/i18n/en.json`
- **Implemented part:** OSE-Frontend/public/i18n/en.json — per-screen empty strings (e.g. GRN.CREATE.NO_ITEMS) not shared lookup empty state
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/public/i18n/en.json — per-screen empty strings (e.g. GRN.CREATE.NO_ITEMS) not shared lookup empty state. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C23-23.5-002
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.5-002

## C23-23.6-001

- **Primary evidence:** `OSE-backend/src/services/item.service.js`
- **Implemented part:** OSE-backend/src/services/item.service.js — tenantId + locationId where clause
- **Missing part:** End-to-end runtime behavior not executed for Platform, Workflow
- **Gap:** OSE-backend/src/services/item.service.js — tenantId + locationId where clause. Not proven: End-to-end runtime behavior not executed for Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C23-23.6-001
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C23-23.6-001

## C23-23.6-002

- **Primary evidence:** `Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json`
- **Implemented part:** V2-CF-GP-XT-READ PASS on Get Pass
- **Missing part:** No runtime probe beyond Get Pass
- **Gap:** V2-CF-GP-XT-READ PASS on Get Pass. Not proven: No runtime probe beyond Get Pass
- **Evidence scope:** Runtime partial — Get Pass module only
- **Root cause group:** TENANT-SCOPE-01
- **Remediation front:** Platform-wide lookup tenant isolation probes across GRN/Transfer/IC

## C23-23.6-003

- **Primary evidence:** `OSE-Frontend/src/app/core/services/shared-lookup.service.ts`
- **Implemented part:** OSE-Frontend/src/app/core/services/shared-lookup.service.ts — limit=20
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/services/shared-lookup.service.ts — limit=20. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C23-23.6-003
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.6-003

## C23-23.6-004

- **Primary evidence:** `OSE-Frontend/src/app/core/services/shared-lookup.service.ts`
- **Implemented part:** OSE-Frontend/src/app/core/services/shared-lookup.service.ts — HTTP GET /items with q param
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/services/shared-lookup.service.ts — HTTP GET /items with q param. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C23-23.6-004
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.6-004

## C23-23.6-005

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — suppliersApi.list({ take: 10000 })
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — suppliersApi.list({ take: 10000 }). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C23-23.6-005
- **Remediation front:** Targeted runtime matrix for Platform — C23-23.6-005

## C24-24.1-001

- **Primary evidence:** `docs/governance/scripts/constitution-base.md`

## C24-24.2-001

- **Primary evidence:** `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md`
- **Implemented part:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — GHSL/VSL golden geometry at 1366×768
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — GHSL/VSL golden geometry at 1366×768. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C24-24.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.2-001

## C24-24.3-001

- **Primary evidence:** `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md`
- **Implemented part:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — §9 Zoom Policy
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — §9 Zoom Policy. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C24-24.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.3-001

## C24-24.4-001

- **Primary evidence:** `OSE-Frontend/src/styles.scss`
- **Implemented part:** OSE-Frontend/src/styles.scss — overflow-x rules for document tables
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/styles.scss — overflow-x rules for document tables. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C24-24.4-001
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.4-001

## C24-24.4-002

- **Primary evidence:** `Governance/CONSTITUTION_TRACEABILITY_MATRIX.md`
- **Implemented part:** Governance artifact Governance/CONSTITUTION_TRACEABILITY_MATRIX.md
- **Missing part:** Product implementation path not linked for Platform
- **Gap:** Governance artifact Governance/CONSTITUTION_TRACEABILITY_MATRIX.md. Not proven: Product implementation path not linked for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C24-24.4-002
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.4-002

## C24-24.4-003

- **Primary evidence:** `Governance/CONSTITUTION_TRACEABILITY_MATRIX.md`
- **Implemented part:** Governance artifact Governance/CONSTITUTION_TRACEABILITY_MATRIX.md
- **Missing part:** Product implementation path not linked for Platform
- **Gap:** Governance artifact Governance/CONSTITUTION_TRACEABILITY_MATRIX.md. Not proven: Product implementation path not linked for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C24-24.4-003
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.4-003

## C24-24.4-004

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — footer submit actions present
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html — footer submit actions present. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C24-24.4-004
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.4-004

## C24-24.4-005

- **Primary evidence:** `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md`
- **Implemented part:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — modal/viewport contracts
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — modal/viewport contracts. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C24-24.4-005
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.4-005

## C24-24.4-006

- **Primary evidence:** `OSE-Frontend/src/styles.scss`
- **Implemented part:** OSE-Frontend/src/styles.scss — table overflow-x auto
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/styles.scss — table overflow-x auto. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C24-24.4-006
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.4-006

## C24-24.5-001

- **Primary evidence:** `docs/governance/scripts/constitution-base.md`
- **Implemented part:** docs/governance/scripts/constitution-base.md — §24.5 browser matrix reference
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** docs/governance/scripts/constitution-base.md — §24.5 browser matrix reference. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C24-24.5-001
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.5-001

## C24-24.5-002

- **Primary evidence:** `OSE-Frontend/src`
- **Implemented part:** OSE-Frontend/src — grep: no DPI/2K/4K-specific handling or test artifacts
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src — grep: no DPI/2K/4K-specific handling or test artifacts. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C24-24.5-002
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.5-002

## C24-24.5-003

- **Primary evidence:** `Governance/CONSTITUTION_TRACEABILITY_MATRIX.md`
- **Implemented part:** Governance artifact Governance/CONSTITUTION_TRACEABILITY_MATRIX.md
- **Missing part:** Product implementation path not linked for Platform
- **Gap:** Governance artifact Governance/CONSTITUTION_TRACEABILITY_MATRIX.md. Not proven: Product implementation path not linked for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C24-24.5-003
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.5-003

## C24-24.6-001

- **Primary evidence:** `OSE-Frontend/docs/governance/DX_OSE_WAVE2_RECOVERY_MEASUREMENT_SOP_v1.md`
- **Implemented part:** OSE-Frontend/docs/governance/DX_OSE_WAVE2_RECOVERY_MEASUREMENT_SOP_v1.md — zoom spot checks
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/docs/governance/DX_OSE_WAVE2_RECOVERY_MEASUREMENT_SOP_v1.md — zoom spot checks. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C24-24.6-001
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.6-001

## C24-24.6-002

- **Primary evidence:** `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md`
- **Implemented part:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — multi-resolution golden references
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — multi-resolution golden references. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C24-24.6-002
- **Remediation front:** Targeted runtime matrix for Platform — C24-24.6-002

## C25-25.2-001

- **Primary evidence:** `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html — document-card layout
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html — document-card layout. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C25-25.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C25-25.2-001

## C25-25.2-002

- **Primary evidence:** `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md`
- **Implemented part:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — one archetype per bounded route
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — one archetype per bounded route. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C25-25.2-002
- **Remediation front:** Targeted runtime matrix for Platform — C25-25.2-002

## C25-25.3-001

- **Primary evidence:** `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md`
- **Implemented part:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — §3 Vertical Scroll Law
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md — §3 Vertical Scroll Law. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C25-25.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C25-25.3-001

## C25-25.3-002

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-list/_grn-list-registry-canvas.scss`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-list/_grn-list-registry-canvas.scss — registry scroll canvas
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-list/_grn-list-registry-canvas.scss — registry scroll canvas. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C25-25.3-002
- **Remediation front:** Targeted runtime matrix for Platform — C25-25.3-002

## C26-26.1-001

- **Primary evidence:** `OSE-backend/src/services/pdf/report-document.facade.js`
- **Implemented part:** OSE-backend/src/services/pdf/report-document.facade.js — shared PDF presentation facade
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/pdf/report-document.facade.js — shared PDF presentation facade. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C26-26.1-001
- **Remediation front:** Targeted runtime matrix for Platform — C26-26.1-001

## C26-26.1-002

- **Primary evidence:** `OSE-backend/src/services/pdf/report-pdf-enterprise.js`
- **Implemented part:** OSE-backend/src/services/pdf/report-pdf-enterprise.js — status pills / POSTED final step
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/pdf/report-pdf-enterprise.js — status pills / POSTED final step. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C26-26.1-002
- **Remediation front:** Targeted runtime matrix for Platform — C26-26.1-002

## C26-26.1-003

- **Primary evidence:** `OSE-backend/src/services/pdf/report-pdf-controlled-document.js`
- **Implemented part:** OSE-backend/src/services/pdf/report-pdf-controlled-document.js — drawControlledMovementHeader()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/pdf/report-pdf-controlled-document.js — drawControlledMovementHeader(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C26-26.1-003
- **Remediation front:** Targeted runtime matrix for Platform — C26-26.1-003

## C26-26.1-004

- **Primary evidence:** `OSE-backend/src/services/pdf/report-pdf-enterprise.js`
- **Implemented part:** OSE-backend/src/services/pdf/report-pdf-enterprise.js — stampEnterpriseDocumentFooters()
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/pdf/report-pdf-enterprise.js — stampEnterpriseDocumentFooters(). Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C26-26.1-004
- **Remediation front:** Targeted runtime matrix for Platform — C26-26.1-004

## C26-26.2-001

- **Primary evidence:** `docs/governance/PRODUCT_CHARTER.md`
- **Implemented part:** docs/governance/PRODUCT_CHARTER.md — operational traceability / authoritative data narrative
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** docs/governance/PRODUCT_CHARTER.md — operational traceability / authoritative data narrative. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C26-26.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C26-26.2-001

## C26-26.3-001

- **Primary evidence:** `OSE-backend/src/routes/grn.routes.js`
- **Implemented part:** OSE-backend/src/routes/grn.routes.js — GET /:id/evidence/pdf require GRN_VIEW
- **Missing part:** End-to-end runtime behavior not executed for Platform, Workflow
- **Gap:** OSE-backend/src/routes/grn.routes.js — GET /:id/evidence/pdf require GRN_VIEW. Not proven: End-to-end runtime behavior not executed for Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C26-26.3-001
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C26-26.3-001

## C26-26.3-002

- **Primary evidence:** `OSE-backend/src/routes/reports.routes.js`
- **Implemented part:** OSE-backend/src/routes/reports.routes.js — requirePermission('REPORTS_EXPORT') on pdf routes
- **Missing part:** End-to-end runtime behavior not executed for Platform, Workflow
- **Gap:** OSE-backend/src/routes/reports.routes.js — requirePermission('REPORTS_EXPORT') on pdf routes. Not proven: End-to-end runtime behavior not executed for Platform, Workflow
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C26-26.3-002
- **Remediation front:** Targeted runtime matrix for Platform, Workflow — C26-26.3-002

## C26-26.3-003

- **Primary evidence:** `OSE-backend/src/acc-authority/catalog.constitution.js`
- **Implemented part:** OSE-backend/src/acc-authority/catalog.constitution.js — permission catalog entries
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/acc-authority/catalog.constitution.js — permission catalog entries. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C26-26.3-003
- **Remediation front:** Targeted runtime matrix for Platform — C26-26.3-003

## C26-26.4-001

- **Primary evidence:** `OSE-backend/src/services/pdf/`
- **Implemented part:** OSE-backend/src/services/pdf/ — no mask/redact implementation found
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-backend/src/services/pdf/ — no mask/redact implementation found. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C26-26.4-001
- **Remediation front:** Targeted runtime matrix for Platform — C26-26.4-001

## C27-27.1-001

- **Primary evidence:** `OSE-Frontend/src/app/shared/components/registry-list-pagination/registry-list-pagination.component.ts`
- **Implemented part:** OSE-Frontend/src/app/shared/components/registry-list-pagination/registry-list-pagination.component.ts — shared pagination component
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/shared/components/registry-list-pagination/registry-list-pagination.component.ts — shared pagination component. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C27-27.1-001
- **Remediation front:** Targeted runtime matrix for Platform — C27-27.1-001

## C27-27.1-002

- **Primary evidence:** `OSE-backend/src/services/item.service.js`
- **Implemented part:** OSE-backend/src/services/item.service.js — search query param
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-backend/src/services/item.service.js — search query param. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Backend guard only — static service/route symbols
- **Root cause group:** PARTIAL-C27-27.1-002
- **Remediation front:** Targeted runtime matrix for Platform — C27-27.1-002

## C27-27.1-003

- **Primary evidence:** `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — debounceTime + switchMap
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts — debounceTime + switchMap. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C27-27.1-003
- **Remediation front:** Targeted runtime matrix for Platform — C27-27.1-003

## C27-27.1-004

- **Primary evidence:** `OSE-Frontend/src/app/features/reports/analytics-report/analytics-report.component.ts`
- **Implemented part:** OSE-Frontend/src/app/features/reports/analytics-report/analytics-report.component.ts — exportingPdf signal during HTTP export
- **Missing part:** Behavior not runtime-probed on modules in scope: Platform
- **Gap:** OSE-Frontend/src/app/features/reports/analytics-report/analytics-report.component.ts — exportingPdf signal during HTTP export. Not proven: Behavior not runtime-probed on modules in scope: Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C27-27.1-004
- **Remediation front:** Targeted runtime matrix for Platform — C27-27.1-004

## C28-28.1-001

- **Primary evidence:** `OSE-Frontend/src/app/features/admin/user-rights/user-rights.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/admin/user-rights/user-rights.component.html — aria-label on some controls
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/admin/user-rights/user-rights.component.html — aria-label on some controls. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C28-28.1-001
- **Remediation front:** Targeted runtime matrix for Platform — C28-28.1-001

## C28-28.1-002

- **Primary evidence:** `OSE-Frontend/src/app/core/components/notification-bell/notification-bell.component.ts`
- **Implemented part:** OSE-Frontend/src/app/core/components/notification-bell/notification-bell.component.ts — badgeCount numeric + bell icon
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/components/notification-bell/notification-bell.component.ts — badgeCount numeric + bell icon. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C28-28.1-002
- **Remediation front:** Targeted runtime matrix for Platform — C28-28.1-002

## C28-28.1-003

- **Primary evidence:** `Governance/CONSTITUTION_TRACEABILITY_MATRIX.md`
- **Implemented part:** Governance artifact Governance/CONSTITUTION_TRACEABILITY_MATRIX.md
- **Missing part:** Product implementation path not linked for Platform
- **Gap:** Governance artifact Governance/CONSTITUTION_TRACEABILITY_MATRIX.md. Not proven: Product implementation path not linked for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C28-28.1-003
- **Remediation front:** Targeted runtime matrix for Platform — C28-28.1-003

## C28-28.2-001

- **Primary evidence:** `Governance/CONSTITUTION_TRACEABILITY_MATRIX.md`
- **Implemented part:** Governance artifact Governance/CONSTITUTION_TRACEABILITY_MATRIX.md
- **Missing part:** Product implementation path not linked for Platform
- **Gap:** Governance artifact Governance/CONSTITUTION_TRACEABILITY_MATRIX.md. Not proven: Product implementation path not linked for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C28-28.2-001
- **Remediation front:** Targeted runtime matrix for Platform — C28-28.2-001

## C28-28.3-001

- **Primary evidence:** `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.html`
- **Implemented part:** OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.html — role="alert" field errors
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.html — role="alert" field errors. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C28-28.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C28-28.3-001

## C28-28.3-002

- **Primary evidence:** `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts`
- **Implemented part:** OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts — message.error toasts
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts — message.error toasts. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Frontend display only — static component/directive symbols
- **Root cause group:** PARTIAL-C28-28.3-002
- **Remediation front:** Targeted runtime matrix for Platform — C28-28.3-002

## C29-29.1-001

- **Primary evidence:** `Governance/requirements.json`
- **Implemented part:** Governance/requirements.json — machine-readable chapter/section mapping per requirement
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** Governance/requirements.json — machine-readable chapter/section mapping per requirement. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C29-29.1-001
- **Remediation front:** Targeted runtime matrix for Platform — C29-29.1-001

## C29-29.1-002

- **Primary evidence:** `Governance/evidence.json`
- **Implemented part:** Governance/evidence.json — revised-capability evidence rows updated in constitution program
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** Governance/evidence.json — revised-capability evidence rows updated in constitution program. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C29-29.1-002
- **Remediation front:** Targeted runtime matrix for Platform — C29-29.1-002

## C29-29.1-003

- **Primary evidence:** `Governance/evidence.json`
- **Implemented part:** Governance/evidence.json — implemented/verificationStatus per requirement before release tracking
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** Governance/evidence.json — implemented/verificationStatus per requirement before release tracking. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C29-29.1-003
- **Remediation front:** Targeted runtime matrix for Platform — C29-29.1-003

## C29-29.3-001

- **Primary evidence:** `docs/governance/scripts/constitution-base.md`
- **Implemented part:** docs/governance/scripts/constitution-base.md — §29.3 Definition of Done
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** docs/governance/scripts/constitution-base.md — §29.3 Definition of Done. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C29-29.3-001
- **Remediation front:** Targeted runtime matrix for Platform — C29-29.3-001

## C29-29.3-002

- **Primary evidence:** `docs/governance/scripts/constitution-base.md`
- **Implemented part:** docs/governance/scripts/constitution-base.md — §29.3 responsive test matrix where applicable
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** docs/governance/scripts/constitution-base.md — §29.3 responsive test matrix where applicable. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C29-29.3-002
- **Remediation front:** Targeted runtime matrix for Platform — C29-29.3-002

## C29-29.4-001

- **Primary evidence:** `docs/governance/EXCEPTION_REGISTER.md`
- **Implemented part:** docs/governance/EXCEPTION_REGISTER.md — register conventions — scope, approval date, approver, expiry, ID
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** docs/governance/EXCEPTION_REGISTER.md — register conventions — scope, approval date, approver, expiry, ID. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C29-29.4-001
- **Remediation front:** Targeted runtime matrix for Platform — C29-29.4-001

## C29-29.4-002

- **Primary evidence:** `docs/governance/EXCEPTION_REGISTER.md`
- **Implemented part:** docs/governance/EXCEPTION_REGISTER.md — EX-005 dual audit — documented with consolidation target
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** docs/governance/EXCEPTION_REGISTER.md — EX-005 dual audit — documented with consolidation target. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C29-29.4-002
- **Remediation front:** Targeted runtime matrix for Platform — C29-29.4-002

## C29-29.4-003

- **Primary evidence:** `docs/governance/EXCEPTION_REGISTER.md`
- **Implemented part:** docs/governance/EXCEPTION_REGISTER.md — EX-004 mixed posting triggers — documented deviation + mitigation
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** docs/governance/EXCEPTION_REGISTER.md — EX-004 mixed posting triggers — documented deviation + mitigation. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C29-29.4-003
- **Remediation front:** Targeted runtime matrix for Platform — C29-29.4-003

## C29-29.4-004

- **Primary evidence:** `docs/governance/EXCEPTION_REGISTER.md`
- **Implemented part:** docs/governance/EXCEPTION_REGISTER.md — EX-003 PeriodClose.status — scope, expiry, resolution direction
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** docs/governance/EXCEPTION_REGISTER.md — EX-003 PeriodClose.status — scope, expiry, resolution direction. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C29-29.4-004
- **Remediation front:** Targeted runtime matrix for Platform — C29-29.4-004

## C29-29.5-001

- **Primary evidence:** `docs/governance/scripts/constitution-base.md`
- **Implemented part:** docs/governance/scripts/constitution-base.md — §29.5 constitutional review requirement
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** docs/governance/scripts/constitution-base.md — §29.5 constitutional review requirement. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C29-29.5-001
- **Remediation front:** Targeted runtime matrix for Platform — C29-29.5-001

## C29-29.6-001

- **Primary evidence:** `Governance/CONSTITUTION_TRACEABILITY_MATRIX.md`

## C29-29.7-001

- **Primary evidence:** `Governance/CONSTITUTION_TRACEABILITY_MATRIX.md`
- **Implemented part:** Governance/CONSTITUTION_TRACEABILITY_MATRIX.md — implementation register SSOT
- **Missing part:** End-to-end runtime behavior not executed for Platform
- **Gap:** Governance/CONSTITUTION_TRACEABILITY_MATRIX.md — implementation register SSOT. Not proven: End-to-end runtime behavior not executed for Platform
- **Evidence scope:** Static definition only — governance library artifact
- **Root cause group:** PARTIAL-C29-29.7-001
- **Remediation front:** Targeted runtime matrix for Platform — C29-29.7-001

## Cross-cutting findings

- **V2-C-WF-EFFECTIVE** — Configuration Drift: No exact 393 requirement expresses effective GET_PASS workflow configuration inheritance across tenants
- **V2-CF-LEG-LOST-DEPT** — Operational Legacy: No exact 393 requirement names legacy /approve-dept route; runtime proves ACC-unpinned approval bypass on Lost Items
