# Guided UAT — Session 01: Opening Balance + Posting Engine

**Phase:** Guided UAT Review Support (no new features / no refactor)  
**Scope:** Stability, Financial Accuracy, Business Logic, Posting Integrity, Edge Cases, Operational Readiness  
**Prerequisites:** Tenant test data, master data (locations, items with **BASE** unit), authenticated users (ADMIN + STOREKEEPER as needed).

**Sources of truth (code):**

- `OSE-backend/src/services/setting.service.js` — OB state, enable, finalize, snapshot
- `OSE-backend/src/services/posting.service.js` — `postDocument`, OB branch, **auto-lock after non-OB post**
- `OSE-backend/src/services/periodGuard.service.js` — period lock, `checkOBAllowed`, operational gate
- `OSE-backend/src/controllers/setting.controller.js` — lock/enable reasons, permissions
- `OSE-backend/src/routes/setting.routes.js`, `movement.routes.js`, `inventory.routes.js`

---

## 1. Executive summary for facilitators

| Topic | What to validate |
|--------|------------------|
| **OB phase** | Tenant can only load OB while `allowOpeningBalance` is effectively **OPEN** (see §4). |
| **Posting** | All stock mutations for standard movements go through `postDocument` in one DB transaction with paired **Ledger + StockBalance** updates. |
| **OB vs WAC** | OB **sets** target qty and **sets** `wacUnitCost` to line unit cost (not the same formula as RECEIVE). |
| **Critical sequencing** | **Any posted non-OB movement auto-locks OB** — team must agree this is acceptable for Pilot (§6.4). |
| **Finalize** | `ob-finalize` posts all **DRAFT** OB documents, then locks + snapshot — separate from implicit auto-lock. |

---

## 2. End-to-end flow (step by step)

### Phase A — Open OB window (administrative)

1. **Check status:** `GET /api/settings/inventory-status` (or UI equivalent).  
   - Understand: `obStatus` ∈ `OPEN` | `FINALIZED` | `INITIAL_LOCK` (`setting.service.js` `getObStatus`).
2. **Enable OB (if permitted):**  
   - `POST /api/settings/ob-enable` with reason, **or**  
   - `PATCH /api/inventory/status` with `{ "isOpeningBalanceAllowed": true, "reason": "..." }` (ADMIN/ORG_MANAGER/SUPER_ADMIN per controller).  
   - Effect: `allowOpeningBalance` = `OPEN`, `isOpeningBalanceAllowed` aligned, snapshot cleared (`enableOpeningBalanceStage`).  
   - **Blocked** if finalized snapshot exists → `OB_ALREADY_FINALIZED`.
3. **Manual lock (optional):** `POST /api/settings/ob-lock` with **mandatory** `reason` → `LOCKED` + `isOpeningBalanceAllowed` false.

### Phase B — Capture OB in system (operational)

4. Create **MovementDocument** `movementType = OPENING_BALANCE`, `status = DRAFT`, lines per **item + location**, with **qty** and **unitCost > 0** (UI: Movements form).
5. **Do not** post any **non-OB** movement yet if the plan is to finish OB first — see §6.4.

### Phase C — Post OB lines (posting engine)

6. For each OB document (or batch): `POST /api/movements/:id/post`.  
   Inside `postDocument`:
   - Reject if not `DRAFT`, empty lines, or wrong tenant.
   - `checkPeriodLock(tenantId, documentDate)`.
   - For OB only: `checkOBAllowed` → fails if `allowOpeningBalance === 'LOCKED'` (`OB_LOCKED`).
   - **Zero cost guard:** any line with `unitCost` not &gt; 0 → `OB_ZERO_COST`.
   - Transaction: for each line, OB branch (§3.3) updates **ledger delta** + **stock upsert** to **target** qty and **WAC = line cost**.
   - Document → `POSTED`, `postedAt` set; audit `POST` on movement (outside inner tx for failure isolation).

### Phase D — Close OB phase (choose one strategy — both exist in code)

7a. **Explicit finalize (recommended for UAT sign-off):**  
   `POST /api/settings/ob-finalize` (SUPER_ADMIN / ADMIN).  
   - Validates items exist, draft OB lines with qty &gt; 0, costs, BASE units.  
   - In one transaction: posts **every** DRAFT OB document via `postDocument`, then sets `LOCKED`, snapshot JSON, audit `FINALIZE_OB`.

7b. **Implicit lock via operations:**  
   As soon as **any** non-OB document is posted, `postDocument` **upserts** `allowOpeningBalance` to `LOCKED` with reason referencing that document (`posting.service.js` § auto-lock).  
   - After that, **further OB posts** fail `checkOBAllowed` unless settings are reopened (and not blocked by finalize snapshot).

---

## 3. Technical deep dive

### 3.1 Database impact (per successful OB post)

| Object | Action |
|--------|--------|
| `movement_documents` | `status` → `POSTED`, `postedAt`, may set `documentNo` |
| `movement_lines` | (unchanged structurally; referenced by ledger) |
| `inventory_ledger` | **Insert** one row per line: OB records **delta** to reach target qty (`qtyIn` or `qtyOut`), `movementType` OPENING_BALANCE, `referenceType` MOVEMENT |
| `stock_balances` | **Upsert**: `qtyOnHand` = target qty, `wacUnitCost` = line unit cost |
| `tenant_settings` | **No change** on OB post alone (unless later non-OB triggers auto-lock) |
| Audit | `auditTrail` `POST` on movement (after commit) |

### 3.2 Posting sequence (single document, conceptual)

```
Validate document → period guard → OB guard (if OB) → BEGIN TX
  For each line:
    if OPENING_BALANCE → delta ledger + upsert stock (target qty, WAC = cost)
    else if increase/decrease/adjustment → other branches
  Update document POSTED + doc number
  If movementType !== OPENING_BALANCE → auto-lock allowOpeningBalance
COMMIT TX
Log audit (non-blocking)
```

### 3.3 WAC recalculation — OB vs normal receipt

| Case | Formula / behavior |
|------|---------------------|
| **OPENING_BALANCE** | **No weighted blend.** Stock row becomes `qtyOnHand = targetQty`, `wacUnitCost = receiveUnitCost` (from line). Ledger stores **delta** from previous on-hand to target. |
| **RECEIVE / TRANSFER_IN / RETURN** (non-OB) | `newWac = (currentQty * currentWac + receiveTotalValue) / (currentQty + qty)`; stock **increments** qty. |

**Financial sensitivity:** OB **overwrites** WAC for that bucket to the entered cost — auditors should treat OB unit cost as **policy valuation** for go-live opening.

### 3.4 Ledger generation (OB)

- For each line: `deltaQty = targetQty - currentQty`.  
- Ledger row: if delta ≥ 0 → `qtyIn = abs(delta)`, else `qtyOut = abs(delta)`; `totalValue = abs(delta) * unitCost`; `balanceAfter = targetQty`.

### 3.5 Lock / unlock behavior (matrix)

| State / action | `allowOpeningBalance` | `isOpeningBalanceAllowed` (string flag) | `obFinalizeSnapshot` | Can post new OB? (`checkOBAllowed`) |
|----------------|----------------------|------------------------------------------|----------------------|-------------------------------------|
| No row | — | — | — | **Yes** (checkOBAllowed returns early) |
| `OPEN` | OPEN | true (after enable) | cleared | **Yes** |
| `LOCKED` (manual or auto or post-finalize) | LOCKED | false | maybe | **No** → `OB_LOCKED` |
| After **finalize** | LOCKED | false | JSON with `finalizedAt` | **No**; reopen blocked → `OB_ALREADY_FINALIZED` if snapshot finalized |

**UI/API eligibility:** `isOpeningBalanceAllowed()` in `setting.service` also returns false for `INITIAL_LOCK` / `FINALIZED` — used to **block GRN/ops** via `assertOperationalTransactionsAllowed` while still in OB phase (see `periodGuard.service.js`).

**Unlock:** `ob-enable` or `PATCH /inventory/status` — requires reason path; **cannot** reopen if finalize snapshot says finalized.

### 3.6 Validation rules (checklist)

| Rule | Where | Error / code |
|------|--------|----------------|
| Document must be DRAFT | `postDocument` | 400 message |
| Non-empty lines | `postDocument` | 400 |
| Period not closed for `documentDate` | `checkPeriodLock` | 422 `PERIOD_LOCKED_*` |
| OB allowed (not LOCKED) | `checkOBAllowed` | 422 `OB_LOCKED` |
| OB every line `unitCost > 0` | `postDocument` | 400 `OB_ZERO_COST` |
| Finalize: tenant has items | `finalizeOpeningBalance` | `OB_FINALIZE_NO_ITEMS` |
| Finalize: draft OB lines with qty &gt; 0 | | `OB_FINALIZE_EMPTY_WAREHOUSE` |
| Finalize: invalid costs / missing BASE unit | | `OB_FINALIZE_VALIDATION_FAILED` |
| Lock OB via API | `lockOB` controller | reason **required** |
| Unlock via PUT setting `allowOpeningBalance=OPEN` | `setSetting` | reason **required** |

### 3.7 Period restrictions

- Any **post** (including OB) calls `checkPeriodLock` on the document date — no posting into **closed month/year** (`PERIOD_LOCKED_MONTHLY`, `PERIOD_LOCKED_ANNUAL`, etc.).

### 3.8 Failure handling

- **Transaction rollback:** any throw inside `transactionWork` rolls back ledger + stock + document status updates for that post attempt.
- **Audit after post:** `logAction` runs **after** successful transaction; failure there does **not** roll back posting (by design — comment in code).
- **Partial finalize:** `finalizeOpeningBalance` uses one transaction; if one `postDocument` throws, entire finalize fails — DB stays consistent, no partial finalize state.

---

## 4. Known risks & financial sensitivities

| ID | Risk | Impact | Mitigation in UAT |
|----|------|--------|-------------------|
| R1 | **Auto-lock on first non-OB post** | Team posts GRN/Receive before OB complete → OB path blocked mid-setup | Train: complete OB **before** any other posting; document rollback procedure (re-enable OB if not finalized) |
| R2 | **OB overwrites WAC** | Opening valuation entirely driven by user-entered unit cost | Dual control on OB sheet; sample reconciliation Stock vs Ledger vs OB file |
| R3 | **`checkOBAllowed` vs `getSetting` default** | `getSetting` returns `LOCKED` when row missing for reads; `checkOBAllowed` allows posting when **no row** | Test **greenfield tenant** vs **tenant with explicit LOCK** |
| R4 | **Movement PUT role names** | `movement.routes.js` uses legacy role strings on PUT | Verify STOREKEEPER/ADMIN can edit drafts in Pilot |
| R5 | **Ops blocked during OB phase** | `assertOperationalTransactionsAllowed` prevents operational txs while OB “allowed” open | Confirm business expectation: no GRN until OB finalized |

---

## 5. Test scenarios (executable)

Use a **dedicated UAT tenant** or snapshot/restore between scenarios where noted.

### Scenario OB-01 — Happy path: enable → draft OB → post → finalize

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | `GET /settings/inventory-status` | Understand current `obStatus` |
| 2 | `POST /settings/ob-enable` + reason | `obStatus` OPEN; snapshot cleared |
| 3 | Create OB DRAFT: Item A, Loc L1, qty 100, unitCost 5 | Saved as DRAFT |
| 4 | `POST /movements/{id}/post` | 200; document POSTED; ledger 1 row qtyIn 100; stock 100 @ 5 |
| 5 | `POST /settings/ob-finalize` | 200; settings LOCKED; snapshot present; no remaining DRAFT OB |
| 6 | `GET /settings/inventory-status` | `FINALIZED` or locked consistent with snapshot |

### Scenario OB-02 — Zero unit cost rejected

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | OB DRAFT line with unitCost 0 or missing | On post: **400** `OB_ZERO_COST` |

### Scenario OB-03 — Period lock blocks OB post

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Close period for document month (`/period-close`) | Success |
| 2 | OB document dated in closed month, post | **422** `PERIOD_LOCKED_*` |

### Scenario OB-04 — Auto-lock after non-OB (critical)

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Enable OB, create OB DRAFT **do not post** | — |
| 2 | Create and post a **RECEIVE** (or any non-OB) movement | Succeeds; `allowOpeningBalance` becomes **LOCKED** (auto) |
| 3 | Attempt post on OB DRAFT | **422** `OB_LOCKED` |

### Scenario OB-05 — Re-post / edit OB while OPEN (delta behavior)

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Stock empty; post OB 100 @ 5 | Ledger +100; stock 100 @ 5 |
| 2 | Re-open OB phase (`ob-enable`) if locked; new OB DRAFT same item/location **150 @ 6**; post | Ledger delta +50; stock **150** @ **6** (overwrite WAC per OB rules) |
| 3 | Reconcile ledger running balance = stock qty | Match |

### Scenario OB-06 — Finalize validation failures

| Step | Action | Expected result |
|------|--------|-----------------|
| A | Finalize with **no items** in tenant | `OB_FINALIZE_NO_ITEMS` |
| B | Finalize with OB drafts but **all qty 0** | `OB_FINALIZE_EMPTY_WAREHOUSE` |
| C | Item without BASE unit in OB draft | `OB_FINALIZE_VALIDATION_FAILED` details |

### Scenario OB-07 — Cannot reopen after finalized snapshot

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Complete finalize with snapshot | — |
| 2 | `POST /settings/ob-enable` | **400** `OB_ALREADY_FINALIZED` |

### Scenario OB-08 — Lock with reason (audit)

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | `POST /settings/ob-lock` without body reason | **400** reason required |
| 2 | With reason | 200; audit `LOCK_OB` recorded |

---

## 6. Review agenda (90–120 min session)

| Time | Topic |
|------|--------|
| 0:00 | Objectives: Pilot stability, posting integrity |
| 0:10 | Walkthrough §2 flow on whiteboard |
| 0:25 | Deep dive §3.3–3.4 (WAC + ledger) — **financial accuracy** |
| 0:40 | Live or API: OB-01 + OB-04 (auto-lock) |
| 0:55 | OB-02, OB-03, OB-06 |
| 1:10 | Risks R1–R5 sign-off or “accept with mitigation” |
| 1:20 | Capture defects **critical bug only**; defer features |

---

## 7. Sign-off block

| Question | Yes / No / N/A | Notes |
|----------|----------------|-------|
| OB posting matches expected ledger + stock for sample items? | | |
| Auto-lock after non-OB understood and accepted for Pilot? | | |
| Finalize path tested on realistic item count? | | |
| Period close interaction understood? | | |

**Facilitator:** ______________ **Date:** ______________  

---

## 8. Next session (preview)

After OB sign-off: **Session 02** — Stock Balance ↔ Ledger reconciliation, then WAC on non-OB flows, then OMC reports (per your sequence).
