# Audit consolidation — Phase B facade plan

## 1. Objective

Establish a **unified enterprise audit-writing contract** without big-bang rewrites: **adapter/facade stabilization** first, optional incremental adoption of shared constants and stricter governance later.

---

## 2. Principles (non-negotiables)

- **No** workflow, UX, dashboard, analytics, or reporting product expansion under this phase.
- **No** global payload redesign; **no** `referenceType` normalization; **no** rewriting historical `audit_log` rows.
- **Incremental** consolidation: one physical write module; existing public APIs (`logAction`, `audit.service.log`) remain stable for callers.

---

## 3. Delivered in Phase B (initial slice)

| Item | Detail |
|------|--------|
| **Facade module** | `OSE-backend/src/services/auditWriter.service.js` — `writeAuditLog`, `isAllowedAuditAction`, `loadAuditActionSetFromSchema`, `AuditNoteTokens` |
| **Trail** | `auditTrail.service.js` → delegates to `writeAuditLog` |
| **M14** | `audit.service.js` `log` → delegates to `writeAuditLog` |
| **Mapping bypass** | `mapping.service.js` → `writeAuditLog` (removes raw `prisma.auditLog.create`) |
| **Static guard** | `npm run smoke:audit-facade` — fails if `auditLog.create` appears outside `auditWriter.service.js` |

---

## 4. Follow-on (post–Phase B, still incremental)

1. **Note tokens:** Migrate high-churn domains (posting, transfer, get-pass, OB) to import `AuditNoteTokens` (or a dedicated `auditNotes.js` if the export surface grows).
2. **Entity types:** Optionally align `ItemMapping` / `UomMapping` / `VendorMapping` with a documented enum or `EntityType` extension — **only** if product agrees on naming stability.
3. **Prisma client singleton:** Point `mapping.service.js` at `../config/database` so transactional boundaries can include mapping + audit in one client if ever required.
4. **Governance enforcement:** CI job chaining `smoke:audit-facade` + existing Phase A/C static smokes; optional ESLint custom rule banning `auditLog.create` outside facade.
5. **Stricter note validation:** Opt-in helper `assertNoteContains(token)` in non-production or behind a feature flag — **not** default in Phase B to avoid breaking legitimate free-text notes.

---

## 5. Rollback

Revert commits that introduce `auditWriter.service.js` and restore inline `auditLog.create` in `auditTrail.service.js`, `audit.service.js`, and `mapping.service.js`. Remove `smoke:audit-facade` script if rolling back entirely. No database migration is required for Phase B.

---

## 6. Success criteria

- Exactly **one** `auditLog.create` implementation in application `src/` (inside the facade).
- **Consistent** error logging prefix and metadata for write failures and invalid actions.
- **Documented** note-token starter set and analysis of remaining drift (`AUDIT_FACADE_ANALYSIS.md`, `AUDIT_FACADE_SMOKE_RESULTS.md`).
