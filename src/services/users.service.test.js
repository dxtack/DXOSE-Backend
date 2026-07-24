const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOrgHierarchyTenantIds, getOrgManagerTenantIds } = require('./users.service');

function mockDb({ orgManagerTenantIds = [], tenants = [], hierarchyTenants = [] }) {
    return {
        tenantMember: {
            findMany: async () =>
                orgManagerTenantIds.map((tenantId) => ({ tenantId })),
        },
        tenant: {
            findMany: async ({ where }) => {
                if (where.id?.in) {
                    return tenants.filter((t) => where.id.in.includes(t.id));
                }
                if (where.OR) {
                    return hierarchyTenants;
                }
                return [];
            },
        },
    };
}

test('resolveOrgHierarchyTenantIds: expands org root to include branch hotels', async () => {
    const orgRoot = 'org-root-id';
    const branchA = 'branch-a-id';
    const branchB = 'branch-b-id';

    const db = mockDb({
        orgManagerTenantIds: [orgRoot],
        tenants: [{ id: orgRoot, parentId: null }],
        hierarchyTenants: [
            { id: orgRoot },
            { id: branchA },
            { id: branchB },
        ],
    });

    const ids = await resolveOrgHierarchyTenantIds(db, 'org-manager-user');
    assert.deepEqual(new Set(ids), new Set([orgRoot, branchA, branchB]));
});

test('resolveOrgHierarchyTenantIds: ORG_MANAGER on branch includes sibling branches', async () => {
    const orgRoot = 'org-root-id';
    const branchA = 'branch-a-id';
    const branchB = 'branch-b-id';

    const db = mockDb({
        orgManagerTenantIds: [branchA],
        tenants: [{ id: branchA, parentId: orgRoot }],
        hierarchyTenants: [
            { id: orgRoot },
            { id: branchA },
            { id: branchB },
        ],
    });

    const ids = await resolveOrgHierarchyTenantIds(db, 'org-manager-user');
    assert.deepEqual(new Set(ids), new Set([orgRoot, branchA, branchB]));
});

test('getOrgManagerTenantIds: returns direct memberships only (legacy)', async () => {
    const db = mockDb({
        orgManagerTenantIds: ['org-root-id'],
    });
    const ids = await getOrgManagerTenantIds(db, 'user-1');
    assert.deepEqual(ids, ['org-root-id']);
});

test('resolveOrgHierarchyTenantIds: empty when not ORG_MANAGER', async () => {
    const db = mockDb({ orgManagerTenantIds: [] });
    const ids = await resolveOrgHierarchyTenantIds(db, 'user-1');
    assert.deepEqual(ids, []);
});
