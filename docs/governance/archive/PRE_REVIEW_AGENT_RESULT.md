# PRE-REVIEW AGENT RESULT

| Field | Value |
|--------|--------|
| **Mode** | READ-ONLY / TEST-ONLY |
| **Ran at** | 2026-07-17 (local) |
| **Code changed** | **None** |
| **DB schema changed** | **None** |
| **Product decisions taken** | **None** |
| **UAT hotel provisioned** | **No** — awaiting your explicit approval |

---

## VERDICT

**BLOCKED** (for certifying full matrix: screens / actions / approvals / numbers / new hotel)

**Partial static Go-Live closures:** EX-003 / EX-009 / EX-010 appear **CLOSED in code** (see Phase A).

You may still start a **manual** year-end/visual review if you choose — but this agent **cannot** sign off “كل شاشة / كل موافقة / أرقام = تقارير على فندق جديد” until the skipped live phases run and the unit failures below are classified by you.

---

## What ran vs plan

| Phase | Plan item | Result |
|-------|-----------|--------|
| A | Static gate (governance + EX closures) | **PARTIAL PASS** — see findings |
| B | Unit / approval automated tests | **FAIL** — 333 pass / **6 fail** |
| C | Governance static smokes | **FAIL** — missing doc path mid-suite |
| D | Provision new UAT hotel | **SKIPPED** — no explicit approval this run |
| E | Movements matrix on hotel | **SKIPPED** (depends on D) |
| F | Approvals matrix live (API) | **SKIPPED** (depends on D); unit coverage mixed |
| G | Reports reconcile (numbers) | **SKIPPED** (depends on D) |
| H | UI smoke (Playwright / every screen) | **SKIPPED** — not executed |

---

## Phase A — Static checks (code / docs)

| ID | Check | Status | Evidence |
|----|--------|--------|----------|
| G-01 | Exception Register v2.0 present | **PASS** | `OSE-backend/docs/governance/EXCEPTION_REGISTER.md` |
| G-02 | RELEASE_GATE / ROADMAP / KNOWN_LIMITATIONS / PRODUCTION_GATE | **PASS** | files present under `OSE-backend/docs/governance/` |
| G-03 | BDR-007 + EX-BDR-010 + policy-from-exceptions decisions | **PASS** | under `docs/governance/decisions/` |
| EX-003 | `PeriodClose.status` = enum `PeriodCloseStatus` | **PASS** | `prisma/schema.prisma` enum OPEN/CLOSING/CLOSED |
| EX-009 | Aging value = qty × `wacUnitCost` | **PASS** | `report.service.js` `generateAgingReport` (~1363–1365) |
| EX-010 | Transfer period filter: receivedAt / postedAt only (no transferDate fallback) | **PASS** | `report.service.js` ~1217–1229; `reports.service.js` ~773–780 |
| PC-IC | `OPEN_INVENTORY_COUNT` severity WARNING | **PASS** | `periodCloseGovernance.service.js` ~113–120 |
| BDR-007 | User-facing Cancelled scrub | **WARN** | IC still maps internal `CANCELLED` → filter chip **Voided** (`inventory-count-page`); timeline test still mentions “Cancelled lifecycle” — needs your call if residual OK |
| WAVE | FE concurrencyVersion on Get Pass / IC / Breakage / Transfer | **PASS** (presence) | services/detail components send version |
| WAVE | Get Pass approval unit + timeline | **PASS** | see Phase B |
| LIVE | `uat-constitution-grn-live.js` exists | **PASS** (file present) | **not executed** (live DB / hotel) |
| SMOKE-DOC | `docs/governance/REVERSAL_RECOVERY_GOVERNANCE.md` | **FAIL** | smoke expects `C:\DX OS&E\docs\governance\...` — path missing (Governance tree deleted/moved); file exists under `OSE-backend/docs/governance/` |

---

## Phase B — Automated tests (executed)

### Backend `npm run test:unit`

| Metric | Value |
|--------|--------|
| Total | 339 |
| Pass | 333 |
| Fail | **6** |
| Duration | ~15.1s |

**Failures (no fix applied):**

| F-ID | Test | Symptom |
|------|------|---------|
| **F-001** | `breakage-approval-request.behavior.test.js` (×4) | `TypeError: tx.approvalRequest.findFirst is not a function` inside `createMovementApprovalRequest` (`breakage.service.js`) — test mock incomplete **or** production path expects prisma shape not mocked |
| **F-002** | `acc-workflow-movement.runtime.test.js` (×2) | actual `PENDING_DEPT` vs expected `DEPT_REVIEW` — status key drift vs test oracle |

**Notable passes (approvals-related):**

- Get Pass service tests: **23/23** (reject / sendBack / resubmit / force-close / returns)
- Timeline builders (Breakage/Lost/Get Pass/GRN/IC): **all pass** in suite
- Workflow send-back / concurrency conflict paths: **pass**
- Posting idempotency (`postingIdempotency.test.js`): **5/5**
- Workflow step permission FE/BE parity: **6/6**

### `npm run smoke:governance-static`

| Status | Detail |
|--------|--------|
| **FAIL** | Early smokes OK (audit facade, transfer audit, IC unification, valuation governance). Crashed on `smoke-reversal-governance-static.js` → ENOENT `C:\DX OS&E\docs\governance\REVERSAL_RECOVERY_GOVERNANCE.md` |

---

## Phases D–H — SKIPPED (awaiting you)

| Item | Why skipped |
|------|-------------|
| New hotel provision | Binding rule: only if you already approved. This message authorized TEST-ONLY; **no clear “نعم أنشئ فندق UAT في DB”**. |
| All live movements | Needs hotel + running API + credentials |
| Live approvals on every button | Needs D + E |
| Report number reconcile | Needs posted docs on isolated tenant |
| UI smoke every screen | Not run (Playwright matrix not invoked) |

### NEEDS_YOUR_DECISION

1. **Approve UAT hotel provision?** (`yes` / `no`) — DB write of new tenant + users + master data (not schema). Prefer leave hotel after run for your manual review? (`leave` / `delete`)
2. **Treat F-001 / F-002 as blockers before sale**, or classify as test-harness debt first?
3. **Reversal smoke path** — restore/move doc vs change smoke path? (**no change until you decide**)
4. After hotel approval: run `uat-constitution-grn-live.js` + full module matrix + reports reconcile?

---

## Out of scope (not scored as defects)

Per `KNOWN_LIMITATIONS_PRE_SALE.md` / Exception Register v2.0:

- EX-001, EX-002, EX-005, EX-011, EX-012  
- Get Pass Logistics  
- WCAG full / SharedLookup incomplete  
- BDR-010 platform-wide  

---

## Stop

```text
No code was changed.
No governance decisions were taken.
Awaiting your instructions.
```

**Next (only after you reply):** e.g.  
`موافق: أنشئ فندق UAT واتركه + شغّل مصفوفة الحركات/الموافقات/التقارير`  
أو  
`صنّف F-001/F-002 أولاً بدون فندق`  
أو  
`أصلح فقط: …`
