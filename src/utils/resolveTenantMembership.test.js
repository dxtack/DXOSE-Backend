const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Regression: inactive direct hotel membership must not block ORG_MANAGER parent access.
 */
test('resolveTenantMembership prefers active direct membership', async (t) => {
  const { resolveTenantMembership } = require('./resolveTenantMembership');
  const childTenantId = 'child-tenant';
  const parentTenantId = 'parent-org';
  const userId = 'user-1';

  const db = {
    tenantMember: {
      findFirst: async ({ where }) => {
        if (where.tenantId === childTenantId && where.userId === userId) {
          return {
            isActive: true,
            role: { code: 'ADMIN' },
            roleId: 'role-admin',
            tenantId: childTenantId,
          };
        }
        return null;
      },
    },
    tenant: { findUnique: async () => null },
  };

  const result = await resolveTenantMembership(db, userId, childTenantId, {
    include: { role: true },
  });
  assert.equal(result.isInherited, false);
  assert.equal(result.membership.role.code, 'ADMIN');
});

test('resolveTenantMembership inherits ORG_MANAGER when direct membership is inactive', async (t) => {
  const { resolveTenantMembership } = require('./resolveTenantMembership');
  const childTenantId = 'child-tenant';
  const parentTenantId = 'parent-org';
  const userId = 'user-1';

  const db = {
    tenantMember: {
      findFirst: async ({ where }) => {
        if (where.tenantId === childTenantId && where.userId === userId) {
          return {
            isActive: false,
            role: { code: 'FINANCE_MANAGER' },
            roleId: 'role-finance',
            tenantId: childTenantId,
          };
        }
        if (
          where.tenantId === parentTenantId &&
          where.userId === userId &&
          where.role?.code === 'ORG_MANAGER'
        ) {
          return {
            isActive: true,
            role: { code: 'ORG_MANAGER' },
            roleId: 'role-org',
            departmentId: null,
          };
        }
        return null;
      },
    },
    tenant: {
      findUnique: async ({ where }) => {
        if (where.id === childTenantId) {
          return {
            id: childTenantId,
            slug: 'hotel-1',
            name: 'Hotel 1',
            parentId: parentTenantId,
            isActive: true,
          };
        }
        if (where.id === parentTenantId) {
          return {
            id: parentTenantId,
            parentId: null,
            isActive: true,
          };
        }
        return null;
      },
    },
  };

  const result = await resolveTenantMembership(db, userId, childTenantId, {
    include: { role: true },
    attachTenant: true,
  });
  assert.equal(result.isInherited, true);
  assert.equal(result.membership.role.code, 'ORG_MANAGER');
  assert.equal(result.membership.tenantId, childTenantId);
  assert.ok(result.inactiveDirect);
});

test('resolveTenantMembership returns inactiveDirect when no inheritance path', async (t) => {
  const { resolveTenantMembership } = require('./resolveTenantMembership');
  const childTenantId = 'child-tenant';
  const userId = 'user-1';

  const db = {
    tenantMember: {
      findFirst: async ({ where }) => {
        if (where.tenantId === childTenantId) {
          return { isActive: false, role: { code: 'STOREKEEPER' }, tenantId: childTenantId };
        }
        return null;
      },
    },
    tenant: {
      findUnique: async () => ({
        id: childTenantId,
        parentId: 'parent-without-manager',
        isActive: true,
      }),
    },
  };

  const result = await resolveTenantMembership(db, userId, childTenantId);
  assert.equal(result.membership, null);
  assert.ok(result.inactiveDirect);
});
