-- Phase 2 RBAC: HOTEL_USERS_MANAGE + Finance Manager operational parity (governance matrix v1).

INSERT INTO "permissions" ("id", "code", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v.code, v.name, NOW(), NOW()
FROM (VALUES
  ('HOTEL_USERS_MANAGE', 'Manage hotel users (tenant-scoped)'),
  ('TENANT_OPS_DIAGNOSE', 'Tenant operational diagnostics')
) AS v(code, name)
ON CONFLICT ("code") DO NOTHING;

-- Finance: hotel user management + modules marked "Add FINANCE" in 2_PERMISSION_MATRIX.csv
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "roles" r
INNER JOIN "permissions" p ON p.code IN (
  'HOTEL_USERS_MANAGE',
  'BASIC_DATA_EDIT',
  'MOVEMENT_CREATE',
  'ISSUE_CREATE',
  'TRANSFER_CREATE',
  'GRN_MANAGE',
  'BREAKAGE_CREATE',
  'BREAKAGE_VIEW',
  'LOST_ITEMS_VIEW',
  'ADJUSTMENT_CREATE',
  'STOCK_COUNT_MANAGE',
  'GET_PASS_CREATE',
  'GET_PASS_APPROVE',
  'GET_PASS_APPROVE_EXIT',
  'GET_PASS_APPROVE_RETURN',
  'IMPORT_EXCEL',
  'TENANT_OPS_DIAGNOSE'
)
WHERE r.code = 'FINANCE_MANAGER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Invalidate JWTs for users whose permissions may have changed
UPDATE "users" u
SET "permissionVersion" = u."permissionVersion" + 1
WHERE EXISTS (
  SELECT 1
  FROM "tenant_members" tm
  INNER JOIN "roles" ro ON ro.id = tm."roleId"
  WHERE tm."userId" = u.id
    AND tm."isActive" = true
    AND ro.code IN ('FINANCE_MANAGER', 'DEPT_MANAGER', 'STOREKEEPER')
);
