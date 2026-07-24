# Item Master + Transfer — Constitution Gap Matrix (Runtime Pilot)

Evidence source: `ITEM_MASTER_TRANSFER_RUNTIME_RESULTS.json` (real browser `getBoundingClientRect()`),
condensed in `ITEM_MASTER_TRANSFER_MEASUREMENTS.json` / `.md`.

Constitution of record (exists, FROZEN 2026-06-15):
`OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md` (authoritative) +
`APP_VIEWPORT_FRAMEWORK.md` (reference only).

Baseline tokens: `OSE-Frontend/src/styles.scss` (`--app-shell-sider-w:250px`, `--app-shell-header-h:56px`,
`--app-shell-content-pad-block:48px`, `--app-shell-content-max-w:1400px`, `--app-shell-layout-h:100lvh`,
`--app-viewport-h: calc(100lvh - 56px - 48px)`).

Runtime environment: frontend `http://127.0.0.1:4200`, API `http://127.0.0.1:4000/api`,
tenant `closeout-audit-hotel-disposable` (child hotel), account `disp-perm-fin@closeout-audit.local`
(FINANCE_MANAGER, 58 permissions, **read-only minted session — zero DB writes**).

---

## CG-00 — Constitution document status (correction)

The earlier Ask-mode pass reported the layout constitution as *missing*. It now **exists** and is
authoritative: `DX_OSE_UX_CONSTITUTION_v1.md` (frozen) with `APP_VIEWPORT_FRAMEWORK.md` as reference.
The pilot is therefore graded against **real ratified clauses**, not a de-facto baseline. Decision: **COMPLIANT (documentation present)**.

---

## Gap matrix

| # | Screen(s) | Viewport | Actual runtime | Constitution rule | Difference | Decision |
|---|-----------|---------:|----------------|-------------------|-----------:|----------|
| G1 | ALL (shell) | all 3 | `document` is the vertical scroll owner; shell height constant **1133px** > viewport; `main-shell__content` `overflow:hidden`, does not scroll | §3.2 "Forbidden: page-level document scroll on desktop bounded operational routes"; §4.6 content-hugging must prevent page becoming second scroll owner | Page scrolls on every A-RG/A-DT route | **SHARED_LAYOUT_DEFECT** |
| G2 | Transfer List | all 3 | Table body bounded (`max-height` 388px, scrollHeight 1050) **and** document scrolls → two vertical scrollbars (`doubleVerticalScroll=true`) | §3.6 "Forbidden: dual vertical scroll"; §4.6; P0-05 | Double scroll | **SHARED_LAYOUT_DEFECT** |
| G3 | Item Master List | 1366/1536 vs 1920 | Work-card table body height **582.5 → 582.5 → 550.5**; rows 6→6→**5**; not monotonic with viewport height | §3.3 list-chrome decomposition; §5.4 shell viewport-derived (taller viewport ⇒ taller shell ⇒ more rows) | Height fixed/shrinking instead of growing; fewer rows on the larger screen | **SCREEN_DEFECT** (items-list ResizeObserver vs CSS token) |
| G4 | Item List (1920), Transfer List (all) | — | Pagination/last row sits at y≈1064–1099, **below the fold**; requires page scroll | §3.7.3 "pagination footer visible without page scroll"; §4.5 footer always visible at shell bottom | Footer below fold | **SHARED_LAYOUT_DEFECT** (consequence of G1) |
| G5 | Item Master List | 1920 | Registry card/table body width **1588px** (full bleed, `max-width:100%`) | §2.3.2 "content column never exceeds 1400px" vs §2.3 RBC full-bleed host + G1 is the golden A-RG reference | Golden reference itself renders 1588 > written 1400 cap | **CONSTITUTION_CONFLICT** (RBC bleed ↔ 1400 cap ↔ golden) |
| G6 | Transfer Detail (all 5 statuses) | all 3 | Narrow card **692 / 802 / 1052px**, left-anchored; blank below content **≈466–525px**; page scroll; no `.document-page` 1280 shell / masthead observed | §6.4 DT-WF (masthead, RBC host bleed, single scroll, 1280 inner cap); P0-02/P0-05/P0-06 | Not on document-page shell; huge dead space | **SCREEN_DEFECT** (already tracked P0-02/05/06) |
| G7 | ALL (shell) | all 3 | Header height **65px** | §2.2 `--app-shell-header-h: 56px` | +9px vs token | **CONSTITUTION_AMBIGUOUS** (token vs actual chrome; padding not decomposed) |
| G8 | Add/Edit Item vs Create/Edit Transfer | all 3 | Item form card full-bleed **1050/1216/1590**; Transfer form capped/centered **1068/1238/1352** | §6.3/§6.5 A-DT DT-ED inner content cap **1280px**; consistent family contract | Item form exceeds 1280 and is not centered; two forms use different width contracts | **SCREEN_DEFECT** |
| G9 | Item View modal / Image Preview modal | — | Row click did not open a modal; not captured | §8.3 Modal Law (M0–M4) | Not measured | **BLOCKED** (needs targeted trigger/selector) |
| G10 | Item Master List columns | all 3 | 8 columns identical + same order at 1366/1536/1920; no horizontal scroll (scrollWidth==clientWidth); Actions reachable | Content-consistency law; §2.6.3 no horizontal page scroll | None | **COMPLIANT** |
| G11 | Transfer List columns | all 3 | 6 columns identical + same order at all sizes; no horizontal scroll; last column reachable | Content-consistency law | None | **COMPLIANT** |
| G12 | Add/Edit Item, Create Transfer | all 3 | Same sections/fields present at all 3 sizes; single (document) scroll; no nested unnecessary scroll inside form | §3 single scroll; content consistency | None (besides shared G1 page-scroll) | **COMPLIANT (content)** |
| G13 | Transfer pagination size | 1366 | Transfer List renders 11 rows with internal scroll (page size appears > 10) | §5.1 Option A (default 10, sizes 10/20/50); P0-03 | Possible Option B | **SCREEN_DEFECT (NEEDS_VERIFY)** |

---

## Root-cause summary

**One shared defect explains most PARTIALs.** The app shell sidebar (`main-shell__sider` →
`app-shell-sidebar-nav` → `shell-sidebar-nav__inner`) has `overflow:hidden` and a natural height of
~1133px (25 nav items for a fully-privileged user) with `min-height:768px`. Because the sider cannot
scroll internally and the shell has no `height:100lvh` cap that forces inner scrolling, the sider
stretches `main-shell` → `app-main-layout` → `app-root` → document to 1133px. The document then owns
vertical scroll on **every** route, defeating the per-screen VSL work-cards (which are otherwise built
correctly). This is the umbrella cause of G1, G2, G4 and the blank-space in G6.

Severity note: the sider height scales with the number of nav items, i.e. with the user's permission
breadth. A restricted user with a short nav may fit within 768px and not trigger page scroll; a manager
with the full nav always overflows. The defect is therefore **privilege-correlated but structural**.

---

## Constitution rewrite / clarification proposals (do NOT apply — proposals only)

### P-A — Resolve the 1400px cap vs full-bleed conflict (G5)
- **Current text (§2.3):** `host max = calc(100vw - 250px - 32px)` and rule 2 "content column never exceeds 1400px".
- **Problem:** The golden A-RG reference (G1 Item Master) renders its table at 1588px on 1920, contradicting the written 1400 cap. Either the golden violates the constitution, or the 1400 cap is not intended to bind registry table bleed.
- **Evidence:** Item List card/body = 1588px @ 1920×1080.
- **Proposed clarification (Registry List family):**
  > Registry tables bleed to `calc(100vw - sider - gutter)` with **no 1400px cap**; the 1400px cap applies only to document/detail/form content (`.document-page`, editor cards), not to A-RG registry tables. Update §2.3.2 to scope the cap to A-DT/forms, and state explicitly that A-RG tables are uncapped bleed.

### P-B — Decompose the header height token (G7)
- **Current text (§2.2):** `--app-shell-header-h: 56px`.
- **Problem:** Runtime header is 65px; the token no longer matches actual chrome, so every `--app-viewport-h` derivation is off by 9px.
- **Proposed fix:** Either (a) correct the token to the true rendered height, or (b) require the header to be laid out from the token so runtime == token. Add a conformance check "measured header height == `--app-shell-header-h` ±1px".

### P-C — Add an explicit App-Shell VSL clause (G1/G2/G4)
- **Gap:** The constitution mandates per-screen single scroll (§3.2) but never states that the **shell** must be `100lvh` with an **independently scrollable sider** so the document never scrolls. Phase 6 "main-layout bounded content" is still only *planned* in the (reference-only) AVF roadmap.
- **Proposed new clause (§3.8 App-Shell Containment):**
  > The application shell (`main-shell`) is fixed to `100lvh`. The sider owns its own vertical scroll (`overflow-y:auto`, `height:100lvh`). The content well (`main-shell__content`) is `min-height:0` inside a flex column so the declared per-archetype primary scroll owner is the only vertical scroller. The document/body must never scroll on bounded A-RG/A-DT/A-TX routes, regardless of sidebar length.

---

## Decisions rollup

| Decision | Count | Items |
|----------|------:|-------|
| COMPLIANT | 4 | G0, G10, G11, G12 |
| SHARED_LAYOUT_DEFECT | 3 | G1, G2, G4 |
| SCREEN_DEFECT | 4 | G3, G6 (tracked P0), G8, G13 |
| CONSTITUTION_CONFLICT | 1 | G5 |
| CONSTITUTION_AMBIGUOUS | 1 | G7 |
| BLOCKED | 1 | G9 |
