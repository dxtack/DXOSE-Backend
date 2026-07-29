-- GM operational read permissions: grant VIEW/READ access across operational
-- modules so the General Manager can navigate to pages where they participate
-- in approval workflows (Stock Count, Transfer, Breakage, etc.).

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
  'TRANSFER_APPROVE',
  'GRN_VIEW',
  'BREAKAGE_VIEW',
  'ADJUSTMENT_VIEW',
  'STOCK_COUNT_VIEW',
  'LOST_ITEMS_VIEW',
  'GET_PASS_VIEW',
  'INTEGRITY_VIEW'
)
WHERE r.code = 'GENERAL_MANAGER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Also sync ur_role_permissions (ACC authority layer).
INSERT INTO "ur_role_permissions" ("id", "roleId", "permissionId")
SELECT gen_random_uuid(), r.id, up.id
FROM "roles" r
INNER JOIN "ur_permissions" up ON up."legacyCode" IN (
  'BASIC_DATA_VIEW',
  'INVENTORY_VIEW',
  'MOVEMENTS_VIEW',
  'LEDGER_VIEW',
  'INVENTORY_HISTORY_VIEW',
  'TRANSFER_VIEW',
  'TRANSFER_APPROVE',
  'GRN_VIEW',
  'BREAKAGE_VIEW',
  'ADJUSTMENT_VIEW',
  'STOCK_COUNT_VIEW',
  'LOST_ITEMS_VIEW',
  'GET_PASS_VIEW',
  'INTEGRITY_VIEW'
)
WHERE r.code = 'GENERAL_MANAGER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Bump permissionVersion for all active GM users so clients re-fetch permissions.
UPDATE "users" u
SET "permissionVersion" = u."permissionVersion" + 1
WHERE u.id IN (
  SELECT DISTINCT tm."userId"
  FROM "tenant_members" tm
  INNER JOIN "roles" r ON r.id = tm."roleId"
  WHERE r.code = 'GENERAL_MANAGER' AND tm."isActive" = true
);
