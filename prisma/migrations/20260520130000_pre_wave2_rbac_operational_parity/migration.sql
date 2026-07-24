-- Pre-Wave 2: operational RBAC parity for Storekeeper, Finance Manager, Cost Control, Auditor.
-- Aligns role_permissions with 2_PERMISSION_MATRIX.csv + register nav permissions.

INSERT INTO "permissions" ("id", "code", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v.code, v.name, NOW(), NOW()
FROM (VALUES
  ('MOVEMENTS_VIEW', 'Movement register read'),
  ('LEDGER_VIEW', 'Inventory ledger read'),
  ('INVENTORY_HISTORY_VIEW', 'Inventory history read'),
  ('GRN_VIEW', 'GRN read'),
  ('GRN_MANAGE', 'GRN manage'),
  ('STOCK_COUNT_VIEW', 'Inventory count read'),
  ('STOCK_COUNT_MANAGE', 'Inventory count manage'),
  ('INVENTORY_VIEW', 'Inventory read'),
  ('TRANSFER_VIEW', 'Transfer read'),
  ('GET_PASS_VIEW', 'Get pass read'),
  ('BREAKAGE_VIEW', 'Breakage list read'),
  ('AUDIT_LOG_VIEW', 'Audit log read'),
  ('PERIOD_CLOSE_MANAGE', 'Period close manage'),
  ('INTEGRITY_VIEW', 'Integrity dashboard read')
) AS v(code, name)
ON CONFLICT ("code") DO NOTHING;

-- STOREKEEPER operational bundle
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "roles" r
INNER JOIN "permissions" p ON p.code IN (
  'BASIC_DATA_VIEW',
  'INVENTORY_VIEW',
  'MOVEMENTS_VIEW',
  'LEDGER_VIEW',
  'INVENTORY_HISTORY_VIEW',
  'MOVEMENT_CREATE',
  'ISSUE_CREATE',
  'TRANSFER_VIEW',
  'TRANSFER_DISPATCH_RECEIVE',
  'GRN_VIEW',
  'GRN_MANAGE',
  'BREAKAGE_CREATE',
  'ADJUSTMENT_CREATE',
  'STOCK_COUNT_VIEW',
  'STOCK_COUNT_MANAGE',
  'REPORTS_VIEW',
  'VIEW_DASHBOARD',
  'DASHBOARD_VIEW',
  'GET_PASS_VIEW',
  'GET_PASS_CREATE',
  'IMPORT_EXCEL',
  'IMPORT_CREATE'
)
WHERE r.code = 'STOREKEEPER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- FINANCE_MANAGER operational bundle
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "roles" r
INNER JOIN "permissions" p ON p.code IN (
  'BASIC_DATA_VIEW',
  'BASIC_DATA_EDIT',
  'INVENTORY_VIEW',
  'MOVEMENTS_VIEW',
  'LEDGER_VIEW',
  'INVENTORY_HISTORY_VIEW',
  'MOVEMENT_CREATE',
  'ISSUE_CREATE',
  'ISSUE_APPROVE',
  'TRANSFER_VIEW',
  'TRANSFER_CREATE',
  'TRANSFER_APPROVE',
  'GRN_VIEW',
  'GRN_MANAGE',
  'BREAKAGE_VIEW',
  'BREAKAGE_CREATE',
  'APPROVE_BREAKAGE',
  'ADJUSTMENT_CREATE',
  'STOCK_COUNT_VIEW',
  'STOCK_COUNT_MANAGE',
  'REPORTS_VIEW',
  'REPORTS_EXPORT',
  'READ_BREAKAGE',
  'READ_LOST',
  'LOST_ITEMS_VIEW',
  'APPROVE_LOST',
  'VIEW_DASHBOARD',
  'DASHBOARD_VIEW',
  'GET_PASS_VIEW',
  'GET_PASS_CREATE',
  'GET_PASS_APPROVE',
  'GET_PASS_APPROVE_EXIT',
  'GET_PASS_APPROVE_RETURN',
  'IMPORT_EXCEL',
  'IMPORT_CREATE',
  'AUDIT_LOG_VIEW',
  'PERIOD_CLOSE_MANAGE',
  'INTEGRITY_VIEW',
  'HOTEL_USERS_MANAGE',
  'TENANT_OPS_DIAGNOSE'
)
WHERE r.code = 'FINANCE_MANAGER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- COST_CONTROL (count review + register visibility)
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "roles" r
INNER JOIN "permissions" p ON p.code IN (
  'BASIC_DATA_VIEW',
  'INVENTORY_VIEW',
  'MOVEMENTS_VIEW',
  'LEDGER_VIEW',
  'INVENTORY_HISTORY_VIEW',
  'TRANSFER_VIEW',
  'GRN_VIEW',
  'GRN_MANAGE',
  'BREAKAGE_VIEW',
  'APPROVE_BREAKAGE',
  'STOCK_COUNT_VIEW',
  'REPORTS_VIEW',
  'REPORTS_EXPORT',
  'READ_BREAKAGE',
  'READ_LOST',
  'VIEW_DASHBOARD',
  'DASHBOARD_VIEW'
)
WHERE r.code = 'COST_CONTROL'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- AUDITOR read bundle (register + count read)
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "roles" r
INNER JOIN "permissions" p ON p.code IN (
  'BASIC_DATA_VIEW',
  'INVENTORY_VIEW',
  'MOVEMENTS_VIEW',
  'LEDGER_VIEW',
  'INVENTORY_HISTORY_VIEW',
  'TRANSFER_VIEW',
  'GRN_VIEW',
  'STOCK_COUNT_VIEW',
  'REPORTS_VIEW',
  'REPORTS_EXPORT',
  'VIEW_DASHBOARD',
  'AUDIT_LOG_VIEW',
  'INTEGRITY_VIEW'
)
WHERE r.code = 'AUDITOR'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Force JWT refresh for affected roles
UPDATE "users" u
SET "permissionVersion" = u."permissionVersion" + 1
WHERE EXISTS (
  SELECT 1
  FROM "tenant_members" tm
  INNER JOIN "roles" ro ON ro.id = tm."roleId"
  WHERE tm."userId" = u.id
    AND tm."isActive" = true
    AND ro.code IN ('STOREKEEPER', 'FINANCE_MANAGER', 'COST_CONTROL', 'AUDITOR', 'DEPT_MANAGER')
);
