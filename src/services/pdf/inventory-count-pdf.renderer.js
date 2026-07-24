'use strict';

const PDFDocument = require('pdfkit');
const { resolveEvidenceTheme, TOKENS } = require('./report-pdf-design-tokens');
const { createEvidenceLayout } = require('./report-pdf-layout');
const { COUNT_PACK_CONFIG } = require('./evidence-pack-registry');
const { registerPdfFonts } = require('./report-pdf-fonts');
const {
    drawAuditReportHeader,
    drawAuditMiniHeader,
    drawAuditInventoryCountMetadataBlock,
    drawAuditSummaryKpiStrip,
    drawAuditInventoryCountLinesTable,
    drawAuditApprovalWorkflow,
    stampAuditEvidenceFooters,
} = require('./report-pdf-audit-shell');

function mapInventoryCountApprovalSlots(history = []) {
    return history.map((row) => {
        const statusRaw = String(row.status || '').toUpperCase();
        let status = statusRaw;
        if (statusRaw === 'SUBMITTED') status = 'PREPARED';

        const stageTitle = row.label || row.step || row.role || 'Step';
        const roleLabel = row.role && row.role !== row.step && row.role !== stageTitle ? row.role : null;
        const pending = status === 'PENDING' || status === 'IN_PROGRESS';
        const omitActorLine = row.kind === 'POSTING';
        const hasActor = row.actor && row.actor !== '—';
        let name = '';
        if (!omitActorLine) {
            if (roleLabel && !hasActor) {
                name = roleLabel;
            } else {
                name = row.actor || (pending ? 'Pending' : '—');
            }
        }

        return {
            label: stageTitle,
            labelEn: stageTitle,
            name,
            role: roleLabel,
            date: row.actedAt,
            status,
            omitActorLine,
        };
    });
}

/** Presentation-only: audit evidence round label (no counting mode). */
function buildInventoryCountRoundLabel(sessionInfo = {}) {
    const roundNo = sessionInfo.roundNo;
    if (roundNo == null || roundNo === '') return '—';
    return `Round ${roundNo}`;
}

/** Presentation-only: location label/value for metadata when scope spans one or many stores. */
function buildInventoryCountLocationPresentation(sessionInfo = {}, lines = []) {
    const scoped = Array.isArray(sessionInfo.scope?.locations)
        ? sessionInfo.scope.locations.filter(Boolean)
        : [];
    const lineLocations = [...new Set((lines || []).map((line) => line.location).filter(Boolean))];
    const unique = [...new Set(scoped.length ? scoped : lineLocations)];

    if (unique.length > 1) {
        return { label: 'Locations', value: unique.join(', ') };
    }
    if (unique.length === 1) {
        return { label: 'Primary Location', value: unique[0] };
    }
    return { label: 'Primary Location', value: sessionInfo.primaryLocation || '—' };
}

/**
 * Inventory Count Evidence PDF — Audit Evidence Shell v2.1 (presentation only).
 * @param {object} payload - exportPdf payload (sessionInfo, kpis, approvalHistory, lines)
 * @returns {Promise<Buffer>}
 */
function renderInventoryCountEvidencePdf(payload = {}) {
    return new Promise((resolve, reject) => {
        try {
            const packConfig = COUNT_PACK_CONFIG;
            const info = payload.sessionInfo || {};
            const kpis = payload.kpis || {};
            const lines = payload.lines || [];

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
            const theme = resolveEvidenceTheme('count');
            const generatedAt = new Date().toISOString();
            const reportReference = `${packConfig.reportRefPrefix}-${info.sessionNo || 'DOC'}`;
            const displayStatus = String(info.status || 'POSTED').toUpperCase();

            const headerOptions = {
                title: packConfig.labels.packTitle,
                packTitle: packConfig.labels.packTitleShort,
                tenantName: info.tenantName || 'DX OSE Hotels',
                documentNo: info.sessionNo,
                reportReference,
                generatedBy: info.createdBy || 'System',
                generatedAt,
                classification: 'INTERNAL AUDIT',
                accent: theme.accent,
            };

            const auditFooterReserve = TOKENS.audit?.footerReserve || 58;

            const layout = createEvidenceLayout(doc, {
                onNewPage: (d) => drawAuditMiniHeader(d, headerOptions, layout),
            });
            layout.fonts = fonts;
            layout.bottomLimit = () => {
                const marginBottom = doc.page.margins?.bottom ?? 60;
                // Keep pagination inside PDFKit's margin break (avoids spurious continueOnNewPage pages).
                return doc.page.height - Math.max(auditFooterReserve, marginBottom) - 1;
            };
            layout.FOOTER_RESERVE = auditFooterReserve;

            drawAuditReportHeader(doc, layout, theme, headerOptions);

            const locationPresentation = buildInventoryCountLocationPresentation(info, lines);

            drawAuditInventoryCountMetadataBlock(doc, layout, {
                tenantName: info.tenantName || 'DX OSE Hotels',
                sessionNo: info.sessionNo,
                department: info.scope?.department,
                primaryLocation: info.primaryLocation,
                locationLabel: locationPresentation.label,
                locationDisplay: locationPresentation.value,
                createdBy: info.createdBy,
                snapshotAt: info.snapshotAt,
                postedAt: info.postedAt,
                roundLabel: buildInventoryCountRoundLabel(info),
                createdAt: info.createdAt,
            }, displayStatus);

            drawAuditSummaryKpiStrip(doc, layout, {}, lines, {}, {
                kpiProfile: 'inventory_count',
                inventoryCountSummary: {
                    linesCounted: kpis.linesCounted,
                    itemsWithVariance: kpis.itemsWithVariance,
                    totalNetVarianceValue: kpis.totalNetVarianceValue,
                    totalAbsVarianceValue: kpis.totalAbsVarianceValue,
                },
            });

            drawAuditInventoryCountLinesTable(doc, layout, lines, {
                sectionTitle: packConfig.labels.itemsSectionTitle || 'Count Lines',
            });

            const approvalSlots = mapInventoryCountApprovalSlots(payload.approvalHistory || []).map((slot) => ({
                ...slot,
                label: slot.label || slot.role,
                date: slot.date || null,
            }));

            if (approvalSlots.length) {
                drawAuditApprovalWorkflow(doc, layout, approvalSlots, theme, {
                    compactWorkflow: true,
                });
            }

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
    renderInventoryCountEvidencePdf,
    mapInventoryCountApprovalSlots,
    buildInventoryCountRoundLabel,
    buildInventoryCountLocationPresentation,
};
