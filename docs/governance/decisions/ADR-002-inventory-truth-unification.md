# ADR-002: Single inventory truth — stock-backed finance reports

| Field | Value |
|--------|--------|
| **Status** | Accepted |
| **Date** | 2026-06-12 |
| **Scope** | DX OSE — Finding #26 inventory truth unification |
| **Supersedes** | Implicit multi-truth reporting in `REPORT_TRUTH_CATALOG` v1.0 |
| **Related** | Finding #26, ADR-001, Session-02 UAT, `integrityMonitoring.service.js` |

## Context

Finance and operations require one answer to “what is our inventory on hand today?” Today:

- **Current Stock Balance** reads live `stock_balances`.
- **Inventory Carrying Value Review** replays official ledger from a period snapshot anchor.
- **OMC Closing** uses movement buckets plus stock-balance fallback.

After successful posting (including Inventory Count Policy B), these surfaces can disagree (e.g. reversible Get Pass checkout: `qtyOnHand` unchanged, `GET_PASS_OUT` reduces ledger replay qty).

Finding #26 is an **architectural** finding, not a screen bug. Priority is **correctness and auditability** over preserving legacy report behavior.

## Decision

1. **Authoritative carrying position** for ops and finance reports = `stock_balances` (live) or `period_snapshot` (closed period as-of).
2. **Formula:** `Carrying value = qtyOnHand × wacUnitCost` (or snapshot `closingQty` / `closingValue` / `wacUnitCost`).
3. **Available qty** (operational overlay): `qtyOnHand − qtyBlocked` — not a separate finance truth.
4. **Reversible Get Pass checkout** (TEMPORARY, CATERING, OUTSIDE_CATERING) shall **not** reduce carrying qty/value; custody via `qtyBlocked` + non-valuation ledger rows (`affectsValuation: false` on forward `GET_PASS_OUT` and matching good `RETURN` where stock is unchanged).
5. **Ledger replay** is an **audit / reconciliation** tool (“explain numbers”) — it must **not** publish a competing carrying total without drift warnings.
6. **Historical as-of (Valuation v1):** no `snapshot + movement overlay` for published finance numbers.

| As-of scenario | Truth source |
|----------------|--------------|
| Today (live) | `stock_balances` |
| Closed period end date | `period_snapshot` for that close |
| Non-closed historical date | Nearest closed snapshot on/before date **or** require user to select a closed period — **no movement overlay** |

7. **OMC closing value** (Phase D) shall use the same qty×WAC rule from balances/snapshot, not movement-blended WAC for **closing carrying value**. Movement columns remain explanatory.

## Consequences

- Phased implementation: reconciliation → get-pass posting → valuation source → OMC value → governance docs.
- Historical ledger rows are **not** rewritten silently; reconciliation explains legacy drift.
- Update `REPORT_TRUTH_CATALOG`, `GET_PASS_STATE_MATRIX`, glossary, Session-02 notes.

## Alternatives rejected

| Alternative | Why rejected |
|-------------|--------------|
| Report-only fix (exclude GET_PASS_OUT from replay) | Ledger still contradicts stock; breaks posting pairing narrative |
| New custody movement enum | Schema churn; `affectsValuation: false` pattern exists |
| Snapshot + movement overlay for historical valuation | Reintroduces ledger replay as a competing truth path |
| Make stock follow replay | Inverts posting engine; stock is the operational write target |

## Implementation reference

See `docs/governance/FINDING-26-IMPLEMENTATION-PLAN.md`.
