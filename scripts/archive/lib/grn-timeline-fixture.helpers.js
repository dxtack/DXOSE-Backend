'use strict';

const grnService = require('../../src/services/grn.service');

function actorFromMember(member, permissions = ['GRN_MANAGE']) {
    return {
        ...member.user,
        role: member.role.code,
        permissions,
    };
}

async function findActorWithRole(prisma, tenantId, roleCode) {
    const member = await prisma.tenantMember.findFirst({
        where: {
            tenantId,
            isActive: true,
            role: { code: roleCode },
            user: { isActive: true },
        },
        include: { user: true, role: true },
    });
    return member ? actorFromMember(member) : null;
}

async function approveCostStep(ctx, grnId, costUser) {
    const g = await grnService.getGrn(grnId, ctx.tenantId);
    return grnService.approveGrn(grnId, ctx.tenantId, costUser, 'Cost OK', g.concurrencyVersion);
}

/**
 * Finance is the final GRN step and would POST via approveGrn. For multi-cycle send-back
 * fixtures we record finance approval on the step without posting so send-back remains valid.
 */
async function completeFinanceStepWithoutPosting(prisma, tenantId, grnId, financeUser) {
    const grn = await prisma.grnImport.findFirst({
        where: { id: grnId, tenantId },
        include: {
            approvalRequest: {
                include: { steps: { orderBy: { stepNumber: 'asc' } } },
            },
        },
    });
    const step = grn?.approvalRequest?.steps?.find((s) => s.stepNumber === 2);
    if (!step) {
        throw new Error(`Finance step missing for GRN ${grnId}`);
    }
    if (step.status === 'APPROVED') {
        return grnService.getGrn(grnId, tenantId);
    }
    await prisma.approvalStep.update({
        where: { id: step.id },
        data: {
            status: 'APPROVED',
            actedBy: financeUser.id,
            actedAt: new Date(),
            comment: 'Finance OK',
        },
    });
    return grnService.getGrn(grnId, tenantId);
}

async function approveCostAndFinanceForSendBackCycle(prisma, ctx, grnId, costUser, financeUser) {
    await approveCostStep(ctx, grnId, costUser);
    await completeFinanceStepWithoutPosting(prisma, ctx.tenantId, grnId, financeUser);
}

module.exports = {
    actorFromMember,
    findActorWithRole,
    approveCostStep,
    completeFinanceStepWithoutPosting,
    approveCostAndFinanceForSendBackCycle,
};
