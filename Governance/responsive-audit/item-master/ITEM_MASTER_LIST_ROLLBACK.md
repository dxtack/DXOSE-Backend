# Item Master List (`/items`) — Patch ROLLBACK + Re-diagnosis

Visual review of the shell patch **FAILED**. The patch was reverted. No new fix applied.

## 1. Revert confirmation

- **Reverted patch:** the `@media (min-width:768px){ :host:has(app-items-list){ … } }` block (shell + sider `100lvh` cap + `.ant-layout-sider-children` flex) that I had added.
- **File reverted (only one, back to its exact prior content):**
  `OSE-Frontend/src/app/core/layout/main-layout/main-layout.component.scss`
- No other file changed by the revert. The pre-existing `app-items-list` entry in `$registry-vsl-route-hosts` (line ~461) is original and untouched. Lint clean.
- Runtime confirms rollback: `pageVerticalScroll` is `true` again and the sidebar shows no internal scrollbar (full nav + footer), i.e. the previous behavior is back.

## 2. Before Patch / After Patch / After Revert (browser runtime, `getBoundingClientRect()`)

| Signal | BEFORE patch (pilot) | AFTER patch (rejected) | AFTER revert (now) |
|---|---|---|---|
| Document page scroll | yes | no | **yes** (restored) |
| Sider internal scrollbar | no | **yes (cramped)** | **no** (restored) |
| Sider footer | full, via page | pinned but cramped | **full** (restored) |
| Table body height 1366/1536/1920 | 583 / 583 / 551 | 218 / 314 / 530 | **551 / 551 / 583** (restored) |
| Pagination visible in viewport | no | yes | **no** (restored) |
| Vertical scroll owners | 0 (page) | 2 → 1 | **0** (restored) |
| Large white space inside table | **yes** | yes (worse) | **yes (still present)** |
| Loading spinner in empty body | **yes** | yes | **yes (still present)** |

Artifacts:
`ITEM_MASTER_LIST_RUNTIME_RESULTS_BEFORE.json` (before patch),
`ITEM_MASTER_LIST_RUNTIME_RESULTS.json` (after patch),
`ITEM_MASTER_LIST_RUNTIME_RESULTS_AFTERREVERT.json` (after revert),
screenshots `IM-LIST__*__afterrevert__viewport.png`.

## 3. Why the Loading overlay and the white space appear (root re-diagnosis)

**Key insight:** the white space + centered spinner are visible **both after the patch and after the revert** → they are **pre-existing** and are **not** caused by the shell patch.

- **White space inside the table:** the table body is force-sized to a **fixed height that fills the card**, driven by the *existing* registry machinery — `nz-table [nzScroll].y = var(--registry-table-body-scroll-h)` **plus** the component's `ResizeObserver` (`syncTableBodyMaxHeight` in `items-list.component.ts`) which sets `.ant-table-body { max-height = scrollShell.clientHeight − header }`. When the page holds **few rows** (or is still loading), the body is much taller than its content, leaving a big empty band. (In the disposable test tenant there are only ~3–4 items, so the gap is extreme.)
- **Loading overlay / spinner in the middle:** `nz-table [nzLoading]="loading()"` renders a centered spin overlay while the fetch (`GET /items` + image-URL hydration) is in flight. Because the body is a tall fixed box, the spinner sits in the middle of a large empty white area, and the `noResult` "No items yet" template can momentarily render together with it. This is **data/latency-driven**, not CSS-driven — a CSS change cannot start/stop an HTTP request. On the 200-item tenant "just loading" indicates the `/items` request itself is slow/pending on that tenant/session, which needs an API/network check, independent of layout.
- **What the patch itself broke (now reverted):** capping the sider to `100lvh` forced the nav into an internal scroll region → **visible sidebar scrollbar + cramped nav + footer squeeze**; capping the shell made the already-tall empty body span the full viewport → **white space looked worse**; and it changed pagination/footer placement. These shell-wide side effects are the reason the visual review failed.

## 4. New diagnostic proposal (NOT implemented — for approval)

The correct target is a **balanced, content-aware table** without touching the sidebar/shell globally:

1. **Do not cap the shell/sider.** Leave the sidebar exactly as-is (no forced internal scrollbar). Keep the document-scroll model for the shell.
2. **Make the table body height content-aware, bounded by (not filling) the available space.** Instead of forcing `.ant-table-body` to a fixed viewport-derived height, the body should be `min(content, availableViewportSpace)` so few rows shrink the body (no white gap) while many rows scroll within a viewport-bounded cap. This targets the *table body owner only*, scoped to `app-items-list`, not the shell.
3. **Decouple the loading state from the empty tall box:** while `loading()` is true or rows are empty, the body should not present a large empty area with a floating spinner — the spinner should sit in a right-sized region. (Component-local, no API change.)
4. **Resolve the ResizeObserver-vs-token duplication** as the *single* body-height source, but only after (2) defines the intended sizing rule, so we don't reintroduce the gap.
5. **Investigate the "just loading" on the real tenant separately:** capture the `/items` network call (status/latency) for DX Airport Hotel to confirm whether data actually returns — this is a functional check, orthogonal to layout, and must not be "fixed" via CSS.
6. **Agree a visual Target first** (reference screenshot / spec) for: sidebar untouched, table height balanced, no white gap, pagination visible, no persistent overlay — before any code is written.

No code will be written until the image is analyzed and a clear visual Target is approved.
