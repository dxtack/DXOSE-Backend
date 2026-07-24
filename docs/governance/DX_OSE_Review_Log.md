# DX OSE — Review Log

**Purpose:** Deferred / follow-up items from reviews that are intentionally not acted on yet.  
**Rule:** Entries here authorize no schema, data, or migration change until explicitly approved.

---

## 2026-07-23 — Frontend orphan files cleanup COMPLETE (28 + companions; KEEP fallback)

**Status:** Complete.  
**Backup:** `OSE-Frontend/backups/fe_orphan_files_pre_cleanup_20260723.zip`  
**Deleted:** 40 files (28 unused `.ts` + 12 HTML/SCSS companions) under `OSE-Frontend/src/` — dead overview/modals, stock-report page/detail (routes already redirect to inventory-count), unused core registries/services/utils, `movements.service.ts` only.  
**Preserved (critical):** `movement-documents.service.ts` untouched.  
**KEEP:** `OSE-Frontend/src/app/core/constants/role-permission-fallback.ts` — retained as unused fallback catalog, no active references, kept for potential future use.  
**src/:** 645 files / ~3.90 MB → 605 files / ~3.79 MB.

---

## 2026-07-23 — Backend root scripts cleanup COMPLETE

**Status:** Complete.  
**Backup:** `OSE-backend/backups/backend_root_scripts_pre_cleanup_20260723.zip`  
**Deleted:** 34 root one-off `*.js` + `MANIFEST.md`.  
**Moved:** `seed-super-admin.js` → `scripts/seed/seed-super-admin.js` (requires + `package.json` `db:seed:superadmin` / `start:prod` updated).  
**Root JS remaining:** 0.  
**Verified:** `npm run db:seed:superadmin` OK; seed+units chain for `start:prod` OK; `/health` 200.

---

## 2026-07-23 — Backups folder cleanup COMPLETE

**Status:** Complete.  
**KEEP:** `ose_inventory_backup_pre_phase4b_final_tenants_20260723.dump` (sole DB milestone), `phase2_structure_cleanup_pre_20260723_000042.zip`, `phase4_tenant_deletion_20260723.sql`, `phase4b_tenant_deletion_20260723.sql`.  
**DELETED:** `pre_UR_cleanup`, `pre_legacy_batch1`, `pre_legacy_batch2`, `pre_phase4_tenant_deletion` dumps.  
**Folder size:** 59.92 MB → 36.78 MB.

---

## 2026-07-23 — Phase 4b: Delete DX/platform (6), KEEP grand-horizon COMPLETE

**Status:** Complete.  
**Backup:** `OSE-backend/backups/ose_inventory_backup_pre_phase4b_final_tenants_20260723.dump`  
**SQL:** `OSE-backend/backups/phase4b_tenant_deletion_20260723.sql`  
**Deleted:** `dx-hospitality-group`, `dx-marina-hotel`, `dx-grand-palace`, `dx-executive-suites`, `dx-airport-hotel`, `platform` (+ exclusive orphan users).  
**KEEP:** `grand-horizon` — fingerprint verified unchanged (seed + `verify:acc-s*` dependency).  
**Code rescan (6 only):** CLEAN for boot/runtime A; no seed/`verify:acc-s*` dependency on the six.  
**Post-check:** tenants=1 (`grand-horizon`); BE `/health` + FE + login `admin@grandhorizon.com` OK.

---

## 2026-07-23 — Phase 4: Test tenant deletion (31) COMPLETE

**Status:** Complete.  
**Backup (mandatory first):** `OSE-backend/backups/ose_inventory_backup_pre_phase4_tenant_deletion_20260723.dump`  
**SQL:** `OSE-backend/backups/phase4_tenant_deletion_20260723.sql`  
**Deleted:** 31 tenants (named set + child hotels) and dependent RESTRICT/CASCADE data; 255 orphan users (memberships exclusively on those tenants); `docs/governance/e2e-uat-results/` (612 files).  
**Skipped orphans:** 7 candidates still referenced by surviving KEEP rows (`inventory_ledger` / `audit_log` etc.) — left in place to avoid mutating KEEP data.  
**KEEP forever (verified unchanged fingerprints):** `dx-hospitality-group`, `dx-marina-hotel`, `dx-grand-palace`, `dx-executive-suites`, `dx-airport-hotel`, `grand-horizon`, `platform`.  
**Preserved:** global `roles` table (10 global roles, delta 0).  
**Post-check:** BE `/health` 200 on :4000; FE :4200 200; login smoke `admin@grandhorizon.com` OK.

---

## 2026-07-22 — مؤجل لمرحلة 3 - Legacy cleanup: `/lost-found` permission aliases

**Title:** Lost & Found (`/lost-found`) still accepts Lost Items / Breakage permissions as one-way route aliases  
**Status:** **CLOSED — fully retired in Phase 3 Legacy batch 2 (2026-07-23).** Routes/controller/service, FE feature, catalog codes, aliases, and table `lost_found_items` removed. `/lost-items` (inventory write-offs) unchanged and separate.  
**Historical note (pre-retirement):** See migration `20260723120000_drop_lost_found_items` and backup `ose_inventory_backup_pre_legacy_batch2_20260723.dump`.

~~Deferred to **Phase 3 — Legacy cleanup** (code review). **Do not change routes/guards until Phase 3 approval.**~~ **Superseded by retirement below.**

---

## 2026-07-23 — Phase 3 Legacy batch 2: Lost & Found FULL RETIREMENT

**Status:** Complete.  
**Backup:** `OSE-backend/backups/ose_inventory_backup_pre_legacy_batch2_20260723.dump`  
**Removed:** BE `lostFound.*` routes/controller/service; FE `features/lost-found`; catalog resource `LOST_FOUND` + `LOST_FOUND_*` permissions/grants/route map; one-way aliases; Prisma model/enum; DB table via `20260723120000_drop_lost_found_items`.  
**Preserved:** `/lost-items` + `movement_documents` LOST workflow (inventory write-offs) — confirmed separate.  
**Report note:** workspace card `lost-items-register` previously read `lost_found_items`; now returns empty until a LOST-movement report is defined.

---

## 2026-07-22 — Schema drift minor items (deferred) [historical header kept]

**Source audit:** Schema vs live DB (`ose_inventory` @ `127.0.0.1:5433`) after `postingEffectKey` migration was already deployed.  
**Backup taken before audit:** `OSE-backend/backups/ose_inventory_backup_pre_schema_diff_20260722_165830.dump` (later removed in Phase 2 structure cleanup; superseded by `ose_inventory_backup_pre_UR_cleanup_20260722.dump` / Phase 2 zip under `backups/`).  
**Artifacts (historical path):** `OSE-Frontend/tmp-nav-proof/schema-drift/` (`00-FULL-DRIFT-CATALOG.json`, `02-diff-db-to-schema.sql`, `04-actual-from-db.prisma`, `17-structural-compare.json`) — **deleted in Phase 2 (project structure cleanup, 2026-07-22/23)**. Findings and deferral decisions below remain authoritative in this Review Log (and the working conversation); do not expect the temporary proof files on disk.  
**Status:** Deferred — do not apply C–F or H until separately reviewed.  
**Already fixed (out of this deferral):** A (partial GRN unique representation) + B (`audit_log.changedBy` `onDelete: Restrict`) — schema-only; DB unchanged. Documented by migration `20260722180000_schema_align_partial_grn_unique_and_audit_restrict`.

### C — `period_closes.updatedAt` default

- **Drift:** Live DB has `DEFAULT CURRENT_TIMESTAMP` on `period_closes.updatedAt`. `schema.prisma` uses `@updatedAt` without a Prisma `@default(now())`, so `migrate diff` (DB → schema) proposes `ALTER COLUMN "updatedAt" DROP DEFAULT`.
- **Risk:** Cosmetic / tooling drift. Runtime behavior already updates via Prisma `@updatedAt`. Dropping the DB default is low value and could surprise raw SQL inserts.
- **Recommendation when revisited:** Prefer documenting intentional DB default, or add matching `@default(now())` in schema if product wants both paths identical — decide explicitly; do not silent-apply.

### D — `period_opening_*` `id` default (`gen_random_uuid()` vs `@default(uuid())`)

- **Drift:** Tables `period_opening_verifications` and `period_opening_verification_lines` have DB default `gen_random_uuid()` on `id`. Schema uses `@default(uuid())` (Prisma client-side / uuid()). Diff proposes `DROP DEFAULT` on both `id` columns when aligning DB → schema.
- **Risk:** Low for Prisma-created rows (client supplies UUID). Raw SQL inserts without `id` would rely on the DB default.
- **Recommendation when revisited:** Keep DB `gen_random_uuid()` and accept representation drift, or switch schema to `dbgenerated("gen_random_uuid()")` for exact match — no forced DROP.

### E — Period-opening index name truncation / rename

- **Drift:** PostgreSQL truncated long index names vs Prisma’s preferred `_idx` suffixes. Diff proposes renames, e.g.:
  - `period_opening_verification_lines_verificationId_classification` → `..._classifica_idx`
  - `period_opening_verifications_tenantId_targetYear_targetMonth_is` → `..._targetMont_idx`
- **Risk:** Cosmetic only if map names are corrected carefully; renaming live indexes is noisy and can confuse ops without functional gain.
- **Recommendation when revisited:** Align with `map:` on `@@index` to the **existing** DB names (no rename), or accept truncated DB names as source of truth.

### F — `store_requisitions_accWorkflowVersionId_idx` present in DB, absent in schema

- **Drift:** Live DB has index on `store_requisitions("accWorkflowVersionId")`. `StoreRequisition` in `schema.prisma` does not declare matching `@@index([accWorkflowVersionId])`. Diff (DB → schema) proposes `DROP INDEX`; reverse proposes `CREATE INDEX`.
- **Risk:** Low. Index is beneficial if queries filter by workflow version; dropping would only hurt performance.
- **Recommendation when revisited:** Add `@@index([accWorkflowVersionId])` (or with explicit `map:`) to schema to match DB — schema-only preferred; do not drop the live index.

### H — Orphan asset migrations in DB history (missing from local `prisma/migrations`)

- **Drift:** `_prisma_migrations` on live DB lists applied migrations that have **no** corresponding folder under local `prisma/migrations`:
  - `20260417205950_add_asset_management`
  - `20260418082245_asset_sequence_opening_batch`
  - `20260427151141_asset_verification_decisions`
  - `20260427180834_asset_verification_approval_apply`
  - `20260428061214_expected_snapshot`
  - `20260428072416_asset_transfers_workflow`
  - `20260428073153_asset_transfer_controls`
  - `20260505083908_separate_get_pass_modules`
- **Note:** `migrate status` still reported “up to date” during the audit because local folders ⊆ applied set; the gap is the reverse (DB history has extras not in repo).
- **Risk:** New environments / `migrate deploy` from this repo alone will not replay those asset migrations. History divergence complicates audits and fresh DB builds.
- **Recommendation when revisited:** Recover migration SQL from backup/git history or another branch and restore folders, **or** document intentional asset-module retirement and archive policy — do not delete `_prisma_migrations` rows casually.

---

## 2026-07-23 — Phase 3 Legacy batch 1: Assets module — DOCUMENT RETIREMENT ONLY

**Status:** Documented retirement — **no delete** of `_prisma_migrations` rows, schema enums, or leftover DDL history.  
**Backup before batch:** `OSE-backend/backups/ose_inventory_backup_pre_legacy_batch1_20260723.dump`

### Assets feature (fully retired in application)

- **Phase 1 (2026-07-22):** All `ASSET_*` permission rows and grants removed from `permissions` / `role_permissions` / UR (DB only).
- **Runtime:** No asset feature module, controllers, services, FE routes/nav, or live `asset_*` business tables in `ose_inventory`.
- **Schema residue (keep for now):** `DocumentType` / related enums may still list `ASSET_VERIFICATION` / `ASSET_DISPOSAL` in `schema.prisma` — **explicit KEEP** until a later schema wave (Phase 3 inventory P4). Do not drop enum values in this batch.

### The eight orphan migration history rows (P3)

These names remain in live `_prisma_migrations` without matching folders under local `prisma/migrations`. They belong to the **retired Assets module** (and related historical get-pass split), not to any active code path:

1. `20260417205950_add_asset_management`
2. `20260418082245_asset_sequence_opening_batch`
3. `20260427151141_asset_verification_decisions`
4. `20260427180834_asset_verification_approval_apply`
5. `20260428061214_expected_snapshot`
6. `20260428072416_asset_transfers_workflow`
7. `20260428073153_asset_transfer_controls`
8. `20260505083908_separate_get_pass_modules`

**Policy (approved 2026-07-23):** Leave these rows in migration history as an audit record. **No additional action now** — do not delete `_prisma_migrations` entries, do not invent empty migration folders unless a separate recovery decision is approved.

**Out of scope this batch (deferred product questions):** Lost & Found retirement, Requisition data archival, P9 inactive legacy fallback / dual-write, P12 role membership audit, Stock Count dual paths (P10), Posting coexistence (P11).

---

## 2026-07-23 — Phase 3 Legacy batch 2: ADMIN role — soft retain

**Status:** Retained in DB — **do not delete.**  
**Role code:** `ADMIN` (`isActive=false`)  
**Reason:** Three historical `approval_steps` reference `requiredRoleId → ADMIN` for `STORE_TRANSFER` requests (May 2026: 2 APPROVED, 1 CANCELLED). FK is `RESTRICT`, so hard-delete would break integrity.  
**Memberships:** None (no `tenant_members` / `ur_user_assignments`).  
**Policy:** Legacy role — retained for historical approval_steps integrity (STORE_TRANSFER, May 2026), no active memberships, **must not be assigned to any user going forward.**  
**Assignment guards (already + hardened):**
- `ASSIGNABLE_ROLE_CODES` / FE `ASSIGNABLE_USER_ROLES` exclude `ADMIN`
- ACC operational pickers exclude `ADMIN`
- `roles.service.js` `listAssignableRoles` excludes `ADMIN` by code (`notIn: ['SUPER_ADMIN','ADMIN']`) even if somehow reactivated

**Deleted in same batch (no blockers):** `RECEIVER`, `E2E_ROLE_A_*`, `E2E_ROLE_B_*`, `E2E_VIEW_ONLY_*`.

---
