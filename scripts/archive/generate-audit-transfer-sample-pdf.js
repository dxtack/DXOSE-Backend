#!/usr/bin/env node
'use strict';

/**
 * Generate Transfer Audit Shell sample PDF for visual review (POSTED transfer).
 */
const fs = require('fs');
const path = require('path');
const { renderTransferEvidencePack, TRANSFER_PACK_CONFIG } = require('../src/services/pdf/evidence-pack-pdf');

const OUT_DIR = path.join(__dirname, '../tmp');

/** Minimal 1×1 PNG — attachments must not render in PDF (governance). */
const PLACEHOLDER_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

function makeMockEvidence() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const attachmentPath = path.join(OUT_DIR, '_sample-transfer-photo.png');
    fs.writeFileSync(attachmentPath, PLACEHOLDER_PNG);

    const lineItems = [
        {
            itemName: 'Premium Bath Towel - White - 70x140cm',
            barcode: 'TWL-7001',
            qty: 24,
            unitCost: 42.5,
            lineValue: 1020,
        },
        {
            itemName: 'Porcelain Dinner Plate 27cm',
            barcode: 'PLT-2700',
            qty: 12,
            unitCost: 18.75,
            lineValue: 225,
        },
        {
            itemName: 'Stainless Steel Serving Spoon',
            barcode: 'SPO-SS01',
            qty: 6,
            unitCost: 12.0,
            lineValue: 72,
        },
    ];

    const totalQty = lineItems.reduce((s, l) => s + l.qty, 0);
    const totalValue = lineItems.reduce((s, l) => s + l.lineValue, 0);

    return {
        generatedBy: 'Audit Shell Verify',
        generatedAt: '2026-05-28T14:00:00.000Z',
        packMeta: {
            packTitle: TRANSFER_PACK_CONFIG.labels.packTitle,
            packTitleShort: TRANSFER_PACK_CONFIG.labels.packTitleShort,
            itemsSectionTitle: TRANSFER_PACK_CONFIG.labels.itemsSectionTitle,
            totalLossLabel: TRANSFER_PACK_CONFIG.labels.totalLossLabel,
            primaryPhotoCaption: TRANSFER_PACK_CONFIG.labels.primaryPhotoCaption,
        },
        workflowGeneration: 'V2',
        header: {
            tenantName: 'DX OSE Hotels',
            documentNo: 'TRF-2026-0042',
            status: 'POSTED',
            reason: 'Restock satellite pantry from main store.',
            notes: 'Handle with care — fragile items on line 2.',
            documentDate: '2026-05-28',
            transferType: 'Store transfer',
            sourceLocation: 'F&B Main Store',
            destLocation: 'Store Floor 1',
            createdBy: 'Ahmed Hassan',
            preparedBy: 'Ahmed Hassan',
            createdAt: '2026-05-28T08:00:00.000Z',
            updatedAt: '2026-05-28T11:30:00.000Z',
            postedAt: '2026-05-28T11:30:00.000Z',
            postedBy: 'Layla Nasser',
        },
        lineItems,
        transferSummary: {
            lineCount: lineItems.length,
            totalQty,
            totalValue,
            currency: 'SAR',
        },
        stockImpactSummary: {
            perItem: [],
            totalLossValue: totalValue,
            currency: 'SAR',
        },
        approvalChainDefinition: [
            { step: 1, role: 'DEPT_MANAGER', label: 'Dept approval' },
            { step: 2, role: 'FINANCE_MANAGER', label: 'Finance approval' },
        ],
        approvalHistory: [
            {
                stepNumber: 1,
                role: 'DEPT_MANAGER',
                label: 'Dept approval',
                status: 'APPROVED',
                actedBy: 'Omar Khalid',
                actedAt: '2026-05-28T09:15:00.000Z',
            },
            {
                stepNumber: 2,
                role: 'FINANCE_MANAGER',
                label: 'Finance approval',
                status: 'APPROVED',
                actedBy: 'Layla Nasser',
                actedAt: '2026-05-28T11:00:00.000Z',
            },
        ],
        approvalSummary: {
            currentStep: 2,
            totalSteps: 2,
            overallStatus: 'APPROVED',
            legacyNote: null,
        },
        auditTrail: {
            createdBy: 'Ahmed Hassan',
            createdAt: '2026-05-28T08:00:00.000Z',
            postedBy: 'Layla Nasser',
            postedAt: '2026-05-28T11:30:00.000Z',
        },
        attachments: [{
            url: attachmentPath,
            filename: 'transfer-photo.png',
            originalName: 'Transfer photo evidence',
        }],
        photoEvidence: {
            photoUrl: attachmentPath,
            photoKey: attachmentPath,
        },
    };
}

async function main() {
    const { resolveFontFile, FONT_CANDIDATES } = require('../src/services/pdf/report-pdf-fonts');
    const fontPath = resolveFontFile(FONT_CANDIDATES.regular);
    const fontName = fontPath ? path.basename(fontPath) : 'Helvetica (fallback)';
    console.log(`INFO: Typography — ${fontName}`);

    const outFile = path.join(OUT_DIR, 'audit-evidence-transfer-sample.pdf');
    const buf = await renderTransferEvidencePack(makeMockEvidence());
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(outFile, buf);

    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    console.log(`PASS: Transfer sample — ${pages} page(s), ${buf.length} bytes`);
    console.log(`INFO: ${outFile}`);
}

main().catch((err) => {
    console.error('FAIL:', err.message || err);
    process.exit(1);
});
