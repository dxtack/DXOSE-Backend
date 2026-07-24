# Audit facade — smoke results (Phase B)

| Field | Value |
|--------|--------|
| **Date** | 2026-05-14 |
| **Command** | `npm run smoke:audit-facade` (from `OSE-backend/`) |
| **Script** | `OSE-backend/scripts/smoke-audit-facade-static.js` |

---

## 1. Static smoke (raw write migration)

**Purpose:** Ensure no `auditLog.create(` remains in `src/**/*.js` except `auditWriter.service.js`.

**Last run output:**

```json
{"pass":true,"auditActionCount":17,"message":"all writes routed through auditWriter facade"}
```

**Interpretation:** `AuditAction` enum block parses to **17** members; **zero** offending files outside the facade.

---

## 2. Module load sanity

**Command:** `node -e "require('./src/services/auditTrail.service'); require('./src/services/audit.service'); require('./src/services/mapping.service');"`

**Result:** `require ok` (no circular dependency or syntax error at load time).

---

## 3. Action validation behavior

| Aspect | Expected behavior |
|--------|-------------------|
| **Source of truth** | `prisma/schema.prisma` `enum AuditAction` parsed at runtime into a `Set` |
| **Invalid `action`** | `[AuditFacade] invalid AuditAction — audit row skipped` with `{ action, tenantId, entityType, entityId }`; **no** row inserted; **no** throw |
| **Schema unreadable** | Logged error; validation effectively **skipped** (writes still attempted — Prisma remains last line of defense) |

---

## 4. Transaction (`tx`) behavior

| Caller | `tx` passed to facade |
|--------|------------------------|
| `logAction({ tx })` | Yes — uses transaction client when provided, else shared `prisma` |
| `audit.service.log` | Always `null` (unchanged — reads/queries outside tx still use shared client) |
| `mapping.service` upserts | Always `null` (unchanged) |

---

## 5. Error logging behavior

| Event | Log shape |
|-------|-----------|
| **Prisma create failure** | `[AuditFacade] Audit log write failed` + `{ message, code, tenantId, entityType, entityId, action }` |
| **Invalid action** | `[AuditFacade] invalid AuditAction — audit row skipped` + context fields |

**Note:** Prior `[AuditTrail]` and free-form `Audit log write failed:` strings are **replaced** for writes that go through the facade (all standard app writes after Phase B slice).

---

## 6. JSON snapshot behavior

| Before Phase B | After |
|----------------|-------|
| Mixed clone / no-clone | **Always** `JSON.parse(JSON.stringify(...))` when `beforeValue` / `afterValue` is non-null |

---

## 7. Note-token enforcement

| Check | Status |
|-------|--------|
| **Runtime enforcement** | **Not** enabled in Phase B (documentation + `AuditNoteTokens` export only) |
| **Drift risk** | Call sites may still use literals; incremental migration recommended |

---

## 8. Rollback notes

1. Delete or stop using `auditWriter.service.js`.
2. Restore `prisma.auditLog.create` (or prior try/catch blocks) in `auditTrail.service.js`, `audit.service.js`, and `mapping.service.js`.
3. Remove `smoke:audit-facade` from `package.json` if desired.
4. **No** database migration to revert.

---

## 9. Remaining drift risks

- **Dual Prisma clients:** `mapping.service.js` still instantiates its own `PrismaClient`; facade uses `config/database.js` — connection and transaction boundaries may diverge.
- **Note literals:** Most `note` strings unchanged; only a small **documented** token set is exported for reuse.
- **New bypasses:** Developers could add `auditLog.create` in new files — mitigated by running `smoke:audit-facade` in CI.
- **EntityId type:** Facade normalizes with `String(entityId)`; callers should still pass stable string identifiers.

---

## 10. Optional follow-up smokes

Existing scripts remain relevant for **enum usage** vs **schema**:

- `node scripts/smoke-audit-phase-a.js`
- `node scripts/smoke-audit-phase-c-static.js`
- `node scripts/smoke-transfer-audit-static.js`
