# Guided UAT — Session 03: Period Close → Stock Reports → Saved Reports → Audit Trail

**Phase:** Guided UAT Review Support (no new features / no refactor)  
**Scope:** Stability, Financial Accuracy, Business Logic Validation, Posting Integrity, Edge Cases, Operational Readiness  
**Prerequisites:** Sessions 01–02 understood; tenant with movements, optional closed period for snapshot tests.

**Sources of truth (code):**

- `OSE-backend/src/services/periodClose.service.js` — close, snapshot, OB auto-lock, reopen
- `OSE-backend/src/routes/periodClose.routes.js` — `POST /close`, `POST /:id/reopen`
- `OSE-backend/src/services/periodGuard.service.js` — what posting is blocked in closed periods
- `OSE-backend/src/services/stockReport.service.js` — live report, export, save, submit, approval, `postStockReport`
- `OSE-backend/src/services/posting.service.js` — `postStockReport` (COUNT_ADJUSTMENT to ledger)
- `OSE-backend/src/services/summaryReport.service.js` + `report.service.js` — OMC / summary use `periodSnapshot` (Session 02)
- `OSE-backend/src/services/auditTrail.service.js` + `audit.service.js` — `audit_log` writers and UI API
- `OSE-backend/src/services/setting.service.js` — `FINALIZE_OB`, `LOCK_OB`, `REOPEN_PERIOD` (settings)

---

## 1. Executive summary for facilitators

| Topic | What to validate |
|--------|------------------|
| **Period close** | Snapshots **all** `stock_balances` rows at close; sets `period_close` to CLOSED; **auto-locks** `allowOpeningBalance`. |
| **After close** | New postings with `documentDate` in a **closed** month/year are **blocked** (`checkPeriodLock`). |
| **Reopen** | `POST /period-close/:id/reopen` — **ADMIN only**; sets period to OPEN, clears `closedAt` / `closedBy` — **snapshots are not automatically deleted** (see risks). |
| **Live stock report** | `GET /stock-report` = **point-in-time** book + opening from **last close snapshot or ledger**; not a stored document. |
| **Saved stock report** | Immutable **snapshot of numbers at save** in `saved_stock_reports` + lines; **POSTED** only after Finance approves → `postStockReport` posts **COUNT_ADJUSTMENT** per location variance. |
| **Audit** | `auditTrail` logs **movement POST**, **settings (OB)**, **reopen** (if userId passed); **period close** and **stock report save/approve** are **not** clearly written to `audit_log` in the services reviewed — see §4. |

---

## 2. Period close logic

### 2.1 Close month vs year

- **API:** `POST /api/period-close/close` with body `{ year, month?, notes? }`  
- **Auth:** `ADMIN`, `FINANCE_MANAGER` (`periodClose.routes.js`).  
- **Unique key:** `(tenantId, year, month)` where `month` is `null` for **annual** close or `1–12` for **monthly** (`periodClose.service.js`).

### 2.2 What happens on close (transaction)

1. **Upsert** `period_closes` row: `status = CLOSED`, `closedAt`, `closedBy`, `notes`.  
2. **Delete** previous `period_snapshots` for that period if re-closing the same period.  
3. **Create** `period_snapshot` for **every** current `stock_balances` row: `closingQty`, `closingValue = qty × wac`, `wacUnitCost`.  
4. **Auto-lock OB:** `tenant_settings.allowOpeningBalance` = `LOCKED` with reason referencing period close.

### 2.3 What is blocked after closing

- **Posting** (`postDocument`, `postStockCount`, `postInventoryCountSession`, `postStockReport`) calls `checkPeriodLock` — **no** transaction dated inside a **closed** month (or year if annual close exists) — errors `PERIOD_LOCKED_MONTHLY`, `PERIOD_LOCKED_ANNUAL`, `PERIOD_LOCKED_PREV_YEAR` as applicable (`periodGuard.service.js`). **Stock count sessions** (both legacy `postStockCount` and canonical `postInventoryCountSession`) pass **`countDate` (fallback `createdAt`)** as the guard date so period discipline matches the **count month**, not wall-clock post time.

### 2.4 What remains allowed

- **Read** APIs: stock list, ledger, reports, `GET /period-close`, saved report **read** by id.  
- **Create** new movements dated in an **open** period (e.g. current month if not closed).  
- **Administrative** reopen if policy allows (below).

### 2.5 Reopen behavior

- **API:** `POST /api/period-close/:id/reopen` — **`authorize('ADMIN')`** only.  
- **Effect:** `period_close.status` → `OPEN`, `closedAt` / `closedBy` → null.  
- **Snapshots:** **Not** removed by reopen in current code — rows in `period_snapshots` may still exist for that `periodCloseId`; reporting logic must prefer **latest closed** period semantics — **UAT risk** (§6).

### 2.6 Snapshot impact & relationship with OMC opening

- **Summary Inventory / Stock Report opening:** Prefer **`period_snapshot`** from **prior** close (year-end Dec or `month: null`) when building opening qty for a fiscal year (`stockReport.service.js`, `summaryReport.service.js`).  
- **OMC Engine (`generateOMCReport`):** Uses **best** `period_close` with `closedAt < reportStart` and snapshots for opening qty/value (`report.service.js` Session 02).  
- After a **new** close, the **next** reporting period should pick up those snapshots as opening — verify with SC-02.

---

## 3. Stock reports (live vs saved)

### 3.1 Live report — source & generation

| Endpoint | Purpose |
|----------|---------|
| `GET /api/stock-report` | JSON grid: **requires `departmentId`**; optional `categoryId`, `year`; optional blind count. |

**Data sources (`getStockReport`):**

- **Locations:** department (+ optional category via `location_categories`).  
- **Items:** department (+ optional category).  
- **Close / book qty:** **Current** `stock_balances` per item × location.  
- **Opening:** `period_snapshot` from prior year close OR December monthly OR **ledger fallback** (including OB lines mid-year).  
- **Movements in year:** ledger aggregates RECEIVE, breakage/lost, get pass outstanding, optional physical from latest POSTED stock count sessions.  

→ **Every refresh can change** if inventory moves.

### 3.2 Export (Excel)

- `GET /api/stock-report/export` — same parameters as above; **regenerates** from live logic (`exportToExcel`). Totals should match **same-parameter** JSON run.

### 3.3 Saved stock report — behavior

| Step | Endpoint | Effect |
|------|----------|--------|
| Save draft | `POST /api/stock-report/save` | Creates `saved_stock_reports` (**DRAFT**), `saved_stock_report_lines`, `saved_stock_report_location_qtys`; creates **`approval_requests`** (STOCK_REPORT, Finance step). |
| Submit | `POST /api/stock-report/:id/submit` | Status → **PENDING_APPROVAL**; emails finance (best-effort). |
| Approve | `POST /api/stock-report/:id/approve` | Calls **`postStockReport`** → ledger **COUNT_ADJUSTMENT** per non-zero location variance; status → **POSTED**; auto-lock OB (same pattern as other postings). |
| Reject | `POST /api/stock-report/:id/reject` | Status → **REJECTED**. |

**Frozen snapshot:** Lines store opening/closing/book/count **at save time** — later movements **do not** change saved rows.

### 3.4 Live vs saved (operational distinction)

| Aspect | Live `GET /stock-report` | Saved `saved_stock_reports` |
|--------|--------------------------|------------------------------|
| Mutability | Changes with every movement | Fixed after save |
| Posting | None | On approve: posts adjustments |
| PDF | N/A | `GET /stock-report/saved/:id/pdf` — variance PDF from **saved** payload |

### 3.5 Filters & scope

- **Department** required for live report.  
- **Category** narrows items + locations (with fallback if no location–category link).  
- **Year** drives period boundaries (calendar year default).  
- Saved report ties to one **`locationId`** on header but lines hold **per-location** qtys.

---

## 4. Audit trail

### 4.1 Two writers (awareness)

- **`auditTrail.service` `logAction`** — used by posting (movement POST), settings/OB, reopen **when userId provided**.  
- **`audit.service` `log`** — alternate helper; **audit UI** typically reads **`audit_log`** via `GET /api/audit-log` (`audit.service.getAuditLog`).

### 4.2 What is logged (confirmed in code)

| Event | Mechanism | Entity / action (examples) |
|-------|-----------|------------------------------|
| Movement posted | `posting.service.js` | `EntityType.MOVEMENT`, action **POST** |
| OB finalize / lock settings | `setting.service.js`, controllers | `SETTINGS`, **FINALIZE_OB**, **LOCK_OB**, **REOPEN_PERIOD** (patch inventory) |
| Period reopen | `periodClose.service.js` | `PERIOD_CLOSE`, **REOPEN_PERIOD** — **only if `userId` passed** (see §6) |
| Period **close** | `closePeriod` | **No `logAction` call** in service — gap for UAT expectations |
| Stock report save / approve | `stockReport.service.js` | **No `logAction`** — gap |
| Report generate (engine) | `report.service` / controller | **No audit_log** in paths reviewed — data in **`generated_reports`** only |

### 4.3 Posting audit

- After successful `postDocument`, audit runs **outside** DB transaction (failure does not roll back stock).

---

## 5. Test scenarios with expected results

### SC-01 — Close period blocks posting in closed month

| Step | Action | Expected |
|------|--------|----------|
| 1 | Close month M for year Y via `POST /period-close/close` | 200, `snapshotCount` ≥ 0, `allowOpeningBalance` LOCKED |
| 2 | Post movement with `documentDate` in month M | **422** `PERIOD_LOCKED_MONTHLY` (or related) |

### SC-02 — OMC / summary uses snapshot after close

| Step | Action | Expected |
|------|--------|----------|
| 1 | Note stock for item X; close year or prior month with snapshot | Snapshots capture qty |
| 2 | Run OMC Engine for period **after** close with location including X | **Opening** reflects snapshot (not live guess) when `bestClose` matches |

### SC-03 — Saved report unchanged after later movements

| Step | Action | Expected |
|------|--------|----------|
| 1 | `save` stock report with book qty B | Rows persisted |
| 2 | Post RECEIVE changing live stock | `GET /saved/:id` lines **unchanged** |
| 3 | `GET /stock-report` (live) | Shows new book qty |

### SC-04 — Live stock changes after movement

| Step | Action | Expected |
|------|--------|----------|
| 1 | Record `closeStock`/location totals from live report | T0 |
| 2 | Post ISSUE | Live report totals **decrease** at affected locations |

### SC-05 — Excel export matches live screen/API

| Step | Action | Expected |
|------|--------|----------|
| 1 | `GET /stock-report?...` note totals | Baseline |
| 2 | `GET /stock-report/export?...` | Sum same rows (allow Excel rounding); **same query params** |

### SC-06 — Saved PDF vs saved JSON

| Step | Action | Expected |
|------|--------|----------|
| 1 | `GET /stock-report/saved/:id` | Payload |
| 2 | `GET /stock-report/saved/:id/pdf` | Variance narrative matches saved report record |

### SC-07 — Approve saved report posts ledger

| Step | Action | Expected |
|------|--------|----------|
| 1 | Approve saved report with non-zero variance | `inventory_ledger` rows `COUNT_ADJUSTMENT`, `referenceType` **STOCK_REPORT** |
| 2 | `saved_stock_reports.status` | **POSTED** |

### SC-08 — Backdated posting into closed period blocked

| Step | Action | Expected |
|------|--------|----------|
| 1 | Close period P | OK |
| 2 | Create/post movement dated inside P | **Blocked** by period guard |

### SC-09 — Reopen then post into formerly closed month

| Step | Action | Expected |
|------|--------|----------|
| 1 | Reopen period (ADMIN) | Status OPEN |
| 2 | Post with date in that month | **Should succeed** if guard only checks **closed** rows — **verify** snapshot duplication if user closes again |

### SC-10 — Audit: movement POST appears

| Step | Action | Expected |
|------|--------|----------|
| 1 | Post any movement | `audit_log` row MOVEMENT / POST |
| 2 | Close period | **May have no row** — document as gap if stakeholders require CLOSE_PERIOD audit |

---

## 6. Database impact matrix

| Operation | period_close / period_snapshot | saved_stock_reports* | inventory_ledger | stock_balances | audit_log |
|-----------|-------------------------------|----------------------|-------------------|----------------|-----------|
| Close period | Create/update + snapshot rows | — | — | — (read for snapshot) | **Not logged** in `periodClose.service` |
| Reopen | Update period OPEN | — | — | — | REOPEN_PERIOD **if userId passed** |
| GET live stock report | Read | — | Read | Read | — |
| Save stock report | — | Insert lines + location qtys | — | — | **Not logged** in service |
| Approve stock report | — | Update POSTED | Insert COUNT_ADJUSTMENT | Update qty | — (movement audit only if extended) |

\* Includes `approval_requests`.

---

## 7. Known risks & financial sensitivities

| ID | Risk | Detail |
|----|------|--------|
| R1 | **Saved vs live confusion** | Users compare **old** saved PDF to **today’s** stock screen — expect mismatch. |
| R2 | **Snapshot vs reopen** | Reopen does not delete snapshots — double-close or wrong “opening” if reports pick wrong close — **validate** with finance. |
| R3 | **Backdated movement** | Allowed in **open** periods only; wrong date entry still passes if period open — **process** control. |
| R4 | **Stock report approve uses current WAC** | `postStockReport` **re-fetches** WAC at approve time — variance value may differ from snapshot-at-save if costs moved. |
| R5 | **Excel vs UI** | Export must use **identical** query params; blind export hides columns — totals differ by design. |
| R6 | **Missing audit entries** | Close period, save stock report, engine report generation may lack `audit_log` — compliance gap for Pilot. |
| R7 | **Reopen audit** | Controller calls `reopenPeriod(id, tenantId)` **without** `userId` — `logAction` for reopen **may never run**. |

---

## 8. Review agenda (90–120 min)

| Time | Topic |
|------|--------|
| 0:00 | Link to Session 02 (snapshots ↔ OMC opening) |
| 0:15 | Walk through close → snapshot → guard |
| 0:35 | Live vs saved stock report (§3) |
| 0:55 | SC-01, SC-03, SC-07 |
| 1:10 | Audit expectations vs §4 — agree **critical bug** list only |
| 1:15 | Sign-off |

---

## 9. Sign-off block

| Question | Yes / No / N/A | Notes |
|----------|----------------|-------|
| Closed period guard verified (posting blocked)? | | |
| Snapshot picked up in OMC / stock report opening (sample)? | | |
| Saved report immutable vs live stock demonstrated? | | |
| Audit trail meets minimum compliance (movement + OB)? | | |
| Excel export matches API for same filters? | | |

**Facilitator:** ______________ **Date:** ______________  

---

## 10. Next session (preview)

Optional **Session 04:** GRN / operational gates vs `assertOperationalTransactionsAllowed`, email approvals, or Pilot cutover checklist.
