'use strict';

const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { resolveEvidenceTheme } = require('./report-pdf-design-tokens');
const {
    BREAKAGE_PACK_CONFIG,
    LOST_PACK_CONFIG,
    TRANSFER_PACK_CONFIG,
    GRN_PACK_CONFIG,
    resolveEvidenceLabels,
} = require('./evidence-pack-registry');
const {
    createEvidenceLayout,
    drawEvidenceMiniHeader,
} = require('./report-pdf-layout');
const { stampGoldenEvidenceFooters } = require('./report-golden-evidence-adapter');
const {
    drawAuditReportHeader,
    drawAuditMetadataBlock,
    drawAuditSummaryKpiStrip,
    drawAuditItemDetailsTable,
    drawAuditGrnItemsTable,
    drawAuditTransferItemsTable,
    drawAuditReceiptContext,
    drawAuditTransferContext,
    drawAuditLossTreatment,
    drawAuditApprovalWorkflow,
    drawAuditEvidencePhotos,
    drawAuditMiniHeader,
    stampAuditEvidenceFooters,
} = require('./report-pdf-audit-shell');
const { TOKENS } = require('./report-pdf-design-tokens');
const {
    drawEvidencePackHeader,
    drawIncidentAndLossRow,
    drawGoldenMetadataCardGrid,
    drawGoldenIncidentResponsibilityRow,
    drawGoldenFinancialImpactStrip,
    drawSummaryCardGrid,
    drawFinancialImpactSection,
    drawEvidenceItemsTable,
    collectPhotoSources,
    drawPhotoEvidenceGalleryPages,
    buildEvidenceSignatureSlots,
    buildSummaryCards,
    buildGoldenEvidenceMetadataCards,
    resolveDisplayStatus,
    drawCompactApprovalProgress,
    buildTransferSignatureSlots,
    buildGrnSignatureSlots,
} = require('./report-pdf-components');

const GOLDEN_OPERATIONAL_PACK_TYPES = new Set(['lost']);

function usesGoldenOperationalShell(packConfig) {
    return GOLDEN_OPERATIONAL_PACK_TYPES.has(packConfig?.packType);
}

function resolveEvidencePdfInfo(evidence, header, displayStatus) {
    const isOfficial = evidence.isOfficialEvidence === true;
    const statusLabel = evidence.documentStatus || displayStatus || header.status || '—';
    const generatedAt = evidence.generatedAt || new Date().toISOString();
    return {
        Title: isOfficial ? 'OFFICIAL EVIDENCE' : 'EVIDENCE REPORT',
        Author: 'DX OSE',
        Subject: `${header.documentNo || 'DOC'} | ${statusLabel} | Generated ${generatedAt}`,
        Keywords: isOfficial ? 'OFFICIAL_EVIDENCE' : 'EVIDENCE_REPORT',
    };
}

async function loadImageBuffer(source) {
    if (!source) return null;

    const normalized = String(source).trim();
    if (!normalized) return null;

    if (/^https?:\/\//i.test(normalized)) {
        const response = await fetch(normalized);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    const backendRoot = path.join(__dirname, '../../..');
    const localPath = normalized.startsWith('/uploads/')
        ? path.join(backendRoot, normalized.replace(/^\/+/, ''))
        : normalized.includes('/uploads/')
            ? path.join(backendRoot, normalized.substring(normalized.indexOf('/uploads/') + 1))
            : path.isAbsolute(normalized)
                ? normalized
                : path.join(backendRoot, 'uploads/attachments', path.basename(normalized));

    return fs.existsSync(localPath) ? fs.readFileSync(localPath) : null;
}

/**
 * Unified enterprise evidence pack renderer (breakage, lost, …).
 * @param {object} evidence - getEvidence() payload (unchanged)
 * @param {object} packConfig - from evidence-pack-registry
 * @returns {Promise<Buffer>}
 */
function renderEvidencePack(evidence, packConfig) {
    return new Promise(async (resolve, reject) => {
        try {
            const { header, lineItems = [], stockImpactSummary = {} } = evidence;
            const packMeta = resolveEvidenceLabels(evidence.packMeta || {}, packConfig);
            const theme = resolveEvidenceTheme(packConfig.themeVariant || 'breakage');
            const generatedBy = evidence.generatedBy || header.createdBy || 'System';
            const generatedAt = evidence.generatedAt || new Date().toISOString();
            const reportReference = `${packConfig.reportRefPrefix}-${header.documentNo || 'DOC'}`;
            const displayStatus = resolveDisplayStatus(header);
            const isOfficial = evidence.isOfficialEvidence === true;
            const classification = isOfficial ? 'OFFICIAL EVIDENCE' : 'INTERNAL AUDIT';

            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 40, bottom: 60, left: 40, right: 40 },
                bufferPages: true,
                info: resolveEvidencePdfInfo(evidence, header, displayStatus),
            });

            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const headerOptions = {
                title: packMeta.packTitle,
                packTitle: packMeta.packTitleShort || packMeta.packTitle,
                tenantName: header.tenantName || 'DX OSE',
                documentNo: header.documentNo,
                reportReference,
                generatedBy,
                generatedAt,
                classification,
                accent: theme.accent,
            };

            const layout = createEvidenceLayout(doc, {
                onNewPage: (d) => drawEvidenceMiniHeader(d, headerOptions, layout),
            });

            drawEvidencePackHeader(doc, layout, theme, {
                ...headerOptions,
                displayStatus,
            });

            if (usesGoldenOperationalShell(packConfig)) {
                drawGoldenMetadataCardGrid(doc, layout, buildGoldenEvidenceMetadataCards(evidence, layout));

                drawGoldenIncidentResponsibilityRow(doc, layout, theme, {
                    reason: header.reason,
                    notes: header.notes,
                    header,
                    approvalHistory: evidence.approvalHistory || [],
                });

                drawGoldenFinancialImpactStrip(doc, layout, theme, stockImpactSummary, lineItems.length);
            } else {
                drawSummaryCardGrid(doc, layout, buildSummaryCards(evidence, layout), theme, { columns: 4 });

                const notesPdf = header.notes
                    ? String(header.notes).replace(/\s*\n\s*/g, ' · ').trim()
                    : null;
                drawIncidentAndLossRow(doc, layout, theme, {
                    reason: header.reason,
                    notes: notesPdf,
                    totalLossValue: stockImpactSummary.totalLossValue,
                    currency: stockImpactSummary.currency || 'SAR',
                    totalLossLabel: packMeta.totalLossLabel,
                });

                drawFinancialImpactSection(doc, layout, theme, stockImpactSummary, packMeta);
            }

            drawEvidenceItemsTable(
                doc,
                layout,
                theme,
                lineItems,
                stockImpactSummary.perItem || [],
                packMeta.itemsSectionTitle,
            );

            drawCompactApprovalProgress(
                doc,
                layout,
                theme,
                buildEvidenceSignatureSlots(evidence),
                { displayStatus },
            );

            const photoSources = collectPhotoSources(evidence, packMeta);
            if (photoSources.length > 0) {
                await drawPhotoEvidenceGalleryPages(doc, layout, theme, photoSources, loadImageBuffer, {
                    documentNo: header.documentNo,
                });
            }

            stampGoldenEvidenceFooters(
                doc,
                layout,
                {
                    tenantName: header.tenantName || 'DX OSE',
                    reportReference,
                    generatedAt,
                    generatedBy,
                    classification,
                },
                packConfig.packType,
            );

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Audit Evidence Shell v2.1 — shared operational evidence renderer (Breakage, Lost, …).
 */
function renderAuditOperationalEvidencePack(evidence, packConfig, shellOptions = {}) {
    const itemDetailsSectionTitle = shellOptions.itemDetailsSectionTitle || 'Item Details';
    const includeLossTreatment = shellOptions.includeLossTreatment !== false;
    const kpiProfile = shellOptions.kpiProfile || 'loss';
    const metadataProfile = shellOptions.metadataProfile || 'default';
    const tableProfile = shellOptions.tableProfile || 'loss';
    const includeReceiptContext = shellOptions.includeReceiptContext === true;
    const includeTransferContext = shellOptions.includeTransferContext === true;
    const includeEvidenceGallery = shellOptions.includeEvidenceGallery !== false;
    const approvalSlotBuilder = shellOptions.approvalSlotBuilder || 'evidence';

    return new Promise(async (resolve, reject) => {
        try {
            const { header, lineItems = [], stockImpactSummary = {} } = evidence;
            const packMeta = resolveEvidenceLabels(evidence.packMeta || {}, packConfig);
            const theme = resolveEvidenceTheme(packConfig.themeVariant || packConfig.packType || 'breakage');
            const generatedBy = evidence.generatedBy || header.createdBy || 'System';
            const generatedAt = evidence.generatedAt || new Date().toISOString();
            const reportReference = `${packConfig.reportRefPrefix}-${header.documentNo || 'DOC'}`;
            const displayStatus = resolveDisplayStatus(header);
            const isOfficial = evidence.isOfficialEvidence === true;
            const classification = isOfficial ? 'OFFICIAL EVIDENCE' : 'INTERNAL AUDIT';

            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 40, bottom: 60, left: 40, right: 40 },
                bufferPages: true,
                info: resolveEvidencePdfInfo(evidence, header, displayStatus),
            });

            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const { registerPdfFonts } = require('./report-pdf-fonts');
            const fonts = registerPdfFonts(doc);
            const auditFooterReserve = TOKENS.audit?.footerReserve || 58;

            const headerOptions = {
                title: packMeta.packTitle,
                packTitle: packMeta.packTitleShort || packMeta.packTitle,
                tenantName: header.tenantName || 'DX OSE',
                documentNo: header.documentNo,
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

            drawAuditMetadataBlock(doc, layout, header, displayStatus, {
                profile: metadataProfile === 'default' ? undefined : metadataProfile,
            });

            drawAuditSummaryKpiStrip(doc, layout, stockImpactSummary, lineItems, header, {
                kpiProfile,
                costSummary: evidence.costSummary || {},
                transferSummary: evidence.transferSummary || {},
            });

            if (includeReceiptContext) {
                drawAuditReceiptContext(doc, layout, header);
            }

            if (includeTransferContext) {
                drawAuditTransferContext(doc, layout, header);
            }

            if (tableProfile === 'grn') {
                drawAuditGrnItemsTable(doc, layout, lineItems, {
                    sectionTitle: itemDetailsSectionTitle,
                });
            } else if (tableProfile === 'transfer') {
                drawAuditTransferItemsTable(doc, layout, lineItems, {
                    sectionTitle: itemDetailsSectionTitle,
                });
            } else {
                drawAuditItemDetailsTable(
                    doc,
                    layout,
                    lineItems,
                    stockImpactSummary.perItem || [],
                    header,
                    { sectionTitle: itemDetailsSectionTitle },
                );
            }

            if (includeLossTreatment) {
                drawAuditLossTreatment(
                    doc,
                    layout,
                    header,
                    stockImpactSummary,
                    evidence.approvalHistory || [],
                );
            }

            const rawSlots = approvalSlotBuilder === 'grn'
                ? buildGrnSignatureSlots(evidence)
                : approvalSlotBuilder === 'transfer'
                    ? buildTransferSignatureSlots(evidence)
                    : buildEvidenceSignatureSlots(evidence);
            const approvalSlots = rawSlots.map((slot) => ({
                ...slot,
                label: slot.label || slot.role,
                date: slot.date || slot.actedAt || null,
            }));
            drawAuditApprovalWorkflow(doc, layout, approvalSlots, theme);

            if (includeEvidenceGallery) {
                const photoSources = collectPhotoSources(evidence, packMeta);
                if (photoSources.length > 0) {
                    await drawAuditEvidencePhotos(doc, layout, photoSources, loadImageBuffer, {
                        documentNo: header.documentNo,
                        reportReference,
                        classification,
                        documentDate: header.documentDate,
                        createdAt: header.createdAt,
                    });
                }
            }

            stampAuditEvidenceFooters(doc, layout, {
                goldenShellRev: 'audit-v2.1-golden-literal-locked',
            });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Breakage evidence pack — Enterprise Audit Style shell (presentation only).
 */
function renderBreakageAuditEvidencePack(evidence) {
    return renderAuditOperationalEvidencePack(evidence, BREAKAGE_PACK_CONFIG);
}

const renderBreakageEvidencePack = (evidence) => renderBreakageAuditEvidencePack(evidence);

function renderLostAuditEvidencePack(evidence) {
    return renderAuditOperationalEvidencePack(evidence, LOST_PACK_CONFIG, {
        itemDetailsSectionTitle: 'Lost Items',
    });
}

const renderLostEvidencePack = (evidence) => renderLostAuditEvidencePack(evidence);

function renderGrnAuditEvidencePack(evidence) {
    return renderAuditOperationalEvidencePack(evidence, GRN_PACK_CONFIG, {
        includeLossTreatment: false,
        itemDetailsSectionTitle: 'Imported Items',
        kpiProfile: 'grn',
        metadataProfile: 'grn',
        tableProfile: 'grn',
        includeEvidenceGallery: false,
        approvalSlotBuilder: 'grn',
    });
}

const renderGrnEvidencePack = (evidence) => renderGrnAuditEvidencePack(evidence);

function renderTransferAuditEvidencePack(evidence) {
    return renderAuditOperationalEvidencePack(evidence, TRANSFER_PACK_CONFIG, {
        includeLossTreatment: false,
        itemDetailsSectionTitle: 'Transfer Items',
        kpiProfile: 'transfer',
        metadataProfile: 'transfer',
        tableProfile: 'transfer',
        includeEvidenceGallery: false,
        approvalSlotBuilder: 'transfer',
    });
}

const renderTransferEvidencePack = (evidence) => renderTransferAuditEvidencePack(evidence);

module.exports = {
    renderEvidencePack,
    renderAuditOperationalEvidencePack,
    renderBreakageAuditEvidencePack,
    renderBreakageEvidencePack,
    renderLostAuditEvidencePack,
    renderLostEvidencePack,
    renderGrnAuditEvidencePack,
    renderGrnEvidencePack,
    renderTransferAuditEvidencePack,
    renderTransferEvidencePack,
    loadImageBuffer,
    BREAKAGE_PACK_CONFIG,
    LOST_PACK_CONFIG,
    TRANSFER_PACK_CONFIG,
    GRN_PACK_CONFIG,
};
