-- Force stale JWTs to refresh after TRANSFER_CREATE was granted to DEPT_MANAGER.
UPDATE "users" u
SET "permissionVersion" = u."permissionVersion" + 1
WHERE EXISTS (
  SELECT 1
  FROM "tenant_members" tm
  INNER JOIN "roles" r ON r.id = tm."roleId"
  WHERE tm."userId" = u.id
    AND tm."isActive" = true
    AND r.code = 'DEPT_MANAGER'
);
