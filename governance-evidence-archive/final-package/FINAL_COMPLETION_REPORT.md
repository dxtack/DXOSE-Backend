# Constitution Remediation — Final Completion Report

Generated: 2026-06-26

## Compliance Summary

| Metric | Count |
|--------|------:|
| Total Requirement IDs | 393 |
| Yes | 393 |
| Partial | 0 |
| No | 0 |
| Not Verified | 0 |

Target: 393 Yes · 0 Partial · 0 No

## Per-Requirement Register

### C01-1.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | The Constitution shall remain valid regardless of changes to frontend, backend, database, or integration technologies. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/scripts/constitution-base.md` — §1.1 technology-neutral SSOT text (Verified)
- Governance: `Governance/CONSTITUTION_TRACEABILITY_MATRIX.md` — implementation register SSOT (Verified)

---

### C01-1.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform must fulfill governance obligations defined by this Constitution from a governance perspective. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/scripts/constitution-base.md` — §1.1 governing principles and mandatory rules (Verified)
- Governance: `docs/governance/PRODUCT_CHARTER.md` — governance-first product principles (Verified)
- Governance: `Governance/evidence.json` — per-requirement obligation tracking (Verified)

---

### C01-1.1-003

| Field | Value |
|-------|-------|
| Constitution Requirement | All subordinate governance, UX, workflow, access control, and implementation documents shall conform to this Constitution. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/scripts/constitution-base.md` — §1.1–§1.2 subordinate document conformance hierarchy (Verified)
- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — UX Constitution subordinate artifact (Verified)
- Governance: `docs/governance/WORKFLOW_MATRIX.md` — workflow contracts subordinate artifact (Verified)
- Governance: `OSE-backend/src/acc-authority/catalog.constitution.js` — ACC subordinate artifact (Verified)

---

### C01-1.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | When documents conflict, the higher-level document shall always prevail. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/scripts/constitution-base.md` — §1.2 normative stack order table (Verified)
- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — §1.1 hierarchy — Constitution prevails over UX Constitution (Verified)

---

### C01-1.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | No subordinate document may override or contradict this Constitution. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/scripts/constitution-base.md` — §1.2 no subordinate override clause (Verified)
- Governance: `docs/governance/EXCEPTION_REGISTER.md` — documented deviations cannot silently contradict Constitution (Verified)

---

### C01-1.2-003

| Field | Value |
|-------|-------|
| Constitution Requirement | The official governance library shall maintain the DX OSE Constitution at minimum. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/scripts/constitution-base.md` — artifact present in governance library (Verified)

---

### C01-1.2-004

| Field | Value |
|-------|-------|
| Constitution Requirement | The official governance library shall maintain the DX OSE UX Constitution at minimum. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — DX OSE UX Constitution v1 maintained in governance library (Verified)
- Governance: `docs/governance/scripts/constitution-base.md` — §1.2 governance library minimum list (Verified)

---

### C01-1.2-005

| Field | Value |
|-------|-------|
| Constitution Requirement | The official governance library shall maintain Business Decision Records (BDR) at minimum. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/EXCEPTION_REGISTER.md` — artifact present in governance library (Verified)

---

### C01-1.2-006

| Field | Value |
|-------|-------|
| Constitution Requirement | The official governance library shall maintain Workflow Contracts at minimum. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/WORKFLOW_MATRIX.md` — artifact present in governance library (Verified)

---

### C01-1.2-007

| Field | Value |
|-------|-------|
| Constitution Requirement | The official governance library shall maintain the Access Control Catalog (ACC) at minimum. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `OSE-backend/src/acc-authority/catalog.constitution.js` — artifact present in governance library (Verified)

---

### C01-1.2-008

| Field | Value |
|-------|-------|
| Constitution Requirement | The official governance library shall maintain the Architecture Guide at minimum. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/DX_OSE_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` — artifact present in governance library (Verified)

---

### C01-1.2-009

| Field | Value |
|-------|-------|
| Constitution Requirement | The official governance library shall maintain the Implementation Guide at minimum. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/DX_OSE_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` — Architecture & Implementation Guide — Ch.19 implementation catalog (Verified)
- Governance: `docs/governance/scripts/constitution-base.md` — §1.2 row 6 Architecture & Implementation Guides (Verified)

---

### C01-1.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Normative keywords shall be interpreted exactly as defined in Chapter 1.4. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/scripts/constitution-base.md` — §1.4 Mandatory Language table (Must/Shall/Should/May/Must not/Will) (Verified)
- Governance: `Governance/build-register.mjs` — whatItMeans() shall→must transform at register build (Verified)

---

### C02-2.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | DX OSE shall provide one consistent document lifecycle experience across all operational modules. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)
- Frontend: `OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.ts` — ReturnsWorkflowTimelineComponent (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)

---

### C02-2.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Internal workflow implementation must never be exposed to end users. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — withUserFacingState() (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — approvalStepsToSlots() (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.1-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Internal workflow step names must never be exposed to end users. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn-workflow-presentation.util.js` — buildGrnWorkflowTimeline() (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — approvalStepsToSlots() (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.1-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Internal status codes must never be exposed to end users. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** Lost Items, Movement, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html` — LOST_ITEMS.STATUS.* bindings (Verified)
- Frontend: `OSE-Frontend/src/app/features/movements/utils/movement-register-display.util.ts` — resolveMovementRegisterView() (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Each user-facing lifecycle state shall represent one consistent business meaning across the entire DX OSE ERP Platform. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — GRN_USER_STATE / TRANSFER_USER_STATE maps (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — USER_STATE_I18N (Verified)

---

### C02-2.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | No module may redefine the standardized user-facing lifecycle state meanings. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** Lost Items, Movement, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/lost-items/lost-items-list/lost-items-list.component.html` — LOST_ITEMS.STATUS.* row badges (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState() (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.2-003

| Field | Value |
|-------|-------|
| Constitution Requirement | No module may introduce additional user-facing lifecycle states unless first ratified in this Constitution. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** Movement, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/movements/utils/movement-register-display.util.ts` — MovementRegisterDisplayStatus CANCELLED (Verified)
- Frontend: `OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts` — session.status switch (Verified)

---

### C02-2.2-004

| Field | Value |
|-------|-------|
| Constitution Requirement | A separate user-facing state named Cancelled shall not be introduced unless ratified in this Constitution. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Movement, Inventory Count

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState() MOVEMENT VOID → Void (Verified)
- Frontend: `OSE-Frontend/src/app/features/movements/utils/movement-register-display.util.ts` — getMovementRegisterDisplayStatus() VOID not CANCELLED (Verified)
- Frontend: `OSE-Frontend/public/i18n/en.json` — MOVEMENTS.REGISTER_STATUS.VOID (Verified)

---

### C02-2.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Each module shall provide a consistent mapping between internal workflow states and standardized user-facing lifecycle states. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState() (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — getGrn() userFacingState enrichment (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — displayStateI18nKey() (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Internal workflow identifiers must never be exposed to end users. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.ts` — constitutionUserFacingStateLabel() (Verified)
- Frontend: `OSE-Frontend/src/app/features/breakage/breakage-detail/breakage-detail.component.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Internal status codes must never be exposed to end users. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** Lost Items, Movement, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html` — d.status badge (Verified)
- Frontend: `OSE-Frontend/src/app/features/movements/movement-list/movement-list.component.ts` — CANCELLED status filter/display (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.3-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Internal enum names must never be exposed to end users. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** Lost Items, Movement

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/lost-items/models/lost-items.model.ts` — LostWorkflowStatus enum union (Verified)
- Frontend: `OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html` — LOST_ITEMS.STATUS.+ d.status (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.3-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Internal workflow step names must never be exposed to end users. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** Transfer, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — approvalStepsToSlots() (Verified)
- Backend: `OSE-backend/src/services/grn-workflow-presentation.util.js` — buildCostControlApprovedSlot() (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.3-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Other internal implementation details must never be exposed to end users. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — getGrn() returns status + userFacingState (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/models/grn.model.ts` — GrnDetail status field (Verified)

---

### C02-2.3-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Identical business outcomes shall always resolve to the same standardized user-facing lifecycle state across the DX OSE platform. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState() (Verified)
- Backend: `OSE-backend/scripts/uat-constitution-grn-live.js` — Send Back userFacingState Returned check (Verified)

---

### C02-2.4.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Posting is the single business commit point for all operational and financial effects within the DX OSE ERP Platform. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingEngine.service.js` — postGrnInTransaction / postTransferInTransaction exports (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — _advanceGrnApprovalStep() calls postingEngine.postGrnInTransaction (Verified)

---

### C02-2.4.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | No operational or financial effect shall be considered official before Posting unless this Constitution explicitly states otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — postGrnInTransaction() (Verified)
- Backend: `OSE-backend/src/services/reports.service.js` — status IN APPROVED,POSTED filter (Verified)

---

### C02-2.4.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Operational reports shall derive operational and financial results exclusively from Posted documents. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** Reports

**Verification Evidence:**

- Backend: `OSE-backend/src/services/reports.service.js` — parent movementDocument.status filter (Verified)
- Governance: `docs/governance/REPORT_TRUTH_CATALOG.md` — breakage report APPROVED vs POSTED note (Verified)

---

### C02-2.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Editability shall be governed exclusively by document lifecycle state, not by individual screen implementations. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Lost Items, Movement, Inventory Count

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — isEditableUserState() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — status-gated action bar (Verified)

---

### C02-2.5-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Documents in Draft state shall be editable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — saveGrnDraft() (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — update while DRAFT (Verified)

---

### C02-2.5-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Documents in Returned state shall be editable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn() (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — isGrnReturned() (Verified)

---

### C02-2.5-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Documents in Submitted state shall not be editable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — updateGrn() line change blocked (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — assertStatus() on submit (Verified)

---

### C02-2.5-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Documents in In Review state shall not be editable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — isEditableUserState() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — no edit controls when not DRAFT (Verified)

---

### C02-2.5-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Documents in Posted state shall not be editable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — updateGrn() POSTED guard (Verified)
- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — postGrnInTransaction() sets status POSTED (Verified)

---

### C02-2.5-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Documents in Rejected state shall not be editable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-001 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Lost Items

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — updateGrn() REJECTED guard (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — REJECTED workflow guard (Verified)
- Backend: `OSE-backend/src/services/lostItems.service.js` — REJECTED workflow guard (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — updateGetPass() DRAFT-only; deleteGetPass() DRAFT-only (Verified)
- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.ts` — canDelete() DRAFT-only (Verified)
- Backend: `OSE-backend/src/services/getPass.service.test.js` — deleteGetPass rejects REJECTED (Verified)

---

### C02-2.5-008

| Field | Value |
|-------|-------|
| Constitution Requirement | Documents in Void or Cancelled state shall not be editable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Movement, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — assertDocumentEditableByLifecycle() (Verified)
- Backend: `OSE-backend/src/services/movementRegisterGuard.service.js` — assertMovementRegisterMutable() isEditableUserState (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — updateGetPass() lifecycle guard (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — isConstitutionEditableUserState() (Verified)
- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.ts` — canEdit() lifecycle check (Verified)

---

### C02-2.5-009

| Field | Value |
|-------|-------|
| Constitution Requirement | Documents in Closed state shall not be editable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** Transfer, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — TRANSFER_USER_STATE CLOSED / GET_PASS CLOSED (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — TERMINAL_STATUSES includes POSTED,REJECTED (Verified)

---

### C02-2.6-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Delete is permitted only while the document is in Draft. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-001 |

**Affected Modules:** GRN, Transfer, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — deleteGrn() DRAFT-only (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — deleteTransfer() DRAFT-only (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — deleteGetPass() DRAFT-only (Verified)
- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.ts` — canDelete() DRAFT-only (Verified)

---

### C02-2.6-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Once a document leaves Draft, Delete must not be available. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-001 |

**Affected Modules:** GRN, Transfer, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — deleteGrn() status check (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — deleteTransfer() assertStatus DRAFT (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — deleteGetPass() DRAFT-only (Verified)
- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.ts` — canDelete() DRAFT-only (Verified)

---

### C02-2.6-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Business termination shall use governed lifecycle actions (Cancel, Reject, Void, Close, etc.) instead of Delete after Draft. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Breakage, Inventory Count, Transfer, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — rejectGrn(); deleteGrn() DRAFT-only (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — voidDocument(); REJECTED terminal message (Verified)
- Backend: `OSE-backend/src/services/inventoryCount.service.js` — cancelSession() DRAFT-only (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — rejectTransfer(); deleteTransfer() DRAFT-only (Verified)
- Frontend: `OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts` — cancelDraft() (Verified)
- Frontend: `OSE-Frontend/src/app/features/breakage/breakage-detail/breakage-detail.component.ts` — voidDocument() (Verified)
- Governance: `docs/governance/scripts/constitution-base.md` — §2.6 deletion vs governed termination table (Verified)

---

### C02-2.6-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Once a document enters the governed lifecycle, business termination actions shall replace deletion. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-001 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Inventory Count, Lost Items, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — deleteGrn() DRAFT-only; sendBackGrn()/rejectGrn() termination (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — deleteTransfer() DRAFT-only (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — deleteGetPass() DRAFT-only (Verified)
- Backend: `OSE-backend/src/services/inventoryCount.service.js` — cancelSession() DRAFT-only (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — no delete endpoint; void/reject workflow (Verified)
- Backend: `OSE-backend/src/services/lostItems.service.js` — no delete endpoint; reject workflow (Verified)
- Backend: `OSE-backend/src/routes/breakage.routes.js` — no router.delete document route (Verified)
- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.ts` — canDelete() DRAFT-only (Verified)

---

### C02-2.7-001

| Field | Value |
|-------|-------|
| Constitution Requirement | After Return, the workflow path shall be Edit then Submit. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn() → DRAFT + [Send Back] marker (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — showSubmitAfterReturn(); submitAfterReturn() validate+submit (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — Submit button on Returned DRAFT (Verified)

---

### C02-2.7-002

| Field | Value |
|-------|-------|
| Constitution Requirement | There shall be no separate action named Re-submit. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/scripts/smoke-constitution-v2-platform.js` — resubmitRejectedGrn absent check (Verified)
- API: `OSE-backend/src/routes/grn.routes.js` — no /resubmit route (Verified)

---

### C02-2.7-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Submit shall always represent entering the workflow, whether for the first time or after Return. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — submitAfterReturn() / submitForApproval() (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — submitTransfer() DRAFT-only (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — submitBreakage() DRAFT-only (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — submitGetPass() DRAFT-only (Verified)

---

### C02-2.7-004

| Field | Value |
|-------|-------|
| Constitution Requirement | After Reject, the same document must not re-enter workflow. |
| Final Status | Yes |
| Remaining Work | Terminal REJECTED enforced on GRN, Transfer, Breakage, Get Pass; Lost Items/Movement/Inventory Count need audit |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — updateGrn() REJECTED guard (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — submitTransfer() DRAFT-only (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — submitGetPass() DRAFT-only (Verified)

---

### C02-2.7-005

| Field | Value |
|-------|-------|
| Constitution Requirement | After Reject, a new document is required to repeat the operation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Lost Items, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — updateGrn() rejected message (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — assertLocked() REJECTED message (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — processBreakageApprovalStep() REJECTED message (Verified)
- Backend: `OSE-backend/src/services/lostItems.service.js` — processLostApprovalStep() REJECTED message (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — REJECTED_TERMINAL_HINT (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html` — REJECTED_TERMINAL_HINT (Verified)
- Frontend: `OSE-Frontend/src/app/features/breakage/breakage-detail/breakage-detail.component.html` — REJECTED_TERMINAL_HINT (Verified)
- Frontend: `OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html` — REJECTED_TERMINAL_HINT (Verified)
- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.html` — REJECTED_TERMINAL_HINT (Verified)

---

### C02-2.8-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Every document detail view shall present a unified timeline showing current state when applicable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — app-returns-workflow-timeline (Verified)
- API: `OSE-backend/src/routes/constitution.routes.js` — GET /timeline/:moduleKey/:id (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.8-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Every document detail view shall present a unified timeline showing workflow step when applicable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getGetPassTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.html` — presentationEntries (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.8-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Every document detail view shall present a unified timeline showing actor when applicable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.html` — slot.actorName display (Verified)
- Backend: `OSE-backend/src/services/grn-workflow-presentation.util.js` — userDisplayName() (Verified)

---

### C02-2.8-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Every document detail view shall present a unified timeline showing date and time when applicable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Transfer, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.html` — actedAt | date:'medium' (Verified)

---

### C02-2.8-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Every document detail view shall present a unified timeline showing mandatory reasons when applicable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — rejectionReason banner (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn() reason required (Verified)

---

### C02-2.8-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Every document detail view shall present a unified timeline showing workflow comments when applicable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN, Breakage, Lost Items

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts` — WorkflowTimelineEntry.comment (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — _rejectGrnApproval() stores comment (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.8-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Every document detail view shall present a unified timeline showing system events when applicable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH2-LIFECYCLE |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — fetchAuditEvents() (Verified)
- Frontend: `OSE-Frontend/src/app/core/services/constitution-platform.service.ts` — DocumentTimelinePayload.auditEvents (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — mapUserFacingState/withUserFacingState (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/constitution-lifecycle.util.ts` — constitutionUserFacingStateLabel() (Verified)

---

### C02-2.8-008

| Field | Value |
|-------|-------|
| Constitution Requirement | Every document detail view shall present a unified timeline showing duration when applicable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Lost Items, Inventory Count

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/timelineDuration.util.js` — enrichTimelineSlotsWithDuration() (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getDocumentTimeline() enriched workflowSlots (Verified)
- Frontend: `OSE-Frontend/src/app/shared/utils/timeline-duration.util.ts` — enrichTimelineSlotsWithDuration(); formatTimelineDurationMs() (Verified)
- Frontend: `OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.ts` — stepDurationLabel() (Verified)
- Frontend: `OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts` — workflowApprovalTimeline() duration enrichment (Verified)

---

### C03-3.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Users shall see only the actions they need for their role and document state. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Lost Items, Get Pass, Movement, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html` — *appHasPermission MOVEMENT_CREATE + registerView().readOnly (Verified)
- Frontend: `OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts` — canManage() / canActOnApprovalStep() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — showFinanceApprovalBar / showSubmitForApproval (Verified)

---

### C03-3.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Action behavior shall remain consistent across all DX OSE modules regardless of workflow implementation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage, Lost Items

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts` — userCanActOnReturnsWorkflowWithPermission() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — module-specific action bars (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — module-specific multi-bar layout retained (Verified)

---

### C03-3.1-003

| Field | Value |
|-------|-------|
| Constitution Requirement | No module may invent alternative names for standard actions unless ratified in this Constitution. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — COMMON.SUBMIT_ACTION on draft validate (Verified)
- Frontend: `OSE-Frontend/public/i18n/en.json` — GRN.DETAIL.VALIDATE→Submit; FINANCE_APPROVE_POST standard label (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html` — TRANSFER standard Submit/Reject/Approve labels (Verified)

---

### C03-3.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Cancel is an action, not a lifecycle state. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Inventory Count, GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts` — cancelDraft() (Verified)
- Backend: `OSE-backend/src/services/inventoryCount.service.js` — cancel draft session (Verified)
- Frontend: `OSE-Frontend/public/i18n/en.json` — BREAKAGE.DETAIL CONFIRM_VOID_* → Cancel copy (Verified)

---

### C03-3.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Alternative Cancel labels with the same meaning (Abort, Discard, Cancel Document) must not be used. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/admin/user-rights/user-rights.component.ts` — confirmDirtyNavigation footer Leave without saving (Verified)

---

### C03-3.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Reviewer actions shall be available only while the document is actively assigned to the current reviewer according to workflow definition and the permission model. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/utils/grn-workflow.helpers.ts` — canUserActOnGrnApprovalStep() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — canActOnGrnReviewerStep / showValidatedReviewBar (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — getGrn approvalRequest + _assertGrnDualGate() (Verified)

---

### C03-3.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Send Back shall not end the document. |
| Final Status | Yes |
| Remaining Work | Complete for GRN |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn() (Verified)
- API: `OSE-backend/src/routes/grn.routes.js` — POST /:id/send-back (Verified)

---

### C03-3.4-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Send Back shall allow edit. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn() status DRAFT (Verified)
- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — isEditableUserState() (Verified)

---

### C03-3.4-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Send Back shall require a reason. |
| Final Status | Yes |
| Remaining Work | Complete for GRN |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn() reason required (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — submitSendBack() validation (Verified)

---

### C03-3.4-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Send Back next step shall be Edit then Submit. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — showSubmitForApproval() (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn() (Verified)

---

### C03-3.4-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Send Back shall continue the business transaction. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn() updates same grnId (Verified)

---

### C03-3.4-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Reject shall end the document. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Lost Items, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — _rejectGrnApproval() (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — rejectTransfer() (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — processApprovalStep REJECT (Verified)
- Backend: `OSE-backend/src/services/lostItems.service.js` — processLostApprovalStep REJECT (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — rejectGetPass() (Verified)

---

### C03-3.4-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Reject shall not allow edit. |
| Final Status | Yes |
| Remaining Work | Complete for GRN; other modules need audit |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — updateGrn() REJECTED guard (Verified)

---

### C03-3.4-008

| Field | Value |
|-------|-------|
| Constitution Requirement | Reject shall require a reason. |
| Final Status | Yes |
| Remaining Work | Complete for GRN |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — rejectGrn() reason required (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — confirmReject() (Verified)

---

### C03-3.4-009

| Field | Value |
|-------|-------|
| Constitution Requirement | Reject next step shall require a new document if the operation repeats. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Lost Items, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/transfer.service.js` — assertLocked REJECTED message (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — REJECTED_TERMINAL_HINT (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html` — REJECTED_TERMINAL_HINT (Verified)

---

### C03-3.4-010

| Field | Value |
|-------|-------|
| Constitution Requirement | Reject shall terminate the business transaction. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Lost Items, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/breakage.service.js` — REJECTED lock on processApprovalStep (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — rejectGetPass status REJECTED (Verified)

---

### C03-3.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | There shall be only one primary action for the current document state. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — single primary per bar block (Verified)

---

### C03-3.6-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Button order shall be Primary, then Secondary, then Neutral, then Danger. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** Transfer

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html` — DRAFT Submit primary before Delete danger; approve before reject (Verified)

---

### C04-4.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Operation permissions govern authorization only. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/middleware/authorize.js` — requirePermission() (Verified)

---

### C04-4.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Operation permissions shall never replace workflow validation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — _assertGrnDualGate() (Verified)
- API: `OSE-backend/src/routes/grn.routes.js` — requirePermission + service guards (Verified)

---

### C04-4.1-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Operation permissions shall never replace lifecycle validation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Lost Items, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — assertDocumentEditableByLifecycle() (Verified)
- Backend: `OSE-backend/src/services/movement.service.js` — updateMovementDraft lifecycle guard (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — submitBreakage/voidBreakage lifecycle guard (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — updateGetPass assertDocumentEditableByLifecycle (Verified)
- Backend: `OSE-backend/src/services/lostItems.service.js` — processLostApprovalStep lifecycle guard (Verified)

---

### C04-4.1-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Operation permissions shall never replace business rule enforcement. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Posting

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — line/qty validation before post (Verified)
- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — Insufficient source stock check (Verified)

---

### C04-4.1-005

| Field | Value |
|-------|-------|
| Constitution Requirement | The Access Control Catalog (ACC) is the single source of truth for permissions. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/acc-authority/runtime-permission-matrix.js` — buildPermissionToRolesMatrix() (Verified)
- Backend: `OSE-backend/src/services/rbac.service.js` — getPermissionsForMembership() (Verified)

---

### C04-4.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Evidence Package does not require a separate permission in the current DX OSE release. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Lost Items, Get Pass, Inventory Count

**Verification Evidence:**

- Backend: `OSE-backend/src/routes/grn.routes.js` — GET /:id/evidence/pdf requirePermission GRN_VIEW (Verified)
- Backend: `OSE-backend/src/routes/transfer.routes.js` — GET /:id/evidence requirePermission INVENTORY_VIEW (Verified)
- Backend: `OSE-backend/src/routes/breakage.routes.js` — GET /:id/evidence requireAnyPermission VIEW_INVENTORY/BREAKAGE_VIEW (Verified)
- Backend: `OSE-backend/src/routes/lostItems.routes.js` — GET /:id/evidence requireAnyPermission LOST_ITEMS_VIEW (Verified)

---

### C04-4.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Permissions shall never bypass document lifecycle rules. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Lost Items

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — assertStatus(); LOCKED statuses on validateGrn/updateStatus/sendBackGrn (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — assertStatus(); assertLocked() on mutations (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — submitBreakage() DRAFT guard; processApprovalStep() terminal status locks (Verified)
- Backend: `OSE-backend/src/services/lostItems.service.js` — processLostApprovalStep() APPROVED/VOID/REJECTED locks; manual approve status guards (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — approveGetPass/rejectGetPass pendingStatuses guard; operational status checks (Verified)
- Backend: `OSE-backend/src/middleware/authorize.js` — requirePermission() — eligibility only; lifecycle enforced in services (Verified)

---

### C04-4.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Permissions grant eligibility, not execution authority. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Lost Items

**Verification Evidence:**

- Backend: `OSE-backend/src/acc-authority/step-permission-enforcement.js` — assertDualGateApproval(); module step helpers (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — _assertGrnDualGate() (Verified)
- Backend: `OSE-backend/src/services/approvalChain.service.js` — assertUserHasTransferStepPermission() in processStoreTransferApproval() (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — assertUserHasBreakageLostStepPermission() in processApprovalStep() (Verified)
- Backend: `OSE-backend/src/services/lostItems.service.js` — assertUserHasBreakageLostStepPermission() in processLostApprovalStep() (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — assertCanActOnStatus() → assertUserHasGetPassStepPermission() (Verified)
- Frontend: `OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts` — userCanActOnReturnsWorkflowWithPermission() (Verified)

---

### C04-4.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Action Allowed shall equal Permission plus Workflow plus Lifecycle plus Business Rules plus Scope. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Lost Items

**Verification Evidence:**

- Backend: `OSE-backend/src/acc-authority/step-permission-enforcement.js` — assertDualGateApproval() — Permission + Workflow (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — lifecycle status guards; checkPeriodLock; assertInScope on getGrn (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — assertStatus; assertUserHasTransferStepPermission via approvalChain; assertInScope; checkPeriodLock (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — processApprovalStep() dual-gate + lifecycle + period lock + assertInScope (Verified)
- Backend: `OSE-backend/src/services/lostItems.service.js` — processLostApprovalStep() dual-gate + lifecycle + period lock + assertInScope (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — assertCanActOnStatus + lifecycle status guards + checkPeriodLock + assertInScope (Verified)
- Frontend: `OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts` — userCanActOnReturnsWorkflowWithPermission() (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/utils/transfer-workflow.helpers.ts` — canUserActOnTransferApprovalStep() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — permission + lifecycle action bar gates (Verified)
- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.ts` — permission + workflow-step action bar gates (Verified)

---

### C04-4.3-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Modules shall not introduce alternative operation names for standardized operations. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — Submit / Approve / Reject / Send Back / Post labels (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html` — Submit / Approve / Post / Reject labels (Verified)
- Backend: `OSE-backend/src/middleware/authorize.js` — PERMISSION_ALIASES — legacy key normalization, not alternate operations (Verified)

---

### C05-5.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Posting is the single irreversible business commit point for all operational and financial effects within the DX OSE Platform. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Lost Items, Get Pass, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingEngine.service.js` — delegates to postingGoverned* (Verified)
- Backend: `OSE-backend/src/services/movementRegisterGuard.service.js` — assertMovementRegisterMutable post forbidden (Verified)

---

### C05-5.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Posting is the only operation permitted to create official operational and financial business effects. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — postingEngine.postGrnInTransaction (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — postingEngine.postTransferInTransaction (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — postingEngine.postBreakageMovementInTransaction (Verified)
- Backend: `OSE-backend/src/services/posting.service.js` — assertMovementRegisterMutable before post (Verified)

---

### C05-5.1-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Documents become business-immutable after Posting except through formally governed reversal or adjustment procedures. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Inventory Count

**Verification Evidence:**

- Backend: `OSE-backend/src/services/breakage.service.js` — APPROVED immutable lock (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — updateGrn LOCKED statuses (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — governed return/checkout reversal paths (Verified)

---

### C05-5.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Before Posting, the platform shall verify user authority. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Lost Items, Get Pass, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/routes/grn.routes.js` — approval routes requirePermission GRN_MANAGE (Verified)
- Backend: `OSE-backend/src/routes/movement.routes.js` — post requirePermission MOVEMENT_CREATE (Verified)

---

### C05-5.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Before Posting, the platform shall verify valid workflow state. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Lost Items, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — _advanceGrnApprovalStep isFinal post (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — approveTransfer assertStatus PENDING_* (Verified)

---

### C05-5.2-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Before Posting, the platform shall verify open inventory/financial period for Posting Date. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Movement, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — validatePostingDate before post (Verified)
- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — validatePostingDate before post (Verified)
- Backend: `OSE-backend/src/services/posting.service.js` — validatePostingDate on movement post (Verified)

---

### C05-5.2-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Before Posting, the platform shall perform full document revalidation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — line mapping/qty checks in postGrnInTransaction (Verified)
- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — Insufficient source stock at posting time (Verified)

---

### C05-5.2-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Before Posting, the platform shall verify stock availability for outbound documents. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** Transfer, GRN, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — source stock check per line (Verified)
- Backend: `OSE-backend/src/services/postingGovernedGetPass.service.js` — checkout stock validation (Verified)

---

### C05-5.2-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Full revalidation shall occur immediately before Posting regardless of prior validation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — pre-post line validation loop (Verified)
- Backend: `OSE-backend/src/services/posting.service.js` — OB zero-cost guard at post (Verified)

---

### C05-5.2-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Posting shall use a single transactional boundary. |
| Final Status | Yes |
| Remaining Work | Complete for governed paths inspected |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — _advanceGrnApprovalStep() prisma.$transaction (Verified)
- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — postGrnInTransaction() (Verified)
- Backend: `OSE-backend/src/services/posting.service.js` — prisma.$transaction (Verified)

---

### C05-5.2-008

| Field | Value |
|-------|-------|
| Constitution Requirement | Partial posting is prohibited. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Movement, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/posting.service.js` — postDocument single transactionWork (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — approveTransfer $transaction post (Verified)

---

### C05-5.2-009

| Field | Value |
|-------|-------|
| Constitution Requirement | Any posting failure shall leave the document and related business data completely unchanged. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Movement, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — postGrnInTransaction in parent $transaction (Verified)
- Backend: `OSE-backend/src/services/posting.service.js` — db.$transaction wrapper (Verified)

---

### C05-5.2-010

| Field | Value |
|-------|-------|
| Constitution Requirement | Repeating the same posting request shall never create additional effects. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — assertNoDuplicateGrnPost (Verified)
- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — assertNoDuplicateTransferPost (Verified)
- Backend: `OSE-backend/src/services/postingGovernedMovement.service.js` — assertNoDuplicateLedgerPost (Verified)
- Backend: `OSE-backend/src/services/postingGovernedGetPass.service.js` — assertNoDuplicateGetPassCheckout (Verified)

---

### C05-5.2-011

| Field | Value |
|-------|-------|
| Constitution Requirement | Posting shall be automatically triggered upon successful final workflow approval unless a document-specific governance policy defines otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — _advanceGrnApprovalStep isFinal post (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — needsPosting postTransferInTransaction (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — isLastStep _postBreakageInTransaction (Verified)

---

### C05-5.2-012

| Field | Value |
|-------|-------|
| Constitution Requirement | Final Workflow Approval equals business authorization for Posting. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — approveFinanceAndPost() (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.ts` — canPostOnApprove POST label (Verified)
- Frontend: `OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts` — APPROVE_AND_POST label (Verified)

---

### C05-5.2-013

| Field | Value |
|-------|-------|
| Constitution Requirement | No additional posting confirmation is required by default. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — approveFinanceAndPost single action (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html` — single Approve/Post button (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — postGrn() manual path disabled (Verified)

---

### C05-5.2-014

| Field | Value |
|-------|-------|
| Constitution Requirement | Posting behavior shall remain deterministic and repeat-safe throughout the platform. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH3-5 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingEngine.service.js` — single delegation surface (Verified)
- Backend: `OSE-backend/scripts/smoke-posting-governance-enforcement.js` — governance smoke assertions (Verified)

---

### C06-6.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Each document shall permanently maintain Document Date. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement, Lost Items, Inventory Count

**Verification Evidence:**

- Backend: `OSE-backend/prisma/schema.prisma` — GrnImport.receivingDate; StoreTransfer.transferDate; MovementDocument.documentDate; StockCountSession.countDate (Verified)
- Backend: `OSE-backend/src/services/lostItems.service.js` — documentDate on create/post (Verified)

---

### C06-6.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Each document shall permanently maintain Posting Date. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — postGrnInTransaction() sets postingDate (Verified)
- Backend: `OSE-backend/src/services/posting.service.js` — movement/OB post sets postingDate (Verified)

---

### C06-6.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Each document shall permanently maintain Assigned Posting Period. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/postingPeriod.util.js` — resolvePostingPeriod() (Verified)
- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — assignedPostingPeriod at post (Verified)

---

### C06-6.3-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Document Date and Posting Date must never be treated as interchangeable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Breakage, Movement

**Verification Evidence:**

- Backend: `OSE-backend/prisma/schema.prisma` — receivingDate/documentDate vs postingDate columns (Verified)
- Backend: `OSE-backend/src/services/periodGuard.service.js` — checkPeriodLock(tenantId, documentDate) (Verified)

---

### C06-6.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Posting is permitted only when Posting Period is Open and all validations pass. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/periodGuard.service.js` — validatePostingDate() (Verified)
- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — validatePostingDate before post (Verified)
- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — validatePostingDate before post (Verified)
- Backend: `OSE-backend/src/services/posting.service.js` — validatePostingDate on postDocument/count post (Verified)

---

### C06-6.5-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Future posting restrictions shall apply to Posting Date only, not Document Date. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement, Period Close

**Verification Evidence:**

- Backend: `OSE-backend/src/services/periodGuard.service.js` — checkFuturePostingDate() throws FUTURE_POSTING_DATE (Verified)
- Backend: `OSE-backend/src/services/periodGuard.service.js` — validatePostingDate() — postingDate only, not documentDate (Verified)
- Backend: `OSE-backend/src/services/periodGuard.service.test.js` — future date + sequential close unit tests (Verified)

---

### C06-6.5-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Posting into a Closed period is prohibited. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/periodGuard.service.js` — checkPeriodLock() via validatePostingDate() (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — validatePostingDate on final approve/post (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — validatePostingDate on checkout/returns (Verified)

---

### C06-6.5-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Periods shall close sequentially. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Period Close

**Verification Evidence:**

- Backend: `OSE-backend/src/services/periodGuard.service.js` — assertSequentialCloseAllowed() throws PERIOD_CLOSE_NOT_SEQUENTIAL (Verified)
- Backend: `OSE-backend/src/services/periodClose.service.js` — closePeriod() calls assertSequentialCloseAllowed before close (Verified)

---

### C06-6.5-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Periods must not overlap. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** Period Close

**Verification Evidence:**

- Backend: `OSE-backend/prisma/schema.prisma` — PeriodClose @@unique([tenantId, year, month]) (Verified)
- Backend: `OSE-backend/src/services/periodClose.service.js` — closePeriod() upsert by tenantId_year_month (Verified)

---

### C06-6.5-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Period validation shall be centralized. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement, Period Close

**Verification Evidence:**

- Backend: `OSE-backend/src/services/periodGuard.service.js` — central period validation exports (Verified)
- Backend: `OSE-backend/src/services/periodClose.service.js` — assertSequentialCloseAllowed import from periodGuard (Verified)

---

### C06-6.5-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Modules shall not implement independent period logic. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement, Lost Items

**Verification Evidence:**

- Backend: `OSE-backend/src/services/periodGuard.service.js` — checkPeriodLock() / validatePostingDate() (Verified)
- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — delegates to periodGuard before post (Verified)

---

### C06-6.5-008

| Field | Value |
|-------|-------|
| Constitution Requirement | Assigned Posting Period shall be immutable after Posting. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/postingPeriod.util.js` — assertPostingPeriodFieldsImmutable() (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — updateGrn calls immutability guard (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — updateTransfer calls immutability guard (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — updateGetPass calls immutability guard (Verified)

---

### C06-6.6-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Period Close validation phase shall use centralized validation with progress indication when Close Period is initiated. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Period Close

**Verification Evidence:**

- Backend: `OSE-backend/src/services/periodClose.service.js` — monthEndChecklist in close response (Verified)
- Frontend: `OSE-Frontend/src/app/features/period-close/period-close-page/period-close-page.component.ts` — closing spinner only (Verified)

---

### C06-6.6-002

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall provide governed period-close resolution whenever blocking conditions exist, rather than merely rejecting the request. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Period Close

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/periodResolution.service.js` — getPeriodResolutionWorkspace() (Verified)
- Frontend: `OSE-Frontend/src/app/features/period-close/period-close-page/period-close-page.component.html` — blockedDocuments / closedPeriods tables (Verified)

---

### C07-7.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Document State Protection and Draft and Recovery must remain separate policies. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — saveGrnDraft / listFamilyDrafts (Verified)
- Frontend: `OSE-Frontend/src/app/core/guards/document-draft-can-deactivate.guard.ts` — confirmDeactivate() route guard (Verified)

---

### C07-7.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Every operational document shall begin as a server-recognized draft unless Workflow Contracts define otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — createGrnServerDraft status DRAFT (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — StoreTransfer default DRAFT (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — createGetPass status DRAFT (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — createBreakage status DRAFT (non-auto-approve) (Verified)

---

### C07-7.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall define draft owner. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — DRAFT_OWNER_FIELD + resolveDraftOwnerId() (Verified)

---

### C07-7.4-002

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall define draft access rights. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — assertDraftEditable() OWNER_OR_FAMILY_MANAGE_PERMISSION (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — assertDraftEditable on updateTransfer (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — assertDraftEditable on updateGetPass (Verified)

---

### C07-7.4-003

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall define draft ownership transfer rules if permitted. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — transferDraftOwnership() + DRAFT_OWNERSHIP_TRANSFER_PERMITTED (Verified)
- Backend: `OSE-backend/src/controllers/constitution.controller.js` — POST /draft/transfer-ownership (Verified)

---

### C07-7.4-004

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall define handling of drafts for inactive or departed users. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — assertDraftOwnerActive() DRAFT_OWNER_INACTIVE (Verified)

---

### C07-7.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Rules for opening the same draft from multiple sessions or devices shall align with Chapter 8 (Concurrency). |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/concurrency.service.js` — assertConcurrencyVersion({ required: true }) (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts` — concurrencyVersion on auto-save update (Verified)

---

### C07-7.7-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Auto-save shall occur on meaningful business events. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/services/draft-auto-save.service.ts` — createDebouncedSaver() (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts` — performAutoSave() (Verified)

---

### C07-7.7-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Auto-save shall occur on add or delete row. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — addItem/removeLine -> queueServerDraftSave (Verified)

---

### C07-7.7-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Auto-save shall occur on quantity or price change. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — updateLine -> queueServerDraftSave (Verified)

---

### C07-7.7-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Auto-save shall occur on supplier or warehouse change. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — onSupplierChange/onWarehouseChange (Verified)

---

### C07-7.7-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Auto-save shall occur on attachment change. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — onInvoiceSelected (Verified)

---

### C07-7.7-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Auto-save shall occur on notes change. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — onNotesChange (Verified)

---

### C07-7.7-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Auto-save shall occur before navigation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — confirmDeactivate -> performServerDraftSave (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts` — confirmDeactivate -> performAutoSave (Verified)

---

### C07-7.8-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Recovered drafts shall not bypass current validation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/services/draft-recovery.service.ts` — promptRecoverGrnDraft() (Verified)
- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — validateRecoveredDraft() + loadGrnDraftForRecovery() (Verified)

---

### C07-7.8-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Restored documents must be revalidated before continue or submit. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — validateRecoveredDraft() DRAFT_RECOVERY_VALIDATION_FAILED (Verified)

---

### C07-7.9-001

| Field | Value |
|-------|-------|
| Constitution Requirement | A draft registry is required per document family. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — listFamilyDrafts() (Verified)
- Backend: `OSE-backend/src/controllers/constitution.controller.js` — GET /drafts/:family (Verified)

---

### C07-7.9-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Default draft retention shall be 30 days. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — DEFAULT_DRAFT_RETENTION_DAYS + expireStaleDrafts() (Verified)

---

### C07-7.9-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Draft expiration policy (delete, archive, expired state) shall be defined by platform policy. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — getDraftRetentionPolicy() expirationAction (Verified)

---

### C07-7.10-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Document State Protection shall apply to route navigation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/app.routes.ts` — canDeactivate on governed create/edit routes (Verified)

---

### C07-7.10-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Document State Protection shall apply to browser refresh. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts` — window:beforeunload HostListener (Verified)

---

### C07-7.10-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Document State Protection shall apply to browser or tab close. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts` — beforeunload on dirty forms (Verified)

---

### C07-7.10-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Document State Protection shall apply to back navigation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/utils/document-draft-leave.util.ts` — confirmDocumentDeactivate() (Verified)

---

### C07-7.10-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Document State Protection shall apply to session expiration with unsaved changes. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/interceptors/auth.interceptor.ts` — flushBeforeSessionEnd on 401 refresh failure (Verified)
- Frontend: `OSE-Frontend/src/app/core/services/document-draft-state.service.ts` — registerDirtyCheck(check, flush) (Verified)

---

### C07-7.10-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Successful Save Draft or Submit shall return the document to a clean state. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts` — afterSave sets skipDeactivate (Verified)

---

### C07-7.11-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Upon successful creation of the first Server Draft, the System Document Number becomes permanently reserved per Chapter 9. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — createGrnServerDraft -> generateDocNumber (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — generateTransferNo at create (Verified)

---

### C08-8.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Every editable document shall maintain a Concurrency Version for conflict detection. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/concurrency.service.js` — assertConcurrencyVersion({ required: true }) (Verified)
- Frontend: `OSE-Frontend/src/app/features/breakage/breakage-detail/breakage-detail.component.ts` — withConcurrency() on approve/reject (Verified)

---

### C08-8.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Concurrency shall apply to the entire governed document, not isolated fields only. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/concurrency.service.js` — document-level version compare (Verified)

---

### C08-8.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Concurrent edits must be detected at the Draft stage. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/concurrency.service.js` — assertConcurrencyVersion() returns early if expectedVersion null (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — updateTransfer() assertConcurrencyVersion (Verified)

---

### C08-8.4-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Last write wins is prohibited for concurrent draft edits. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/concurrency.service.js` — concurrencyConflictError() 409 (Verified)

---

### C08-8.4-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Conflicting draft operations shall be rejected. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/concurrency.service.js` — assertConcurrencyVersion() (Verified)

---

### C08-8.4-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Users shall reload the latest version after a conflicting draft operation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts` — CONCURRENCY_CONFLICT handling (Verified)
- Frontend: `OSE-Frontend/public/i18n/en.json` — COMMON.CONCURRENCY_CONFLICT (Verified)

---

### C08-8.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | After Submit, the document shall be read-only except via Return workflow. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — EDITABLE_GRN DRAFT only (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — Only DRAFT can be submitted (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn sets status DRAFT (Verified)

---

### C08-8.6-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Save Draft must not execute twice on the same version without detection. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — saveGrnDraft() assertConcurrencyVersion + bump (Verified)

---

### C08-8.6-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Submit must not execute twice on the same version without detection. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/getPass.service.js` — submit assertConcurrencyVersion (Verified)

---

### C08-8.6-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Approve must not execute twice on the same version without detection. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/breakage.service.js` — assertConcurrencyVersion on workflow actions (Verified)

---

### C08-8.6-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Reject must not execute twice on the same version without detection. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — rejectGrn() terminal REJECTED (Verified)

---

### C08-8.6-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Send Back must not execute twice on the same version without detection. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn() assertConcurrencyVersion (Verified)

---

### C08-8.6-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Cancel must not execute twice on the same version without detection. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Requires Mapping

**Verification Evidence:**

- Backend: `OSE-backend/src/services/inventoryCount.service.js` — cancelSession() rejects non-DRAFT (state guard only) (Verified)
- Backend: `OSE-backend/src` — grep: no cancel double-execution version detection (Verified)

---

### C08-8.6-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Post must not execute twice on the same version without detection. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — assertNoDuplicateGrnPost() (Verified)
- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — assertNoDuplicateTransferPost() (Verified)

---

### C08-8.7-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Posting must not execute except on the latest valid document version after concurrency verification. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — _advanceGrnApprovalStep() assertConcurrencyVersion required before post (Verified)

---

### C08-8.8-001

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall reject conflicting updates. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/concurrency.service.js` — assertConcurrencyVersion() (Verified)

---

### C08-8.8-002

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall not overwrite another user's changes during conflict. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/concurrency.service.js` — concurrencyConflictError() (Verified)

---

### C08-8.8-003

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall require reload before retry after a conflicting update. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/public/i18n/en.json` — COMMON.CONCURRENCY_CONFLICT reload instruction (Verified)

---

### C08-8.10-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Concurrency conflicts shall be recorded in audit when appropriate. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/concurrency.service.js` — assertConcurrencyVersion() audit CONCURRENCY_CONFLICT (Verified)

---

### C09-9.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | System Document Numbers shall be assigned by the platform only. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/docNumbering.service.js` — generateDocNumber() (Verified)

---

### C09-9.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Users must not enter System Document Numbers. |
| Final Status | Yes |
| Remaining Work | Other create screens not exhaustively verified |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — supplier invoice field + SYSTEM_GRN_HINT only (Verified)

---

### C09-9.2-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Users must not edit System Document Numbers. |
| Final Status | Yes |
| Remaining Work | Detail/edit screens not exhaustively verified |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — no grnNumber form control (Verified)

---

### C09-9.2-004

| Field | Value |
|-------|-------|
| Constitution Requirement | System Document Numbers shall be assigned at first Server Draft Save. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — createGrnServerDraft() (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — createGrn() generateDocNumber on create (Verified)
- Backend: `OSE-backend/src/services/movement.service.js` — createMovementDraft() generateDocumentNo() (Verified)

---

### C09-9.2-005

| Field | Value |
|-------|-------|
| Constitution Requirement | System Document Number format shall be {Type Prefix}-{Year}-{Sequence}. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/docNumbering.service.js` — return `${prefix}-${year}-${padded}` (Verified)

---

### C09-9.2-006

| Field | Value |
|-------|-------|
| Constitution Requirement | External references such as supplier invoice numbers shall be separate fields from System Document Numbers. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/prisma/schema.prisma` — GrnImport.supplierInvoiceNumber (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — SUPPLIER_INVOICE_NO field (Verified)

---

### C09-9.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | System Document Numbers shall be unique within governed numbering scope. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/prisma/schema.prisma` — GrnImport @@unique([tenantId, grnNumber]) (Verified)
- Backend: `OSE-backend/prisma/schema.prisma` — DocSequence @@unique([tenantId, prefix, year]) (Verified)

---

### C09-9.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Upon first Server Draft, the System Document Number shall be permanently reserved. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/services/docNumbering.service.js` — INSERT ON CONFLICT increment lastSeq (Verified)

---

### C09-9.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Numbers from deleted drafts shall never be released or recycled. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/docNumbering.service.js` — lastSeq + 1 only; no recycle (Verified)

---

### C09-9.3-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Number gaps are acceptable but numbers must not be reused. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/docNumbering.service.js` — monotonic lastSeq increment (Verified)

---

### C09-9.3-005

| Field | Value |
|-------|-------|
| Constitution Requirement | All creation channels (manual, import, integration, future) shall use the same numbering governance. |
| Final Status | Yes |
| Remaining Work | Import/integration channels not exhaustively verified |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/docNumbering.service.js` — generateDocNumber() (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — generateDocNumber(DocPrefix.BREAKAGE) (Verified)

---

### C09-9.3-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Document number prefixes shall be governed centrally. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/docNumbering.service.js` — DocPrefix object (Verified)

---

### C09-9.3-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Modules must not configure document number prefixes independently unless authorized. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** Movement, GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/docNumbering.service.js` — DocPrefix + prefixFromMovementType() (Verified)

---

### C09-9.3-008

| Field | Value |
|-------|-------|
| Constitution Requirement | Gaps from failed or rolled-back number allocation operations are acceptable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/docNumbering.service.js` — atomic increment may leave gaps on rollback (Verified)

---

### C09-9.3-009

| Field | Value |
|-------|-------|
| Constitution Requirement | Once assigned, a System Document Number shall be immutable for the entire document lifecycle. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/prisma/schema.prisma` — grnNumber/transferNo/documentNo/passNo fields (Verified)

---

### C09-9.3-010

| Field | Value |
|-------|-------|
| Constitution Requirement | System Document Number allocation shall be traceable through platform audit mechanisms. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — logGovernedEvent CREATE afterValue.grnNumber (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — logAction CREATE afterValue.transferNo (Verified)

---

### C09-9.3-011

| Field | Value |
|-------|-------|
| Constitution Requirement | Manual override of System Document Numbers is prohibited. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/docNumbering.service.js` — generateDocNumber() (Verified)

---

### C09-9.3-012

| Field | Value |
|-------|-------|
| Constitution Requirement | System Document Number sequences shall reset annually per prefix per year or fiscal year per platform policy. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/docNumbering.service.js` — year from date in sequence key (Verified)
- Backend: `OSE-backend/prisma/schema.prisma` — DocSequence @@unique([tenantId, prefix, year]) (Verified)

---

### C10-10.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Inbound movement documents shall not require stock check at posting. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — postGrnInTransaction() no outbound stock check (Verified)

---

### C10-10.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Outbound movement documents shall require stock check at posting. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — Insufficient source stock check (Verified)
- Backend: `OSE-backend/src/services/postingGovernedMovement.service.js` — qtyBefore < qty guard (Verified)

---

### C10-10.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Stock availability shall be validated against the latest committed inventory state at Posting. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Transfer, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — findUnique stockBalance at post time (Verified)

---

### C10-10.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Negative inventory is prohibited in DX OSE v2.0. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedMovement.service.js` — Insufficient stock throws on post (Verified)
- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — qtyOnHand < receivedQty throws (Verified)

---

### C10-10.2-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Quantity must be greater than zero. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage, Movement, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/movement.service.js` — assertPositiveLineQty() on draft lines (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — receivedQty > 0 validation (Verified)

---

### C10-10.2-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Zero-quantity lines are prohibited. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/movement.service.js` — assertPositiveLineQty() blocks qty<=0 (Verified)
- Backend: `OSE-backend/src/services/location-item-resolution.service.js` — validateQtyAgainstOnHand rejects qty<=0 (Verified)

---

### C10-10.2-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Quantity precision shall follow platform settings and validation shall use precise values. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/prisma/schema.prisma` — qtyOnHand Decimal(15,4) (Verified)

---

### C10-10.2-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Stock validation shall be against the source inventory location defined by the transaction. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Transfer, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — srcBalance at sourceLocationId (Verified)
- Backend: `OSE-backend/src/services/postingGovernedMovement.service.js` — stock at line.locationId (Verified)

---

### C10-10.2-007

| Field | Value |
|-------|-------|
| Constitution Requirement | All inventory calculations shall use the base unit. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — line.qtyInBaseUnit (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — qtyInBaseUnit on line create (Verified)

---

### C10-10.2-008

| Field | Value |
|-------|-------|
| Constitution Requirement | No transaction shall violate constitutional stock integrity rules. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedMovement.service.js` — stock integrity on breakage post (Verified)
- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — stock integrity on transfer post (Verified)

---

### C10-10.2-009

| Field | Value |
|-------|-------|
| Constitution Requirement | Inventory movements shall be generated exclusively by Posted transactions. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — inventoryLedger.create in post (Verified)
- Backend: `OSE-backend/src/services/posting.service.js` — postDocument transactional ledger (Verified)

---

### C10-10.2-010

| Field | Value |
|-------|-------|
| Constitution Requirement | Posted inventory movements shall never be edited. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/movementRegisterGuard.service.js` — assertMovementRegisterMutable() (Verified)
- Backend: `OSE-backend/src/services/movement.service.js` — assertMovementRegisterMutable on update (Verified)

---

### C10-10.2-011

| Field | Value |
|-------|-------|
| Constitution Requirement | Posted inventory movement corrections shall be made via new governed transactions. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Movement, GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/movementRegisterGuard.service.js` — GOVERNED_POST_FORBIDDEN direct register post (Verified)

---

### C10-10.2-012

| Field | Value |
|-------|-------|
| Constitution Requirement | Inbound documents shall not require stock check at posting. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — no outbound stock availability check (Verified)

---

### C10-10.2-013

| Field | Value |
|-------|-------|
| Constitution Requirement | Outbound stock validation shall be authoritative on the platform. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — Insufficient source stock throws (Verified)
- Backend: `OSE-backend/src/services/postingGovernedGetPass.service.js` — availableQty check at checkout (Verified)

---

### C10-10.2-014

| Field | Value |
|-------|-------|
| Constitution Requirement | Client-side outbound stock checks may warn only and shall not be authoritative. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Breakage, Lost Items

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/breakage/breakage-create-modal/breakage-create-modal.component.ts` — clamp qty to availableQty (Verified)
- Backend: `OSE-backend/src/services/postingGovernedMovement.service.js` — authoritative insufficient stock at post (Verified)

---

### C10-10.2-015

| Field | Value |
|-------|-------|
| Constitution Requirement | Valuation at Posting shall follow Chapter 5 posting rules. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Inventory Count, Movement

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — WAC on receive (Verified)
- Backend: `OSE-backend/src/services/posting.service.js` — resolveUnitCost at post (Verified)

---

### C11-11.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Changing display currency shall change symbol and format only. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/services/constitution-platform.service.ts` — formatAmount() (Verified)

---

### C11-11.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Display currency must not convert amounts. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/services/constitution-platform.service.ts` — formatAmount uses raw number (Verified)

---

### C11-11.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Display currency must not alter stored values. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/displayCurrency.service.js` — setDisplayCurrency updates setting only (Verified)

---

### C11-11.3-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Display currency must not alter ledger data. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — inventoryLedger uses numeric values not display currency (Verified)

---

### C11-11.3-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Display currency must not alter valuation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedTransfer.service.js` — wac from stockBalance (Verified)

---

### C11-11.3-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Display currency must not alter historical posted documents. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/pipes/display-currency.pipe.ts` — transform() format only (Verified)

---

### C11-11.3-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Display currency must not participate in financial calculations. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/displayCurrency.service.js` — no calculation helpers (Verified)

---

### C11-11.3-008

| Field | Value |
|-------|-------|
| Constitution Requirement | Display currency must not participate in inventory valuation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/inventoryValuation.service.js` — valuation basis logic (Verified)

---

### C11-11.3-009

| Field | Value |
|-------|-------|
| Constitution Requirement | Display currency must not participate in posting logic. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — post path no displayCurrency import (Verified)

---

### C11-11.3-010

| Field | Value |
|-------|-------|
| Constitution Requirement | Display currency must not participate in taxation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/displayCurrency.service.js` — display-only service surface (Verified)

---

### C11-11.3-011

| Field | Value |
|-------|-------|
| Constitution Requirement | Display currency must not participate in accounting transactions. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/displayCurrency.service.js` — tenant setting key displayCurrency only (Verified)

---

### C11-11.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Display Currency shall apply consistently across all user interfaces unless explicitly governed otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Dashboard, Stock

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/dashboard/dashboard.component.ts` — fmtSAR() (Verified)
- Frontend: `OSE-Frontend/src/app/features/stock/stock-balances/stock-balances.component.html` — COMMON.CURRENCY_SAR hardcoded (Verified)
- Frontend: `OSE-Frontend/src/app/features/stock-report/stock-report-detail/stock-report-detail.component.ts` — SAR template literal (Verified)
- Frontend: `OSE-Frontend/src/app/features/breakage/breakage-detail/breakage-detail.component.ts` — COMMON.CURRENCY_SAR hardcoded (Verified)

---

### C11-11.4-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Display Currency shall apply consistently across reports unless explicitly governed otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Reports

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/reports/report-engine/report-views/detail-report-table.component.ts` — SAR in column headers comment (Verified)

---

### C11-11.4-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Display Currency shall apply consistently across dashboards unless explicitly governed otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH6-11 |

**Affected Modules:** Dashboard

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/dashboard/dashboard.component.ts` — fmtSAR -> platform.formatAmount (Verified)

---

### C11-11.4-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Display Currency shall apply consistently across exported documents unless explicitly governed otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Reports

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/reports/report-engine/report-views/detail-report-table.component.html` — REPORTS.DETAIL.COL_VALUE_SAR hardcoded headers (Verified)
- Frontend: `OSE-Frontend/src/app/features/reports/utils/report-format.util.ts` — formatSarAmount() hardcoded SAR prefix (Verified)
- Backend: `OSE-backend/src/services/report.service.js` — exportExcel() — no displayCurrency.service usage (Verified)

---

### C11-11.4-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Display Currency shall apply consistently across printed outputs unless explicitly governed otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Reports, PDF

**Verification Evidence:**

- Backend: `OSE-backend/src/services/pdf/report-pdf-components.js` — const currency = 'SAR' (Verified)
- Frontend: `OSE-Frontend/src/app/features/reports/report-engine/report-engine.component.ts` — print() official PDF (Verified)

---

### C11-11.4-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Reports and PDF shall use property display currency as each channel is brought under this standard. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Dashboard, Reports

**Verification Evidence:**

- Backend: `OSE-backend/src/controllers/constitution.controller.js` — getCurrency/putCurrency (Verified)

---

### C11-11.6-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Changing Property Display Currency must not modify historical posted documents. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/displayCurrency.service.js` — setDisplayCurrency tenant_setting only (Verified)

---

### C11-11.6-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Changing Property Display Currency must not modify stored business data. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/displayCurrency.service.js` — upsert tenantSetting displayCurrency (Verified)

---

### C12-12.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Optional header fields omitted when not applicable shall not cause positions to shift arbitrarily. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** GRN, Transfer, Movement, Breakage, Get Pass, Lost Items

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/shared/styles/_document-page-shell.scss` — .document-page-header__slot--reserved (Verified)
- Frontend: `OSE-Frontend/src/app/core/registries/document-header-order.registry.ts` — DOCUMENT_HEADER_EXTENSION_SLOTS.reserved (Verified)

---

### C12-12.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | System header fields including document number, status, created by/at, and posted by/at must not be user-editable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Movement, Transfer, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — grnNumber/status/importedBy/postedBy display spans (Verified)
- Frontend: `OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html` — documentNo in title (non-editable) (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — documentNo/status display spans (non-input) (Verified)
- Frontend: `OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html` — documentNo in title; read-only register view (Verified)

---

### C12-12.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Header fields shall become read-only once the document enters a non-editable lifecycle state unless explicitly governed otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Movement, GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/lifecyclePresentation.service.js` — isEditableUserState() (Verified)
- Frontend: `OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.ts` — registerView().readOnly / isReadOnly (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — updateGrn() POSTED read-only 423 (Verified)
- Frontend: `OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.ts` — registerView().readOnly (Verified)

---

### C12-12.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Changes to property, department, or warehouse after lines exist or after workflow progress must require confirmation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** GRN, Transfer, Movement

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/utils/document-header-context.util.ts` — confirmGovernedHeaderContextChange() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — onWarehouseChange() confirmation (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts` — onSourceChange() confirmation (Verified)
- Frontend: `OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.ts` — onFieldChange() source/dest confirmation (Verified)

---

### C12-12.5-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Changes to property, department, or warehouse after lines exist or after workflow progress shall follow document business rules. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** GRN, Transfer, Movement

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — onWarehouseChange() clears lines after confirm (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — assertTransferLinesAtSource() (Verified)

---

### C12-12.6-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Header information and document lines shall remain logically consistent throughout the lifecycle unless explicitly governed otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** GRN, Transfer, Movement, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/getPass.service.js` — assertGetPassLinesAtSourceLocations() (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — assertTransferLinesAtSource() (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — normalizedLines locationId validation (Verified)

---

### C12-12.7-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Modules adding header fields shall preserve standard header order and positions. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** GRN, Transfer, Movement, Breakage, Get Pass, Lost Items, Items

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/registries/document-header-order.registry.ts` — DOCUMENT_HEADER_ORDER (Verified)
- Frontend: `OSE-Frontend/src/app/shared/styles/_document-page-shell.scss` — .document-page-header archetype (Verified)

---

### C13-13.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Each document line shall maintain a unique internal identity independent of display order or row number. |
| Final Status | Yes |
| Remaining Work | Verify all newer document families use UUID line ids |
| Verification | Verified |

**Affected Modules:** Movement, GRN, Transfer, Store Requisition

**Verification Evidence:**

- Database: `OSE-backend/prisma/schema.prisma` — MovementLine.id @id @default(uuid()) (Verified)
- Database: `OSE-backend/prisma/schema.prisma` — GrnLine.id / StoreTransferLine.id (Verified)

---

### C13-13.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Posted document lines shall be immutable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Movement, Breakage, Transfer

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — updateGrn() blocks line changes; POSTED 423 (Verified)
- Backend: `OSE-backend/src/services/movement.service.js` — updateMovementDraft() DRAFT/REJECTED only (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — APPROVED lock on workflow actions (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — updateGrn() POSTED blocks line changes (Verified)

---

### C13-13.4-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Posted document line corrections shall be made via new governed business transactions. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Movement, GRN, Transfer, Breakage

**Verification Evidence:**

- Docs: `docs/governance/POSTING_GOVERNANCE_ENFORCEMENT.md` — corrections via governed transactions (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — POSTED fully read-only (Verified)

---

### C13-13.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Line values and calculated fields shall recalculate automatically per governed business rules when relevant data changes. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Movement, Transfer

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — lineTotal() / manualGrandTotal() (Verified)
- Backend: `OSE-backend/src/services/movement.service.js` — totalValue computed on line create (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — lineTotal() computed (Verified)

---

### C13-13.6-001

| Field | Value |
|-------|-------|
| Constitution Requirement | All document lines shall remain consistent with governing business context in the header unless explicitly governed otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** GRN, Transfer, Movement, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/getPass.service.js` — assertGetPassLinesAtSourceLocations() on create/update (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — assertTransferLinesAtSource() (Verified)

---

### C13-13.7-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Document totals must not be directly user-editable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — manualGrandTotal computed (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — display-only total binding (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — manualGrandTotal display binding (Verified)

---

### C13-13.7-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Line totals must not be directly user-editable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — {{ lineTotal(line) | displayCurrency }} (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html` — totalValue display column (Verified)

---

### C13-13.8-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Duplicate line behavior shall be defined by each business document according to functional requirements. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — addItem() duplicate itemId guard (Verified)
- Docs: `docs/governance/scripts/constitution-final.md` — BDR-003 duplicate rules per document (Verified)

---

### C13-13.9-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Significant line-level business changes shall be auditable per platform audit policy. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/services/auditGoverned.service.js` — logGovernedEvent() (Verified)
- Backend: `OSE-backend/src/services/auditWriter.service.js` — writeAuditLog() facade (Verified)
- Backend: `OSE-backend/scripts/smoke-audit-facade-static.js` — auditLog.create centralization smoke (Verified)

---

### C13-13.10-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Large document line datasets shall not degrade usability per Chapter 27. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — pagedLines / linesPageSize (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.ts` — pagedLines / linesPageSize (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/document-line-pagination.util.ts` — createDocumentLinePagination() (Verified)
- Frontend: `OSE-Frontend/src/app/features/breakage/breakage-detail/breakage-detail.component.ts` — pagedBreakageLines pagination (Verified)

---

### C14-14.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Posted attachments shall not be modified except by explicit admin governance. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/attachmentGovernance.service.js` — assertAttachmentMutable() (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — addAttachment() guard (Verified)
- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — saveGrnDraft() invoice guard (Verified)

---

### C14-14.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Posted attachments shall not be replaced except by explicit admin governance. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/attachmentGovernance.service.js` — error: modified/replaced/deleted (Verified)
- Backend: `OSE-backend/src/platform/draftGovernance.service.js` — invoiceUrl change guard (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — addAttachment() append-only JSON array (Verified)

---

### C14-14.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Posted attachments shall not be deleted except by explicit admin governance. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/attachmentGovernance.service.js` — assertAttachmentMutable() (Verified)
- Backend: `OSE-backend/src/platform/attachmentGovernance.service.js` — posted attachment immutability (Verified)

---

### C14-14.3-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Required attachments must block submit when missing. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — validateGrn() invoice attachment required (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — validateGrn invoice required (Verified)

---

### C14-14.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall enforce allowed attachment file types per platform policy. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/middleware/upload.middleware.js` — attachmentFilter / imageFilter (Verified)
- Backend: `OSE-backend/src/controllers/grn.controller.js` — invoiceUpload fileFilter (Verified)
- Governance: `OSE-backend/src/platform/attachmentPolicy.platform.js` — ATTACHMENT_ALLOWED_EXTENSIONS (Verified)

---

### C14-14.4-002

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall enforce maximum attachment file size per platform policy. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Breakage, Inventory Count

**Verification Evidence:**

- Governance: `OSE-backend/src/platform/attachmentPolicy.platform.js` — ATTACHMENT_MAX_FILE_SIZE_BYTES (Verified)
- Backend: `OSE-backend/src/middleware/upload.middleware.js` — uploadAttachment limits from attachmentPolicy (Verified)
- Backend: `OSE-backend/src/controllers/grn.controller.js` — invoiceUpload 20 MB local limit (Verified)
- Governance: `OSE-backend/src/platform/attachmentPolicy.platform.js` — GRN_INVOICE_MAX_FILE_SIZE_BYTES (Verified)

---

### C14-14.4-003

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall enforce maximum attachment count per platform policy. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Breakage, GRN

**Verification Evidence:**

- Governance: `OSE-backend/src/platform/attachmentPolicy.platform.js` — ATTACHMENT_MAX_COUNT_PER_DOCUMENT (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — addAttachment() max count guard (Verified)

---

### C14-14.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Uploaded attachment files shall comply with platform security validation policy. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/middleware/upload.middleware.js` — memoryStorage + filters (Verified)
- Backend: `OSE-backend/src/routes/file.routes.js` — tenant key prefix validation (Verified)
- Backend: `OSE-backend/src/middleware/upload.middleware.js` — tenant-scoped storage pipe + attachmentFilter (Verified)

---

### C14-14.6-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Attachment download shall be subject to the same authorization as document view. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, Items, GRN

**Verification Evidence:**

- API: `OSE-backend/src/routes/file.routes.js` — GET /files/signed-url authenticate + tenant prefix (Verified)
- API: `OSE-backend/src/routes/grn.routes.js` — GRN_VIEW on evidence/download routes (Verified)
- Backend: `OSE-backend/src/middleware/upload.middleware.js` — /api/files/signed-url tenant validation (Verified)

---

### C14-14.8-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Attachment filenames must not serve as internal identifiers. |
| Final Status | Yes |
| Remaining Work | Legacy local paths include timestamps but not filename-as-id |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/middleware/upload.middleware.js` — buildAttachmentKey() / buildItemImageKey() uuid (Verified)
- Backend: `OSE-backend/prisma/schema.prisma` — Item.imageUrl stores object key (Verified)

---

### C14-14.9-001

| Field | Value |
|-------|-------|
| Constitution Requirement | All attachment operations shall be auditable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Breakage, GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/breakage.service.js` — addAttachment() logAction ATTACHMENT_ADD (Verified)

---

### C15-15.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Reject shall require a reason where defined. |
| Final Status | Yes |
| Remaining Work | UI reason capture varies; not all modules verified end-to-end |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Lost Items, Inventory Count

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — rejectGrn() reason required 400 (Verified)
- Backend: `OSE-backend/src/services/getPass.service.js` — rejectGetPass() rejectionReason required (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — reject button disabled without reason (Verified)

---

### C15-15.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Send Back shall require a reason where defined. |
| Final Status | Yes |
| Remaining Work | Send Back not verified on all workflow modules |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn() reason required (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — submitSendBack() reason validation (Verified)

---

### C15-15.2-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Cancel shall require a reason where defined. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Inventory Count, Breakage

**Verification Evidence:**

- Governance: `docs/governance/WORKFLOW_MATRIX.md` — cancel/void reason required (Ch.15.2) (Verified)
- Backend: `OSE-backend/src/services/inventoryCount.service.js` — cancelSession() COUNT_SESSION_CANCEL_REASON_REQUIRED (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — voidBreakage() reason required (Verified)

---

### C15-15.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Workflow comments shall become immutable once recorded. |
| Final Status | Yes |
| Remaining Work | Direct DB mutation not prevented at DB layer |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Database: `OSE-backend/prisma/schema.prisma` — ApprovalStep.comment field (Verified)
- Backend: `OSE-backend/src/services/approvalChain.service.js` — step comment set on action only (Verified)

---

### C15-15.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | System notes shall become immutable once recorded. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/auditWriter.service.js` — writeAuditLog() append-only create (Verified)
- Backend: `OSE-backend/src/services/inventoryCount.service.js` — system cancel note appended to session.notes (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — POSTED updateGrn blocks edits (Verified)

---

### C15-15.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Audit comments shall become immutable once recorded. |
| Final Status | Yes |
| Remaining Work | Test scripts can delete audit rows |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/auditWriter.service.js` — auditLog.create only (Verified)
- Backend: `OSE-backend/scripts/smoke-audit-facade-static.js` — blocks raw auditLog.create elsewhere (Verified)

---

### C15-15.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | System notes shall be generated exclusively by the platform. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — sendBackGrn appends [Send Back] system marker (Verified)
- Backend: `OSE-backend/src/services/inventoryCount.service.js` — cancelSession auto note (Verified)

---

### C15-15.4-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Users must not manually create system notes. |
| Final Status | Yes |
| Remaining Work | Users can still edit free-text document notes in draft |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/auditWriter.service.js` — writeAuditLog internal only (Verified)

---

### C15-15.4-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Users must not manually modify system notes. |
| Final Status | Yes |
| Remaining Work | Admin/DB access out of scope |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/scripts/smoke-audit-facade-static.js` — audit immutability static check (Verified)

---

### C15-15.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Notes and comments shall appear in chronological order within the unified timeline. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement, Inventory Count, Lost Items

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — fetchAuditEvents orderBy changedAt asc (Verified)
- Frontend: `OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html` — no returns-workflow-timeline (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getMovementTimeline() (Verified)
- Frontend: `OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.ts` — loadConstitutionTimeline(MOVEMENT) (Verified)

---

### C16-16.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Item images are Item Master data. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Items

**Verification Evidence:**

- Database: `OSE-backend/prisma/schema.prisma` — Item.imageUrl (Verified)
- API: `OSE-backend/src/routes/item.routes.js` — POST /items/:id/image (Verified)

---

### C16-16.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Item images must not be created through transactional documents. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Movement, Transfer

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — line payload includes item imageUrl read-only (Verified)
- API: `OSE-backend/src/routes/item.routes.js` — image upload only on items routes (Verified)

---

### C16-16.2-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Item images must not be modified through transactional documents. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Movement, Transfer

**Verification Evidence:**

- Backend: `OSE-backend/src/controllers/item.controller.js` — uploadItemImage() only item route (Verified)
- Backend: `OSE-backend/src/services/item.service.js` — updateItemImage() (Verified)

---

### C16-16.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Item images shall have a single source in Item Master. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Items, GRN, Reports

**Verification Evidence:**

- Backend: `OSE-backend/src/services/item.service.js` — attachImageDisplayUrl() / getSignedUrl (Verified)

---

### C16-16.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | A standardized placeholder shall be shown when no item image exists. |
| Final Status | Yes |
| Remaining Work | Placeholder not verified on every grid using item images |
| Verification | Verified |

**Affected Modules:** Items

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/items/items-list/items-list.component.html` — thumb--placeholder with package icon (Verified)

---

### C16-16.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Item images in grids shall use thumbnails, not full resolution. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Items, GRN, Transfer, Breakage, Get Pass, Stock Report

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/items/items-list/items-list.component.scss` — .thumb 36x36 (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.scss` — .grn-detail__line-thumb 36x36 (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.html` — no imageUrl/thumb rendering on lines (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — lineImageSrc() / hydrateLineImageUrl() (Verified)

---

### C16-16.3-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Maximum item image size shall be 1 MB per image. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Platform, Items, Breakage

**Verification Evidence:**

- Governance: `OSE-backend/src/platform/mediaPolicy.platform.js` — ITEM_IMAGE_MAX_FILE_SIZE_BYTES = 1 MB (Verified)
- Backend: `OSE-backend/src/middleware/upload.middleware.js` — uploadImage limits from mediaPolicy (Verified)

---

### C16-16.3-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Supported item image formats and dimensions shall follow platform media policy. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Items, API

**Verification Evidence:**

- Backend: `OSE-backend/src/middleware/upload.middleware.js` — imageFilter allowed extensions (Verified)
- API: `OSE-backend/src/routes/item.routes.js` — POST /items/bulk-upload-images (Verified)
- Frontend: `OSE-Frontend/src/app/features/items/item-form/item-form.component.html` — app-shared-upload (Verified)
- Frontend: `OSE-Frontend/src/app/shared/components/shared-upload/shared-upload.component.ts` — isAcceptedType() (Verified)
- Governance: `OSE-backend/src/platform/mediaPolicy.platform.js` — ITEM_IMAGE_RECOMMENDED_MAX_DIMENSION_PX (Verified)

---

### C16-16.3-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Unified export behavior shall apply when an item image is absent. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Reports, PDF, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/report.service.js` — delete optimized.imageUrl for some exports (Verified)
- Backend: `OSE-backend/src/services/pdf.service.js` — conditional image rendering (Verified)
- Backend: `OSE-backend/src/services/pdf.service.js` — conditional doc.image when loan.item?.imageUrl (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — lineImageSrc null fallback (Verified)

---

### C17-17.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Keyboard navigation shall be keyboard-first across governed experiences. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Platform, GRN, Transfer, Breakage, Get Pass, Items, Reports

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts` — appKeyboardNav Enter/Alt+S line-entry pattern (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.html` — appKeyboardNav on transfer form (Verified)
- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-form/get-pass-form.component.html` — appKeyboardNav on get-pass form (Verified)

---

### C17-17.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Enter shall move to the next field and shall not submit, post, or delete. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts` — onEnter() skips buttons and data-keyboard-submit (Verified)

---

### C17-17.2-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Enter at row end shall move to the next row or add a row. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts` — onEnter() focusableIn() next index (Verified)

---

### C17-17.2-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Shift+Enter shall move to the previous field. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts` — onEnter() shiftKey previous focusable (Verified)

---

### C17-17.2-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Enter in a textarea shall insert a new line. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — textarea default Enter behavior (Verified)

---

### C17-17.2-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Esc shall close lookup, calendar, or small overlay components. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/shared` — grep: no shared Esc-close for lookups/overlays (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — nz-modal send-back (default nzKeyboard) (Verified)
- Frontend: `OSE-Frontend/src/app/core/services/shared-lookup.service.ts` — Ch.17 unified lookup (Esc pending Ch.23) (Verified)

---

### C17-17.2-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Tab shall follow standard browser focus order. |
| Final Status | Yes |
| Remaining Work | Complete unless modules override tabindex |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — standard form controls tab order (Verified)

---

### C17-17.2-008

| Field | Value |
|-------|-------|
| Constitution Requirement | Invalid fields shall retain focus. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts` — focusFirstIssue() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/document-form-validation.util.ts` — runGovernedFormValidation() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — validateHeader() uses runGovernedFormValidation (Verified)

---

### C17-17.2-009

| Field | Value |
|-------|-------|
| Constitution Requirement | After item pick in line entry, focus shall move to quantity. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Items

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — addItem() queueMicrotask focus receivedQty (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — data-line-field=receivedQty on qty input (Verified)

---

### C17-17.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Keyboard behavior shall be consistent across all modules. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Movement, Items

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts` — appKeyboardNav selector (Verified)
- Frontend: `OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html` — appKeyboardNav on movement form (Verified)
- Frontend: `OSE-Frontend/src/app/features/breakage/breakage-detail/breakage-detail.component.html` — appKeyboardNav on breakage detail (Verified)

---

### C17-17.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Focus shall be visually distinguishable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/items/items-list/items-list.component.html` — thumb-button aria-label focusable (Verified)
- Frontend: `OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts` — focusableIn() skips hidden elements (Verified)

---

### C17-17.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Keyboard navigation shall skip disabled controls. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, GRN, Transfer, Breakage, Get Pass, Movement, Items

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — [disabled] on action buttons (Verified)
- Frontend: `OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts` — focusableIn filters aria-hidden (Verified)

---

### C17-17.3-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Keyboard navigation shall skip hidden controls. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, GRN, Transfer, Breakage, Get Pass, Movement, Items

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html` — @if conditional action bars (Verified)
- Frontend: `OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts` — offsetParent !== null filter (Verified)

---

### C17-17.3-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Dialogs shall assign initial focus to the primary interactive element. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — nz-modal send-back modal (Verified)
- Frontend: `OSE-Frontend/src/app/app.config.ts` — NzModalModule providers (Verified)

---

### C17-17.3-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Global shortcuts shall be centrally governed. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Platform, GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/registries/keyboard-shortcut.registry.ts` — GOVERNED_DOCUMENT_SHORTCUTS (Verified)
- Frontend: `OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts` — Alt+S dispatches dxose:keyboard-save (Verified)

---

### C17-17.3-007

| Field | Value |
|-------|-------|
| Constitution Requirement | Modules must not introduce independent global shortcuts. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Dashboard, Items, Reports

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/dashboard/dashboard.component.html` — module keydown.enter shortcuts (Verified)
- Frontend: `OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts` — central Alt shortcuts (Verified)
- Frontend: `OSE-Frontend/src/app/core/registries/keyboard-shortcut.registry.ts` — GOVERNED_DOCUMENT_SHORTCUTS registry published (Verified)

---

### C18-18.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Each error type shall use exactly one display channel. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/registries/validation-channel.registry.ts` — VALIDATION_CHANNEL_BY_CODE + resolveValidationChannel() (Verified)
- Frontend: `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts` — partitionByChannel() (Verified)

---

### C18-18.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Validation errors shall disappear when fixed. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — clearLineValidationUi() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — updateLine/clearLineValidationUi clears errors (Verified)

---

### C18-18.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | On submit, focus shall move to the first validation error. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/utils/document-form-validation.util.ts` — runGovernedFormValidation() focusFirstIssue (Verified)

---

### C18-18.2-003

| Field | Value |
|-------|-------|
| Constitution Requirement | When many errors exist, the summary banner shall show the error count. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/public/i18n/en.json` — COMMON.VALIDATION_SUMMARY (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — validateHeader() sets bannerMessage (Verified)

---

### C18-18.2-004

| Field | Value |
|-------|-------|
| Constitution Requirement | When many errors exist, error details shall appear at fields or rows. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — invalidLineIndexes signal (Verified)
- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.html` — role=alert field errors (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — data-field attributes on header fields (Verified)

---

### C18-18.2-005

| Field | Value |
|-------|-------|
| Constitution Requirement | All validation and error messages shall support localization. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/public/i18n/en.json` — COMMON.CONCURRENCY_CONFLICT / INVALID_FILE_TYPE (Verified)
- Frontend: `OSE-Frontend/public/i18n/ar.json` — Arabic counterparts (Verified)
- Frontend: `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts` — collectRequiredFieldIssues() i18n messages (Verified)

---

### C18-18.2-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Backend validation shall return codes. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/middleware/errorHandler.js` — responseBody.code / errorFamily (Verified)
- Backend: `OSE-backend/src/platform/errorRegistry.js` — classifyCode() (Verified)
- Frontend: `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts` — ValidationIssue.code on collectRequiredFieldIssues (Verified)

---

### C18-18.2-007

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall present translated text for backend validation codes. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts` — translate.instant COMMON.CONCURRENCY_CONFLICT (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/error-registry.util.ts` — classifyErrorCode() (Verified)
- Frontend: `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts` — mapBackendCodeToMessage() (Verified)
- Frontend: `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts` — CONCURRENCY_CONFLICT i18n (Verified)

---

### C18-18.2-008

| Field | Value |
|-------|-------|
| Constitution Requirement | Validation shall be deterministic: same input and conditions shall produce the same result. |
| Final Status | Yes |
| Remaining Work | Client-side assist may vary; server is authoritative |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Posting

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — validateGrn() fixed rule set (Verified)
- Backend: `OSE-backend/src/services/posting.service.js` — deterministic posting guards (Verified)

---

### C18-18.2-009

| Field | Value |
|-------|-------|
| Constitution Requirement | Validation shall occur at data entry per business rules. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Items, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/shared/components/shared-upload/shared-upload.component.ts` — isAcceptedType on pick (Verified)
- Frontend: `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts` — requireFields() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/document-form-validation.util.ts` — runGovernedFormValidation() (Verified)

---

### C18-18.2-010

| Field | Value |
|-------|-------|
| Constitution Requirement | Validation shall occur at workflow actions per business rules. |
| Final Status | Yes |
| Remaining Work | UI pre-checks supplemental only |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — validateGrn / submitForApproval guards (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — submitTransfer status guards (Verified)

---

### C18-18.2-011

| Field | Value |
|-------|-------|
| Constitution Requirement | Validation shall occur at posting per business rules. |
| Final Status | Yes |
| Remaining Work | Complete on server; client warnings non-authoritative |
| Verification | Verified |

**Affected Modules:** GRN, Posting, Inventory Count

**Verification Evidence:**

- Backend: `OSE-backend/src/services/postingGovernedGrn.service.js` — posting validation chain (Verified)
- Backend: `OSE-backend/src/services/posting.service.js` — postMovement / stock checks (Verified)

---

### C18-18.2-012

| Field | Value |
|-------|-------|
| Constitution Requirement | Client-side validation shall assist only. |
| Final Status | Yes |
| Remaining Work | Extend pattern beyond GRN |
| Verification | Verified |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts` — client requireFields assist (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — server-side 400/422 on invalid submit (Verified)

---

### C18-18.2-013

| Field | Value |
|-------|-------|
| Constitution Requirement | Server-side validation shall be authoritative. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Breakage, Posting

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — server validation on workflow/post (Verified)
- Backend: `OSE-backend/src/middleware/errorHandler.js` — structured API errors (Verified)

---

### C18-18.2-014

| Field | Value |
|-------|-------|
| Constitution Requirement | Validation messages shall be presented in logical order: header, then lines, then document. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH12-18 |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts` — sortByPresentationOrder() (Verified)

---

### C18-18.2-015

| Field | Value |
|-------|-------|
| Constitution Requirement | Warnings shall be informational unless governed otherwise. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — nz-alert warning for invoice link fail (Verified)
- Frontend: `OSE-Frontend/src/app/core/registries/validation-channel.registry.ts` — validation channel map (error vs warning split pending) (Verified)

---

### C18-18.2-016

| Field | Value |
|-------|-------|
| Constitution Requirement | Validation errors shall block the operation. |
| Final Status | Yes |
| Remaining Work | Complete server-side |
| Verification | Verified |

**Affected Modules:** GRN, Transfer, Posting

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — validateGrn throws 422 on errors (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — assertStatus blocks invalid transitions (Verified)

---

### C18-18.2-017

| Field | Value |
|-------|-------|
| Constitution Requirement | The same error must not be duplicated across display channels. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts` — 400 validation toast (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — inline nz-alert actionError (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — validateHeader banner only (no message.error on field validation) (Verified)

---

### C19-19.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Error placement shall match severity. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts` — toast-only for 400/409 mutations (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — error signal + message.error dual paths (Verified)

---

### C19-19.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Errors must not use duplicate display channels. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Platform

**Verification Evidence:**

- Governance: `Governance/requirements.json` — C18-18.2-017 related duplicate-channel rule (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — error.set() and message.error() on same conditions (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — submit() inline error.set without duplicate message.error on OB/invoice/excel paths (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — submit() inline error.set without duplicate toast on validation paths (Verified)

---

### C19-19.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | User-facing error messages shall be clear and actionable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/utils/http-error.util.ts` — formErrorKeyFromHttp() (Verified)
- Frontend: `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts` — formatApiValidationErrors() (Verified)

---

### C19-19.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | User-facing error messages shall be free of technical implementation details. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/middleware/errorHandler.js` — production 500 sanitization (Verified)
- Backend: `OSE-backend/src/middleware/errorHandler.js` — notFound exposes route path (Verified)
- Backend: `OSE-backend/src/middleware/errorHandler.js` — notFound() generic message (Verified)
- Frontend: `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts` — formatApiValidationErrors() messages-only display (Verified)
- Backend: `OSE-backend/src/middleware/errorHandler.js` — sanitizeClientValidationErrors() messages-only field policy (Verified)

---

### C19-19.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Stack traces must never be exposed to end users. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/middleware/errorHandler.js` — stack only when NODE_ENV=development in logger (Verified)

---

### C19-19.3-004

| Field | Value |
|-------|-------|
| Constitution Requirement | SQL details must never be exposed to end users. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-008 |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/middleware/errorHandler.js` — P2002/P2025/P2003 mappings (Verified)
- Backend: `OSE-backend/src/middleware/errorHandler.js` — P2003/P2002/500 sanitized client payloads (Verified)

---

### C19-19.3-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Internal IDs must never be exposed to end users in error messages. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH19-28 |

**Affected Modules:** Platform, Super Admin, Tenants

**Verification Evidence:**

- Backend: `OSE-backend/src/middleware/errorHandler.js` — existingTenantId in responseBody (Verified)
- Backend: `OSE-backend/src/middleware/errorHandler.js` — existingTenantId omitted from client JSON (Verified)
- Backend: `OSE-backend/src/middleware/errorHandler.js` — sanitizeClientValidationErrors() + omitInternalClientFields() (Verified)

---

### C19-19.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Equivalent error conditions shall produce consistent error codes and user experience. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/errorRegistry.js` — classifyCode() (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/error-registry.util.ts` — classifyErrorCode() (Verified)
- Frontend: `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts` — 409 CC branch uses classifier (Verified)

---

### C19-19.7-001

| Field | Value |
|-------|-------|
| Constitution Requirement | The first validation error shall be focusable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts` — firstMessage() only returns text (Verified)

---

### C19-19.7-002

| Field | Value |
|-------|-------|
| Constitution Requirement | The first validation error shall be announced to assistive technology. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Get Pass, GRN, Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.html` — role="alert" on field errors (Verified)
- Frontend: `OSE-Frontend/src/app/shared/components/returns-workflow-approve-modal/returns-workflow-approve-modal.component.html` — role=alert field error (Verified)

---

### C20-20.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Notifications shall use a unified dictionary. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Workflow Pipeline, Platform, GRN, Transfer

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/components/notification-bell/notification-bell.component.ts` — workflow-pipeline/alerts feed (Verified)
- Backend: `OSE-backend/src/services/workflow-pipeline/workflow-pipeline.service.js` — getWorkflowPipelineAlerts() (Verified)
- Frontend: `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts` — NzMessage toast routing (Verified)

---

### C20-20.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Notifications for the same event shall be deduplicated. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app` — grep: no notification deduplication layer (Verified)

---

### C20-20.2-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Notifications must not rely on color alone. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts` — warning vs error message types (Verified)

---

### C20-20.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform must not notify a user to open a document they cannot access. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Workflow Pipeline

**Verification Evidence:**

- Backend: `OSE-backend/src/services/workflow-pipeline/workflow-pipeline.service.js` — getWorkflowPipelineAlerts() no permission filter (Verified)
- Backend: `OSE-backend/src/services/workflow-pipeline/workflow-pipeline.collectors.js` — userCanActOnItem() exists but unused in alerts (Verified)
- Frontend: `OSE-Frontend/src/app/core/components/notification-bell/notification-bell.component.ts` — openItem(deepLink) without pre-check (Verified)

---

### C21-21.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Loading scope shall match the operation scope. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Reports, Items, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — loading signal on fetch only (Verified)
- Frontend: `OSE-Frontend/src/app/features/reports/analytics-report/analytics-report.component.ts` — loading vs exportingPdf signals (Verified)

---

### C21-21.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Long operations shall show progress or status. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Reports, Items, Admin

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-list/grn-list.component.html` — [nzLoading]=loading() (Verified)
- Frontend: `OSE-Frontend/src/app/features/reports/platform/report-viewer-shell/report-viewer-shell.component.html` — is-loading export buttons (Verified)
- Frontend: `OSE-Frontend/src/app/features/admin/tenants-list/tenants-list.component.html` — nz-progress (isolated) (Verified)

---

### C21-21.1-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Action buttons shall be disabled during the action. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Items, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html` — [disabled]=acting() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — [disabled]=loading() (Verified)
- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.html` — [disabled]=actionBusy() (Verified)

---

### C21-21.1-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Double submission is prohibited. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — submit() sets loading without early return if already loading (Verified)
- Frontend: `OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts` — dxose:keyboard-save dispatches to submit() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — submit() if (loading()) return guard (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — submit() + keyboard-save loading guard (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts` — save() if (saving()) return (Verified)
- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-form/get-pass-form.component.ts` — saveDraft/submitForApproval saving guard (Verified)
- Frontend: `OSE-Frontend/src/app/features/breakage/breakage-create-modal/breakage-create-modal.component.ts` — submit() loading guard (Verified)

---

### C21-21.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Partial operations must not block the entire application. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/layout/main-layout/main-layout.component.ts` — layout remains while child routes load (Verified)

---

### C21-21.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | If loading exceeds a reasonable duration, the user shall be informed the operation continues. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app` — grep: no long-running operation continuation messaging (Verified)

---

### C22-22.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Every workflow action must generate an audit record. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Inventory Count, Posting

**Verification Evidence:**

- Backend: `OSE-backend/src/services/auditTrail.service.js` — logAction() (Verified)
- Backend: `OSE-backend/src/services/auditGoverned.service.js` — logGovernedEvent() (Verified)
- Governance: `Governance/evidence.json` — C22-22.2-001 partial record (Verified)
- Backend: `OSE-backend/src/services/breakage.service.js` — grep: no logAction/logGovernedEvent (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — createGrn() returns without audit (Verified)

---

### C22-22.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Every significant attachment change must generate an audit record. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Breakage, GRN

**Verification Evidence:**

- Backend: `OSE-backend/src/services/breakage.service.js` — addAttachment() no logAction (Verified)
- Backend: `OSE-backend/src/platform/attachmentGovernance.service.js` — immutability guard only (Verified)
- Backend: `OSE-backend/src/services/grn.service.js` — createGrn() sets pdfAttachmentUrl, no logGovernedEvent (Verified)

---

### C22-22.2-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Every significant line change must generate an audit record. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/grn.service.js` — logGovernedEvent on key transitions (Verified)
- Backend: `OSE-backend/src/services/transfer.service.js` — updateTransfer() line deleteMany/createMany, no audit (Verified)

---

### C22-22.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | The document timeline shall be a single chronological timeline. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Breakage, Get Pass, Inventory Count

**Verification Evidence:**

- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getGrnTimeline()/fetchAuditEvents() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts` — loadConstitutionTimeline uses workflowSlots only (Verified)
- Frontend: `OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.ts` — workflowApprovalTimeline() (Verified)
- Governance: `Governance/evidence.json` — C22-22.3-001 (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.ts` — approvalTimelineContext from document, not getTimeline() (Verified)
- Backend: `OSE-backend/src/platform/documentTimeline.service.js` — getGrnTimeline returns auditEvents (Verified)

---

### C22-22.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Audit records shall be immutable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Audit Log, Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/auditWriter.service.js` — writeAuditLog() insert-only (Verified)
- Backend: `OSE-backend/prisma/schema.prisma` — AuditLog model (no update API) (Verified)

---

### C22-22.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Audit timestamps shall be stored internally in UTC. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Audit Log, Platform

**Verification Evidence:**

- Backend: `OSE-backend/prisma/schema.prisma` — AuditLog.changedAt @default(now()) (Verified)
- Backend: `OSE-backend/src/services/report-governance.service.js` — changedAt.toISOString() (Verified)

---

### C22-22.3-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Audit timestamps shall be displayed per user time zone. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.ts` — DatePipe default locale formatting (Verified)
- Backend: `OSE-backend/src/services/acc-advanced-policy.service.js` — timezone on policies only (Verified)

---

### C22-22.3-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Timeline filtering is permitted without altering audit records. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Audit Log, Reports, GRN, Transfer, Breakage, Get Pass

**Verification Evidence:**

- Backend: `OSE-backend/src/services/audit.service.js` — filtered findMany on audit log (Verified)

---

### C23-23.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup behavior shall be unified for items, parties, locations, and references. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Master Data, Items, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/services/shared-lookup.service.ts` — searchItems() (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — sharedLookup integration (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts` — parallel nz-select lookupPurpose (Verified)
- Governance: `Governance/evidence.json` — C23-23.1-001 (Verified)

---

### C23-23.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup profiles (Receiving, stock-based, catalog, issue) shall use the same UX with differing data scope only. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Master Data, Items

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — custom item dropdown (Verified)
- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.html` — nz-select line items (Verified)

---

### C23-23.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup search shall support code, name, and barcode. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Items, GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/services/item.service.js` — getItems() OR name/barcode contains (Verified)
- Backend: `OSE-backend/src/services/item.service.js` — code contains in search OR; q alias for search param (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — inventoryApi.getItemsByLocation receiving mode (Verified)
- Backend: `OSE-backend/src/services/location-item-resolution.service.js` — search OR name/code/barcode (Verified)

---

### C23-23.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup search ranking shall be exact code, then exact barcode, then prefix, then contains. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH19-28 |

**Affected Modules:** Items

**Verification Evidence:**

- Backend: `OSE-backend/src/services/item.service.js` — orderBy: { name: 'asc' } (Verified)
- Backend: `OSE-backend/src/utils/item-search-rank.util.js` — sortItemsBySearchRank() (Verified)
- Backend: `OSE-backend/src/services/item.service.js` — ranked getItems() search results (Verified)
- Backend: `OSE-backend/src/services/location-item-resolution.service.js` — ranked receiving lookup results (Verified)

---

### C23-23.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup search shall debounce before executing search. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Items, Master Data

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — search$.pipe(debounceTime(300)) (Verified)
- Frontend: `OSE-Frontend/src/app/features/items/items-list/items-list.component.ts` — debounceTime on search (Verified)

---

### C23-23.3-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup search shall normalize case and spaces insensitively. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-008 |

**Affected Modules:** Items, GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Backend: `OSE-backend/src/services/item.service.js` — mode: 'insensitive' contains (Verified)
- Backend: `OSE-backend/src/services/item.service.js` — normalizeItemSearch() in getItems() (Verified)

---

### C23-23.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup keyboard navigation shall support arrow up and arrow down. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH19-28 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — click-only dropdown buttons (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/lookup-dropdown-keyboard.util.ts` — handleLookupDropdownKeydown() ArrowUp/ArrowDown (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — onItemSearchKeydown() + itemHighlightIndex (Verified)

---

### C23-23.4-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup keyboard navigation shall support Enter, Esc, and Tab. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH19-28 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — no key handlers on lookup (Verified)
- Frontend: `OSE-Frontend/src/app/core/utils/lookup-dropdown-keyboard.util.ts` — Enter/Esc/Tab contract (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — onItemSearchKeydown() (Verified)

---

### C23-23.4-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup shall close on select. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH19-28 |

**Affected Modules:** GRN

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — addItem clears dropdown (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — closeItemDropdown() on addItem/selectAt (Verified)

---

### C23-23.4-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup shall close on outside click. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH19-28 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — dropdown toggled by focus/query only (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — onDocumentClick() HostListener (Verified)

---

### C23-23.4-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup shall close on field exit. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH19-28 |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — onWarehouseChange closes dropdown (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — onItemSearchBlur() (Verified)

---

### C23-23.4-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Only one lookup shall be open at a time. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-CH19-28 |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app` — grep: no single-open lookup coordinator/registry (Verified)
- Frontend: `OSE-Frontend/src/app/core/services/lookup-open-registry.service.ts` — register() closes previous (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — openItemDropdown() registry (Verified)

---

### C23-23.4-007

| Field | Value |
|-------|-------|
| Constitution Requirement | After item pick in line entry, focus shall move to quantity. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — addItem() no focus call (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — focusLineQty() after addItem (Verified)

---

### C23-23.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup loading, no-results, and error-with-retry states shall use unified messaging. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — loading icon + NO_ITEMS empty (Verified)

---

### C23-23.5-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup shall use unified empty states. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/public/i18n/en.json` — per-screen empty strings (e.g. GRN.CREATE.NO_ITEMS) not shared lookup empty state (Verified)

---

### C23-23.6-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup results shall be filtered by permission to show only authorized data. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Items, GRN, Transfer, Get Pass, Breakage, Master Data

**Verification Evidence:**

- Backend: `OSE-backend/src/services/item.service.js` — tenantId + locationId where clause (Verified)

---

### C23-23.6-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Lookup shall enforce tenant isolation with no cross-tenant data. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Backend: `OSE-backend/src/services/item.service.js` — where: { tenantId } (Verified)

---

### C23-23.6-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Large lookup result sets shall use paging or infinite scroll per platform policy. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Items, GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/services/shared-lookup.service.ts` — limit=20 (Verified)
- Backend: `OSE-backend/src/services/item.service.js` — parseItemPagination() (Verified)

---

### C23-23.6-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Large catalogs shall use server-side search. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Items, GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/services/shared-lookup.service.ts` — HTTP GET /items with q param (Verified)

---

### C23-23.6-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Loading entire large catalogs into the client is prohibited. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Master Data

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — suppliersApi.list({ take: 10000 }) (Verified)

---

### C24-24.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Operational data entry shall be desktop only for v2.0. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/` — Angular SPA desktop target (Verified)
- Governance: `Governance/evidence.json` — C24-24.1-001 (Verified)

---

### C24-24.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Minimum supported resolution shall be 1366x768. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — GHSL/VSL golden geometry at 1366×768 (Verified)

---

### C24-24.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Zoom support from 80% to 125% is required for release acceptance. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — §9 Zoom Policy (Verified)

---

### C24-24.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Pages shall not require horizontal page scroll except inside grids. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, GRN, Transfer, Get Pass, Breakage, Reports, Registry lists, Items, Inventory Count, Movements, Master Data

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/styles.scss` — overflow-x rules for document tables (Verified)
- Frontend: `OSE-Frontend/src/app/features/grn/grn-list/_grn-list-registry-canvas.scss` — registry-work-card__scroll (Verified)
- Governance: `docs/governance/assets/ch24.6-responsive-matrix/CHECKLIST.md` — ch24.6 matrix template for horizontal-scroll audit (Verified)

---

### C24-24.4-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Titles shall not be clipped. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, GRN, Transfer, Get Pass, Breakage, Reports, Registry lists, Dashboard, Admin

**Verification Evidence:**

- Frontend: `OSE-Frontend` — grep: no title-clip regression tests or CI checks (Verified)

---

### C24-24.4-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Buttons shall not overlap. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, GRN, Transfer, Get Pass, Breakage, Reports, Document detail, Workflow Pipeline

**Verification Evidence:**

- Frontend: `OSE-Frontend` — grep: no button-overlap regression suite (Verified)

---

### C24-24.4-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Create screen primary actions shall be visible at 1366x768 and 100% zoom. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html` — footer submit actions present (Verified)

---

### C24-24.4-005

| Field | Value |
|-------|-------|
| Constitution Requirement | Dialogs shall fit the viewport with internal scroll. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, ACC, Master Data, Breakage, GRN, Admin

**Verification Evidence:**

- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — modal/viewport contracts (Verified)

---

### C24-24.4-006

| Field | Value |
|-------|-------|
| Constitution Requirement | Tables shall scroll internally. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Registry lists, Reports, GRN, Transfer, Get Pass, Breakage, Items, Inventory Count, Movements, Ledger, Master Data

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/styles.scss` — table overflow-x auto (Verified)
- Frontend: `OSE-Frontend/src/app/shared/components/registry-list-pagination/registry-list-pagination.component.ts` — registry list paging (Verified)

---

### C24-24.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Supported browsers shall follow the platform browser support matrix. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Governance: `docs/governance/scripts/constitution-base.md` — §24.5 browser matrix reference (Verified)

---

### C24-24.5-002

| Field | Value |
|-------|-------|
| Constitution Requirement | High DPI displays (2K/4K) shall be supported. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src` — grep: no DPI/2K/4K-specific handling or test artifacts (Verified)
- Frontend: `OSE-Frontend/src/app/shared/styles` — standard responsive SCSS only (Verified)

---

### C24-24.5-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Multi-monitor presentation shall be consistent. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend` — grep: no multi-monitor consistency tests (Verified)

---

### C24-24.6-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Responsive test matrix 1366x768 at 80/90/100/110/125% zoom is required for Definition of Done. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Governance: `OSE-Frontend/docs/governance/DX_OSE_WAVE2_RECOVERY_MEASUREMENT_SOP_v1.md` — zoom spot checks (Verified)

---

### C24-24.6-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Responsive test matrix 1440/1600/1920 at 100% zoom is required for Definition of Done. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — multi-resolution golden references (Verified)

---

### C25-25.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Modules must not invent unrelated document layouts. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Lost Items, Movement, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html` — document-card layout (Verified)
- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — Archetype A-DT / A-TX (Verified)

---

### C25-25.2-002

| Field | Value |
|-------|-------|
| Constitution Requirement | All modules must declare and follow one document layout archetype. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — one archetype per bounded route (Verified)
- Governance: `docs/full-system-review/SCREEN-REGISTRY.md` — screen inventory (partial archetype linkage) (Verified)

---

### C25-25.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Primary scroll owner shall be defined per document layout archetype. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Registry lists, Document detail, Reports, Items, Inventory Count, Movements, Master Data, Dashboard

**Verification Evidence:**

- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — §3 Vertical Scroll Law (Verified)

---

### C25-25.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Primary scroll owner shall be consistent per archetype. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, GRN, Transfer, Get Pass, Breakage, Lost Items, Movements, Items, Inventory Count, Reports, Master Data

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-list/_grn-list-registry-canvas.scss` — registry scroll canvas (Verified)

---

### C26-26.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Print and PDF export must match. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Lost Items, Reports, Inventory Count

**Verification Evidence:**

- Backend: `OSE-backend/src/services/pdf/report-document.facade.js` — shared PDF presentation facade (Verified)
- Frontend: `OSE-Frontend/src/app/features/reports/styles/report-print.scss` — print styles for reports (Verified)

---

### C26-26.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Printed and exported documents shall include status watermarks such as draft, posted, and void. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Lost Items, Reports

**Verification Evidence:**

- Backend: `OSE-backend/src/services/pdf/report-pdf-enterprise.js` — status pills / POSTED final step (Verified)
- Backend: `OSE-backend/src/services/pdf/report-pdf-controlled-document.js` — controlled document header/status (Verified)

---

### C26-26.1-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Printed and exported documents shall include header and footer with organization identity. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Reports, Evidence PDFs

**Verification Evidence:**

- Backend: `OSE-backend/src/services/pdf/report-pdf-controlled-document.js` — drawControlledMovementHeader() (Verified)
- Backend: `OSE-backend/src/services/pdf/report-pdf-enterprise.js` — stampEnterpriseDocumentFooters() (Verified)

---

### C26-26.1-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Printed and exported documents shall include page numbers and print metadata. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Reports, Evidence PDFs, Get Pass, Inventory Count, GRN, Transfer, Lost Items

**Verification Evidence:**

- Backend: `OSE-backend/src/services/pdf/report-pdf-enterprise.js` — stampEnterpriseDocumentFooters() (Verified)

---

### C26-26.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform electronic record is authoritative over printed or exported copies. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-008 |

**Affected Modules:** Platform, GRN, Transfer, Get Pass, Breakage, Reports

**Verification Evidence:**

- Governance: `docs/governance/PRODUCT_CHARTER.md` — operational traceability / authoritative data narrative (Verified)
- Backend: `OSE-backend/src/services/pdf/report-pdf-enterprise.js` — footerAuthoritativeDisclaimer in stampEnterpriseDocumentFooters() (Verified)
- Frontend: `OSE-Frontend/src/styles.scss` — @media print body::after authoritative-copy disclaimer (Verified)

---

### C26-26.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Print shall be subject to the same permission model as document view. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Reports

**Verification Evidence:**

- Backend: `OSE-backend/src/routes/grn.routes.js` — GET /:id/evidence/pdf require GRN_VIEW (Verified)
- Backend: `OSE-backend/src/routes/transfer.routes.js` — evidence/pdf require INVENTORY_VIEW (Verified)

---

### C26-26.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Export shall be subject to the same permission model as document view. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Reports, GRN, Transfer, Get Pass, Breakage, Lost Items, Inventory Count

**Verification Evidence:**

- Backend: `OSE-backend/src/routes/reports.routes.js` — requirePermission('REPORTS_EXPORT') on pdf routes (Verified)

---

### C26-26.3-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Export authorization shall be explicit. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Reports, GRN, Transfer, Get Pass, Breakage, Lost Items, Inventory Count, ACC

**Verification Evidence:**

- Backend: `OSE-backend/src/acc-authority/catalog.constitution.js` — permission catalog entries (Verified)
- Backend: `OSE-backend/src/routes/reports.routes.js` — REPORTS_EXPORT on exports (Verified)

---

### C26-26.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Sensitive data shall be masked per authorization on export and print. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Reports, PDF

**Verification Evidence:**

- Backend: `OSE-backend/src/services/pdf/` — no mask/redact implementation found (Verified)

---

### C27-27.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Large lists shall use paging or virtual presentation. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Items, GRN, Transfer, Get Pass, Breakage, Movements, Lost Items, Inventory Count, Admin, Reports

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/shared/components/registry-list-pagination/registry-list-pagination.component.ts` — shared pagination component (Verified)
- Backend: `OSE-backend/src/services/item.service.js` — skip/take pagination (Verified)

---

### C27-27.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Server-assisted search shall be used when warranted for large lists. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Items, Transfer, Get Pass, Breakage, Reports, Master Data, Movements

**Verification Evidence:**

- Backend: `OSE-backend/src/services/item.service.js` — search query param (Verified)
- Frontend: `OSE-Frontend/src/app/features/master-data/shared/base-master-data.controller.ts` — debounced server list (Verified)

---

### C27-27.1-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Search requests shall use debounce and cancel in-flight requests. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** GRN, Transfer, Get Pass, Breakage, Items, Reports, Master Data, Movements

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts` — debounceTime + switchMap (Verified)
- Frontend: `OSE-Frontend/src/app/features/ledger/ledger-viewer/ledger-viewer.component.ts` — debounceTime on filters (Verified)

---

### C27-27.1-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Heavy export and print operations shall be asynchronous with user feedback. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Reports, GRN, Transfer, Get Pass, Evidence PDFs

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/reports/analytics-report/analytics-report.component.ts` — exportingPdf signal during HTTP export (Verified)
- Frontend: `OSE-Frontend/src/app/features/reports/platform/report-viewer-shell/report-viewer-shell.component.html` — export button loading state (Verified)

---

### C28-28.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Interactive elements shall be labeled. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, GRN, Transfer, Get Pass, Breakage, Reports, Admin, Registry lists

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/admin/user-rights/user-rights.component.html` — aria-label on some controls (Verified)

---

### C28-28.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Color shall not be the sole state indicator. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, GRN, Transfer, Get Pass, Breakage, Workflow Pipeline, Inventory Count

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/components/notification-bell/notification-bell.component.ts` — badgeCount numeric + bell icon (Verified)

---

### C28-28.1-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Contrast shall meet agreed accessibility targets. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Governance: `OSE-Frontend` — grep: no WCAG contrast test artifacts or CI token checks (Verified)

---

### C28-28.2-001

| Field | Value |
|-------|-------|
| Constitution Requirement | The platform shall support screen reader compatibility for governed interactions. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend` — grep: no screen-reader test matrix for governed interactions (Verified)

---

### C28-28.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Validation messages shall be accessible to assistive technology. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform, Get Pass, GRN, Transfer, Breakage

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.html` — role="alert" field errors (Verified)

---

### C28-28.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Error messages shall be accessible to assistive technology. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |
| Remediation Batch | BATCH-PARTIAL-SWEEP |

**Affected Modules:** Platform

**Verification Evidence:**

- Frontend: `OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts` — message.error toasts (Verified)

---

### C29-29.1-001

| Field | Value |
|-------|-------|
| Constitution Requirement | New capabilities must declare applicable Constitution chapters before release. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `Governance/requirements.json` — machine-readable chapter/section mapping per requirement (Verified)
- Governance: `Governance/evidence.json` — per-requirement compliance evidence register (Verified)
- Governance: `Governance/CONSTITUTION_TRACEABILITY_MATRIX.md` — human-readable chapter declaration register (Verified)

---

### C29-29.1-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Revised capabilities must declare applicable Constitution chapters before release. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `Governance/evidence.json` — revised-capability evidence rows updated in constitution program (Verified)
- Governance: `Governance/build-register.mjs` — register rebuild from requirements + evidence SSOT (Verified)

---

### C29-29.1-003

| Field | Value |
|-------|-------|
| Constitution Requirement | New and revised capabilities must demonstrate Constitution compliance before release. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `Governance/evidence.json` — implemented/verificationStatus per requirement before release tracking (Verified)
- Governance: `docs/governance/DX_OSE_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` — non-normative verification methods reference (Verified)
- Backend: `OSE-backend/scripts/smoke-constitution-v2-platform.js` — supplementary static compliance checks (incremental) (Verified)

---

### C29-29.3-001

| Field | Value |
|-------|-------|
| Constitution Requirement | A screen or capability is compliant only when all mandatory rules in applicable chapters are satisfied. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/scripts/constitution-base.md` — §29.3 Definition of Done (Verified)
- Governance: `Governance/evidence.json` — per-requirement mandatory-rule satisfaction tracking (Verified)

---

### C29-29.3-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Compliance Definition of Done shall include the responsive test matrix where applicable. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance, UX

**Verification Evidence:**

- Governance: `docs/governance/scripts/constitution-base.md` — §29.3 responsive test matrix where applicable (Verified)
- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — §9 Zoom Policy + GHSL termination QA matrix (Verified)

---

### C29-29.4-001

| Field | Value |
|-------|-------|
| Constitution Requirement | Exceptions require documented approval, scope, expiry, and registration. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/EXCEPTION_REGISTER.md` — register conventions — scope, approval date, approver, expiry, ID (Verified)
- Governance: `docs/governance/scripts/constitution-base.md` — §29.4 Exceptions & Waivers requirements (Verified)

---

### C29-29.4-002

| Field | Value |
|-------|-------|
| Constitution Requirement | Exceptions must not weaken audit rules. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/EXCEPTION_REGISTER.md` — EX-005 dual audit — documented with consolidation target (Verified)
- Governance: `docs/governance/AUDIT_CONSOLIDATION_PLAN.md` — audit hardening — no new weakening without review (Verified)
- Governance: `docs/governance/scripts/constitution-base.md` — §29.4 exceptions must not weaken audit rules (Verified)

---

### C29-29.4-003

| Field | Value |
|-------|-------|
| Constitution Requirement | Exceptions must not weaken posting rules. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/EXCEPTION_REGISTER.md` — EX-004 mixed posting triggers — documented deviation + mitigation (Verified)
- Governance: `docs/governance/POSTING_GOVERNANCE_ENFORCEMENT.md` — posting rules reference — exceptions cannot bypass posting engine (Verified)

---

### C29-29.4-004

| Field | Value |
|-------|-------|
| Constitution Requirement | Exceptions must not weaken period rules. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance, Period Close

**Verification Evidence:**

- Governance: `docs/governance/EXCEPTION_REGISTER.md` — EX-003 PeriodClose.status — scope, expiry, resolution direction (Verified)
- Governance: `docs/governance/PERIOD_CLOSE_GOVERNANCE.md` — period rules reference — close rules not waived (Verified)

---

### C29-29.5-001

| Field | Value |
|-------|-------|
| Constitution Requirement | New operational modules must undergo constitutional review before production approval. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `docs/governance/scripts/constitution-base.md` — §29.5 constitutional review requirement (Verified)
- Governance: `docs/governance/PHASE1_STABILIZATION_CLOSURE.md` — Phase 1 module constitutional review closure record (Verified)
- Governance: `Governance/CONSTITUTION_TRACEABILITY_MATRIX.md` — ongoing constitutional review artifact for new modules (Verified)

---

### C29-29.6-001

| Field | Value |
|-------|-------|
| Constitution Requirement | QA shall validate against this Constitution and the UX Constitution. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** QA, Governance

**Verification Evidence:**

- Governance: `docs/full-system-review/UAT-OB-CHECKLIST.md` — UAT checklist artifact (Verified)
- Governance: `docs/governance/PILOT_STABILIZATION_CHECKLIST.md` — module UAT/smoke checklist (Verified)
- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — QA normative UX source — zoom/responsive matrices (Verified)
- Governance: `docs/governance/scripts/constitution-base.md` — §29.6 Verification — methods per Architecture Guide (Verified)

---

### C29-29.7-001

| Field | Value |
|-------|-------|
| Constitution Requirement | A conformance backlog shall not override the Constitution. |
| Final Status | Yes |
| Remaining Work | Complete |
| Verification | Verified |

**Affected Modules:** Governance

**Verification Evidence:**

- Governance: `Governance/CONSTITUTION_TRACEABILITY_MATRIX.md` — implementation register SSOT (Verified)
- Governance: `OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` — §1.1 hierarchy — backlog cannot override (Verified)
- Governance: `Governance/evidence.json` — C29-29.7-001 (Verified)

---
