# Production Gate Runbook

| Field | Value |
|-------|-------|
| **Purpose** | Ops checklist for Production Sign-off **after** Waves 1–6 (and optional Wave 7) |
| **Reference** | `archive/CONSTITUTION_VALIDATION_REPORT.md` §15 |
| **UAT script** | `OSE-backend/scripts/uat-constitution-grn-live.js` |
| **Rule** | Do **not** run this gate during feature Waves — run on the delivery environment before go-live / sale claim of production readiness |

---

## Preconditions

1. Waves **1–6** complete on the release candidate.
2. Full **DB snapshot / backup** of the target production (or delivery) database.
3. Application processes that lock Prisma engines on Windows stopped if `generate` hits `EPERM`.

---

## Sequence (mandatory order)

```text
backup
  → prisma migrate status
  → (remediate failed / drifted migrations if needed)
  → prisma migrate deploy
  → prisma generate
  → inspect migration state (zero failed / in-progress)
  → UAT: uat-constitution-grn-live.js
```

### Commands

```bash
cd OSE-backend

# 1) Status
npx prisma migrate status
node scripts/inspect-migration-state.js

# 2) Deploy (only after backup)
npx prisma migrate deploy

# 3) Client
npx prisma generate

# 4) Confirm clean migration table
node scripts/inspect-migration-state.js
# Expect: no failed / in-progress rows; schema up to date

# 5) Production / delivery UAT
# Set UAT_TENANT (and auth env as required by the script) to a tenant with master data + role users
node scripts/uat-constitution-grn-live.js
```

If `migrate status` shows historical apply failures matching local remediation patterns, follow §15 of `CONSTITUTION_VALIDATION_REPORT.md` (`migrate resolve --applied` / `--rolled-back` then `deploy`) **only** after backup and inspection.

---

## Acceptance (Sign-off: Approved)

All must be true:

| Check | Pass criteria |
|-------|----------------|
| Backup | Completed and verified recoverable |
| `migrate deploy` | PASS — schema up to date |
| `prisma generate` | PASS |
| Migration inspect | Zero failed / in-progress `_prisma_migrations` rows |
| UAT | `uat-constitution-grn-live.js` PASS on target |

Until then: **Production Sign-off = Blocked**.

---

## Out of this runbook

- Feature development Waves (1–7)
- Inventing new UAT modules beyond the constitution GRN live script unless Product adds them
- Claiming “100% Constitution” — use Known Limitations + Exception Register for sale scope
