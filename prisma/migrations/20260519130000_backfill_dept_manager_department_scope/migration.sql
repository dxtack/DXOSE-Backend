-- Phase 1 UAT: dept managers must have tenant_members.departmentId for department scope.
UPDATE tenant_members tm
SET "departmentId" = d.id,
    "updatedAt" = NOW()
FROM users u,
     departments d,
     roles r
WHERE tm."userId" = u.id
  AND tm."roleId" = r.id
  AND r.code = 'DEPT_MANAGER'
  AND tm."departmentId" IS NULL
  AND d."tenantId" = tm."tenantId"
  AND (
    (LOWER(u.email) = 'fb.manager@grandhorizon.com' AND d.code = 'FB')
    OR (LOWER(u.email) = 'hk.manager@grandhorizon.com' AND d.code = 'HK')
  );
