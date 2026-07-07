# Item Master List — Visual Regression Fix

**Date:** 2026-07-03  
**Status:** FIXED  
**Tenant:** DX Airport Hotel (200 items)

## Symptom

After the Loading Performance patch, Item Master List showed:
- First 2–4 rows with complete data
- Remaining rows blank (no name, category, supplier, price)
- Status toggles still visible on blank rows
- Actions column present but row text empty

## Investigation Results

### 1. API response (`GET /api/items`)

**20 complete records** returned. Sample:

```json
{
  "id": "452110b1-3b80-4c77-a48d-20a0f459bbb1",
  "name": "Banquet Nut Cracker",
  "category": { "name": "Flatware" },
  "supplier": { "name": "OSE Supplier" },
  "isActive": true,
  "unitPrice": "12.85"
}
```

`meta.total = 200`, `take = 20`. **Backend and `ITEM_LIST_INCLUDE` are NOT the cause.**

### 2. Frontend `itemsList()` signal

After API response: **20 objects, all with `name`** (`signalAllHaveName: true`). Index 6 = `"Banquet Nut Cracker"`, 27 keys per object. **Data mapping is correct.**

### 3. DOM vs signal mismatch

| Source | Row 6 name |
|--------|------------|
| API | `"Banquet Nut Cracker"` |
| `itemsList()` signal | `"Banquet Nut Cracker"` |
| DOM `.cell-name` | `""` (empty) |

Template bindings were not evaluated for rows 3–20 despite correct signal data.

### 4. Console errors (root cause)

```
NG0203: effect() can only be used within an injection context
  → items-list.component.ts constructor, effect() inside afterNextRender callback

NG01203: No value accessor for form control unspecified name attribute  (×20 per load)
  → status-toggle.component.ts, nz-switch + [ngModel] per table row
```

Under **Angular 21 zoneless**, thrown errors during `ApplicationRef.synchronizeOnce` **abort the render pass**. Rows processed before the error get bindings; subsequent rows render empty shells (toggle/actions from partial pass, text bindings skipped).

### 5. Isolation proof

| Test | blanks | NG01203 |
|------|--------|---------|
| With `<app-status-toggle>` (broken) | 16–18 / 20 | 20 |
| Toggle replaced with `<span>{{ row.isActive }}</span>` | **0 / 20** | **0** |
| Presentational ant-switch (fixed) | **0 / 20** | **0** |

## Root Causes (two bugs)

| # | File | Line | Issue |
|---|------|------|-------|
| 1 | `items-list.component.ts` | ~305 (before fix) | `effect()` created inside `afterNextRender()` → **NG0203** |
| 2 | `status-toggle.component.ts` | ~15–22 (before fix) | `nz-switch` + `[ngModel]` → **NG01203** × N rows, aborts render |

The Loading Performance patch (`initialLoadPending`, etc.) was **reverted**; blanks persisted, confirming the regression was **not** from loading-state logic but from these latent Angular 21 zoneless incompatibilities surfacing under full 20-row render load.

## Fixes Applied

### `items-list.component.ts`
- Moved `effect()` from `afterNextRender` callback into **constructor** (valid injection context).
- Reverted loading-state patch to original `[nzData]="itemsList()"` + `[nzLoading]="loading()"`.

### `status-toggle.component.ts`
- Replaced `nz-switch` + `FormsModule`/`ngModel` with **presentational `<button class="ant-switch">`** using same ant design classes.
- Preserved controlled behavior: click emits `statusChange`; visual state follows `status` input only.
- **No form binding** → no NG01203.

### Backend (`item.service.js`)
- **Kept** safe optimizations: `ITEM_LIST_INCLUDE`, deferred list image signing (not related to blank rows).

## Verification (after fix)

| Scenario | Rows | Blanks | Errors |
|----------|------|--------|--------|
| Initial load | 20 | 0 | 0 |
| Refresh | 20 | 0 | 0 |
| Search "Acrylic" | 2 | 0 | 0 |
| Pagination page 2 | 20 | 0 | 0 |

- All rows: name, category, supplier, price, toggle, actions present.
- `checkedCount = 20` on page 1 (all active items).
- Screenshot: `screenshots/IM-LIST__1920x1080__regressionfix__loaded.png`

## Build / Tests

- `item.service.test.js`: 13/13 PASS
- `npm run build`: PASS

## Files Modified

1. `OSE-Frontend/src/app/features/items/items-list/items-list.component.ts`
2. `OSE-Frontend/src/app/features/items/items-list/items-list.component.html` (reverted loading patch)
3. `OSE-Frontend/src/app/features/items/items-list/items-list.component.scss` (reverted loading styles)
4. `OSE-Frontend/src/app/shared/components/status-toggle/status-toggle.component.ts`

## Loading UI

Loading-state UX improvements from the failed patch are **deferred** until Amr re-approves. Current behavior matches pre-regression (full-table `nzLoading` dim). Data integrity restored as priority.
