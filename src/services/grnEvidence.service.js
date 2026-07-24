'use strict';

const prisma = require('../config/database');
const { userName, num } = require('../utils/evidence-format.util');
const { getGrn } = require('./grn.service');
const {
    approvalChainDefinitionFromAcc,
    resolvePresentationChain,
} = require('./acc-workflow-presentation.service');
const { buildGrnTimelineRawEntries } = require('../platform/timeline/grnTimeline.builder');
const { buildTimelineEntries } = require('../platform/timeline/timelineEntry.merge');
const { mapTimelineEntriesToPdfApprovalWorkflow } = require('./evidence-pdf-approval-from-timeline.util');

/** @deprecated Wave 6 — preview allowed; use evidenceClassification.isOfficialEvidenceEligible */
const assertGrnEvidenceEligible = (grn) => {
    const { isOfficialEvidenceEligible } = require('../platform/evidenceClassification.service');
    if (!isOfficialEvidenceEligible('GRN', { internalStatus: grn.status, postedAt: grn.postedAt })) {
        throw Object.assign(
            new Error(
                'Official GRN evidence is available only after the GRN is posted to inventory.',
            ),
            { status: 422, code: 'EVIDENCE_OFFICIAL_NOT_ELIGIBLE' },
        );
    }
};

const userSelect = { select: { id: true, firstName: true, lastName: true } };

/**
 * Load approval history cycles + audits so PDF uses the same timeline source as the screen.
 */
async function loadGrnTimelineContext(grn, tenantId) {
    const [approvalHistory, auditEvents] = await Promise.all([
        prisma.approvalRequest.findMany({
            where: {
                tenantId,
                requestType: 'GRN_IMPORT',
                grnImportId: grn.id,
                ...(grn.approvalRequestId ? { id: { not: grn.approvalRequestId } } : {}),
            },
            orderBy: [{ cycleNumber: 'asc' }, { createdAt: 'asc' }],
            include: {
                steps: {
                    orderBy: { stepNumber: 'asc' },
                    include: {
                        actedByUser: userSelect,
                        requiredRole: { select: { code: true, name: true } },
                    },
                },
            },
        }),
        prisma.auditLog.findMany({
            where: { tenantId, entityType: 'GRN', entityId: grn.id },
            orderBy: { changedAt: 'asc' },
            take: 200,
            include: { changedByUser: userSelect },
        }),
    ]);

    return {
        grnWithHistory: {
            ...grn,
            approvalHistory,
        },
        auditEvents,
    };
}

function buildGrnPdfApprovalWorkflow(grnWithHistory, auditEvents, accChainDef) {
    const raw = buildGrnTimelineRawEntries(grnWithHistory, auditEvents);
    const entries = buildTimelineEntries([raw]);
    return mapTimelineEntriesToPdfApprovalWorkflow(entries, {
        accChainDef,
        moduleKey: 'GRN',
        ensurePostingSlot: true,
        includeMilestones: true,
        postedAt: grnWithHistory.postedAt || null,
        postedBy: userName(grnWithHistory.postedByUser),
    });
}

/**
 * Audit-grade evidence JSON for GRN PDF (reporting layer only).
 */
const getGrnEvidence = async (id, tenantId, user = null) => {
    const grn = await getGrn(id, tenantId, user);

    const chain = await resolvePresentationChain({
        moduleKey: 'GRN',
        tenantId,
        versionId: grn.accWorkflowVersionId,
    });
    const accChainDef = approvalChainDefinitionFromAcc(chain);

    const { grnWithHistory, auditEvents } = await loadGrnTimelineContext(grn, tenantId);
    const { approvalChainDefinition, approvalHistory } = buildGrnPdfApprovalWorkflow(
        grnWithHistory,
        auditEvents,
        accChainDef,
    );

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
    });

    const lineItems = (grn.lines || []).map((line) => {
        const qty = num(line.receivedQty);
        const unitCost = num(line.unitPrice);
        const lineValue = qty * unitCost;
        return {
            itemName: line.item?.name || line.futurelogDescription || '—',
            itemCode: line.item?.barcode || line.futurelogItemCode || null,
            barcode: line.item?.barcode || line.futurelogItemCode || null,
            qty,
            unitCost,
            lineValue,
            uom: line.uom?.abbreviation || line.futurelogUom || null,
        };
    });

    const totalQty = lineItems.reduce((s, l) => s + l.qty, 0);
    const totalValue = lineItems.reduce((s, l) => s + l.lineValue, 0);
    const currency = 'SAR';

    const invoiceRef = (grn.supplierInvoiceNumber || '').trim() || '—';
    const supplierName = grn.vendor?.name || grn.vendorNameSnapshot || '—';

    return {
        packType: 'grn',
        packMeta: {
            packTitle: 'GRN EVIDENCE PACK',
            packTitleShort: 'GRN Evidence Pack',
            packSubtitle: 'Goods receipt, supplier invoice, approvals, and posting audit',
            reportBasis: 'GRN import evidence and approval trail',
            itemsSectionTitle: 'Imported Items',
            totalLossLabel: 'Total GRN Value',
            primaryPhotoCaption: 'Supplier invoice attachment',
        },
        header: {
            tenantName: tenant?.name || 'DX OSE',
            documentNo: grn.grnNumber,
            status: grn.status,
            reason: null,
            notes: grn.notes || null,
            documentDate: grn.receivingDate,
            supplierName,
            receivingLocation: grn.location?.name || '—',
            invoiceRef,
            createdBy: userName(grn.importedByUser),
            createdAt: grn.createdAt,
            updatedAt: grn.updatedAt,
            postedAt: grn.postedAt,
            postedBy: userName(grn.postedByUser),
        },
        lineItems,
        costSummary: {
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
        auditTrail: {
            createdBy: userName(grn.importedByUser),
            createdAt: grn.createdAt,
            updatedAt: grn.updatedAt,
            postedBy: userName(grn.postedByUser),
            postedAt: grn.postedAt,
            costControlBy: userName(grn.approvedByUser),
            rejectedBy: userName(grn.rejectedByUser),
        },
        attachments: grn.pdfAttachmentUrl
            ? [{ url: grn.pdfAttachmentUrl, filename: 'supplier-invoice.pdf', originalName: 'Supplier invoice' }]
            : [],
        photoEvidence: {
            photoUrl: grn.pdfAttachmentDisplayUrl || null,
            photoKey: grn.pdfAttachmentUrl || null,
        },
        generatedAt: new Date().toISOString(),
        generatedBy: user
            ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
            : 'System',
    };
};

module.exports = {
    getGrnEvidence,
    assertGrnEvidenceEligible,
};
