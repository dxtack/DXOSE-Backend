# DX OSE — Emergency Freeze and UI Regression Audit

**Status:** OFFICIAL FREEZE — read-only audit only  
**Executed:** 2026-06-27  
**Trigger:** Item Master screenshot — footer `1–20 of 199 items`, ~7 visible rows, large blank band above pagination  
**Agent action taken:** STOP — no scripts, no cleanup, no restore, no product edits after this report

---

## Freeze confirmation

| Action | Status |
| ------ | ------ |
| Closeout harness execution | **STOPPED** — no scripts scheduled |
| Additional DB cleanup | **NOT RUN** after freeze request |
| Product file edits | **NONE** in this audit pass |
| Restore / revert / checkout | **NOT PERFORMED** |
| Playwright create/update/delete | **NOT RUN** |

**Historical note (pre-freeze):** `53-cleanup-closeout-fixtures.js` already ran earlier in session (299 GP, 41 GRN, 147 movement docs). State preserved as-is per freeze.

---

## 1. Processes running at audit time

| PID | Command | CWD (inferred) | Start (local) | Writes Product? | Writes DB? | Stopped? |
| --- | ------- | -------------- | ------------- | --------------- | ---------- | -------- |
| 19868 | `concurrently` backend+frontend dev | `C:\DX OS&E` | 2026-06-26 06:03 | No (serves) | No | **No** — user dev stack |
| 16268 / 3068 | `npm run dev` (backend) | OSE-backend | 2026-06-26 06:03 | No | No | No |
| 21400 / 24880 | `nodemon src/server.js` | OSE-backend | 2026-06-26 06:03 / 23:41 | No | **Yes if API called** | No |
| 22104 | `node src/server.js` | OSE-backend | 2026-06-27 03:12 | No | **Yes if API called** | No — **LISTEN :4000** |
| 12696 / 20128 | `npm run start` / ng serve | OSE-Frontend | 2026-06-26 06:03 | No | No | No — **LISTEN :4200** |
| 16020 | `ng serve --host 127.0.0.1 --port 4200` | OSE-Frontend | 2026-06-26 06:03 | No | No | No |
| 3560 / 21088 / 23384 | Cursor TypeScript tsserver | IDE | 2026-06-26 06:04 | No | No | No |

**Closeout harness:** No `closeout-runtime-audit/*.js` process running. Last batch (`run-round7.js`, PID 21672) **completed** 2026-06-27 ~00:54.

**Ports:** `:4000` (API), `:4200` (Angular dev server) — both active before freeze.

---

## 2. Files affecting table layout / height (read-only)

### Shared VSL (Viewport Shell Layout) system

| File | Property / mechanism | Current value / behavior | Last modified (local) | Possible source |
| ---- | -------------------- | ------------------------ | ----------------------- | --------------- |
| `OSE-Frontend/src/styles.scss` | `--app-viewport-h` | `calc(var(--app-shell-layout-h) - header - pad)` | (not re-read this pass) | Global shell |
| `OSE-Frontend/src/app/shared/styles/_registry-vsl-shell-binding.scss` | `--registry-content-usable-h` | `calc(--app-viewport-h - 48px)` | **2026-06-26 06:01:27** | Wave A VSL registry rollout |
| Same | `--registry-table-shell-h` | viewport − list chrome − footer | same | Feature canvas tokens |
| Same | `--registry-table-body-scroll-h` | shell − table head | same | **Fixed scroll body height** |
| Same | `registry-table-scroll-physics` | `.ant-table-body { flex:1; overflow-y:auto; height:100% }` | same | Forces tall tbody canvas |
| Same | `registry-vsl-viewport-stack` | `flex:1; min-height:0; height:100%` on work-card | same | Flex fill to sidebar floor |
| `OSE-Frontend/src/app/features/items/items-list/_items-list-registry-canvas.scss` | `registry-work-card-shell-tokens(18rem)` | Computes shell from 18rem chrome | **2026-06-26 06:01:27** | Items-local canvas |
| Same | `.registry-work-card @768` | `flex:1; height:100%` | same | Card stretches to usable-h |
| Same | `.registry-ops-page__table-region` | `flex:1 1 auto` @768 | same | Table region fill |
| `OSE-Frontend/src/app/features/items/items-list/items-list.component.ts` | `itemsTableScroll` | `{ y: 'var(--registry-table-body-scroll-h)' }` desktop | **2026-06-26 06:01:27** | nz-table fixed scroll Y |
| Same | `ITEMS_PAGE_SIZE` / `pageSize` | **20** | same | Pagination data (not layout) |
| `OSE-Frontend/src/app/shared/components/registry-list-pagination/registry-list-pagination.constants.ts` | `REGISTRY_LIST_PAGE_SIZE` | **20** | **2026-06-26 06:01:27** | Footer range math |
| `OSE-Frontend/src/app/core/layout/main-layout/main-layout.component.scss` | `$registry-vsl-route-hosts` | Flex height chain for registry route hosts | **2026-06-27 00:57:29** | Wave 2 A-RG shell binding — **timestamp during closeout window; no closeout script writes this path** |
| Same | `app-items-list` host rules | `flex:1; min-height:0; height:100%` | same | Route host height chain |

### Other registry canvases (same VSL pattern — 2026-06-26 06:01:27)

`_stock-balances-registry-canvas.scss`, `_movement-list-registry-canvas.scss`, `_grn-list-registry-canvas.scss`, `_breakage-list-registry-canvas.scss`, `_transfer-list-registry-canvas.scss`, `_lost-items-list-registry-canvas.scss`, `_ledger-registry-canvas.scss`, `_get-pass-list-registry-canvas.scss`, `_inventory-count-registry-canvas.scss`, `_workflow-pipeline-command-canvas.scss`

---

## 3. Root cause analysis — footer vs visible rows

### Observed (screenshot)

- Footer: **`1–20 of 199 items`** → pagination logic believes page 1 shows items 1–20 of total 199.
- Visible body: **~7 data rows** (Acrylic Juice Dispenser … Banquet Nut Cracker).
- Large **white band** between last row and footer/pagination.

### Read-only conclusion

| Hypothesis | Verdict |
| ---------- | ------- |
| API returned 20, UI rendered fewer | **Unlikely** — footer `to=20` implies `itemsList.length=20` and `total=199` in component |
| API returned 7, footer wrong | **Rejected** — footer uses `(pageIndex-1)*pageSize+1` to `min(pageIndex*pageSize,total)`; with pageSize=20 would show `1–7` if only 7 rows |
| Container fixed height | **Primary cause** — `--registry-table-body-scroll-h` sizes nz-table scroll body to **viewport-derived height**, not row-count |
| Rows hidden | **Not indicated** — rows visible; scrollbar thumb small → tall scroll container |
| Virtual scroll | **Not used** on Item Master — standard nz-table + `[nzScroll]` |
| CSS overflow / table body height | **Confirmed** — `registry-table-scroll-physics` sets `.ant-table-body { flex:1; height:100% }` inside fixed shell |
| Pagination pinned to page bottom | **Contributing** — work-card uses flex column; footer `flex-shrink:0` at card bottom; scroll shell `flex:1` above it |
| Test data cleanup affected row count | **Rejected for this symptom** — cleanup removed movement/GP/GRN fixtures, not Item Master catalog rows; total still 199 |
| Page size changed to 10 | **Rejected** — `ITEMS_PAGE_SIZE=20`, footer explicitly says 20 |

**Most likely mechanism:** API + component hold **20 items**. Table scroll region height = **`--registry-table-body-scroll-h`** (large, viewport-bound). Only ~7 row-heights of content render at top; **remaining shell height appears as blank space** inside the scroll canvas above the card footer. This is **layout/table-height behavior**, not pagination count.

**Closeout harness link:** Harness scripts **do not modify** the SCSS/TS files above. Registry VSL files timestamp **2026-06-26 06:01:27** (before closeout runtime sessions). `main-layout.component.scss` timestamp **2026-06-27 00:57:29** — outside closeout script write paths; source unknown (IDE/user/other agent) — **not modified in this freeze pass**.

---

## 4. Damage scope (code-pattern assessment — no browser run)

All listed screens use the same **Registry VSL** pattern (`--registry-table-body-scroll-h` + `registry-table-scroll-physics`) unless noted.

| Screen | Registry canvas | Expected regression pattern |
| ------ | --------------- | --------------------------- |
| Item Master | `_items-list-registry-canvas.scss` | **Confirmed in screenshot** — tall shell, blank band |
| Stock Balances | `_stock-balances-registry-canvas.scss` | Same VSL — likely same blank-band risk |
| Movements | `_movement-list-registry-canvas.scss` | Same |
| Par Levels | workbench tokens in `_registry-vsl-shell-binding.scss` | Same class of issue |
| Ledger | `_ledger-registry-canvas.scss` | Same |
| GRN | `_grn-list-registry-canvas.scss` | Same |
| Transfers | `_transfer-list-registry-canvas.scss` | Same |
| Breakage | `_breakage-list-registry-canvas.scss` | Same |
| Lost Items | `_lost-items-list-registry-canvas.scss` | Same |
| Get Pass | `_get-pass-list-registry-canvas.scss` | Same (+ toolbar token variant) |
| Inventory Count | `_inventory-count-registry-canvas.scss` | Same family |
| Workflow Pipeline | `_workflow-pipeline-command-canvas.scss` | Workbench variant — same fixed shell logic |

| Screen | Visible rows (screenshot) | Footer range (screenshot) | Blank space | Layout regression |
| ------ | -------------------------: | ------------------------- | ----------- | ----------------- |
| Item Master | ~7 | 1–20 of 199 | Large | **Yes — confirmed** |
| Others | *Not captured this freeze* | *Not captured* | *Expected same pattern if VSL active* | **Probable — same CSS architecture** |

*Runtime per-screen verification deferred — freeze prohibits Playwright.*

---

## 5. Product files — touch audit

**Git:** `OSE-Frontend/` and `OSE-backend/` are **untracked** — no commit baseline or backup branch in repo.

**Closeout harness write scope:** All `fs.writeFileSync` in `OSE-backend/scripts/closeout-runtime-audit/*.js` target **`Governance/closeout-runtime-audit/`** JSON/MD/CSV only. Grep found **no** harness writes to `OSE-Frontend/src` or `OSE-backend/src`.

| File path | Last modified (local) | Hash (prefix) | Closeout script can write? | Backup in repo? |
| --------- | --------------------- | ------------- | -------------------------- | --------------- |
| `items-list/_items-list-registry-canvas.scss` | 2026-06-26 06:01:27 | 640CE1856BF2 | **No** | **No** |
| `shared/styles/_registry-vsl-shell-binding.scss` | 2026-06-26 06:01:27 | AB61245118AA | **No** | **No** |
| `items-list/items-list.component.ts` | 2026-06-26 06:01:27 | 2992B556A57A | **No** | **No** |
| `main-layout/main-layout.component.scss` | **2026-06-27 00:57:29** | BD6CABEAF593 | **No** | **No** |
| `registry-list-pagination.constants.ts` | 2026-06-26 06:01:27 | (see file) | **No** | **No** |

**Governance docs referencing VSL rollout:** `Governance/timeline-remediation/PHASE5_TRANSFER_BREAKAGE_LOST_EVIDENCE.md`, Wave A/B registry canvas work — predates closeout audit mandate.

---

## 6. Awaiting approval

**Frozen.** No fix attempted. No style rollback. No table height change. No closeout resume.

Next steps require explicit user approval on:

1. Which file(s) and commit/time constitute “last approved design”
2. Whether to revert VSL shell binding or adjust `--registry-table-body-scroll-h` behavior
3. Whether to resume closeout at all

---

## Artifact index

| File | Purpose |
| ---- | ------- |
| This report | Emergency freeze + UI regression read-only audit |
| `UNAUTHORIZED_PRODUCT_CHANGE_AUDIT.md` | Prior closeout contamination audit (DB, not layout) |
| `CLOSEOUT_FIXTURE_CLEANUP_PROOF.json` | Pre-freeze cleanup record |
