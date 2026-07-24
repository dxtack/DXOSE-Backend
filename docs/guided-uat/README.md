# Guided UAT Review Support

وثائق جلسات المراجعة الموجّهة لـ **Go-Live Readiness & Pilot Stability** فقط — بدون تطوير ميزات أو refactor.

## التسلسل

| # | الموضوع | الملف |
|---|---------|--------|
| 1 | Opening Balance + Posting Engine | [SESSION-01-OPENING-BALANCE-AND-POSTING-ENGINE.md](./SESSION-01-OPENING-BALANCE-AND-POSTING-ENGINE.md) |
| 2 | Stock Balance ↔ Ledger ↔ WAC (non-OB) ↔ OMC | [SESSION-02-STOCK-BALANCE-LEDGER-WAC-OMC.md](./SESSION-02-STOCK-BALANCE-LEDGER-WAC-OMC.md) |
| 3 | Period Close → Stock Reports → Saved Reports → Audit | [SESSION-03-PERIOD-CLOSE-STOCK-REPORTS-AUDIT.md](./SESSION-03-PERIOD-CLOSE-STOCK-REPORTS-AUDIT.md) |

## قواعد المرحلة

- **مسموح:** إصلاح أخطاء حرجة (Critical Bug Fixing) فقط.
- **غير مسموح:** ميزات جديدة، refactor واسع، تغيير سلوك غير مبرر أثناء الـUAT.

## مراجع عامة

- [../full-system-review/OPENING-BALANCE-AND-POSTING.md](../full-system-review/OPENING-BALANCE-AND-POSTING.md)
- [../full-system-review/UAT-OB-CHECKLIST.md](../full-system-review/UAT-OB-CHECKLIST.md)
