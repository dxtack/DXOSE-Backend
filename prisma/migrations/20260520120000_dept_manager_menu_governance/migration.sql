-- Dept manager UI governance: granular register/history nav perms; revoke GRN + register views.

INSERT INTO "permissions" ("id", "code", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v.code, v.name, NOW(), NOW()
FROM (VALUES
  ('MOVEMENTS_VIEW', 'Movement register read'),
  ('LEDGER_VIEW', 'Inventory ledger read'),
  ('INVENTORY_HISTORY_VIEW', 'Inventory history (audit filter) read')
) AS v(code, name)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "roles" r
INNER JOIN "permissions" p ON p.code IN ('MOVEMENTS_VIEW', 'LEDGER_VIEW', 'INVENTORY_HISTORY_VIEW')
WHERE r.code IN ('STOREKEEPER', 'COST_CONTROL', 'FINANCE_MANAGER', 'AUDITOR')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."roleId" = r.id
  AND rp."permissionId" = p.id
  AND r.code = 'DEPT_MANAGER'
  AND p.code IN ('GRN_VIEW', 'MOVEMENTS_VIEW', 'LEDGER_VIEW', 'INVENTORY_HISTORY_VIEW');

UPDATE "users" u
SET "permissionVersion" = u."permissionVersion" + 1
WHERE u.id IN (
  SELECT DISTINCT tm."userId"
  FROM "tenant_members" tm
  INNER JOIN "roles" r ON r.id = tm."roleId"
  WHERE r.code = 'DEPT_MANAGER' AND tm."isActive" = true
);
