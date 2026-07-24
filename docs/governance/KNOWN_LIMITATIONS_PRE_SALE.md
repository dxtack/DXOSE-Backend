# Known Limitations — Pre-sale / Go-Live (2026-07-17)

Aligned with **Exception Register v2.0** + Release Gate.

| ID / Item | Status for this delivery |
|-----------|---------------------------|
| Active exceptions EX-001, EX-002, EX-005, EX-011, EX-012 | See `EXCEPTION_REGISTER.md` §1 |
| EX-003 PeriodClose enum | **CLOSED** |
| EX-009 Aging WAC | **CLOSED** (go-live batch) |
| EX-010 Transfer date fallback | **CLOSED** (go-live batch) |
| BDR-007 Voided only | **Closed Decision** |
| BDR-010 / v2.1 platform-wide | **Exception EX-012** — out of release |
| Get Pass Logistics | **Out of Scope** |
| PC-IC open count vs period close | **Warning** unless Ch.6 mandates blocker |
| Production / Release Gate | **Pending Ops** — `RELEASE_GATE.md` / `PRODUCTION_GATE_RUNBOOK.md` |

## Reviewers should score

- Waves 1–7 behavior in scope
- EX-009 / EX-010 fixed valuation & transfer dating
- Year / Excel / PDF on **Posted** data

## Reviewers should not score as defects

- EX-012 continuity platform-wide
- Get Pass Logistics
- WCAG full program
- SharedLookup incomplete rollout
