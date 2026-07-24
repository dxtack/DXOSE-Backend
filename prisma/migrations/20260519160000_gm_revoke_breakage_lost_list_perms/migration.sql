-- GM: revoke list/read breakage & lost permissions (keep APPROVE_BREAKAGE / APPROVE_LOST for detail + pipeline).

DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."roleId" = r.id
  AND rp."permissionId" = p.id
  AND r.code = 'GENERAL_MANAGER'
  AND p.code IN (
    'READ_BREAKAGE',
    'READ_LOST',
    'BREAKAGE_VIEW',
    'LOST_ITEMS_VIEW',
    'INVENTORY_VIEW'
  );

UPDATE "users" u
SET "permissionVersion" = u."permissionVersion" + 1
WHERE u.id IN (
  SELECT DISTINCT tm."userId"
  FROM "tenant_members" tm
  INNER JOIN "roles" r ON r.id = tm."roleId"
  WHERE r.code = 'GENERAL_MANAGER' AND tm."isActive" = true
);
