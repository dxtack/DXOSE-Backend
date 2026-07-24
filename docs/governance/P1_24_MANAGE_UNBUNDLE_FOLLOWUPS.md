# P1 #24 — MANAGE bundle unbundle follow-ups (documentation only)

First executed unbundle: **STOCK_COUNT_MANAGE** → granular UR permissions
`STOCK_COUNT_CREATE`, `STOCK_COUNT_EXECUTE`, `STOCK_COUNT_CANCEL`,
`STOCK_COUNT_RECOUNT`, `STOCK_COUNT_SUBMIT` (view/approve already separate).

This note records the **proposed** split for remaining composite bundles.
**Do not implement here** — future work only.

---

## 1) `GRN_MANAGE`

**Likely current surface:** create GRN, edit draft lines, receive/complete,
cancel/void, possibly submit-to-approval if chained.

**Proposed split (UI-aligned):**

| Permission | Ops |
|---|---|
| `GRN_CREATE` | Create GRN / start draft |
| `GRN_EDIT` | Edit draft lines / headers while editable |
| `GRN_RECEIVE` | Receive / complete receiving steps |
| `GRN_CANCEL` | Cancel / void (if not already a separate approve path) |
| `GRN_SUBMIT` | Submit for approval (if distinct from receive) |

**Keep separate if already present:** `GRN_VIEW`, any `GRN_APPROVE*`.

**Migration rule:** every role with `GRN_MANAGE` gets the full equivalent set;
bidirectional `hasPermission` synonym until JWTs refresh.

---

## 2) `BASIC_DATA_EDIT`

**Likely current surface:** items, categories, locations, suppliers, UOMs,
and other master-data write screens gated by one edit key.

**Proposed split (by master entity / screen):**

| Permission | Ops |
|---|---|
| `ITEM_EDIT` (or keep `ITEM_MANAGE` canonical) | Item create/update |
| `CATEGORY_EDIT` | Category create/update |
| `LOCATION_EDIT` | Location create/update |
| `SUPPLIER_EDIT` | Supplier create/update |
| `UOM_EDIT` | UOM create/update |

**Keep:** `BASIC_DATA_VIEW` as read umbrella (or split later if needed).

**Note:** several aliases already map into `BASIC_DATA_EDIT` / `ITEM_MANAGE` —
inventory aliases carefully before unbundling.

---

## 3) Users / Settings / Platform packs

### Users
| Current | Proposed |
|---|---|
| `HOTEL_USERS_MANAGE` | Keep hotel-scoped user CRUD; optional later: invite vs deactivate |
| `USERS_COMPANY_MANAGE` | Keep org-scoped user CRUD |
| `USER_MANAGE` | Retire/alias once hotel+org covers all callers |

### Settings
| Current | Proposed |
|---|---|
| `SETTINGS_MANAGE` | Split only if UI has clear tabs: e.g. `SETTINGS_TENANT_EDIT`, `SETTINGS_NUMBERING_EDIT`, `SETTINGS_NOTIFICATION_EDIT` |
| `TENANT_MANAGE` | Align with org-settings only; avoid overlapping `SETTINGS_MANAGE` |

### Platform / Access Control
| Current | Proposed |
|---|---|
| `PLATFORM_MANAGE` | Super-admin platform ops — leave bundled unless console gains distinct dangerous actions |
| `ACCESS_CONTROL_MANAGE` | Keep as UR admin write; `ACCESS_CONTROL_VIEW` already separate |
| `SUPER_ADMIN_PORTAL_ACCESS` | Portal entry only — do not merge into `PLATFORM_MANAGE` |

---

## Execution order (suggested)

1. ~~STOCK_COUNT_MANAGE~~ (done in P1 #24)
2. `GRN_MANAGE` (high traffic ops; clear create/receive/cancel UI)
3. `BASIC_DATA_EDIT` (many screens; higher alias risk)
4. Users/Settings/Platform (governance-sensitive; do last)

Each step must: catalog + BASE grants + route/UI guards + no-regression test
+ DB grant equivalent set with **zero capability loss**.
