-- Department managers create and submit inter-store transfer requests (JWT from role_permissions).
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "roles" r
INNER JOIN "permissions" p ON p.code = 'TRANSFER_CREATE'
WHERE r.code = 'DEPT_MANAGER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
