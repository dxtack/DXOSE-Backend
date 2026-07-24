# Audit consolidation — phased plan (governance only)

| Field | Value |
|--------|--------|
| **Prerequisite** | `AUDIT_CONSOLIDATION_ANALYSIS.md`, `AUDIT_EVENT_CATALOG.md`. |
| **Constraints** | No UX/dashboard/analytics work; no **`referenceType`** normalization; no aggressive workflow rewrites; **reversible** migrations preferred. |
| **North star** | One **audit writer facade**, **valid enum actions only**, **paired narrative** for posting (ledger + `AuditLog`). |

---

## 1. Guiding principles

1. **Correctness over volume:** fix **silent failures** and **semantic bugs** before adding new events.  
2. **Enum-first:** every persisted `action` ∈ `AuditAction` (extend DB enum when a new verb is truly needed).  
3. **Same transaction when it matters:** financial/session state commits **with** audit when auditors require atomicity; otherwise document **eventual** audit (current movement post pattern).  
4. **Legacy coexistence:** legacy stock count and canonical inventory count may share **`STOCK_COUNT`** `entityType` but **`note` / `afterValue`** must distinguish `workflow: INVENTORY_COUNT_V1` vs `LEGACY_STOCK_COUNT` until sunset.  

---

## 2. Phased consolidation strategy

### Phase A — Audit integrity hotfix (**DONE** — code + smoke)

**Objectives:** stop silent loss; fix misleading events.

| # | Task | Status |
|---|------|--------|
| A1 | Inventory count **cancel**: **`CANCEL`** → **`VOID`** + `note` (`domainVerb=CANCEL_DRAFT`) | **Done** |
| A2 | OB enable: **`REOPEN_PERIOD`** → **`UPDATE`** + `OB_IMPORT_ENABLED` note | **Done** |
| A3 | **Get Pass:** `EntityType.GET_PASS` + remap non-enum actions → `UPDATE` / `APPROVE` + `note` | **Done** |
| A4 | `auditTrail` → shared **`database`** prisma | **Done** |
| A5 | Audit write failure → **`logger.error`** (structured) on trail + `err.code` on M14 | **Done** |

**Exit criteria (met for new writes):** `node scripts/smoke-audit-phase-a.js` passes; OB enable no longer emits `REOPEN_PERIOD`; inventory cancel uses `VOID`. DB fixture verification: `AUDIT_PHASE_A_SMOKE_RESULTS.md`.

---

### Phase B — Unified writer facade (no behavior change beyond call sites)

**Objectives:** single module used by controllers/services.

| # | Task | Risk |
|---|------|------|
| B1 | Introduce `auditWriter.log({...})` (name TBD) wrapping validated `action` + optional `tx` + `note` + IP/UA. | Low |
| B2 | Migrate **`audit.service.log`** and **`logAction`** callers incrementally to facade; deprecate direct `prisma.auditLog.create` in `mapping.service.js`. | Low |
| B3 | Document **when to attach `tx`** (finalize OB, cancel session) vs post-tx (movement post today). | None |

**Exit criteria:** All audit creates go through facade; mapping service uses facade.

**Implementation (2026):** Facade module `OSE-backend/src/services/auditWriter.service.js` (`writeAuditLog`). See `AUDIT_FACADE_PLAN.md`, `AUDIT_FACADE_ANALYSIS.md`, `AUDIT_FACADE_SMOKE_RESULTS.md`. Static guard: `npm run smoke:audit-facade`.

---

### Phase C — Posting and approval coverage (**DONE** — minimal session/document events)

**Objectives:** align **ledger** mutations with **`AuditLog`** for inventory count, stock report, and legacy stock count — **one `POST` per posting run**, no per-line noise.

| # | Task | Status |
|---|------|--------|
| C1 | **`postInventoryCountSession`:** `logAction` `STOCK_COUNT` / **`POST`** after successful tx; `logger.error` on failure | **Done** |
| C2 | **`postStockCount`** / **`postStockReport`:** same | **Done** |
| C3 | Inventory count **submit counts**, **submit for approval**, **approve**, **reject** | **Done** (`SUBMIT`, `COUNT_APPROVE`, `COUNT_REJECT`) |
| C4 | Stock report **submit / approve / reject** + relies on C2 for **`POST`** | **Done** |
| C5 | Legacy **stock count** `submitForApproval` / `processApproval` | **Done** |
| C6 | **Transfers:** `APPROVE`/`REJECT` on `TRANSFER` + receive | **Store transfer slice done** (`TRANSFER_AUDIT_*`); other domains **deferred** |

**Exit criteria:** For inventory count and stock report, an auditor can order **`AuditLog`** by `changedAt` and see **submit → approve → post** (or **reject** without `POST`) on the same **`entityId`**. See **`AUDIT_PHASE_C_SMOKE_RESULTS.md`**.

---

### Phase D — Catalog enforcement & hygiene

| # | Task |
|---|------|
| D1 | Normalize `entityType` strings to catalog §2 (migration of **historical** rows optional; new writes strict). |
| D2 | Remove dead imports where applicable (e.g. services that no longer call audit after refactors) |
| D3 | Optional: DB view **`v_audit_chain`** (session id → ledger count) — **out of scope** unless explicitly approved (not a dashboard; could be support SQL). |

---

## 3. Low-risk stabilization order (recommended)

1. **Phase A** (silent failures + wrong verb for OB)  
2. **Phase C** (posting + approval — **done**)  
3. **Phase B** (facade — reduces future drift)  
4. **Phase C6** remainder (non–store-transfer movement domains) as prioritized  
5. **Phase D**  

---

## 4. Rollback strategy

| Change type | Rollback |
|-------------|----------|
| **Code-only** (facade, new `logAction` calls, enum remap to existing values) | Revert PR; no DB migration. |
| **`AuditAction` enum extension** | Forward migration only for Postgres enums; rollback = **new code** must tolerate old enum (avoid removing values); prefer **additive** enum values only. |
| **Historical `entityType` rename** | Do not mass-update old rows without backup + offline script; prefer **dual-write** period (old + new filter) if UI depends on legacy strings. |

**Operational rollback:** keep audit failures **non-blocking** (today’s pattern) until explicit policy requires hard-fail on audit loss.

---

## 5. Migration risks

| Risk | Mitigation |
|------|------------|
| **Postgres enum add** | Use `ADD VALUE` migrations; deploy code **after** migration in same release train. |
| **Semantic relabeling** | OB `REOPEN_PERIOD` → new meaning: old rows remain; document **cutover date** in catalog appendix. |
| **Volume** | Posting + per-line audit is noisy; log **session-level POST** once, not per ledger line (matches movement pattern). |

---

## 6. Legacy handling strategy

- **Legacy stock count:** mirror **minimal** event set (`SUBMIT`, `COUNT_APPROVE`/`COUNT_REJECT`, `POST`) only if product keeps routes; else document **“audit only on canonical path”** until sunset (`LEGACY_STOCK_COUNT_SUNSET_PLAN.md`).  
- **Dual `referenceType` on ledger:** still **out of scope**; audit **`note`** may cite `COUNT_SESSION` vs `STOCK_COUNT` for human readers only.

---

## 7. Smoke requirements (backend)

| # | Test | Method |
|---|------|--------|
| S0 | **Static enum contract** | `node scripts/smoke-audit-phase-a.js` **and** `node scripts/smoke-audit-phase-c-static.js` (no DB) |
| S0b | **Store transfer audit actions** | `node scripts/smoke-transfer-audit-static.js` |
| S1 | Cancel inventory draft → **one** `AuditLog` row with valid `action` | Script or integration test with disposable session |
| S2 | OB enable → **not** `REOPEN_PERIOD` (or excluded by `note` contract) | Assert on latest row |
| S3 | `postDocument` still writes `MOVEMENT`/`POST` | Regression |
| S4 | Phase C golden path rows (`STOCK_COUNT` / `STOCK_REPORT`) | Fixture tenant / staging (see `AUDIT_PHASE_C_SMOKE_RESULTS.md` §5) |
| S5 | Get Pass: one workflow step persists audit | Staging / fixture |

Until **S1–S2** are automated against a real DB, treat audit UI as **best-effort** for those paths; **S0** covers enum contract on every CI run.

---

## 8. Non-goals (this phase)

- **`referenceType`** unification on **ledger** rows.  
- Dashboards / analytics on audit data.  
- Rewriting approval state machines beyond **adding audit hooks**.  

---

## Related

- `PHASE1_STABILIZATION_CLOSURE.md` — Phase 1 stabilization lock + CI smoke record  
- `GOVERNANCE_INCREMENTAL_HARDENING.md` — note-token adoption, semantic drift, enforcement direction  
- `AUDIT_CONSOLIDATION_ANALYSIS.md`  
- `AUDIT_EVENT_CATALOG.md`  
- `AUDIT_FACADE_PLAN.md` / `AUDIT_FACADE_ANALYSIS.md` / `AUDIT_FACADE_SMOKE_RESULTS.md`  
- `AUDIT_PHASE_A_SMOKE_RESULTS.md`  
- `AUDIT_PHASE_C_SMOKE_RESULTS.md`  
- `INVENTORY_COUNT_REPORTING_SAFETY_ANALYSIS.md`  
- `TRANSFER_AUDIT_ANALYSIS.md`  
- `TRANSFER_AUDIT_PLAN.md`  
- `TRANSFER_AUDIT_SMOKE_RESULTS.md`  
- `LEGACY_STOCK_COUNT_SUNSET_PLAN.md`
