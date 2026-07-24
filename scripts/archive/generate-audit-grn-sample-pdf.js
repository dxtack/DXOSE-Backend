#!/usr/bin/env node
'use strict';

/**
 * Generate GRN Audit Shell sample PDF for visual review (POSTED GRN).
 */
const fs = require('fs');
const path = require('path');
const { renderGrnEvidencePack, GRN_PACK_CONFIG } = require('../src/services/pdf/evidence-pack-pdf');

const OUT_DIR = path.join(__dirname, '../tmp');

/** Minimal 1×1 PNG for invoice attachment smoke test. */
const PLACEHOLDER_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

function makeMockEvidence() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const invoicePath = path.join(OUT_DIR, '_sample-grn-invoice.png');
    fs.writeFileSync(invoicePath, PLACEHOLDER_PNG);

    const lineItems = [
        {
            itemName: 'Premium Bath Towel - White - 70x140cm',
            barcode: 'TWL-7001',
            qty: 120,
            unitCost: 42.5,
            lineValue: 5100,
            uom: 'PCS',
        },
        {
            itemName: 'Porcelain Dinner Plate 27cm',
            barcode: 'PLT-2700',
            qty: 48,
            unitCost: 18.75,
            lineValue: 900,
            uom: 'PCS',
        },
        {
            itemName: 'Stainless Steel Serving Spoon',
            barcode: 'SPO-SS01',
            qty: 24,
            unitCost: 12.0,
            lineValue: 288,
            uom: 'PCS',
        },
    ];

    const totalQty = lineItems.reduce((s, l) => s + l.qty, 0);
    const totalValue = lineItems.reduce((s, l) => s + l.lineValue, 0);

    return {
        generatedBy: 'Audit Shell Verify',
        generatedAt: '2026-05-28T11:00:00.000Z',
        packMeta: {
            packTitle: GRN_PACK_CONFIG.labels.packTitle,
            packTitleShort: GRN_PACK_CONFIG.labels.packTitleShort,
            itemsSectionTitle: GRN_PACK_CONFIG.labels.itemsSectionTitle,
            totalLossLabel: GRN_PACK_CONFIG.labels.totalLossLabel,
            primaryPhotoCaption: GRN_PACK_CONFIG.labels.primaryPhotoCaption,
        },
        header: {
            documentNo: 'GRN-2026-0188',
            status: 'POSTED',
            notes: 'Supplier delivery verified against PO-4421.',
            documentDate: '2026-05-28',
            supplierName: 'Test Supplier',
            receivingLocation: 'Store Floor 1',
            invoiceRef: '5555555555555',
            createdBy: 'Sara Al-Mutairi',
            createdAt: '2026-05-28T09:30:00.000Z',
            updatedAt: '2026-05-28T10:15:00.000Z',
            postedAt: '2026-05-28T10:15:00.000Z',
            postedBy: 'Layla Nasser',
            tenantName: 'DX OSE Hotels',
        },
        lineItems,
        costSummary: {
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
        approvalHistory: [
            { stepNumber: 1, step: 'RECEIVED & VALIDATED', label: 'Received & validated', status: 'COMPLETED', kind: 'MILESTONE', actedBy: 'Sara Al-Mutairi', actedAt: '2026-05-28T09:30:00.000Z' },
            { stepNumber: 2, step: 'COST CONTROL APPROVED', label: 'Cost Control approved', status: 'APPROVED', kind: 'APPROVAL', actedBy: 'Omar Khalid', actedAt: null },
            { stepNumber: 3, step: 'FINANCE APPROVED', label: 'Finance approved', status: 'APPROVED', kind: 'APPROVAL', actedBy: 'Layla Nasser', actedAt: '2026-05-28T10:15:00.000Z' },
            { stepNumber: 4, step: 'POSTED TO INVENTORY', label: 'Posted to inventory', status: 'POSTED', kind: 'POSTING', actedBy: null, actedAt: '2026-05-28T10:15:00.000Z' },
        ],
        approvalChainDefinition: [
            { step: 1, role: 'RECEIVED', label: 'Received & validated' },
            { step: 2, role: 'COST_CONTROL', label: 'Cost Control approved' },
            { step: 3, role: 'FINANCE', label: 'Finance approved' },
            { step: 4, role: 'SYSTEM', label: 'Posted to inventory' },
        ],
        auditTrail: {
            createdBy: 'Sara Al-Mutairi',
            createdAt: '2026-05-28T09:30:00.000Z',
            postedBy: 'Layla Nasser',
            postedAt: '2026-05-28T10:15:00.000Z',
            costControlBy: 'Omar Khalid',
        },
        attachments: [{
            url: invoicePath,
            filename: 'supplier-invoice.png',
            originalName: 'Supplier invoice',
        }],
        photoEvidence: {
            photoUrl: invoicePath,
            photoKey: invoicePath,
        },
    };
}

async function main() {
    const { resolveFontFile, FONT_CANDIDATES } = require('../src/services/pdf/report-pdf-fonts');
    const fontPath = resolveFontFile(FONT_CANDIDATES.regular);
    const fontName = fontPath ? path.basename(fontPath) : 'Helvetica (fallback)';
    console.log(`INFO: Typography — ${fontName}`);

    const outFile = path.join(OUT_DIR, 'audit-evidence-grn-sample.pdf');
    const buf = await renderGrnEvidencePack(makeMockEvidence());
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(outFile, buf);

    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    console.log(`PASS: GRN sample — ${pages} page(s), ${buf.length} bytes`);
    console.log(`INFO: ${outFile}`);
}

main().catch((err) => {
    console.error('FAIL:', err.message || err);
    process.exit(1);
});
