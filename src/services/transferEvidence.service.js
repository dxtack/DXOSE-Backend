'use strict';

const prisma = require('../config/database');
const { userName, num } = require('../utils/evidence-format.util');
const { getTransfer } = require('./transfer.service');
const {
    resolveWorkflowGeneration,
    isTransferPosted,
} = require('./transferWorkflow.util');
const {
    approvalChainDefinitionFromAcc,
    resolvePresentationChain,
} = require('./acc-workflow-presentation.service');
const { buildApprovalTimelineRawEntries } = require('../platform/timeline/approvalTimeline.builder');
const { buildTimelineEntries } = require('../platform/timeline/timelineEntry.merge');
const {
    mapTimelineEntriesToPdfApprovalWorkflow,
    PDF_LIFECYCLE_TYPES,
} = require('./evidence-pdf-approval-from-timeline.util');

/** @deprecated Wave 6 — preview allowed; use evidenceClassification.isOfficialEvidenceEligible */
const assertTransferEvidenceEligible = (trf) => {
    const { isOfficialEvidenceEligible } = require('../platform/evidenceClassification.service');
    if (!isOfficialEvidenceEligible('TRANSFER', { internalStatus: trf.status, postedAt: trf.postedAt })) {
        throw Object.assign(
            new Error(
                'Official transfer evidence is available only after the transfer is posted to inventory.',
            ),
            { status: 422, code: 'EVIDENCE_OFFICIAL_NOT_ELIGIBLE' },
        );
    }
};

const userSelect = { select: { id: true, firstName: true, lastName: true } };

/**
 * Audit-grade evidence JSON for store transfer PDF (reporting layer only).
 */
const getTransferEvidence = async (id, tenantId, user = null) => {
    const trf = await getTransfer(id, tenantId, user);
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
    });

    const workflowGeneration = resolveWorkflowGeneration(trf);
    const chain = await resolvePresentationChain({
        moduleKey: 'TRANSFER',
        tenantId,
        versionId: trf.approvalRequest?.accWorkflowVersionId,
    });
    const accChainDef = approvalChainDefinitionFromAcc(chain);

    const posted = isTransferPosted(trf);
    const postedAt = trf.postedAt || (posted ? trf.receivedAt || trf.closedAt : null);
    const postedByName =
        userName(trf.postedByUser)
        || userName(trf.approvedByUser)
        || null;

    let approvalChainDefinition = workflowGeneration === 'LEGACY' ? [] : accChainDef;
    let approvalHistory = [];

    if (workflowGeneration !== 'LEGACY' && trf.approvalRequest) {
        const {
            filterBusinessApprovalSteps,
        } = require('./transferWorkflow.util');
        const { stepLabelFromAccChain } = require('./acc-workflow-presentation.service');
        const businessSteps = filterBusinessApprovalSteps(trf.approvalRequest?.steps || []);
        const legacyHistory = businessSteps.map((s) => ({
            stepNumber: s.stepNumber,
            role: s.requiredRole?.code ?? null,
            label: stepLabelFromAccChain(chain, s.stepNumber)
                || s.requiredRole?.name
                || s.requiredRole?.code,
            status: s.status,
            actedBy: userName(s.actedByUser),
            actedAt: s.actedAt,
            comment: s.comment,
        }));

        const auditEvents = await prisma.auditLog.findMany({
            where: { tenantId, entityType: 'TRANSFER', entityId: id },
            orderBy: { changedAt: 'asc' },
            take: 200,
            include: { changedByUser: userSelect },
        });
        const raw = buildApprovalTimelineRawEntries(trf.approvalRequest, {
            auditEvents,
            rejectionReason: trf.rejectionReason,
            postedAt: null,
            includePosting: false,
            autoPosted: true,
        });
        const entries = buildTimelineEntries([raw]);
        const hasLifecycle = entries.some(
            (e) =>
                e.entryType === 'LIFECYCLE_EVENT' &&
                PDF_LIFECYCLE_TYPES.has(String(e.lifecycleEventType || '').toUpperCase()),
        );

        if (hasLifecycle) {
            const mapped = mapTimelineEntriesToPdfApprovalWorkflow(entries, {
                accChainDef,
                moduleKey: 'TRANSFER',
                ensurePostingSlot: false,
                includeMilestones: false,
            });
            approvalChainDefinition = mapped.approvalChainDefinition.length
                ? mapped.approvalChainDefinition
                : accChainDef;
            approvalHistory = mapped.approvalHistory;
        } else {
            approvalHistory = legacyHistory;
        }
    }

    const lineItems = (trf.lines || []).map((line) => {
        const qty = num(line.receivedQty ?? line.requestedQty);
        const unitCost = num(line.unitCost);
        const lineValue = line.totalValue != null ? num(line.totalValue) : qty * unitCost;
        return {
            itemId: line.itemId,
            itemName: line.item?.name || '—',
            barcode: line.item?.barcode || null,
            qty,
            unitCost,
            lineValue,
            uom: line.uom?.abbreviation || null,
        };
    });

    const totalQty = lineItems.reduce((s, l) => s + l.qty, 0);
    const totalValue = lineItems.reduce((s, l) => s + l.lineValue, 0);
    const currency = 'SAR';

    return {
        packType: 'transfer',
        packMeta: {
            packTitle: 'TRANSFER REPORT',
            packTitleShort: 'Transfer Report',
            packSubtitle: 'Transfer, approvals, line valuation, and audit trail',
            reportBasis: 'Store transfer operational report and approval trail',
            itemsSectionTitle: 'Transfer Items',
            totalLossLabel: 'Total Value',
            primaryPhotoCaption: 'Transfer photo evidence',
        },
        workflowGeneration,
        header: {
            tenantName: tenant?.name || 'DX OSE',
            documentNo: trf.transferNo,
            status: trf.status,
            reason: trf.reason || null,
            notes: trf.notes || null,
            documentDate: trf.transferDate,
            transferType: 'Store transfer',
            sourceLocation: trf.sourceLocation?.name || '—',
            destLocation: trf.destLocation?.name || '—',
            createdBy: userName(trf.requestedByUser),
            preparedBy: userName(trf.requestedByUser),
            createdAt: trf.createdAt,
            updatedAt: trf.updatedAt,
            postedAt,
            postedBy: postedByName,
        },
        lineItems,
        transferSummary: {
            lineCount: lineItems.length,
            totalQty: parseFloat(totalQty.toFixed(4)),
            totalValue: parseFloat(totalValue.toFixed(4)),
            currency,
        },
        stockImpactSummary: {
            perItem: [],
            totalLossValue: parseFloat(totalValue.toFixed(4)),
            currency,
        },
        approvalChainDefinition,
        approvalHistory,
        approvalSummary: {
            currentStep: trf.approvalRequest?.currentStep,
            totalSteps: trf.approvalRequest?.totalSteps,
            overallStatus: trf.approvalRequest?.status,
            legacyNote:
                workflowGeneration === 'LEGACY'
                    ? 'Migrated legacy workflow (pre–finance-post logistics path).'
                    : null,
        },
        auditTrail: {
            createdBy: userName(trf.requestedByUser),
            createdAt: trf.createdAt,
            updatedAt: trf.updatedAt,
            postedBy: postedByName,
            postedAt,
            approvedBy: userName(trf.approvedByUser),
            approvedAt: trf.approvedAt,
            rejectedBy: userName(trf.rejectedByUser),
            rejectedAt: trf.status === 'REJECTED' || trf.status === 'CANCELLED' ? trf.updatedAt : null,
        },
        attachments: [],
        photoEvidence: {
            photoUrl: null,
            photoKey: null,
        },
        generatedAt: new Date().toISOString(),
        generatedBy: user
            ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
            : 'System',
    };
};

module.exports = {
    getTransferEvidence,
    assertTransferEvidenceEligible,
};
