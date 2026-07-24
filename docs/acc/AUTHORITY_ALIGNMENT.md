# ACC Authority Alignment

**Status:** Phases 0–F complete  
**Constitution:** `src/acc-authority/catalog.constitution.js`  
**Seed:** `scripts/seed-acc-authority-catalog.js`  
**Validate:** `scripts/acc-authority-validate.js`

## Principle

```text
ACC = single authority for tenant scope
Feature → Resource → Permission → Matrix → Runtime
```

## Golden rule (Matrix UI)

Every role sees the **full catalog**. Granted permissions are active; not granted are muted/off — never hidden rows.

## Phases

| Phase | Scope |
|-------|--------|
| 0 | Constitution + taxonomy |
| A | Catalog seed + legacy `permissions` sync |
| B | Frontend routes/guards/constants |
| C | Backend `requirePermission` migration |
| D | Workflow step → permission gates (`workflow-step-permissions.js`, pipeline collectors) |
| E | Validation scripts + drift inventory |
| F | Legacy retirement — constitution matrix, ur_* sole write |

## Phase F (legacy retirement)

- **Matrix SSOT:** `base-role-permissions.js` + `runtime-permission-matrix.js`
- **Runtime:** `ur_*` primary; no `ROLE_OPERATIONAL_PERMISSIONS` union
- **ACC save:** `ur_*` only (`ACC_LEGACY_DUAL_WRITE=true` for rollback)
- **JWT:** `hasPermission` strict when JWT permissions present
- **Validate:** `npm run verify:acc-phase-f`

## Production cutover gates

- Shadow clean
- Runtime clean  
- No role-only tenant APIs
- No catalog gaps
- Validation script PASS

## Platform scope

`PLATFORM` resource (`SUPER_ADMIN_PORTAL_ACCESS`, `PLATFORM_MANAGE`) — Super Admin portal remains role-guarded at route level; permissions exist in catalog for matrix visibility.
