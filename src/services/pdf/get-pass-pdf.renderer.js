'use strict';

const PDFDocument = require('pdfkit');
const { resolveEvidenceTheme, TOKENS } = require('./report-pdf-design-tokens');
const { createEvidenceLayout } = require('./report-pdf-layout');
const { GET_PASS_PACK_CONFIG } = require('./evidence-pack-registry');
const { formatPerson } = require('./report-pdf-components');
const { registerPdfFonts } = require('./report-pdf-fonts');
const {
    drawAuditReportHeader,
    drawAuditMiniHeader,
    drawAuditGetPassMetadataBlock,
    drawAuditSummaryKpiStrip,
    drawAuditGetPassContext,
    drawAuditGetPassItemsTable,
    drawAuditApprovalWorkflow,
    stampAuditEvidenceFooters,
} = require('./report-pdf-audit-shell');

const OVERDUE_TRANSFER_TYPES = new Set(['TEMPORARY', 'CATERING', 'OUTSIDE_CATERING']);
const OVERDUE_STATUSES = new Set(['OUT', 'PARTIALLY_RETURNED']);

function isGetPassOverdue(pass, now = new Date()) {
    if (!pass?.expectedReturnDate) return false;
    if (!OVERDUE_TRANSFER_TYPES.has(pass.transferType)) return false;
    if (!OVERDUE_STATUSES.has(pass.status)) return false;
    return new Date(pass.expectedReturnDate) < now;
}

/**
 * PDF status pill: ACTIVE | RETURNED | CLOSED | OVERDUE
 */
function resolveGetPassPdfStatus(pass) {
    if (isGetPassOverdue(pass)) return 'OVERDUE';
    if (pass.status === 'CLOSED') return 'CLOSED';
    if (pass.status === 'RETURNED' || pass.status === 'PARTIALLY_RETURNED') return 'RETURNED';
    return 'ACTIVE';
}

function formatTransferType(transferType) {
    return String(transferType || '—').replace(/_/g, ' ');
}

function approvalSlot(label, userOrName, date, statusOverride) {
    const name = typeof userOrName === 'string'
        ? userOrName
        : formatPerson(userOrName);
    const complete = Boolean(date);
    const status = statusOverride || (complete ? 'APPROVED' : 'PENDING');
    return {
        label,
        name: name || (complete ? '—' : 'Pending'),
        date: date || null,
        status,
    };
}

/**
 * Terminal Return Status step — same labels as Get Pass Context RETURN STATUS
 * (Returned / Partially Returned). Not a governance approval.
 */
function resolveGetPassReturnWorkflowSlot(pass = {}) {
    const status = String(pass.status || '').toUpperCase();
    let label = 'Returned';
    if (status === 'PARTIALLY_RETURNED') label = 'Partially Returned';
    else if (status === 'RETURNED' || status === 'CLOSED') label = 'Returned';

    const returnedAt =
        pass.returnStatusAt ||
        pass.closedAt ||
        (status === 'RETURNED' || status === 'PARTIALLY_RETURNED' || status === 'CLOSED'
            ? pass.updatedAt
            : null);

    const actor =
        pass.returnStatusActor ||
        pass.closingUser ||
        null;

    if (!returnedAt) {
        return approvalSlot(label, null, null, 'PENDING');
    }
    return approvalSlot(label, actor, returnedAt, 'APPROVED');
}

function buildGetPassAuditWorkflowSlots(pass) {
    return [
        approvalSlot('Prepared By', pass.createdByUser, pass.createdAt, pass.createdAt ? 'PREPARED' : 'PENDING'),
        approvalSlot('Department Head', pass.deptApprover, pass.deptApprovedAt),
        approvalSlot('Cost Control', pass.costControlApprover, pass.costControlApprovedAt),
        approvalSlot('Finance Manager', pass.financeApprover, pass.financeApprovedAt),
        approvalSlot('General Manager', pass.gmApprover, pass.gmApprovedAt),
        approvalSlot('Security', pass.securityApprover, pass.securityApprovedAt),
        approvalSlot('Security Clearance', pass.checkoutUser, pass.checkedOutAt),
        resolveGetPassReturnWorkflowSlot(pass),
    ];
}

/** @deprecated Use buildGetPassAuditWorkflowSlots */
const buildGetPassWorkflowSlots = buildGetPassAuditWorkflowSlots;

function buildGetPassSummary(lines = []) {
    const totalQtyOut = lines.reduce((sum, line) => sum + (parseFloat(line.qty) || 0), 0);
    const totalQtyReturned = lines.reduce(
        (sum, line) => sum + (parseFloat(line.returnedGoodQty) || 0),
        0,
    );
    return {
        lineCount: lines.length,
        totalQtyOut,
        totalQtyReturned,
    };
}

/**
 * Get Pass Evidence Pack PDF — CLOSED (Audit Evidence Shell v2.1, presentation only).
 * Qty Returned = returnedGoodQty; Condition = operational return outcome.
 * Next: Wave 5 — Inventory Count Evidence PDF.
 * @param {object} pass - getGetPassById payload
 * @returns {Promise<Buffer>}
 */
function renderGetPassControlledDocument(pass) {
    return new Promise((resolve, reject) => {
        try {
            const packConfig = GET_PASS_PACK_CONFIG;
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 40, bottom: 60, left: 40, right: 40 },
                bufferPages: true,
            });

            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const fonts = registerPdfFonts(doc);
            const theme = resolveEvidenceTheme('gate_pass');
            const displayStatus = resolveGetPassPdfStatus(pass);
            const generatedAt = new Date().toISOString();
            const generatedBy = formatPerson(pass.createdByUser) || 'System';
            const reportReference = `${packConfig.reportRefPrefix}-${pass.passNo || 'DOC'}`;
            const classification = 'SECURITY CONTROLLED';
            const auditFooterReserve = TOKENS.audit?.footerReserve || 58;
            const lines = pass.lines || [];
            const getPassSummary = buildGetPassSummary(lines);

            const headerOptions = {
                title: packConfig.labels.packTitle,
                packTitle: packConfig.labels.packTitleShort,
                tenantName: pass.tenant?.name || 'DX OSE Hotels',
                documentNo: pass.passNo,
                reportReference,
                generatedBy,
                generatedAt,
                classification,
                accent: theme.accent,
            };

            const layout = createEvidenceLayout(doc, {
                onNewPage: (d) => drawAuditMiniHeader(d, headerOptions, layout),
            });
            layout.fonts = fonts;
            layout.bottomLimit = () => doc.page.height - auditFooterReserve;
            layout.FOOTER_RESERVE = auditFooterReserve;

            drawAuditReportHeader(doc, layout, theme, {
                ...headerOptions,
                classification,
            });

            drawAuditGetPassMetadataBlock(doc, layout, {
                tenantName: pass.tenant?.name || 'DX OSE Hotels',
                passNo: pass.passNo,
                department: pass.department?.name,
                borrower: pass.borrowingEntity,
                transferType: formatTransferType(pass.transferType),
                createdOn: layout.formatDateTime(pass.createdAt),
                preparedBy: formatPerson(pass.createdByUser) || 'System',
            }, displayStatus);

            drawAuditSummaryKpiStrip(doc, layout, {}, lines, {}, {
                kpiProfile: 'get_pass',
                getPassSummary,
            });

            drawAuditGetPassContext(doc, layout, pass);

            drawAuditGetPassItemsTable(doc, layout, lines, {
                sectionTitle: packConfig.labels.itemsSectionTitle || 'Get Pass Items',
            });

            const approvalSlots = buildGetPassAuditWorkflowSlots(pass).map((slot) => ({
                ...slot,
                label: slot.label || slot.role,
                date: slot.date || null,
            }));
            drawAuditApprovalWorkflow(doc, layout, approvalSlots, theme, {
                minStepWidth: 72,
                stageGap: 11,
            });

            stampAuditEvidenceFooters(doc, layout, {
                goldenShellRev: 'audit-v2.1-golden-literal-locked',
            });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    renderGetPassControlledDocument,
    resolveGetPassPdfStatus,
    buildGetPassAuditWorkflowSlots,
    buildGetPassWorkflowSlots,
    isGetPassOverdue,
};
