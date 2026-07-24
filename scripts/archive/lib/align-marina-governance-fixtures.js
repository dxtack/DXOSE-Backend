'use strict';

/**
 * Align DX Marina UAT fixtures for governance runtime tests:
 * - Map dept-manager assignments to tenant-scoped department IDs (locations use marina departments).
 * - Sync tenantMember.departmentId on the marina property.
 */

const TENANT_SLUG = process.env.AUDIT_TENANT_SLUG || 'dx-marina-hotel';

/** Workflow permissions required for governance runtime chains (ur_role_permissions). */
const WORKFLOW_ROLE_PERMISSIONS = Object.freeze({
    STOREKEEPER: ['REQUISITION_APPROVE'],
    DEPT_MANAGER: ['GET_PASS_APPROVE'],
    COST_CONTROL: ['GET_PASS_APPROVE'],
});

async function resolveMarinaDepartmentId(prisma, marinaTenantId, departmentId) {
    if (!departmentId) return null;
    const dept = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true, name: true, code: true, tenantId: true },
    });
    if (!dept) return null;
    if (dept.tenantId === marinaTenantId) return dept.id;
    const match = await prisma.department.findFirst({
        where: {
            tenantId: marinaTenantId,
            isActive: true,
            OR: [
                ...(dept.code ? [{ code: dept.code }] : []),
                { name: dept.name },
            ],
        },
        select: { id: true },
    });
    return match?.id ?? null;
}

async function ensureMarinaWorkflowPermissions(prisma) {
    let permissionFixes = 0;
    for (const [roleCode, codes] of Object.entries(WORKFLOW_ROLE_PERMISSIONS)) {
        const role = await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true } });
        if (!role) continue;
        for (const legacyCode of codes) {
            const permission = await prisma.urPermission.findFirst({
                where: { legacyCode },
                select: { id: true },
            });
            if (!permission) continue;
            const exists = await prisma.urRolePermission.findFirst({
                where: { roleId: role.id, permissionId: permission.id },
            });
            if (exists) continue;
            await prisma.urRolePermission.create({
                data: { roleId: role.id, permissionId: permission.id },
            });
            permissionFixes += 1;
        }
    }
    return permissionFixes;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<{ tenantId: string, departmentFixes: number, assignmentFixes: number, memberFixes: number }>}
 */
async function alignMarinaGovernanceFixtures(prisma) {
    const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } });
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_SLUG}`);

    let departmentFixes = 0;
    let assignmentFixes = 0;
    let memberFixes = 0;

    const members = await prisma.tenantMember.findMany({
        where: { tenantId: tenant.id, isActive: true, departmentId: { not: null } },
        include: { department: { select: { id: true, name: true, tenantId: true } } },
    });

    for (const member of members) {
        const mapped = await resolveMarinaDepartmentId(prisma, tenant.id, member.departmentId);
        if (!mapped || mapped === member.departmentId) continue;
        await prisma.tenantMember.update({
            where: { id: member.id },
            data: { departmentId: mapped },
        });
        memberFixes += 1;
    }

    const assignments = await prisma.urUserAssignment.findMany({
        where: {
            isActive: true,
            properties: { some: { propertyId: tenant.id } },
        },
        include: {
            departments: { include: { department: { select: { id: true, name: true, tenantId: true } } } },
        },
    });

    for (const assignment of assignments) {
        for (const row of assignment.departments) {
            const mapped = await resolveMarinaDepartmentId(prisma, tenant.id, row.departmentId);
            if (!mapped || mapped === row.departmentId) continue;
            const exists = await prisma.urAssignmentDepartment.findFirst({
                where: { assignmentId: assignment.id, departmentId: mapped },
            });
            if (!exists) {
                await prisma.urAssignmentDepartment.create({
                    data: { assignmentId: assignment.id, departmentId: mapped },
                });
                departmentFixes += 1;
            }
            await prisma.urAssignmentDepartment.delete({ where: { id: row.id } });
            assignmentFixes += 1;
        }
    }

    const permissionFixes = await ensureMarinaWorkflowPermissions(prisma);

    return { tenantId: tenant.id, departmentFixes, assignmentFixes, memberFixes, permissionFixes };
}

/**
 * Pick stock + dept manager email where UR scope matches location department on marina.
 */
async function resolveScopedStockFixture(prisma, tenantId) {
    const deptMembers = await prisma.tenantMember.findMany({
        where: {
            tenantId,
            isActive: true,
            role: { code: 'DEPT_MANAGER' },
            departmentId: { not: null },
        },
        include: { user: { select: { email: true } }, department: true },
    });

    for (const dm of deptMembers) {
        const balance = await prisma.stockBalance.findFirst({
            where: {
                tenantId,
                qtyOnHand: { gt: 1 },
                location: { departmentId: dm.departmentId },
            },
            include: {
                item: { include: { itemUnits: true } },
                location: { select: { id: true, name: true, departmentId: true } },
            },
        });
        if (balance?.item?.itemUnits?.[0]) {
            return {
                deptEmail: dm.user.email,
                departmentId: dm.departmentId,
                balance,
            };
        }
    }
    return null;
}

/**
 * Two locations in same dept with stock at source — for transfer runtime.
 */
async function resolveTransferFixture(prisma, tenantId) {
    const deptMembers = await prisma.tenantMember.findMany({
        where: {
            tenantId,
            isActive: true,
            role: { code: 'DEPT_MANAGER' },
            departmentId: { not: null },
        },
        include: { user: { select: { email: true } } },
    });

    for (const dm of deptMembers) {
        const locs = await prisma.location.findMany({
            where: { tenantId, isActive: true, departmentId: dm.departmentId },
            take: 10,
        });
        if (locs.length < 2) continue;

        for (const src of locs) {
            for (const dst of locs) {
                if (src.id === dst.id) continue;
                const balance = await prisma.stockBalance.findFirst({
                    where: { tenantId, locationId: src.id, qtyOnHand: { gt: 1 } },
                    include: { item: { include: { itemUnits: true } } },
                });
                if (balance?.item?.itemUnits?.[0]) {
                    return {
                        deptEmail: dm.user.email,
                        sourceLocationId: src.id,
                        destLocationId: dst.id,
                        balance,
                    };
                }
            }
        }
    }
    return null;
}

module.exports = {
    alignMarinaGovernanceFixtures,
    resolveScopedStockFixture,
    resolveTransferFixture,
};
