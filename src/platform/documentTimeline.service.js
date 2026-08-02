'use strict';

const { PrismaClient } = require('@prisma/client');
const { buildGrnWorkflowTimeline } = require('../services/grn-workflow-presentation.util');
const { buildGetPassWorkflowTimeline } = require('../services/get-pass-workflow-timeline.util');
const { buildInventoryCountWorkflowTimelineForSession } = require('../services/inventory-count-workflow-presentation.util');
const { enrichTimelineSlotsWithDuration } = require('./timelineDuration.util');
const { attachTimelineEntries } = require('./timeline/timelinePayload.util');
const { buildGrnTimelineRawEntries } = require('./timeline/grnTimeline.builder');
const { buildApprovalTimelineRawEntries } = require('./timeline/approvalTimeline.builder');
const { buildGetPassTimelineRawEntries, buildApprovalStepsFromAccChain } = require('./timeline/getPassTimeline.builder');
const { ROLE_DISPLAY } = require('../services/workflow-pipeline/workflow-pending.definitions');

const prisma = new PrismaClient();

const userSelect = { select: { id: true, firstName: true, lastName: true } };

function roleLabelFromCode(code) {
    if (!code) return null;
    return ROLE_DISPLAY[code] || String(code).replace(/_/g, ' ');
}

function approvalStageTitle(step) {
    const label = roleLabelFromCode(step.requiredRole?.code);
    if (label) return `${label} Review`;
    return `Approval Step ${step.stepNumber}`;
}

async function fetchAuditEvents(tenantId, entityType, entityId) {
    return prisma.auditLog.findMany({
        where: { tenantId, entityType, entityId },
        orderBy: { changedAt: 'asc' },
        take: 200,
        include: { changedByUser: userSelect },
    });
}

function approvalStepsToSlots(approvalRequest) {
    const ar = Array.isArray(approvalRequest) ? approvalRequest[0] : approvalRequest;
    if (!ar?.steps?.length) return [];
    return [...ar.steps]
        .sort((a, b) => Number(a.stepNumber) - Number(b.stepNumber))
        .map((step, index) => ({
        order: index + 1,
        kind: 'APPROVAL',
        stageTitle: approvalStageTitle(step),
        roleLabel: roleLabelFromCode(step.requiredRole?.code),
        actorName: step.actedByUser
            ? `${step.actedByUser.firstName || ''} ${step.actedByUser.lastName || ''}`.trim() || null
            : null,
        actedAt: step.actedAt ? new Date(step.actedAt).toISOString() : null,
        status: step.status === 'APPROVED' ? 'APPROVED' : step.status === 'REJECTED' ? 'REJECTED' : 'PENDING',
    }));
}

async function getGrnTimeline(grnId, tenantId) {
    const grn = await prisma.grnImport.findFirst({
        where: { id: grnId, tenantId },
        include: {
            importedByUser: { select: { firstName: true, lastName: true } },
            approvedByUser: { select: { firstName: true, lastName: true } },
            postedByUser: { select: { firstName: true, lastName: true } },
            rejectedByUser: { select: { firstName: true, lastName: true } },
            approvalRequest: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: {
                            actedByUser: { select: { firstName: true, lastName: true } },
                            requiredRole: { select: { code: true } },
                        },
                    },
                },
            },
            approvalHistory: {
                where: { requestType: 'GRN_IMPORT' },
                orderBy: [{ cycleNumber: 'asc' }, { createdAt: 'asc' }],
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: {
                            actedByUser: { select: { firstName: true, lastName: true } },
                            requiredRole: { select: { code: true } },
                        },
                    },
                },
            },
        },
    });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });

    const slots = enrichTimelineSlotsWithDuration(buildGrnWorkflowTimeline(grn));
    const auditEvents = await fetchAuditEvents(tenantId, 'GRN', grnId);
    const rawEntries = buildGrnTimelineRawEntries(grn, auditEvents);

    return attachTimelineEntries({
        documentType: 'GRN',
        documentId: grnId,
        workflowSlots: slots,
        auditEvents,
    }, rawEntries);
}

async function resolveTransferPostingEvidence(transferId, tenantId, trf) {
    if (trf.postedAt) {
        return {
            postedAt: trf.postedAt,
            postedByUser: trf.postedByUser,
            includePosting: trf.status === 'POSTED',
            postingDataGap: false,
            postingRecoveredFrom: null,
        };
    }
    if (trf.status !== 'POSTED') {
        return {
            postedAt: null,
            postedByUser: null,
            includePosting: false,
            postingDataGap: false,
            postingRecoveredFrom: null,
        };
    }

    const ledgerRow = await prisma.inventoryLedger.findFirst({
        where: { tenantId, referenceType: 'TRANSFER', referenceId: transferId },
        orderBy: { createdAt: 'asc' },
        include: { createdByUser: userSelect },
    });

    if (!ledgerRow) {
        return {
            postedAt: null,
            postedByUser: null,
            includePosting: false,
            postingDataGap: true,
            postingRecoveredFrom: null,
        };
    }

    return {
        postedAt: ledgerRow.createdAt,
        postedByUser: ledgerRow.createdByUser,
        includePosting: true,
        postingDataGap: false,
        postingRecoveredFrom: 'INVENTORY_LEDGER',
    };
}

async function getTransferTimeline(transferId, tenantId) {
    const trf = await prisma.storeTransfer.findFirst({
        where: { id: transferId, tenantId },
        include: {
            postedByUser: userSelect,
            approvalRequest: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: { actedByUser: userSelect, requiredRole: true },
                    },
                },
            },
        },
    });
    if (!trf) throw Object.assign(new Error('Transfer not found'), { status: 404 });

    const workflowSlots = enrichTimelineSlotsWithDuration(approvalStepsToSlots(trf.approvalRequest));
    const auditEvents = await fetchAuditEvents(tenantId, 'TRANSFER', transferId);
    const posting = await resolveTransferPostingEvidence(transferId, tenantId, trf);
    const rawEntries = buildApprovalTimelineRawEntries(trf.approvalRequest, {
        auditEvents,
        rejectionReason: trf.rejectionReason,
        postedAt: posting.postedAt,
        postedByUser: posting.postedByUser,
        includePosting: posting.includePosting,
        autoPosted: true,
        documentStatus: trf.status,
    });

    return attachTimelineEntries({
        documentType: 'TRANSFER',
        documentId: transferId,
        workflowSlots,
        auditEvents,
    }, rawEntries);
}

async function getBreakageTimeline(breakageId, tenantId) {
    const doc = await prisma.movementDocument.findFirst({
        where: { id: breakageId, tenantId, movementType: 'BREAKAGE' },
        include: {
            createdByUser: userSelect,
            approvalRequests: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: { actedByUser: userSelect, requiredRole: true },
                    },
                },
            },
        },
    });
    if (!doc) throw Object.assign(new Error('Breakage not found'), { status: 404 });

    const workflowSlots = enrichTimelineSlotsWithDuration(approvalStepsToSlots(doc.approvalRequests));
    const auditEvents = await fetchAuditEvents(tenantId, 'BREAKAGE', breakageId);
    const approval =
        Array.isArray(doc.approvalRequests) ? doc.approvalRequests[0] : doc.approvalRequests;
    const status = String(doc.status || '').toUpperCase();
    const isPosted = (status === 'POSTED' || status === 'APPROVED') && !!doc.postedAt;
    const rawEntries = buildApprovalTimelineRawEntries(approval, {
        auditEvents,
        documentStatus: doc.status,
        postedAt: isPosted ? doc.postedAt : null,
        postedByUser: doc.createdByUser,
        includePosting: isPosted,
        showPendingPosting: !isPosted,
        autoPosted: true,
    });

    return attachTimelineEntries({
        documentType: 'BREAKAGE',
        documentId: breakageId,
        workflowSlots,
        auditEvents,
    }, rawEntries);
}

async function loadGetPassApprovalRequest(getPassId) {
    try {
        return await prisma.approvalRequest.findFirst({
            where: { getPassId },
            include: {
                steps: {
                    orderBy: { stepNumber: 'asc' },
                    include: { actedByUser: userSelect, requiredRole: true },
                },
            },
        });
    } catch (err) {
        const msg = String(err?.message || '');
        if (err?.code === 'P2022' || /getPassId/.test(msg)) {
            return null;
        }
        throw err;
    }
}

async function fetchGetPassAuditEvents(getPass) {
    const tenantIds = [getPass.tenantId];
    if (getPass.targetTenantId && getPass.targetTenantId !== getPass.tenantId) {
        tenantIds.push(getPass.targetTenantId);
    }
    return prisma.auditLog.findMany({
        where: {
            entityType: 'GET_PASS',
            entityId: String(getPass.id),
            tenantId: { in: tenantIds },
        },
        orderBy: { changedAt: 'asc' },
        take: 200,
        include: { changedByUser: userSelect },
    });
}

async function getGetPassTimeline(getPassId, tenantId) {
    const getPass = await prisma.getPass.findFirst({
        where: {
            id: getPassId,
            OR: [
                { tenantId },
                { targetTenantId: tenantId, isInternalTransfer: true },
            ],
        },
        include: {
            deptApprover: userSelect,
            costControlApprover: userSelect,
            financeApprover: userSelect,
            gmApprover: userSelect,
            securityApprover: userSelect,
            checkoutUser: userSelect,
            closingUser: userSelect,
            receivedBy: userSelect,
            destinationDeptAccepter: userSelect,
            destinationSecurityExitUser: userSelect,
        },
    });
    if (!getPass) throw Object.assign(new Error('Get Pass not found'), { status: 404 });

    const approvalRequest = await loadGetPassApprovalRequest(getPassId);

    let approvalSteps;
    if (getPass.accWorkflowVersionId) {
        try {
            const { resolveWorkflowByVersionId } = require('../services/acc-workflow-runtime.service');
            const chain = await resolveWorkflowByVersionId(getPass.accWorkflowVersionId);
            approvalSteps = buildApprovalStepsFromAccChain(chain.steps);
        } catch {
            approvalSteps = undefined;
        }
    }

    const workflowSlots = enrichTimelineSlotsWithDuration(buildGetPassWorkflowTimeline(getPass));
    const auditEvents = await fetchGetPassAuditEvents(getPass);
    const rawEntries = buildGetPassTimelineRawEntries(getPass, auditEvents, {
        approvalSteps,
        approvalRequest,
    });

    return attachTimelineEntries({
        documentType: 'GET_PASS',
        documentId: getPassId,
        workflowSlots,
        auditEvents,
    }, rawEntries);
}

async function getLostTimeline(lostId, tenantId) {
    const doc = await prisma.movementDocument.findFirst({
        where: { id: lostId, tenantId, movementType: 'LOST' },
        include: {
            createdByUser: userSelect,
            approvalRequests: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: { actedByUser: userSelect, requiredRole: true },
                    },
                },
            },
        },
    });
    if (!doc) throw Object.assign(new Error('Lost Items document not found'), { status: 404 });

    const workflowSlots = enrichTimelineSlotsWithDuration(approvalStepsToSlots(doc.approvalRequests));
    const auditEvents = await fetchAuditEvents(tenantId, 'LOST', lostId);
    const approval =
        Array.isArray(doc.approvalRequests) ? doc.approvalRequests[0] : doc.approvalRequests;
    const status = String(doc.status || '').toUpperCase();
    const isPosted = (status === 'POSTED' || status === 'APPROVED') && !!doc.postedAt;
    const rawEntries = buildApprovalTimelineRawEntries(approval, {
        auditEvents,
        documentStatus: doc.status,
        postedAt: isPosted ? doc.postedAt : null,
        postedByUser: doc.createdByUser,
        includePosting: isPosted,
        showPendingPosting: !isPosted,
        autoPosted: true,
    });

    return attachTimelineEntries({
        documentType: 'LOST',
        documentId: lostId,
        workflowSlots,
        auditEvents,
    }, rawEntries);
}

async function getInventoryCountTimeline(sessionId, tenantId) {
    const { buildInventoryCountTimelineRawEntries } = require('./timeline/inventoryCountTimeline.builder');

    const session = await prisma.stockCountSession.findFirst({
        where: { id: sessionId, tenantId },
        include: {
            scopedLocations: { include: { location: { select: { id: true, name: true } } } },
            location: { select: { id: true, name: true } },
            createdByUser: userSelect,
            approvalRequest: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: {
                            requiredRole: { select: { code: true } },
                            actedByUser: userSelect,
                        },
                    },
                },
            },
        },
    });
    if (!session) throw Object.assign(new Error('Inventory count session not found'), { status: 404 });

    const roundRows = await prisma.stockCountLocationQty.findMany({
        where: { sessionId, countedQty: { not: null } },
        select: { roundNo: true },
        distinct: ['roundNo'],
    });
    const roundNumbers = roundRows.map((r) => r.roundNo).sort((a, b) => a - b);

    const workflowSlots = enrichTimelineSlotsWithDuration(
        await buildInventoryCountWorkflowTimelineForSession(tenantId, session),
    );
    const auditEvents = await fetchAuditEvents(tenantId, 'STOCK_COUNT', sessionId);
    const rawEntries = buildInventoryCountTimelineRawEntries(session, auditEvents, {
        roundNumbers,
    });

    return attachTimelineEntries({
        documentType: 'INVENTORY_COUNT',
        documentId: sessionId,
        workflowSlots,
        auditEvents,
    }, rawEntries);
}

async function getMovementTimeline(movementId, tenantId) {
    const doc = await prisma.movementDocument.findFirst({
        where: { id: movementId, tenantId },
        include: {
            createdByUser: userSelect,
            approvalRequests: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: { actedByUser: userSelect, requiredRole: true },
                    },
                },
            },
        },
    });
    if (!doc) throw Object.assign(new Error('Movement document not found'), { status: 404 });

    const workflowSlots = enrichTimelineSlotsWithDuration(approvalStepsToSlots(doc.approvalRequests));
    const auditEvents = await fetchAuditEvents(tenantId, 'MOVEMENT', movementId);

    return attachTimelineEntries({
        documentType: 'MOVEMENT',
        documentId: movementId,
        workflowSlots,
        auditEvents,
    });
}

async function getDocumentTimeline(moduleKey, documentId, tenantId) {
    const mod = String(moduleKey || '').toUpperCase();
    if (mod === 'GRN') return getGrnTimeline(documentId, tenantId);
    if (mod === 'TRANSFER') return getTransferTimeline(documentId, tenantId);
    if (mod === 'BREAKAGE') return getBreakageTimeline(documentId, tenantId);
    if (mod === 'GET_PASS' || mod === 'GETPASS') return getGetPassTimeline(documentId, tenantId);
    if (mod === 'LOST' || mod === 'LOST_ITEMS') return getLostTimeline(documentId, tenantId);
    if (mod === 'INVENTORY_COUNT' || mod === 'COUNT') return getInventoryCountTimeline(documentId, tenantId);
    if (mod === 'MOVEMENT') return getMovementTimeline(documentId, tenantId);
    throw Object.assign(new Error(`Timeline not available for module ${mod}`), { status: 404 });
}

module.exports = {
    getDocumentTimeline,
    getGrnTimeline,
    getTransferTimeline,
    getBreakageTimeline,
    getGetPassTimeline,
    getMovementTimeline,
    getLostTimeline,
    getInventoryCountTimeline,
};
