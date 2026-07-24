# BDR-007 — Void vs Cancelled (user-facing lifecycle)

| Field | Value |
|-------|-------|
| **Status** | **Ratified — Option A (Voided only)** |
| **Date** | 2026-07-17 |
| **Decision owners** | Product Governance (pre-sale closure Waves) |
| **Constitution** | Ch.2.2 — a separate user-facing state named Cancelled shall not be introduced unless ratified |
| **Related** | `constitution-lifecycle.util.ts`; `lifecyclePresentation.service.js`; Wave 1 + Wave 6 scrub |

---

## Decision

**Option A — Voided only.**

- Internal enums may remain `VOID` / `CANCELLED` where the schema historically used them.
- User-facing lifecycle, badges, filters, and timeline labels SHALL resolve to **Voided** (`COMMON.LIFECYCLE.VOID` / equivalent).
- No separate user-facing state named **Cancelled** is shipped.

**Option B** (Cancelled as an official user-facing state) is **not** adopted for this delivery.

---

## Delivery evidence

| Surface | Treatment |
|---------|-----------|
| Lifecycle maps | `CANCELLED` / `VOID` → `Voided` |
| Movement register filter | Display key `VOIDED` (maps API `VOID`) |
| Inventory Count status i18n | `CANCELLED` / `VOID` labels → Voided |
| Timeline | `TIMELINE.LIFECYCLE.CANCEL` → Voided |
| Void action copy | Void / إبطال (not Cancelled-state language) |

---

## Matrix closure

Traceability row Ch.2.2 (BDR-007): **Closed — Option A**. No open exception for introducing Cancelled as a user-facing state.
