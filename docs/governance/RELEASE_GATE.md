# Release Gate — Go-Live prerequisites

| Field | Value |
|--------|--------|
| **Ratified** | 2026-07-17 |
| **Purpose** | Delivery / production sign-off checklist — **not** constitution exceptions |
| **Ops runbook** | `PRODUCTION_GATE_RUNBOOK.md` |

---

## A) Code closures before Go-Live (from Exception Register §3)

| ID | Item | Required outcome |
|----|------|------------------|
| **EX-003** | `PeriodClose.status` | Enum `PeriodCloseStatus` in schema + DB (**CLOSED** — migration `20260706200000_ch6_period_management`) |
| **EX-009** | Aging valuation | Aging report `value` uses **WAC** (`stockBalance.wacUnitCost`), not catalog `item.unitPrice` |
| **EX-010** | Transfers period date | Period filter uses **receive/post stamp only** — no `transferDate` fallback when `receivedAt` is null |

---

## B) Production Sign-off (Ops)

```text
backup → prisma migrate status → migrate deploy → prisma generate
  → inspect migration state (zero failed)
  → node scripts/uat-constitution-grn-live.js
```

**Approved** only when: backup done · migrate PASS · generate PASS · UAT PASS · zero failed `_prisma_migrations` rows.

---

## C) Smoke (recommended before Gate)

Per module: Create → Submit → Approve / Send Back / Reject → Post  
(GRN, Transfer, Get Pass, Breakage, Lost, Inventory Count)

---

## D) Year-end / reports review

Score Posted data, Excel/PDF vs screen. Do **not** score EX-012 / Logistics / WCAG as delivery defects.
