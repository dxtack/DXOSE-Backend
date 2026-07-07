# Item Master List (`/items`) — Remediation Findings

Scope: **Item Master List only**. No other screen (Add/Edit/View/Import/Modals) or module (Transfer, etc.) was fixed or changed.

## 1. Final root cause

The shared app shell (`main-layout.component.scss`) sized the layout row and the sider with **`min-height: 100lvh` only — no height cap** — while the sider is `overflow: hidden`. A privileged user's navigation is taller than the viewport (sider natural content ≈ **1133 px**: brand 64 + menu 993 + footer 76). Because nothing capped the row height, the sider's natural content stretched the whole `.main-shell` row to **1133 px** on every viewport (`ant-layout-has-sider` → row height = tallest child, `align-items: stretch`).

Consequences on `/items`:
1. **Document-level vertical scroll** on all viewports (shell 1133 > viewport).
2. **Pagination/footer below the fold** (card bottom 1108.8; at 1920 pagination bottom 1099.8 > 1080).
3. **Table body height not viewport-driven / non-monotonic** (583 / 583 / **551** — it tracked the sider-pinned shell, not the viewport; it even *shrank* at 1920).
4. **Blank area** (33–42 px) under the table because the card was taller than the data needed.

The registry table's own flex/scroll chain (already present via `_registry-vsl-shell-binding.scss` + the `app-items-list` entry in `$registry-vsl-route-hosts`) was correct; it was **defeated** because the shell it lived inside was taller than the viewport.

## 2. Files modified

Exactly **one production file**:

- `OSE-Frontend/src/app/core/layout/main-layout/main-layout.component.scss`
  - Added a **route-gated** block (`@media (min-width: 768px) { :host:has(app-items-list) { … } }`):
    - `.main-shell.ant-layout` → `height` + `max-height` = `var(--app-shell-layout-h)` (= `100lvh`) + `overflow: hidden` (caps the shell to the active viewport → no document scroll).
    - `.main-shell > .main-shell__sider.ant-layout-sider` → `height` + `max-height` = `var(--app-shell-layout-h)` (caps the sider to the viewport).
    - `.main-shell__sider .ant-layout-sider-children` → bounded flex column (`height:100%; min-height:0; display:flex; flex-direction:column`) so the nav's existing `.main-shell__menu { overflow-y:auto }` becomes the **sider scroll owner** (brand + footer stay pinned and reachable, not clipped).

No other production `.ts`, `.html`, or `.scss` changed. No Item APIs, backend, permissions, import behavior, columns, labels, buttons, filters, or the registry canvas contract were touched. No database writes.

Evidence-only scripts (non-production) added under `OSE-backend/Governance/scripts/`: `responsive-item-master-measure.js`, `responsive-item-master-smoke.js`, `responsive-item-master-before-extract.js`.

## 3. Why the change lives in the shell (not the `/items` canvas)

A screen-local fix inside `app-items-list` **cannot** cap an ancestor (`.main-shell`) — CSS styles descendants, not ancestors, and `::ng-deep` pierces downward only. The oversized element is the shared shell/sider, above the routed component. Therefore an `app-items-list`-only canvas fix is impossible for this root cause.

To stay safe (Shared Shell Safety Rule, Option 2), the shell rules are **gated to `:host:has(app-items-list)`** and desktop/tablet width. By construction they cannot match any other route or mobile, so other routes are byte-for-byte unaffected. This was also **verified empirically** (see §7).

## 4. ResizeObserver decision (single source of truth)

The table body height had two potential writers of `.ant-table-body { max-height }`:
- **CSS token** `--registry-table-body-scroll-h` (fed to `nz-table [nzScroll].y`), and
- the component's **`ResizeObserver`** (`syncTableBodyMaxHeight`), which sets the body's inline `max-height` to `scrollShell.clientHeight − headerHeight`.

**Decision: the `ResizeObserver` is the single source of truth; the CSS token is demoted to a bootstrap-only value.** Justification (and why the observer must stay):
- `nz-table` renders its fixed-header / scrollable-body split **only** when `[nzScroll].y` is set, and it always writes that value as an inline `max-height` on `.ant-table-body`. A pure-CSS `max-height:100%` cannot override that inline value, so a JS measurement is architecturally required to make the body flex-fill the card exactly (and to absorb the *conditional* import banner, which the static token over-counts → the old 33–42 px blank area).
- After the shell fix, `scrollShell.clientHeight` finally tracks the viewport, so the observer now yields exact, monotonic heights (218 / 314 / 530) and the blank area collapses to 1 px. The token remains only as the pre-JS bootstrap so the scroll structure exists on first paint; the observer re-asserts on data/loading/viewport/resize and is authoritative at all times.
- Removing the observer would reintroduce the blank area and break exact fit; it is retained deliberately. No new competing writer was introduced, and no component logic was changed.

## 5. Required scroll ownership — final state (`/items`)

```
App shell    : fixed to active viewport (height = 100lvh, overflow hidden)
Sidebar      : independently scrollable — .main-shell__menu owns nav scroll;
               brand + user/footer pinned and reachable (footer bottom 767.9 @768)
Item List    : does not extend document height (document scrollHeight == clientHeight)
Table body   : owns vertical data scrolling (overflow-y auto, sole data scroller)
Footer/Pager : always visible below the table body, inside the viewport
```

## 6. Acceptance criteria — result

| Criterion | 1366×768 | 1536×864 | 1920×1080 |
|---|---|---|---|
| No document vertical scroll from this screen | ✅ | ✅ | ✅ |
| Table body is the data scroll owner (no double data-scroll) | ✅ | ✅ | ✅ (fits, no scroll needed) |
| Pagination visible in viewport | ✅ 735 | ✅ 831 | ✅ 1047 (was 1099.8 off-fold) |
| Footer visible in viewport | ✅ | ✅ | ✅ |
| Table body grows with viewport | 218 | 314 | 530 (monotonic ✅) |
| No unjustified blank area | ✅ 1px | ✅ 1px | ✅ 1px |
| Same columns / order / actions / filters / labels | ✅ | ✅ | ✅ |
| Actions column reachable | ✅ | ✅ | ✅ |
| No horizontal clipping / page h-scroll | ✅ | ✅ | ✅ |
| Registry full-bleed preserved (not capped to 1400 @1920) | — | — | ✅ (card 1590) |
| Sidebar footer reachable (not clipped) | ✅ | ✅ | ✅ |
| No error overlay / console layout errors | ✅ | ✅ | ✅ |

## 7. Shared-shell regression smoke (read-only, not a fix)

`ITEM_MASTER_LIST_SHARED_SHELL_SMOKE.json` — at 1920×1080:

| Route | error overlay | shell `overflow-y` | shell `max-height` | page scroll | has `app-items-list` |
|---|---|---|---|---|---|
| `/transfers` (Transfer List) | none | `visible` | `none` | `true` (unchanged) | no |
| `/dashboard` (Dashboard) | none | `visible` | `none` | `true` (unchanged) | no |

Both retain their prior shell behavior (not viewport-capped) — the `/items`-gated rules are inert off `/items`. No fix was applied to these routes.

## 8. Build / test status

- **My only production edit** (`main-layout.component.scss`) — no linter errors; SCSS change confirmed **live at runtime** on `/items` (shell capped, no error overlay). The dev server applied the style with no compile error from the shell.
- **Full `ng build` is currently BLOCKED by an unrelated, pre-existing compile error in another agent's in-flight module** — `movement-form.component.html:114` `TS2551 Property 'movementTypeValues' does not exist on type 'MovementFormComponent'`. This file is **out of scope** (Transfer/Movements/Adjustments work) and was **not** touched. A green full build must wait for that agent's fix; my change is verified via the live dev bundle + runtime matrix above.
- **Item Master runtime matrix**: `responsive-item-master-measure.js` → PASS on all 12 checks × 3 viewports (see §6).

## 9. Difference from the current constitution / proposed amendment (NOT executed)

- GHSL specifies `--app-shell-content-max-w: 1400px`. Item Master List intentionally **breaks out to full-bleed** (card 1590 @1920) via its canvas negative-margin contract, which the acceptance criteria explicitly require to keep. This is a pre-existing, intentional divergence for A-RG registry lists — **left as-is**.
- **Proposed amendment (for Amr's later review, not implemented):** the constitution's Vertical Scroll Law should state, as a shell invariant, that **the app shell row and sider are fixed to the active viewport and the sider scrolls its own navigation independently**, so registry VSL chains are never defeated by a tall sider. Today this is only expressed per-route; the `/items` fix is the first route-scoped instance and is a candidate to promote to a shell-wide rule once each registry route is individually validated.

## 10. Evidence artifact paths

```
Governance/responsive-audit/item-master/
  ITEM_MASTER_LIST_BEFORE_AFTER.json
  ITEM_MASTER_LIST_RUNTIME_RESULTS.json            (after)
  ITEM_MASTER_LIST_RUNTIME_RESULTS_BEFORE.json     (extracted from pilot)
  ITEM_MASTER_LIST_SHARED_SHELL_SMOKE.json
  ITEM_MASTER_LIST_MEASUREMENTS.md
  ITEM_MASTER_LIST_FINDINGS.md
  screenshots/IM-LIST__{1366x768,1536x864,1920x1080}__after__{viewport,fullpage}.png
  screenshots/SMOKE-{TR-LIST,DASHBOARD}__1920x1080__after.png
```

## 11. Confirmation

Only **Item Master List (`/items`)** was remediated. Add Item, Edit Item, Item View/Image modals, Import (upload/preview/validation/failed rows), Transfer, Dashboard, Reports and all other screens were **not** fixed or intentionally changed. The single shared-file edit is route-gated to `/items` and proven inert elsewhere.
