'use strict';

const prisma = require('../config/database');
const { writeAuditLogTransactional } = require('../services/auditWriter.service');
const { concurrencyConflictError } = require('./concurrency.service');

const TARGET_CREATOR = 'CREATOR';
const TARGET_STEP = 'STEP';

function bizError(statusCode, code, message) {
    return Object.assign(new Error(message), { statusCode, code });
}

function normalizeReason(reason) {
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed) {
        throw bizError(400, 'SEND_BACK_REASON_REQUIRED', 'Send Back reason is required.');
    }
    return trimmed;
}

function sortedSteps(approvalRequest) {
    return [...(approvalRequest?.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber);
}

function stepRoleCode(step) {
    return step?.requiredRole?.code || step?.requiredRole || null;
}

/**
 * Compute next workflow round from immutable SEND_BACK audit history.
 */
async function resolveWorkflowRound(tx, tenantId, entityType, entityId) {
    if (!tx.auditLog?.count) {
        return 1;
    }
    const count = await tx.auditLog.count({
        where: { tenantId, entityType, entityId: String(entityId), action: 'SEND_BACK' },
    });
    return count + 1;
}

function buildSendBackAuditPayload({
    approvalRequest,
    sourceStep,
    targetStepNumber,
    targetType,
    targetStep,
    reason,
    workflowRound,
    documentStatusBefore,
    documentStatusAfter,
}) {
    return {
        approvalRequestId: approvalRequest.id,
        accWorkflowVersionId: approvalRequest.accWorkflowVersionId ?? null,
        workflowRound,
        sourceStepNumber: sourceStep.stepNumber,
        sourceStepRole: stepRoleCode(sourceStep),
        targetStepNumber: targetType === TARGET_CREATOR ? 0 : targetStepNumber,
        targetStepRole: targetType === TARGET_CREATOR ? null : stepRoleCode(targetStep),
        targetType,
        reason,
        documentStatusBefore,
        documentStatusAfter,
    };
}

/**
 * Constitutional one-step Send Back inside an existing transaction.
 * Mutates ApprovalRequest + ApprovalSteps; writes SEND_BACK audit in same tx.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} params
 * @param {object} params.approvalRequest — with steps + requiredRole
 * @param {number} params.sourceStepNumber — guarded expected current step (>0)
 * @param {string} params.reason
 * @param {string} params.userId
 * @param {string} params.tenantId
 * @param {string} params.entityType
 * @param {string} params.entityId
 * @param {string|null} [params.documentStatusBefore]
 * @param {string|null} [params.documentStatusAfter]
 * @returns {Promise<{ targetStepNumber: number, targetType: string, workflowRound: number }>}
 */
async function executeWorkflowSendBackInTx(tx, params) {
    const {
        approvalRequest,
        sourceStepNumber,
        reason,
        userId,
        tenantId,
        entityType,
        entityId,
        documentStatusBefore = null,
        documentStatusAfter = null,
        forceTargetStepNumber = null,
    } = params;

    const trimmedReason = normalizeReason(reason);
    const steps = sortedSteps(approvalRequest);
    const sourceStep = steps.find((s) => s.stepNumber === sourceStepNumber);
    if (!sourceStep) {
        throw bizError(422, 'SEND_BACK_NO_SOURCE_STEP', 'Current approval step not found.');
    }
    if (String(sourceStep.status || '').toUpperCase() !== 'PENDING') {
        throw bizError(422, 'SEND_BACK_STEP_NOT_PENDING', 'Send Back is only allowed from the current pending step.');
    }
    if (Number(approvalRequest.currentStep) !== sourceStepNumber) {
        throw concurrencyConflictError();
    }
    if (String(approvalRequest.status || '').toUpperCase() !== 'PENDING') {
        throw bizError(422, 'SEND_BACK_REQUEST_NOT_ACTIVE', 'Approval request is not active.');
    }

    let targetStepNumber = sourceStepNumber <= 1 ? 0 : sourceStepNumber - 1;
    if (forceTargetStepNumber != null) {
        const forced = Number(forceTargetStepNumber);
        if (!Number.isFinite(forced) || forced < 0 || forced >= sourceStepNumber) {
            throw bizError(422, 'SEND_BACK_INVALID_TARGET', 'Invalid Send Back target step.');
        }
        targetStepNumber = forced;
    }
    const targetType = targetStepNumber === 0 ? TARGET_CREATOR : TARGET_STEP;
    const targetStep = targetStepNumber > 0 ? steps.find((s) => s.stepNumber === targetStepNumber) : null;

    if (typeof tx.approvalRequest.updateMany === 'function') {
        const guarded = await tx.approvalRequest.updateMany({
            where: {
                id: approvalRequest.id,
                tenantId,
                status: 'PENDING',
                currentStep: sourceStepNumber,
            },
            data: {
                status: 'PENDING',
                currentStep: targetStepNumber,
                resolvedAt: null,
            },
        });
        if (guarded.count === 0) {
            throw concurrencyConflictError();
        }
    } else {
        await tx.approvalRequest.update({
            where: { id: approvalRequest.id },
            data: {
                status: 'PENDING',
                currentStep: targetStepNumber,
                resolvedAt: null,
            },
        });
    }

    if (targetType === TARGET_CREATOR) {
        // Park on creator desk: clear every step so Resubmit restarts the chain cleanly.
        for (const st of steps) {
            await tx.approvalStep.update({
                where: { id: st.id },
                data: {
                    status: 'PENDING',
                    actedByUser: { disconnect: true },
                    actedAt: null,
                    comment: st.stepNumber === sourceStepNumber ? trimmedReason : null,
                },
            });
        }
    } else if (targetType === TARGET_STEP) {
        for (const st of steps) {
            if (st.stepNumber < targetStepNumber) continue;
            await tx.approvalStep.update({
                where: { id: st.id },
                data: {
                    status: 'PENDING',
                    actedByUser: { disconnect: true },
                    actedAt: null,
                    comment: st.stepNumber === sourceStepNumber ? trimmedReason : st.comment,
                },
            });
        }
    }

    const workflowRound = await resolveWorkflowRound(tx, tenantId, entityType, entityId);
    const auditPayload = buildSendBackAuditPayload({
        approvalRequest,
        sourceStep,
        targetStepNumber,
        targetType,
        targetStep,
        reason: trimmedReason,
        workflowRound,
        documentStatusBefore,
        documentStatusAfter,
    });

    const targetLabel =
        targetType === TARGET_CREATOR
            ? 'Creator'
            : stepRoleCode(targetStep) || `step ${targetStepNumber}`;

    await writeAuditLogTransactional({
        tenantId,
        entityType,
        entityId,
        action: 'SEND_BACK',
        changedBy: userId,
        note: `WORKFLOW_SEND_BACK round=${workflowRound} from=${sourceStepNumber} to=${targetLabel} reason=${trimmedReason}`,
        beforeValue: { currentStep: sourceStepNumber, status: documentStatusBefore },
        afterValue: auditPayload,
        tx,
    });

    return { targetStepNumber, targetType, workflowRound, reason: trimmedReason };
}

/**
 * Creator resubmit — same ApprovalRequest, advance to step 1.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
async function executeCreatorResubmitInTx(tx, params) {
    const {
        approvalRequest,
        userId,
        tenantId,
        entityType,
        entityId,
        documentStatusBefore = null,
        documentStatusAfter = null,
        resubmitNotePrefix = 'WORKFLOW_RESUBMIT',
    } = params;

    if (Number(approvalRequest.currentStep) !== 0) {
        throw bizError(422, 'RESUBMIT_NOT_AT_CREATOR', 'Document is not awaiting creator resubmit.');
    }
    if (String(approvalRequest.status || '').toUpperCase() !== 'PENDING') {
        throw bizError(422, 'RESUBMIT_REQUEST_NOT_ACTIVE', 'Approval request is not active.');
    }

    const steps = sortedSteps(approvalRequest);
    const firstStep = steps.find((s) => s.stepNumber === 1);
    if (!firstStep) {
        throw bizError(422, 'RESUBMIT_NO_FIRST_STEP', 'Approval chain has no first step.');
    }

    if (typeof tx.approvalRequest.updateMany === 'function') {
        const guarded = await tx.approvalRequest.updateMany({
            where: { id: approvalRequest.id, tenantId, status: 'PENDING', currentStep: 0 },
            data: { status: 'PENDING', currentStep: 1, resolvedAt: null },
        });
        if (guarded.count === 0) {
            throw concurrencyConflictError();
        }
    } else {
        await tx.approvalRequest.update({
            where: { id: approvalRequest.id },
            data: { status: 'PENDING', currentStep: 1, resolvedAt: null },
        });
    }

    for (const st of steps) {
        if (st.stepNumber === 1) {
            await tx.approvalStep.update({
                where: { id: st.id },
                data: {
                    status: 'PENDING',
                    actedByUser: { disconnect: true },
                    actedAt: null,
                },
            });
        } else if (st.stepNumber > 1) {
            await tx.approvalStep.update({
                where: { id: st.id },
                data: {
                    status: 'PENDING',
                    actedByUser: { disconnect: true },
                    actedAt: null,
                    comment: null,
                },
            });
        }
    }

    const workflowRound =
        (await tx.auditLog.count({
            where: { tenantId, entityType, entityId: String(entityId), action: 'SEND_BACK' },
        })) + 1;

    await writeAuditLogTransactional({
        tenantId,
        entityType,
        entityId,
        action: 'SUBMIT',
        changedBy: userId,
        note: `${resubmitNotePrefix} round=${workflowRound} approvalRequestId=${approvalRequest.id}`,
        beforeValue: { currentStep: 0, status: documentStatusBefore },
        afterValue: {
            approvalRequestId: approvalRequest.id,
            accWorkflowVersionId: approvalRequest.accWorkflowVersionId ?? null,
            workflowRound,
            resubmit: true,
            currentStep: 1,
            documentStatusAfter,
        },
        tx,
    });

    return { currentStep: 1, workflowRound };
}

/**
 * Run send-back inside a new transaction (for simple call sites).
 */
async function runWorkflowSendBack(params) {
    const { runInTransaction } = params;
    if (typeof runInTransaction === 'function') {
        return runInTransaction(async (tx) => executeWorkflowSendBackInTx(tx, { ...params, tx }));
    }
    return prisma.$transaction(async (tx) => executeWorkflowSendBackInTx(tx, params));
}

module.exports = {
    TARGET_CREATOR,
    TARGET_STEP,
    normalizeReason,
    sortedSteps,
    stepRoleCode,
    resolveWorkflowRound,
    buildSendBackAuditPayload,
    executeWorkflowSendBackInTx,
    executeCreatorResubmitInTx,
    runWorkflowSendBack,
};
