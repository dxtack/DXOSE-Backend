'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    GM_CANNOT_MODIFY_ORG_MANAGER_MESSAGE,
    assertGmMayModifyTargetUser,
    userHasHierarchyProtectedRole,
} = require('./roleHierarchyGuard');

function mockDb({ assignment = null, membership = null } = {}) {
    return {
        urUserAssignment: {
            findFirst: async () => assignment,
            findUnique: async () => (assignment ? { userId: 'target-1' } : null),
        },
        tenantMember: {
            findFirst: async () => membership,
        },
    };
}

test('userHasHierarchyProtectedRole — true when active ORG_MANAGER assignment exists', async () => {
    const db = mockDb({ assignment: { id: 'a1' } });
    assert.equal(await userHasHierarchyProtectedRole(db, 'target-1'), true);
});

test('userHasHierarchyProtectedRole — false when no protected roles', async () => {
    const db = mockDb();
    assert.equal(await userHasHierarchyProtectedRole(db, 'target-1'), false);
});

test('assertGmMayModifyTargetUser — allows non-GM actors', async () => {
    const db = mockDb({ assignment: { id: 'a1' } });
    await assert.doesNotReject(() =>
        assertGmMayModifyTargetUser(db, {
            actorRoleCode: 'ORG_MANAGER',
            targetUserId: 'target-1',
        }),
    );
});

test('assertGmMayModifyTargetUser — allows GM for non-protected targets', async () => {
    const db = mockDb();
    await assert.doesNotReject(() =>
        assertGmMayModifyTargetUser(db, {
            actorRoleCode: 'GENERAL_MANAGER',
            targetUserId: 'staff-1',
        }),
    );
});

test('assertGmMayModifyTargetUser — rejects GM for ORG_MANAGER targets', async () => {
    const db = mockDb({ membership: { id: 'm1' } });
    await assert.rejects(
        () =>
            assertGmMayModifyTargetUser(db, {
                actorRoleCode: 'GENERAL_MANAGER',
                targetUserId: 'target-1',
            }),
        (err) => {
            assert.equal(err.statusCode, 403);
            assert.equal(err.code, 'ROLE_HIERARCHY_FORBIDDEN');
            assert.equal(err.message, GM_CANNOT_MODIFY_ORG_MANAGER_MESSAGE);
            return true;
        },
    );
});
