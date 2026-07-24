# ACC Authority — Legacy Retirement (Phase F)



**Status:** Complete — ACC is sole tenant authority; legacy bridges opt-in only



## Retired in Phase F



| Legacy pattern | Replacement |

|----------------|-------------|

| `authorize(roles)` on tenant operational routes | `requirePermission` / `requireAnyPermission` |

| Duplicate `PERMISSIONS` block in `authorize.js` | `acc-authority/runtime-permission-matrix.js` (from constitution grants) |

| `mergeWithOperationalMatrix` runtime union | `ur_*` → `role_permissions` fallback only; no `ROLE_OPERATIONAL_PERMISSIONS` union |

| `role_permissions` dual-write on ACC save | `ur_*` sole write; set `ACC_LEGACY_DUAL_WRITE=true` for rollback sync |

| `DEPT_MANAGER_STRIPPED_PERMISSIONS` runtime-only | Expressed in `base-role-permissions.js` grants (stripped codes never seeded) |

| Workflow collector role-only gates | `workflow-step-permissions.js` + JWT permission checks |



## Rollback switches



| Env | Default | Purpose |

|-----|---------|---------|

| `ACC_HARD_CUTOVER=false` | — | Legacy-only posture (emergency) |

| `ACC_LEGACY_DUAL_WRITE=true` | false | Re-enable `role_permissions` sync on matrix save |

| `ACC_PERMISSION_DRIFT_SAFE_FALLBACK=true` | true | Legacy wins when ACC ≠ legacy under enforce |

| `ENABLE_UR_SHADOW_MODE=true` | false | Drift monitoring (non-blocking) |



## Verification



```bash

npm run verify:acc-authority

npm run verify:acc-phase-f

node scripts/smoke-workflow-pipeline-filters.js

```



## Production cutover checklist



```text

☑ npm run verify:acc-authority → PASS

☑ npm run verify:acc-phase-f → PASS

☐ npm run seed:acc-authority on target DB

☐ Shadow mismatches = 0 (ENABLE_UR_SHADOW_MODE=true, monitor)

☐ ACC_PERMISSION_DRIFT_SAFE_FALLBACK=false after pilot sign-off

☐ Full pilot sign-off

```



`authorize()` middleware remains for **Super Admin portal** platform routes only.

