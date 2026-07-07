# Wave 6 — Evidence Preview and Official Evidence Final Verification

**Run ID:** W6-RV (see JSON)  
**Gate:** **CLOSED** — 25 PASS · 0 FAIL · 0 BLOCKED  
**Evidence JSON:** `Governance/wave6/WAVE6_EVIDENCE_PREVIEW_OFFICIAL_FINAL_VERIFICATION.json`

---

## 1. Evidence Contract

Every evidence JSON response (GRN, Transfer, Breakage, Lost Items) includes:

| Field | Type | Description |
|-------|------|-------------|
| `evidenceClass` | `PREVIEW` \| `OFFICIAL` | Resolved from document state or explicit `?mode=` |
| `isOfficialEvidence` | `boolean` | `true` only for eligible final/posted states |
| `documentStatus` | `string` | Wave 2 user-facing state (never raw enum) |
| `generatedAt` | ISO-8601 | Pack generation timestamp |
| `disclaimer` | `string` \| `null` | Preview-only non-official disclaimer |

**Mode behavior (query `?mode=`):**

- Omitted → auto-resolve from document state.
- `PREVIEW` → always preview (watermarked).
- `OFFICIAL` → allowed only when eligible; **422** `EVIDENCE_OFFICIAL_NOT_ELIGIBLE` otherwise.

**SSOT:** `OSE-backend/src/platform/evidenceClassification.service.js`

---

## 2. Module Eligibility Matrix

| Module | Official when | Preview when | Rejected/Voided |
|--------|---------------|--------------|-----------------|
| **GRN** | `POSTED` + `postedAt` | All other states | Preview only |
| **Transfer** | Posted (`POSTED` / legacy posted via `isTransferPosted`) | Pre-posting workflow states | Preview only |
| **Breakage** | `APPROVED` + `postedAt` | Draft, in-review, returned | Preview only (not posting evidence) |
| **Lost Items** | `APPROVED` + `postedAt` | Draft, in-review, returned | Preview only |

**Not in Wave 6 scope:** Inventory Count, Get Pass, Stock Count legacy evidence (existing official-only behavior unchanged).

---

## 3. API Changes

- Controllers use `buildEnrichedEvidence()` + `logEvidenceExport()` from `utils/evidenceExport.util.js`.
- Endpoints unchanged:
  - `GET /api/grn/:id/evidence` (+ `/pdf`)
  - `GET /api/transfers/:id/evidence` (+ `/pdf`)
  - `GET /api/breakage/:id/evidence` (+ `/pdf`)
  - `GET /api/lost-items/:id/evidence` (+ `/pdf`)
- Optional query: `?mode=PREVIEW|OFFICIAL` (guarded).
- GRN/Transfer evidence services no longer hard-block pre-posted fetch; classification handles preview vs official.

---

## 4. PDF/JSON Changes

**Preview PDF:**

- Visual diagonal watermark: **PREVIEW — NOT FINAL** (all pages via `stampEvidencePreviewWatermark`).
- PDF Info metadata: `Title: PREVIEW — NOT FINAL`, `Keywords: PREVIEW,NOT_FINAL,NOT_OFFICIAL_EVIDENCE`.
- Header classification badge: `PREVIEW — NOT FINAL`.
- Filename suffix: `_PREVIEW` (e.g. `Breakage-Report-BRK-001_PREVIEW.pdf`).

**Official PDF:**

- No preview watermark.
- PDF Info: `Title: OFFICIAL EVIDENCE`.
- Header classification: `OFFICIAL EVIDENCE`.
- Filename suffix: `_OFFICIAL`.

Report layout and data unchanged — classification/watermark/metadata only.

---

## 5. Frontend Changes

| Screen | Change |
|--------|--------|
| GRN detail | Evidence enabled before posting; label switches Preview ↔ Official |
| Transfer detail | Same |
| Breakage detail | Tooltip + Preview/Official label (was always-on download) |

**i18n:** `EVIDENCE_DOWNLOAD_PREVIEW`, `EVIDENCE_DOWNLOAD_OFFICIAL`, `EVIDENCE_PACK_HINT_PREVIEW`, `EVIDENCE_PACK_HINT_OFFICIAL`.

No raw mode selector exposed to users.

---

## 6. Permission Results

| Module | Permission | Result |
|--------|------------|--------|
| GRN | `GRN_VIEW` | Unchanged — route guard |
| Transfer | `TRANSFER_VIEW` | Unchanged |
| Breakage | `BREAKAGE_VIEW` / aliases | Unchanged |
| Lost Items | `LOST_ITEMS_VIEW` / aliases | Unchanged |

Negative 403 enforced at **route middleware** (W6-PERM-NEG-01 PASS). Tenant isolation → 404 without leak (W6-ISO-01 PASS).

---

## 7. Audit Results

Evidence export now logs via existing governed pattern:

- `logGovernedEvent` → `action: UPDATE`, `eventType: EVIDENCE_EXPORT`
- Note: `JSON PREVIEW` / `PDF OFFICIAL` etc.
- No new AuditAction enum or subsystem.

---

## 8. Preview Runtime Evidence

| Check | Result |
|-------|--------|
| Draft GRN → PREVIEW JSON | PASS (W6-GRN-02) |
| Draft Breakage → PREVIEW JSON | PASS (W6-BRK-01) |
| Preview PDF metadata/watermark | PASS (W6-BRK-02) |
| Contract fields on draft transfer | PASS (W6-CONTRACT-01) |
| OFFICIAL mode blocked on draft | PASS (W6-GUARD-01) |

---

## 9. Official Runtime Evidence

| Check | Result |
|-------|--------|
| Posted GRN contract (synthetic) | PASS (W6-CONTRACT-02) |
| Approved Breakage contract + PDF | PASS (W6-BRK-03, W6-BRK-04) |
| Official PDF without preview marker | PASS (W6-BRK-04) |

---

## 10. Regression Results

| Area | Status |
|------|--------|
| Posting / workflow | Not modified |
| Timeline | Not modified |
| Attachments / Breakage photos | Gallery path unchanged |
| User-facing status mapper | Reused from Wave 2 SSOT |
| Shell / scroll / layout | Not modified |

---

## 11. Tests and Build

- `node --test src/platform/evidenceClassification.service.test.js` — **8/8 PASS**
- `node Governance/wave6/wave6-runtime-verification.js` — **25 PASS, gate CLOSED**

---

## 12. Files Touched

**Backend**

- `src/platform/evidenceClassification.service.js` (+ test)
- `src/utils/evidenceExport.util.js`
- `src/services/grnEvidence.service.js`
- `src/services/transferEvidence.service.js`
- `src/controllers/{grn,transfer,breakage,lostItems}.controller.js`
- `src/services/pdf/evidence-pack-pdf.js`
- `src/services/pdf/report-pdf-layout.js`

**Frontend**

- `grn-detail`, `transfer-detail`, `breakage-detail` (TS + HTML)
- `public/i18n/en.json`

**Governance**

- `Governance/wave6/wave6-runtime-verification.js`
- `Governance/wave6/WAVE6_EVIDENCE_PREVIEW_OFFICIAL_FINAL_VERIFICATION.json`

---

## 13. Database Changes

**None.** Classification is computed at export time.

---

## 14. Transfer Deprecated Permission Audit (`TRANSFER_DISPATCH_RECEIVE`)

| Metric | Finding |
|--------|---------|
| Test DB permission row | Not present (may be purged in test seed) |
| **Catalog** | Still listed as **Deprecated SYS-DEC-07** in `catalog.constitution.js` |
| **Base role templates** | Still referenced in `base-role-permissions.js` (ORG_MANAGER, STOREKEEPER templates) |
| **Seed script** | Still in `scripts/seed-user-rights-phase1.js` |
| **Runtime routes** | **None** — dispatch/receive removed Wave 5 |
| **Pipeline guards** | **None** — `workflow-step-permissions.js` maps legacy to `TRANSFER_VIEW` |

**Recommendation for Wave 8 Governance Closeout:** Do not delete catalog/seed entries until production role-grant audit confirms zero `urRolePermission` rows; test DB shows 0 grants. Safe to remove from ACC after Wave 8 tenant cleanup plan.

---

## 15. PASS / FAIL / BLOCKED

| Verdict | Count |
|---------|-------|
| PASS | 25 |
| FAIL | 0 |
| BLOCKED | 0 |

**Overall: PASS — Wave 6 CLOSED**

---

## 16. Execution Blockers

None. Wave 7 may proceed.
