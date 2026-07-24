-- GM executive menu: revoke operational permissions; add period/integrity nav permissions.

INSERT INTO "permissions" ("id", "code", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v.code, v.name, NOW(), NOW()
FROM (VALUES
  ('PERIOD_CLOSE_MANAGE', 'Period close and reopen'),
  ('INTEGRITY_VIEW', 'Data integrity dashboard read')
) AS v(code, name)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "roles" r
INNER JOIN "permissions" p ON p.code IN ('PERIOD_CLOSE_MANAGE')
WHERE r.code IN ('FINANCE_MANAGER', 'ORG_MANAGER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "roles" r
INNER JOIN "permissions" p ON p.code IN ('INTEGRITY_VIEW')
WHERE r.code IN ('FINANCE_MANAGER', 'ORG_MANAGER', 'AUDITOR')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."roleId" = r.id
  AND rp."permissionId" = p.id
  AND r.code = 'GENERAL_MANAGER'
  AND p.code IN (
    'BASIC_DATA_VIEW',
    'INVENTORY_VIEW',
    'TRANSFER_VIEW',
    'GRN_VIEW',
    'STOCK_COUNT_VIEW',
    'GET_PASS_VIEW',
    'LOST_ITEMS_VIEW',
    'MOVEMENT_CREATE',
    'BREAKAGE_CREATE',
    'TRANSFER_CREATE',
    'TRANSFER_APPROVE',
    'GRN_MANAGE',
    'STOCK_COUNT_MANAGE',
    'GET_PASS_CREATE',
    'IMPORT_EXCEL'
  );

UPDATE "users" u
SET "permissionVersion" = u."permissionVersion" + 1
WHERE u.id IN (
  SELECT DISTINCT tm."userId"
  FROM "tenant_members" tm
  INNER JOIN "roles" r ON r.id = tm."roleId"
  WHERE r.code = 'GENERAL_MANAGER' AND tm."isActive" = true
);
