# DX OSE — Exception Register (Final, Ratified)

| Field | Value |
|--------|--------|
| **Version** | 2.0 — Final |
| **Ratified** | 2026-07-17 |
| **Purpose** | **Real constitution deviations only.** Operating rules → Constitution policy. Delivery prerequisites → Release Gate. Deferred work → Roadmap. |
| **Supersedes** | Exception Register v1.x (EX-001–EX-012 mixed with policy/ops items) |

**Related:** `RELEASE_GATE.md`, `ROADMAP_DEFERRED.md`, `decisions/CONSTITUTION_POLICY_FROM_EXCEPTIONS.md`, `KNOWN_LIMITATIONS_PRE_SALE.md`

---

## Decision symbols

| Symbol | Meaning |
|--------|---------|
| **أبقِ** | Accepted for this delivery |
| **أغلق** | Must be fixed before Go-Live / sale claim |
| **حوّل لسياسة** | Not an exception — write into Constitution as adopted behavior |
| **أجّل** | After Production Gate or a later program |

---

## 1. Active exceptions (deferred or retained)

| ID | Item | Final decision | Note | Status |
|----|------|----------------|------|--------|
| **EX-001** | Dual inventory-count API surfaces (Legacy) | **أجّل** | Legacy mutations blocked with 403; sunset after Production Gate | Open — deferred |
| **EX-002** | Shared `MovementStatus` for count + movement | **أبقِ** | Internal design debt, not a user bug; split enums later | Open — retained |
| **EX-005** | Dual audit write paths | **أجّل** | Consolidation after Gate; no year-end review blocker | Open — deferred |
| **EX-011** | “Asset verification” naming | **أجّل** | Naming only; not urgent | Open — deferred |
| **EX-012** | BDR-010 / Amendment v2.1 (platform draft continuity) | **أبقِ** | Out of current release; separate program later. Detail: `decisions/EX-BDR-010-DELIVERY-OUT-OF-SCOPE.md` | Open — retained |

---

## 2. Converted to Constitution policy (removed from exception list)

| Former ID | Item | Final decision | Note |
|-----------|------|----------------|------|
| ~~EX-004~~ | Different posting trigger verbs per module | **حوّل لسياسة** | Adopt in Ch.2 / Ch.5 as business behavior |
| ~~EX-006~~ | Approval without guaranteed posting | **حوّل لسياسة** | Document type→post matrix first; orphan types = separate bugs |
| ~~EX-007~~ | Breakage / Lost parity | **حوّل لسياسة** | Intentional differences documented; unintentional = bug |
| ~~EX-008~~ | Get Pass distributed ledger effects | **حوّل لسياسة** | With state × ledger-effect matrix |

See: `decisions/CONSTITUTION_POLICY_FROM_EXCEPTIONS.md`

---

## 3. Must close before Go-Live

| ID | Item | Final decision | Note | Closure status |
|----|------|----------------|------|----------------|
| **EX-003** | `PeriodClose.status` free text | **أغلق (P1)** | Prisma enum `PeriodCloseStatus` (`OPEN`/`CLOSING`/`CLOSED`) via migration `20260706200000_ch6_period_management`; schema field is enum | **CLOSED** (schema + migration) |
| **EX-009** | Aging report value ≠ WAC | **أغلق قبل الإنتاج** | Align aging `value` to stock WAC (`wacUnitCost`) | **CLOSED** (`report.service.js` generateAgingReport) |
| **EX-010** | Transfers report `transferDate` fallback | **أغلق قبل الإنتاج** | Period filter uses receive/post stamp only | **CLOSED** (`report.service.js`, `reports.service.js`, `report-workspace.handlers.js`) |

---

## 4. Removed from this register (classified elsewhere)

| Item | Correct classification |
|------|------------------------|
| BDR-007 (Cancelled vs Voided) | **Closed Decision** — `decisions/BDR-007-VOID-ONLY.md` (Option A) |
| Production Gate | **Release Gate** — `RELEASE_GATE.md` |
| Get Pass Logistics | **Out of Scope** for this release — `ROADMAP_DEFERRED.md` |
| SharedLookup partial | **Roadmap / Progressive Rollout** — `ROADMAP_DEFERRED.md` |
| WCAG full | **Future / Contract Scope** — `ROADMAP_DEFERRED.md` |

---

## 5. Conditional (depends on Constitution Ch.6 text)

| ID | Item | Decision | Condition |
|----|------|----------|-----------|
| **PC-IC** | Open inventory count during period close | **Warning (default)** / Blocker if Ch.6 mandates | If Ch.6 explicitly requires block → close as Blocker. If no such text → keep Warning (current code). |

Current implementation: `OPEN_INVENTORY_COUNT` severity **WARNING** in `periodCloseGovernance.service.js` (aligned with pre-sale Decision 6).

---

## Summary index (active exceptions only)

| ID | Short title | Decision |
|----|-------------|----------|
| EX-001 | Dual stock-count APIs | أجّل |
| EX-002 | Overloaded MovementStatus | أبقِ |
| EX-005 | Dual audit helpers | أجّل |
| EX-011 | Asset verification naming | أجّل |
| EX-012 | BDR-010 / v2.1 out of release | أبقِ |

---

## Version history

| Version | Date | Notes |
|---------|------|------|
| 2.0 | 2026-07-17 | Final ratified register: policy / gate / roadmap separated; EX-003 closed; EX-009/010 go-live closure batch |
| 1.2 | 2026-07-17 | EX-012 added; BDR-007 noted closed |
| 1.1 | 2026-06-26 | §29.4 fields |
| 1.0 | 2026-05-14 | Initial register |
