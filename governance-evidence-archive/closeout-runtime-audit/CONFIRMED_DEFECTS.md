# Confirmed Defects (Runtime Evidence Only)

Generated: 2026-06-26T23:38:38.202Z


## GP-FF-DEPT_MANAGER_A

**Type:** Confirmed Runtime Behavior (submit fast-forward stamps)

```json
{
  "userKey": "DEPT_MANAGER_A",
  "user": "fb.manager@grandhorizon.com",
  "role": "DEPT_MANAGER",
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
    "LOST_FOUND_VIEW",
    "LOST_FOUND_CREATE",
    "LOST_FOUND_RETURN",
    "WORKFLOW_PIPELINE_VIEW",
    "REQUISITION_VIEW",
    "REQUISITION_CREATE",
    "REQUISITION_SUBMIT",
    "REQUISITION_APPROVE",
    "GET_PASS_APPROVE"
  ],
  "createHttp": 201,
  "submitHttp": 200,
  "submitError": null,
  "initialStatus": "DRAFT",
  "statusAfterSubmit": "PENDING_COST_CONTROL",
  "expectedFirstPendingStep": "PENDING_DEPT (typical)",
  "approvalStamps": {
    "dept": "326c29fa-8969-4dab-b8db-9e5dabf142ea",
    "costControl": null,
    "finance": null,
    "gm": null,
    "security": null
  },
  "auditActions": [
    "SUBMIT",
    "CREATE"
  ],
  "intermediateApprovalsBySubmitter": true
}
```

## GP-FF-FINANCE

**Type:** Confirmed Runtime Behavior (submit fast-forward stamps)

```json
{
  "userKey": "FINANCE",
  "user": "finance@grandhorizon.com",
  "role": "FINANCE_MANAGER",
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
    "STOCK_COUNT_MANAGE",
    "REPORTS_VIEW",
    "REPORTS_EXPORT",
    "READ_BREAKAGE",
    "READ_LOST",
    "LOST_ITEMS_VIEW",
    "APPROVE_LOST",
    "VIEW_DASHBOARD",
    "DASHBOARD_VIEW",
    "GET_PASS_VIEW",
    "GET_PASS_CREATE",
    "GET_PASS_APPROVE",
    "GET_PASS_APPROVE_EXIT",
    "GET_PASS_APPROVE_RETURN",
    "GET_PASS_FORCE_CLOSE_INITIATE",
    "GET_PASS_CONFIRM_DESTINATION",
    "IMPORT_EXCEL",
    "IMPORT_CREATE",
    "AUDIT_LOG_VIEW",
    "PERIOD_CLOSE_MANAGE",
    "INTEGRITY_VIEW",
    "HOTEL_USERS_MANAGE",
    "USER_MANAGE",
    "TENANT_OPS_DIAGNOSE",
    "ISSUE_VIEW",
    "ADJUSTMENT_VIEW",
    "LOST_FOUND_VIEW",
    "LOST_FOUND_RETURN",
    "WORKFLOW_PIPELINE_VIEW",
    "ACCESS_CONTROL_VIEW",
    "PAR_LEVELS_VIEW",
    "PAR_LEVELS_MANAGE",
    "REQUISITION_VIEW",
    "REQUISITION_CREATE",
    "REQUISITION_SUBMIT",
    "REQUISITION_APPROVE",
    "SETTINGS_MANAGE",
    "TENANT_MANAGE"
  ],
  "createHttp": 201,
  "submitHttp": 200,
  "submitError": null,
  "initialStatus": "DRAFT",
  "statusAfterSubmit": "PENDING_GM",
  "expectedFirstPendingStep": "PENDING_DEPT (typical)",
  "approvalStamps": {
    "dept": null,
    "costControl": null,
    "finance": "e553ca9c-d315-4f28-99ad-1574d1fd49da",
    "gm": null,
    "security": null
  },
  "auditActions": [
    "SUBMIT",
    "CREATE"
  ],
  "intermediateApprovalsBySubmitter": true
}
```

## ACC-STEP-STAMP-STOREKEEPER

**Type:** Confirmed Runtime Behavior (dept step auto-stamped on create)

```json
{
  "userKey": "STOREKEEPER",
  "user": "store@grandhorizon.com",
  "role": "STOREKEEPER",
  "jwtPermissionsSample": [
    "BASIC_DATA_VIEW",
    "INVENTORY_VIEW",
    "MOVEMENTS_VIEW",
    "LEDGER_VIEW",
    "INVENTORY_HISTORY_VIEW",
    "MOVEMENT_CREATE",
    "ISSUE_CREATE",
    "TRANSFER_VIEW"
  ],
  "endpoint": "POST /api/breakage",
  "requestBody": {
    "reason": "CLOSEOUT_RT_AUDIT disposable breakage test",
    "suggestedAction": "HOTEL",
    "notes": "CLOSEOUT_RT_AUDIT",
    "lines": [
      {
        "itemId": "0f97c9cb-5771-4c95-9b6d-eb4ec45ed4c6",
        "locationId": "3dee5398-c0a1-423b-81db-451f295dab61",
        "qty": 1,
        "unitCost": 18,
        "totalValue": 18
      }
    ]
  },
  "initialStatus": "DRAFT (expected for non-auto roles)",
  "httpStatus": 201,
  "errorCode": null,
  "finalDocumentStatus": "DRAFT",
  "approvalRequest": {
    "id": "28d952d6-9b72-46ab-9709-124948078c73",
    "status": "PENDING",
    "currentStep": 2,
    "totalSteps": 4,
    "accWorkflowVersionId": "f1c40d9e-ce82-4836-ba80-bd58118a962f",
    "steps": [
      {
        "stepNumber": 1,
        "requiredRole": "DEPT_MANAGER",
        "status": "APPROVED",
        "actedBy": "store@grandhorizon.com",
        "actedAt": "2026-06-26T23:37:29.555Z",
        "comment": "Auto-approved by system due to high-level authority."
      },
      {
        "stepNumber": 2,
        "requiredRole": "COST_CONTROL",
        "status": "PENDING",
        "actedBy": null,
        "actedAt": null,
        "comment": null
      },
      {
        "stepNumber": 3,
        "requiredRole": "FINANCE_MANAGER",
        "status": "PENDING",
        "actedBy": null,
        "actedAt": null,
        "comment": null
      },
      {
        "stepNumber": 4,
        "requiredRole": "GENERAL_MANAGER",
        "status": "PENDING",
        "actedBy": null,
        "actedAt": null,
        "comment": null
      }
    ]
  },
  "ledger": [],
  "stockDelta": {
    "itemId": "0f97c9cb-5771-4c95-9b6d-eb4ec45ed4c6",
    "locationId": "3dee5398-c0a1-423b-81db-451f295dab61",
    "qtyOnHandAfter": "15"
  },
  "audit": [
    {
      "action": "CREATE",
      "changedAt": "2026-06-26T23:37:29.625Z",
      "changedBy": "119786df-ef21-40df-a585-319e6ea474da"
    }
  ],
  "constitutionResult": "NO_AUTO_APPROVE"
}
```

## ACC-STEP-STAMP-FINANCE

**Type:** Confirmed Runtime Behavior (dept step auto-stamped on create)

```json
{
  "userKey": "FINANCE",
  "user": "finance@grandhorizon.com",
  "role": "FINANCE_MANAGER",
  "jwtPermissionsSample": [
    "BASIC_DATA_VIEW",
    "BASIC_DATA_EDIT",
    "INVENTORY_VIEW",
    "MOVEMENTS_VIEW",
    "LEDGER_VIEW",
    "INVENTORY_HISTORY_VIEW",
    "MOVEMENT_CREATE",
    "ISSUE_CREATE"
  ],
  "endpoint": "POST /api/breakage",
  "requestBody": {
    "reason": "CLOSEOUT_RT_AUDIT disposable breakage test",
    "suggestedAction": "HOTEL",
    "notes": "CLOSEOUT_RT_AUDIT",
    "lines": [
      {
        "itemId": "0f97c9cb-5771-4c95-9b6d-eb4ec45ed4c6",
        "locationId": "3dee5398-c0a1-423b-81db-451f295dab61",
        "qty": 1,
        "unitCost": 18,
        "totalValue": 18
      }
    ]
  },
  "initialStatus": "DRAFT (expected for non-auto roles)",
  "httpStatus": 201,
  "errorCode": null,
  "finalDocumentStatus": "DRAFT",
  "approvalRequest": {
    "id": "3632d23b-6057-469a-ad6a-cd237fc4638d",
    "status": "PENDING",
    "currentStep": 2,
    "totalSteps": 4,
    "accWorkflowVersionId": "f1c40d9e-ce82-4836-ba80-bd58118a962f",
    "steps": [
      {
        "stepNumber": 1,
        "requiredRole": "DEPT_MANAGER",
        "status": "APPROVED",
        "actedBy": "finance@grandhorizon.com",
        "actedAt": "2026-06-26T23:37:30.695Z",
        "comment": "Auto-approved by system due to high-level authority."
      },
      {
        "stepNumber": 2,
        "requiredRole": "COST_CONTROL",
        "status": "PENDING",
        "actedBy": null,
        "actedAt": null,
        "comment": null
      },
      {
        "stepNumber": 3,
        "requiredRole": "FINANCE_MANAGER",
        "status": "PENDING",
        "actedBy": null,
        "actedAt": null,
        "comment": null
      },
      {
        "stepNumber": 4,
        "requiredRole": "GENERAL_MANAGER",
        "status": "PENDING",
        "actedBy": null,
        "actedAt": null,
        "comment": null
      }
    ]
  },
  "ledger": [],
  "stockDelta": {
    "itemId": "0f97c9cb-5771-4c95-9b6d-eb4ec45ed4c6",
    "locationId": "3dee5398-c0a1-423b-81db-451f295dab61",
    "qtyOnHandAfter": "15"
  },
  "audit": [
    {
      "action": "CREATE",
      "changedAt": "2026-06-26T23:37:30.738Z",
      "changedBy": "e553ca9c-d315-4f28-99ad-1574d1fd49da"
    }
  ],
  "constitutionResult": "NO_AUTO_APPROVE"
}
```

## TEST-backend_unit_tests

**Type:** Automated test failure

```json
{
  "command": "C:\\Program Files\\nodejs\\node.exe --test src/**/*.test.js scripts/**/*.test.js",
  "exit": 1,
  "exactFailure": "✖ postDocument OPENING_BALANCE prefetches stock and skips zero-qty lines (235.5273ms)\n  TypeError: validatePostingDate is not a function\n      at Object.postDocument (C:\\DX OS&E\\OSE-backend\\src\\services\\posting.service.js:100:11)\n      at async TestContext.<anonymous> (C:\\DX OS&E\\OSE-backend\\src\\services\\posting.service.test.js:179:5)\n      at async Test.run (node:internal/test_runner/test:1125:7)\n      at async Test.processPendingSubtests (node:internal/test_runner/test:787:7)\n\ntest at src\\services\\posting.service.test.js:190:1\n✖ postDocument OPENING_BALANCE writes audit inside parent transaction when tx passed (3.2119ms)\n  TypeError: validatePostingDate is not a function\n      at Object.postDocument (C:\\DX OS&E\\OSE-backend\\src\\services\\posting.service.js:100:11)\n      at async TestContext.<anonymous> (C:\\DX OS&E\\OSE-backend\\src\\services\\posting.service.test.js:205:5)\n      at async Test.run (node:internal/test_runner/test:1125:7)\n      at async Test.processPendingSubtests (node:internal/test_runner/test:787:7)\n"
}
```

## TEST-governance_integration

**Type:** Automated test failure

```json
{
  "command": "C:\\Program Files\\nodejs\\node.exe scripts/run-governance-integration.js",
  "exit": 1,
  "exactFailure": "     ?   totalQtyLost?: SortOrder,\n     ?   totalQtyDamage?: SortOrder,\n     ?   wacUnitCost?: SortOrder,\n     ?   lastUpdated?: SortOrder,\n     ?   maxQty?: SortOrder,\n     ?   minQty?: SortOrder,\n     ?   reorderPoint?: SortOrder,\n     ?   item?: ItemOrderByWithRelationInput,\n     ?   location?: LocationOrderByWithRelationInput,\n     ?   tenant?: TenantOrderByWithRelationInput\n       }\n     })\n\nUnknown argument `updatedAt`. Available options are marked with ?.\n"
}
```

## TEST-reporting_final_regression

**Type:** Automated test failure

```json
{
  "command": "C:\\Program Files\\nodejs\\node.exe scripts/smoke-reporting-final-regression.js",
  "exit": 1,
  "exactFailure": "  PASS  Golden PDF renders (39956 bytes)\n  PASS  Stock balance 26 lines PDF page count 2 (no ghost pages)\n  PASS  Stock PDF raw SAR path preserved (100.00)\n  PASS  Golden blended WAC derived (5)\n  PASS  Summary inventory PDF renders (41131 bytes)\n  PASS  Summary PDF valid vector document header\n  PASS  Grouped export detected for PDF presenter\n  PASS  Golden Excel renders (7794 bytes)\n\nSamples: C:\\DX OS&E\\OSE-backend\\tmp\\reporting-final-regression\n  PASS  Engine OMC grouped export columns resolved\n\n--- Final regression: 23 passed, 1 failed ---\n  FAIL  Golden column width sum 767 expected ~770\n"
}
```

## TEST-frontend_unit_headless

**Type:** Automated test failure

```json
{
  "command": "C:\\Program Files\\nodejs\\node.exe C:\\DX OS&E\\OSE-Frontend\\node_modules\\@angular\\cli\\bin\\ng.js test --watch=false --browsers=ChromeHeadless",
  "exit": 1,
  "exactFailure": "Node.js version v25.6.0 detected.\nOdd numbered Node.js versions will not enter LTS status and should not be used for production. For more information, please see https://nodejs.org/en/about/previous-releases/.\nThe following packages are required but were not found:\n  - The \"browsers\" option requires either \"@vitest/browser-playwright\", \"@vitest/browser-webdriverio\", or \"@vitest/browser-preview\" to be installed.\nPlease install the missing packages and rerun the test command.\n"
}
```
