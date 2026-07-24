'use strict';

const prisma = require('../config/database');
const { connectRole, normalizeRole } = require('./rbac.service');
const { assertUserHasTransferStepPermission } = require('../acc-authority/step-permission-enforcement');
const {
    resolveWorkflowForDocument,
    approvalRequestVersionPin,
} = require('./acc-workflow-runtime.service');
const { defaultRoleCodesForModule } = require('./acc-workflow-default-chains');

/** Dept → Finance (final posting triggered from transfer.service on Finance approval). */
const TRANSFER_APPROVAL_ROLE_CODES = defaultRoleCodesForModule('TRANSFER');

/**
 * May approve/reject the current transfer step even when not the step owner
 * (Finance operational override + org/admin).
 */
const TRANSFER_APPROVAL_OVERRIDE_ROLE_CODES = Object.freeze([
    'FINANCE_MANAGER',
    'ORG_MANAGER',
    'SUPER_ADMIN',
]);

const transferStatusForActiveStep = (stepNumber) => {
    if (stepNumber === 1) return 'PENDING_DEPT';
    if (stepNumber === 2) return 'PENDING_FINANCE';
    return 'PENDING_DEPT';
};

/**
 * Create approval for a store transfer (call inside a transaction).
 * Single motion: if creator role matches ACC step 1, stamp Department and enter Finance.
 * @returns {{ enterStatus: string, currentStep: number }}
 */
const createStoreTransferApprovalRequest = async (tx, { tenantId, transferId, createdBy, userRole }) => {
    const chain = await resolveWorkflowForDocument({ moduleKey: 'TRANSFER', tenantId });
    const firstRole = normalizeRole(chain.roleCodes?.[0]);
    const submitterRole = normalizeRole(userRole);
    const preApproveFirst =
        Boolean(firstRole) && Boolean(submitterRole) && firstRole === submitterRole;
    const currentStep = preApproveFirst ? Math.min(2, chain.roleCodes.length) : 1;
    const enterStatus = transferStatusForActiveStep(currentStep);
    const now = new Date();

    await tx.approvalRequest.create({
        data: {
            tenantId,
            requestType: 'STORE_TRANSFER',
            status: 'PENDING',
            storeTransferId: transferId,
            currentStep,
            totalSteps: chain.roleCodes.length,
            createdBy,
            ...approvalRequestVersionPin(chain),
            steps: {
                create: chain.roleCodes.map((code, i) => {
                    const stepNumber = i + 1;
                    const isPre = preApproveFirst && stepNumber === 1;
                    return {
                        stepNumber,
                        requiredRole: connectRole(code),
                        status: isPre ? 'APPROVED' : 'PENDING',
                        ...(isPre
                            ? {
                                  actedByUser: { connect: { id: createdBy } },
                                  actedAt: now,
                              }
                            : {}),
                    };
                }),
            },
        },
    });

    return { enterStatus, currentStep };
};

/**
 * Approve or reject the current step (optionally inside caller transaction).
 * @returns {Promise<{ transfer: object, needsPosting?: boolean }>}
 */
const processStoreTransferApproval = async ({
    transferId,
    tenantId,
    userId,
    user,
    action,
    comment,
    tx: externalTx,
}) => {
    const loadTransfer = async (tx) =>
        tx.storeTransfer.findFirst({
            where: { id: transferId, tenantId },
            include: {
                lines: true,
                sourceLocation: { select: { name: true } },
                destLocation: { select: { name: true } },
                approvalRequest: {
                    include: {
                        steps: {
                            orderBy: { stepNumber: 'asc' },
                            include: { requiredRole: { select: { code: true } } },
                        },
                    },
                },
            },
        });

    const run = async (tx) => {
        const trf = await loadTransfer(tx);
        if (!trf?.approvalRequest) {
            throw Object.assign(new Error('No approval workflow found for this transfer.'), { statusCode: 404 });
        }

        const approval = trf.approvalRequest;
        const currentStepNo = approval.currentStep;
        const step = approval.steps.find((s) => s.stepNumber === currentStepNo);

        if (!step || step.status !== 'PENDING') {
            throw Object.assign(new Error('No pending approval step for this transfer.'), { statusCode: 422 });
        }

        assertUserHasTransferStepPermission(user, trf.status, step.requiredRole?.code);

        const now = new Date();

        if (action === 'REJECT') {
            await tx.approvalStep.update({
                where: { id: step.id },
                data: {
                    status: 'REJECTED',
                    actedBy: userId,
                    actedAt: now,
                    comment: comment || null,
                },
            });
            await tx.approvalRequest.update({
                where: { id: approval.id },
                data: { status: 'REJECTED', resolvedAt: now, currentStep: currentStepNo },
            });
            await tx.approvalStep.updateMany({
                where: {
                    requestId: approval.id,
                    stepNumber: { gt: currentStepNo },
                    status: 'PENDING',
                },
                data: { status: 'CANCELLED' },
            });
            const transfer = await tx.storeTransfer.update({
                where: { id: transferId },
                data: {
                    status: 'REJECTED',
                    rejectedBy: userId,
                    rejectionReason: comment || 'Rejected',
                    updatedAt: now,
                },
                include: { lines: true, sourceLocation: true, destLocation: true },
            });
            return { transfer, needsPosting: false };
        }

        await tx.approvalStep.update({
            where: { id: step.id },
            data: {
                status: 'APPROVED',
                actedBy: userId,
                actedAt: now,
                comment: comment || null,
            },
        });

        const isFinal = currentStepNo >= approval.totalSteps;

        if (isFinal) {
            await tx.approvalRequest.update({
                where: { id: approval.id },
                data: { status: 'APPROVED', resolvedAt: now, currentStep: currentStepNo },
            });
            return { transfer: trf, needsPosting: true };
        }

        const nextStepNo = currentStepNo + 1;
        await tx.approvalRequest.update({
            where: { id: approval.id },
            data: { currentStep: nextStepNo },
        });

        const transfer = await tx.storeTransfer.update({
            where: { id: transferId },
            data: {
                status: transferStatusForActiveStep(nextStepNo),
                updatedAt: now,
            },
            include: { lines: true, sourceLocation: true, destLocation: true },
        });
        return { transfer, needsPosting: false };
    };

    if (externalTx) return run(externalTx);
    return prisma.$transaction(run);
};

module.exports = {
    TRANSFER_APPROVAL_ROLE_CODES,
    TRANSFER_APPROVAL_OVERRIDE_ROLE_CODES,
    transferStatusForActiveStep,
    createStoreTransferApprovalRequest,
    processStoreTransferApproval,
};
