# Closeout Runtime Audit — Execution Environment

**Executed at:** 2026-06-27T16:32:34.460Z

## Tenants

| Label | Slug | ID |
|-------|------|-----|
| Hotel A | grand-horizon | d7f5e85c-86f9-487d-b17d-708cebcf9ca3 |
| Hotel B | dx-airport-hotel | bf7638b8-04db-4051-94d1-0cf039827c00 |

## API / Frontend

- API: http://127.0.0.1:4000/api
- Frontend: http://127.0.0.1:4200

## Stock fixture (Hotel A)

```json
{
  "itemId": "0f97c9cb-5771-4c95-9b6d-eb4ec45ed4c6",
  "itemName": "Garbage Bag Roll (50pcs)",
  "locationId": "3dee5398-c0a1-423b-81db-451f295dab61",
  "locationName": "Main Store",
  "departmentId": "dd8e4d25-b467-4b72-ac7c-791a659c07f3",
  "qtyOnHand": 15,
  "unitCost": 18
}
```

## Users tested (login probe)

```json
{
  "DEPT_MANAGER_A": {
    "email": "fb.manager@grandhorizon.com",
    "role": "DEPT_MANAGER",
    "loginOk": true,
    "httpStatus": 200,
    "permissions": [
      "BASIC_DATA_VIEW",
      "INVENTORY_VIEW",
      "ISSUE_CREATE",
      "ISSUE_APPROVE",
      "TRANSFER_VIEW",
      "TRANSFER_CREATE",
      "TRANSFER_APPROVE",
      "BREAKAGE_VIEW",
      "BREAKAGE_CREATE",
      "APPROVE_BREAKAGE",
      "REPORTS_VIEW",
      "LOST_ITEMS_VIEW",
      "APPROVE_LOST",
      "LOST_CREATE",
      "VIEW_DASHBOARD",
      "DASHBOARD_VIEW",
      "GET_PASS_CREATE",
      "GET_PASS_VIEW",
      "ISSUE_VIEW",
      "LOST_FOUND_VIEW"
    ],
    "permissionCount": 28,
    "tenantSlug": "grand-horizon"
  },
  "DEPT_MANAGER_B": {
    "email": "hk.manager@grandhorizon.com",
    "role": "DEPT_MANAGER",
    "loginOk": true,
    "httpStatus": 200,
    "permissions": [
      "BASIC_DATA_VIEW",
      "INVENTORY_VIEW",
      "ISSUE_CREATE",
      "ISSUE_APPROVE",
      "TRANSFER_VIEW",
      "TRANSFER_CREATE",
      "TRANSFER_APPROVE",
      "BREAKAGE_VIEW",
      "BREAKAGE_CREATE",
      "APPROVE_BREAKAGE",
      "REPORTS_VIEW",
      "LOST_ITEMS_VIEW",
      "APPROVE_LOST",
      "LOST_CREATE",
      "VIEW_DASHBOARD",
      "DASHBOARD_VIEW",
      "GET_PASS_CREATE",
      "GET_PASS_VIEW",
      "ISSUE_VIEW",
      "LOST_FOUND_VIEW"
    ],
    "permissionCount": 28,
    "tenantSlug": "grand-horizon"
  },
  "STOREKEEPER": {
    "email": "store@grandhorizon.com",
    "role": "STOREKEEPER",
    "loginOk": true,
    "httpStatus": 200,
    "permissions": [
      "BASIC_DATA_VIEW",
      "INVENTORY_VIEW",
      "MOVEMENTS_VIEW",
      "LEDGER_VIEW",
      "INVENTORY_HISTORY_VIEW",
      "MOVEMENT_CREATE",
      "ISSUE_CREATE",
      "TRANSFER_VIEW",
      "TRANSFER_DISPATCH_RECEIVE",
      "GRN_VIEW",
      "GRN_MANAGE",
      "BREAKAGE_CREATE",
      "STOCK_COUNT_VIEW",
      "STOCK_COUNT_MANAGE",
      "VIEW_DASHBOARD",
      "DASHBOARD_VIEW",
      "GET_PASS_VIEW",
      "GET_PASS_CREATE",
      "IMPORT_EXCEL",
      "IMPORT_CREATE"
    ],
    "permissionCount": 39,
    "tenantSlug": "grand-horizon"
  },
  "COST_CONTROL": {
    "email": "cost@grandhorizon.com",
    "role": "COST_CONTROL",
    "loginOk": true,
    "httpStatus": 200,
    "permissions": [
      "BASIC_DATA_VIEW",
      "INVENTORY_VIEW",
      "MOVEMENTS_VIEW",
      "LEDGER_VIEW",
      "INVENTORY_HISTORY_VIEW",
      "TRANSFER_VIEW",
      "GRN_VIEW",
      "GRN_MANAGE",
      "BREAKAGE_VIEW",
      "APPROVE_BREAKAGE",
      "STOCK_COUNT_VIEW",
      "STOCK_COUNT_MANAGE",
      "READ_BREAKAGE",
      "READ_LOST",
      "VIEW_DASHBOARD",
      "DASHBOARD_VIEW",
      "GET_PASS_VIEW",
      "APPROVE_LOST",
      "REPORTS_VIEW",
      "REPORTS_EXPORT"
    ],
    "permissionCount": 29,
    "tenantSlug": "grand-horizon"
  },
  "FINANCE": {
    "email": "finance@grandhorizon.com",
    "role": "FINANCE_MANAGER",
    "loginOk": true,
    "httpStatus": 200,
    "permissions": [
      "BASIC_DATA_VIEW",
      "BASIC_DATA_EDIT",
      "INVENTORY_VIEW",
      "MOVEMENTS_VIEW",
      "LEDGER_VIEW",
      "INVENTORY_HISTORY_VIEW",
      "MOVEMENT_CREATE",
      "ISSUE_CREATE",
      "ISSUE_APPROVE",
      "TRANSFER_VIEW",
      "TRANSFER_CREATE",
      "TRANSFER_APPROVE",
      "GRN_VIEW",
      "GRN_MANAGE",
      "BREAKAGE_VIEW",
      "BREAKAGE_CREATE",
      "APPROVE_BREAKAGE",
      "ADJUSTMENT_CREATE",
      "STOCK_COUNT_VIEW",
      "STOCK_COUNT_MANAGE"
    ],
    "permissionCount": 57,
    "tenantSlug": "grand-horizon"
  },
  "GM": {
    "email": "richard.evans@dxuat.com",
    "role": "GENERAL_MANAGER",
    "loginOk": false,
    "httpStatus": 401,
    "permissions": [],
    "permissionCount": 0
  },
  "ADMIN": {
    "email": "admin@grandhorizon.com",
    "role": "ADMIN",
    "loginOk": true,
    "httpStatus": 200,
    "permissions": [
      "BASIC_DATA_EDIT",
      "BASIC_DATA_VIEW",
      "INVENTORY_VIEW",
      "MOVEMENT_CREATE",
      "ISSUE_CREATE",
      "ISSUE_APPROVE",
      "TRANSFER_CREATE",
      "TRANSFER_APPROVE",
      "TRANSFER_DISPATCH_RECEIVE",
      "GRN_VIEW",
      "GRN_MANAGE",
      "BREAKAGE_CREATE",
      "ADJUSTMENT_CREATE",
      "STOCK_COUNT_MANAGE",
      "STOCK_COUNT_VIEW",
      "REPORTS_VIEW",
      "BREAKAGE_VIEW",
      "LOST_ITEMS_VIEW",
      "REPORTS_EXPORT",
      "VIEW_DASHBOARD"
    ],
    "permissionCount": 43,
    "tenantSlug": "grand-horizon"
  },
  "AUDITOR": {
    "email": "auditor@grandhorizon.com",
    "role": "AUDITOR",
    "loginOk": false,
    "httpStatus": 401,
    "permissions": [],
    "permissionCount": 0
  }
}
```

## ORG_MANAGER memberships

```json
[
  {
    "email": "amr.seif_test@dx.com",
    "tenantSlug": "tets-org-1",
    "tenantId": "f810d3fe-54fa-493c-bbc0-1b1ff65e73a5"
  },
  {
    "email": "amr.seif_test@dx.com",
    "tenantSlug": "roma-2",
    "tenantId": "f3da1cfd-a397-42f5-a470-3e511d56bece"
  },
  {
    "email": "amr.test@dx.com",
    "tenantSlug": "rotana",
    "tenantId": "90d14b98-4404-4127-95bb-ccbf3aa4ef17"
  },
  {
    "email": "org-mgr-disposable@closeout-audit.local",
    "tenantSlug": "closeout-audit-org-disposable",
    "tenantId": "7c312820-957e-4b08-bcc3-07e8b9fc288f"
  },
  {
    "email": "amr_test@g.com",
    "tenantSlug": "hotel-test",
    "tenantId": "d8b7455c-1ac2-4b14-959f-f4c4f3331ed8"
  },
  {
    "email": "daniel.carter@dxuat.com",
    "tenantSlug": "dx-hospitality-group",
    "tenantId": "3f763a13-177d-44e7-81f5-5640a7e8ead5"
  },
  {
    "email": "amr.seif_test@dx.com",
    "tenantSlug": "roma-1",
    "tenantId": "90a23ac2-c0cb-4344-89f2-34fddfef021a"
  },
  {
    "email": "amr@ga.com",
    "tenantSlug": "test-org",
    "tenantId": "e45aca57-0cef-4c16-8e1b-f98599891652"
  },
  {
    "email": "amr_test@dx.com",
    "tenantSlug": "voco-khobar-hotel",
    "tenantId": "a039cd6e-efca-4ff2-9915-d83404c83cf2"
  },
  {
    "email": "org-mgr@closeout-audit.local",
    "tenantSlug": "dx-hospitality-group",
    "tenantId": "3f763a13-177d-44e7-81f5-5640a7e8ead5"
  }
]
```

## SUPER_ADMIN operational (Hotel A context)

```json
{
  "email": "superadmin@ose.cloud",
  "loginOk": false,
  "permissionCount": 0
}
```

