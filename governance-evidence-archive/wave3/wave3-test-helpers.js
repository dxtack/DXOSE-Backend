'use strict';

const { ensureCanonicalPermission } = require('../../test/harness/disposable-grn-fixture');

const GRN_STEP_KEYS = ['PENDING_APPROVAL', 'PENDING_FINANCE'];

async function ensureRole(prisma, code) {
    return prisma.role.upsert({
        where: { code },
        create: { code, name: code, tenantId: null, isActive: true },
        update: {},
    });
}

async function linkRolePermission(prisma, roleId, legacyCode, runId) {
    const { permission } = await ensureCanonicalPermission(prisma, legacyCode, runId);
    await prisma.urRolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permission.id } },
        create: { roleId, permissionId: permission.id },
        update: {},
    });
    return permission;
}

/**
 * Seed a global (tenantId=null) published ACC workflow for integration RV.
 */
async function ensurePublishedAccWorkflow(prisma, moduleKey, { grnStyle = false } = {}) {
    const key = String(moduleKey).toUpperCase();
    const mod = await prisma.accModule.upsert({
        where: { key },
        create: { key, name: key, isActive: true, displayOrder: 0 },
        update: { isActive: true },
    });

    const deptRole = await ensureRole(prisma, 'DEPT_MANAGER');
    const financeRole = await ensureRole(prisma, 'FINANCE_MANAGER');

    const defKey = `W3-RV-${key}`;
    let def = await prisma.accWorkflowDefinition.findFirst({
        where: { moduleId: mod.id, tenantId: null, key: defKey },
    });
    if (!def) {
        def = await prisma.accWorkflowDefinition.create({
            data: {
                moduleId: mod.id,
                key: defKey,
                name: `W3 RV ${key}`,
                tenantId: null,
                isActive: true,
            },
        });
    }

    let version = await prisma.accWorkflowVersion.findFirst({
        where: { definitionId: def.id, status: 'PUBLISHED' },
        include: { steps: true },
    });

    if (!version) {
        const steps =
            grnStyle || key === 'GRN'
                ? [
                      { stepOrder: 1, label: 'Cost Control', approverRoleId: deptRole.id, statusKey: GRN_STEP_KEYS[0] },
                      { stepOrder: 2, label: 'Finance', approverRoleId: financeRole.id, statusKey: GRN_STEP_KEYS[1] },
                  ]
                : [
                      { stepOrder: 1, label: 'Department', approverRoleId: deptRole.id, statusKey: 'PENDING_DEPT' },
                      { stepOrder: 2, label: 'Finance', approverRoleId: financeRole.id, statusKey: 'PENDING_FINANCE' },
                  ];

        version = await prisma.accWorkflowVersion.create({
            data: {
                definitionId: def.id,
                versionNumber: 1,
                status: 'PUBLISHED',
                publishedAt: new Date(),
                steps: { create: steps },
            },
            include: { steps: true },
        });
    }

    return { module: mod, definition: def, version };
}

module.exports = {
    ensureRole,
    linkRolePermission,
    ensurePublishedAccWorkflow,
};
