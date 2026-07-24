-- Inventory count GM approval workflow: executive approve permission for Finance + GM steps.

INSERT INTO "permissions" ("id", "code", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'APPROVE_INVENTORY_COUNT', 'Approve inventory count session', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "code" = 'APPROVE_INVENTORY_COUNT'
);

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "roles" r
INNER JOIN "permissions" p ON p.code = 'APPROVE_INVENTORY_COUNT'
WHERE r.code IN ('FINANCE_MANAGER', 'GENERAL_MANAGER', 'ORG_MANAGER', 'SUPER_ADMIN')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

UPDATE "users" u
SET "permissionVersion" = u."permissionVersion" + 1
WHERE u.id IN (
  SELECT DISTINCT tm."userId"
  FROM "tenant_members" tm
  INNER JOIN "roles" r ON r.id = tm."roleId"
  WHERE r.code IN ('FINANCE_MANAGER', 'GENERAL_MANAGER', 'ORG_MANAGER') AND tm."isActive" = true
);
