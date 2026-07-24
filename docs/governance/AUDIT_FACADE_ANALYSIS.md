# Audit consolidation — Phase B facade analysis

| Field | Value |
|--------|--------|
| **Scope** | Unified audit **write** contract: validation, logging, optional `tx`, note-token documentation, elimination of raw `prisma.auditLog.create` outside the facade. **Out of scope:** workflow redesign, payload/UX/reporting expansion, `referenceType` normalization, rewriting historical rows. |
| **Goal** | Reduce **audit drift risk** by converging on one physical write path and one failure/validation policy. |

---

## 1. Executive summary (pre–Phase B baseline)

The platform had **three independent write implementations** for the same `AuditLog` table:

| Path | Module | Behavior |
|------|--------|----------|
| **Trail** | `auditTrail.service.js` | `auditLog.create` via `tx \|\| prisma`; catch → structured `logger.error` with `[AuditTrail]` prefix; **no** `ipAddress` / `userAgent`; **no** deep clone of JSON snapshots |
| **M14 service** | `audit.service.js` | `prisma.auditLog.create` only; catch → `logger.error` with different message shape; **deep clone** before/after; **`ipAddress` / `userAgent`** supported; **no** `note` / **no** `tx` |
| **Bypass** | `mapping.service.js` | Raw `prisma.auditLog.create` ×3; no trail/M14 semantics; **`entityId`** sometimes passed as raw UUID object (coercion inconsistent with other writers) |

**Action validation** was implicit (Prisma reject) on trail/M14/mapping — failures were observable only if logging was correct; invalid enum strings produced **silent loss** of audit rows on some historical paths (Phase A addressed several call sites).

**Note tokens** (e.g. `OB_IMPORT_ENABLED`, `GET_PASS_APPROVE_STEP:`, posting markers) were **string literals scattered** across services with no shared export — high drift risk for search and governance.

---

## 2. Duplicate / inconsistent behavior (catalog)

### 2.1 Physical writes

- **Duplicated Prisma calls** in three modules (now consolidated behind `writeAuditLog` in `auditWriter.service.js`).

### 2.2 Validation

- **Before:** No shared pre-write validation; schema was the only guard.
- **After (Phase B minimal):** `writeAuditLog` parses `enum AuditAction` from `prisma/schema.prisma` at runtime; unknown `action` values → **structured log + skip write** (never throw), same non-blocking posture as before for DB errors.

### 2.3 Failure logging

- **Before:** Mixed prefixes (`[AuditTrail]` vs `Audit log write failed:`) and slightly different metadata fields.
- **After:** Single pattern: `[AuditFacade] Audit log write failed` and `[AuditFacade] invalid AuditAction — audit row skipped` with consistent `{ message, code, tenantId, entityType, entityId, action }` (where applicable).

### 2.4 Optional transaction client

- **Before:** Only `logAction` accepted `tx`; `audit.service.log` and mapping always used a non-transactional client.
- **After:** `writeAuditLog({ tx })` is the single implementation; `audit.service.log` and mapping pass `tx: null` (unchanged semantics). Callers that need transactional audit continue to use `logAction` with `tx`.

### 2.5 JSON snapshots

- **Before:** M14 cloned; trail passed references as-is; mapping passed plain objects.
- **After:** **Unified deep clone** in the facade for `beforeValue` / `afterValue` to avoid accidental mutation of shared objects after logging.

### 2.6 Note-token discipline

- **Before:** No shared constants; grep-only governance.
- **After (minimal):** `AuditNoteTokens` exported from `auditWriter.service.js` documents a **starter set** of high-signal substrings. **Not** a full migration of all call sites in Phase B (incremental).

---

## 3. Raw write bypasses

| Location | Status (Phase B) |
|----------|------------------|
| `mapping.service.js` (×3) | **Routed** through `writeAuditLog` |
| `auditTrail.service.js` | **Delegated** to `writeAuditLog` |
| `audit.service.js` (`log`) | **Delegated** to `writeAuditLog` |

**Residual risk:** Any new file could reintroduce `auditLog.create` — mitigated by `npm run smoke:audit-facade` (static scan).

---

## 4. Enforcement gaps (remaining drift)

| Gap | Severity | Mitigation (future) |
|-----|----------|---------------------|
| Call sites still use literal `note` strings not imported from `AuditNoteTokens` | Medium | Incremental refactors per domain; optional CI grep for approved prefixes |
| `EntityType` strings vs ad-hoc `entityType` (e.g. `ItemMapping`, `TenantSetting`) | Low | Document in `AUDIT_EVENT_CATALOG.md`; optional shared `EntityType` extension |
| `mapping.service.js` uses a **local** `PrismaClient` while the facade uses **shared** `database.js` | Medium (pre-existing) | Future: align mapping with shared prisma for connection pooling / tx boundaries |
| Schema parse failure → validation skipped (`isAllowedAuditAction` returns true) | Low | Logged once; rare in deployed layouts |

---

## 5. Cross-references

- Phase 1 inventory: `AUDIT_CONSOLIDATION_ANALYSIS.md`
- Roadmap: `AUDIT_CONSOLIDATION_PLAN.md` (Phase B facade)
- Phase A / C smoke: `AUDIT_PHASE_A_SMOKE_RESULTS.md`, `AUDIT_PHASE_C_SMOKE_RESULTS.md`
