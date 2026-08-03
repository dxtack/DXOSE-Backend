'use strict';

/**
 * Role-escalation protection — GENERAL_MANAGER must not mutate ORG_MANAGER / SUPER_ADMIN accounts.
 */

const HIERARCHY_PROTECTED_ROLE_CODES = Object.freeze(['ORG_MANAGER', 'SUPER_ADMIN']);

const GM_CANNOT_MODIFY_ORG_MANAGER_MESSAGE =
    'General Managers cannot modify Organization Manager accounts.';

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function userHasHierarchyProtectedRole(db, userId) {
    if (!userId) return false;

    const [assignment, membership] = await Promise.all([
        db.urUserAssignment.findFirst({
            where: {
                userId,
                isActive: true,
                role: { code: { in: [...HIERARCHY_PROTECTED_ROLE_CODES] } },
            },
            select: { id: true },
        }),
        db.tenantMember.findFirst({
            where: {
                userId,
                isActive: true,
                role: { code: { in: [...HIERARCHY_PROTECTED_ROLE_CODES] } },
            },
            select: { id: true },
        }),
    ]);

    return Boolean(assignment || membership);
}

/**
 * Throws 403 when a GENERAL_MANAGER attempts to mutate a protected higher-ranking account.
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db
 * @param {{ actorRoleCode?: string|null, targetUserId: string }} opts
 */
async function assertGmMayModifyTargetUser(db, { actorRoleCode, targetUserId }) {
    const actor = String(actorRoleCode ?? '').trim().toUpperCase();
    if (actor !== 'GENERAL_MANAGER') return;

    const protectedTarget = await userHasHierarchyProtectedRole(db, targetUserId);
    if (!protectedTarget) return;

    throw Object.assign(new Error(GM_CANNOT_MODIFY_ORG_MANAGER_MESSAGE), {
        statusCode: 403,
        code: 'ROLE_HIERARCHY_FORBIDDEN',
    });
}

/**
 * Resolve target userId from an assignment, then apply the GM hierarchy guard.
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db
 * @param {{ actorRoleCode?: string|null, assignmentId: string }} opts
 */
async function assertGmMayModifyAssignment(db, { actorRoleCode, assignmentId }) {
    const actor = String(actorRoleCode ?? '').trim().toUpperCase();
    if (actor !== 'GENERAL_MANAGER') return;

    const assignment = await db.urUserAssignment.findUnique({
        where: { id: assignmentId },
        select: { userId: true },
    });
    if (!assignment) return;

    await assertGmMayModifyTargetUser(db, {
        actorRoleCode: actor,
        targetUserId: assignment.userId,
    });
}

module.exports = {
    HIERARCHY_PROTECTED_ROLE_CODES,
    GM_CANNOT_MODIFY_ORG_MANAGER_MESSAGE,
    userHasHierarchyProtectedRole,
    assertGmMayModifyTargetUser,
    assertGmMayModifyAssignment,
};
