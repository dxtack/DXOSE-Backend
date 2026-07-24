# Phase 1 — Protected Behavior Register

Path: `Governance/phase-1-stability/PHASE_1_PROTECTED_BEHAVIOR_REGISTER.md`

| ID | Protected Behavior | Permanent Test | Layer | Product Area | Risk | Current Status | Replaced/Reduced Legacy Script | Explicit Limit |
| -- | ------------------ | -------------- | ----- | ------------ | ---- | -------------- | ------------------------------ | -------------- |
| P1-T01 | Test DB local-only guard (`localhost`/`127.0.0.1`, not product DB name) | `OSE-backend/test/harness/assert-test-database-env.js` (invoked by integration runner + safety Stage 1) | Harness | Test infrastructure | High | GREEN | N/A | Does not validate network firewall rules outside Node process |
| P1-T02 | Exact `ose_inventory_test` database requirement | `assert-test-database-env.js` | Harness | Test infrastructure | High | GREEN | N/A | Does not prove production DATABASE_URL configuration |
| P1-T03 | Explicit bootstrap only (`prisma db push --skip-generate` via `npm run test:integration:bootstrap`) | Safety Stage 1 schema probe; bootstrap script | Harness | Test infrastructure | High | GREEN (SF-004 accepted) | N/A | Not production migration certification (see SF-004) |
| P1-T04 | Integration/E2E cleanup + zero residual markers after full safety run | Per-test cleanup harness + `check-phase-1-residuals.js` (Safety Stage 8) | Harness | Test infrastructure | High | GREEN | Partially reduces ad-hoc verify scripts | Residual checker is read-only; stale rows from aborted runs require manual `purge-phase-1-stale-residuals.js` |
| P1-T05 | Unified fail-fast safety orchestration | `npm run test:safety` → `scripts/run-safety-tests.js` | Harness | Test infrastructure | High | GREEN | Replaces manual multi-command smoke | Does not replace Governance static smokes outside Phase 1 list |
| P1-A01 | ACC permission resolution via property-scoped assignment | `acc-permission-resolution.test.js` | Integration | User Rights / ACC | High | GREEN | Partially supersedes `verify-fy01-p2-runtime.js` | Single disposable fixture; not full catalog seed |
| P1-A02 | Assignment department scope restricts locations | `acc-assignment-department-scope.test.js` | Integration | User Rights / ACC | High | GREEN | Partially supersedes `verify-fy01-p2-runtime.js`, `verify-scope-isolation.js` | ACC assignment path only; not movement module cross-dept proof |
| P1-A03 | JWT `permissionVersion` freshness on sign | `acc-permission-version-stale.test.js` | Integration | User Rights / Auth | High | GREEN | Partially supersedes `smoke-fy01-p2-user-rights.js` | Resolver-level + signed JWT; not every HTTP route |
| P1-A04 | Stale JWT denied (`PERMISSIONS_STALE`) | `acc-permission-version-stale.test.js`, `api-grn-authorization.test.js` Case C | Integration | User Rights / Auth | High | GREEN | Partially supersedes manual stale-token scripts | GRN route stack for HTTP proof; not all modules |
| P1-A05 | Deactivate bumps `permissionVersion` exactly once | `acc-assignment-lifecycle-permission-version.test.js` | Integration | User Rights / Lifecycle | High | GREEN | Partially supersedes `verify-fy01-p2-lifecycle.js` | Product lifecycle service direct call; audit atomicity not guaranteed (SF-007) |
| P1-A06 | Reactivate bumps `permissionVersion` exactly once | `acc-assignment-reactivate-permission-version.test.js` | Integration | User Rights / Lifecycle | High | GREEN | Partially supersedes `verify-fy01-p2-lifecycle.js` | Includes second reactivate idempotency sub-case |
| P1-A07 | Reactivate second call bump zero | `acc-assignment-reactivate-permission-version.test.js` | Integration | User Rights / Lifecycle | High | GREEN | N/A | Does not cover concurrent reactivate races |
| P1-B01 | GRN authorized API request allowed | `api-grn-authorization.test.js` Case A | Integration | GRN / Authorization | High | GREEN | New permanent coverage | Express inject stack only for GRN read route |
| P1-B02 | Missing GRN permission denied (403) | `api-grn-authorization.test.js` Case B | Integration | GRN / Authorization | High | GREEN | New permanent coverage | Does not prove every GRN mutation endpoint |
| P1-B03 | Scope-denied GRN read blocked | `api-grn-authorization.test.js` Case D | Integration | GRN / Authorization | High | GREEN | Partially supersedes scope scripts | Out-of-scope GRN only |
| P1-B04 | Foreign GRN read denied | `tenant-isolation-grn.test.js` Case A | Integration | GRN / Tenant isolation | High | GREEN | New permanent coverage | GRN cross-tenant patterns only; not every module |
| P1-B05 | Foreign GRN absent from list/count | `tenant-isolation-grn.test.js` Case B | Integration | GRN / Tenant isolation | High | GREEN | New permanent coverage | List endpoint characterized; not dashboard widgets |
| P1-B06 | Foreign GRN mutation denied | `tenant-isolation-grn.test.js` Case C | Integration | GRN / Tenant isolation | High | GREEN | New permanent coverage | Reject mutation only |
| P1-B07 | Same-tenant control read succeeds | `tenant-isolation-grn.test.js` Case D | Integration | GRN / Tenant isolation | Medium | GREEN | N/A | Positive control on read only |
| P1-B08 | GRN scoped-list null location regression (HTTP 200) | `api-grn-authorization.test.js` + product fix in collectors | Integration + Product | GRN / Pipeline | High | GREEN (remediated) | Reduces manual UAT repro | Does not prove every module uses identical tenant filters |
| P1-W01 | Posting transaction rollback on ledger failure | `posting.service.test.js` | Unit | Posting | High | GREEN | N/A | Mocked Prisma; not live DB posting |
| P1-W02 | Posting rollback on stock/status failure | `posting.service.test.js` | Unit | Posting | High | GREEN | N/A | Unit-only; no integration posting path |
| P1-W03 | GRN workflow transition contracts | `grn.service.test.js` | Unit | GRN / Workflow | High | GREEN | N/A | Mocked service; not HTTP E2E |
| P1-W04 | Terminal reject timeline (no pending after reject) | `approvalTimeline.builder.test.js`, `grnTimeline.builder.test.js` | Unit | Timeline | Medium | GREEN | N/A | Builder-level; not browser render |
| P1-W05 | No future terminal placeholders after reject | `approvalTimeline.builder.test.js` | Unit | Timeline | Medium | GREEN | N/A | Unit timeline builder only |
| P1-W06 | Get Pass lifecycle behavior (reject/send-back/resubmit/close) | `getPass.service.test.js` | Unit | Get Pass | Medium | GREEN (SF-006 valid behavior) | N/A | Unit mocked; SF-006 documents valid lifecycle semantics |
| P1-F01 | ORG_MANAGER operational permission requires JWT permission | `auth.service.spec.ts` | Unit | Frontend Auth | High | GREEN (SF-002 remediated) | Reduces reliance on role blanket | Client-side only; server still authoritative |
| P1-F02 | SUPER_ADMIN operational permission requires JWT permission | `auth.service.spec.ts` | Unit | Frontend Auth | High | GREEN (SF-002 remediated) | Reduces reliance on role blanket | Super Admin Portal guard preserved separately |
| P1-F03 | Explicit Super Admin Portal guard preserved | `auth.service.spec.ts` (portal paths) | Unit | Frontend Auth | Medium | GREEN | N/A | Does not E2E entire admin portal |
| P1-F04 | Permission route denial | `permission.guard.spec.ts`, `e2e/critical/permission-route-denial.test.js` | Unit + E2E | Frontend Routing | High | GREEN | Partially supersedes `smoke-fy01-p2-user-rights.js` UI path | One denied route scenario |
| P1-F05 | Permission directive action hiding | `has-permission.directive.spec.ts` | Unit | Frontend UI | Medium | GREEN | N/A | Directive unit; not full module screens |
| P1-F06 | GRN Create/Manage action permission alignment | `grn-list.component.ts` + `grn-action-authority.test.js` | Unit + E2E | GRN UI | High | GREEN (remediated) | N/A | List/create visibility; not all GRN detail actions |
| P1-F07 | Tenant switch permission refresh | `e2e/critical/login-tenant-switch.test.js` | E2E | Frontend Auth | High | GREEN | N/A | Dual-tenant fixture; not subscription-expiry edge |
| P1-F08 | Forced API mutation remains denied without permission | `permission-route-denial.test.js` | E2E | Frontend Auth | High | GREEN | N/A | Single denied operational route |

## Static safety invariants (Stage 7)

| Check | Enforced by |
| ----- | ----------- |
| No `--passWithNoTests` in protected runners | `scripts/check-phase-1-safety-static.js` |
| No `.only`/`.skip` in protected test paths | `scripts/check-phase-1-safety-static.js` |
| Integration explicit file list + `--test-concurrency=1` | `scripts/check-phase-1-safety-static.js` |
| `AuthService.hasPermission` has no ORG_MANAGER/SUPER_ADMIN blanket bypass | `scripts/check-phase-1-safety-static.js` |
| `role-permission-fallback.ts` present (Batch 3 unchanged) | `scripts/check-phase-1-safety-static.js` |

See also: [PHASE_1_LEGACY_SCRIPT_TRACEABILITY.md](./PHASE_1_LEGACY_SCRIPT_TRACEABILITY.md)
