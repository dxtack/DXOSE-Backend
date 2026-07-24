#!/usr/bin/env node
'use strict';

/**
 * Generate Breakage Audit Shell sample PDFs for visual review (HOTEL + EMPLOYEE loss treatment).
 */
const fs = require('fs');
const path = require('path');
const { renderBreakageEvidencePack } = require('../src/services/pdf/evidence-pack-pdf');

const OUT_DIR = path.join(__dirname, '../tmp');

/** Minimal 1×1 PNG for photo layout smoke test. */
const PLACEHOLDER_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

function writePlaceholderPhotos(count) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const photoPaths = [];
    for (let i = 1; i <= count; i += 1) {
        const photoPath = path.join(OUT_DIR, `_sample-breakage-photo-${i}.png`);
        fs.writeFileSync(photoPath, PLACEHOLDER_PNG);
        photoPaths.push(photoPath);
    }
    return photoPaths;
}

function makeMockEvidence(scenario = 'HOTEL') {
    const photoPaths = writePlaceholderPhotos(10);
    const captions = [
        'Primary breakage photo — banquet setup',
        '',
        'Plate stack incident — service area',
        '',
        'Broken china — main kitchen pass',
        'Damaged glassware — storage rack',
        '',
        'Service tray incident — banquet hall',
        'Storage shelf damage — F&B store',
        'Close-up — item barcode verification',
    ];

    const isEmployee = scenario === 'EMPLOYEE';

    return {
        generatedBy: 'Audit Shell Verify',
        generatedAt: '2026-05-28T10:40:00.000Z',
        header: {
            documentNo: isEmployee ? 'BRK-2026-0043' : 'BRK-2026-0042',
            department: 'Food & Beverage',
            preparedBy: 'Ahmed Hassan',
            createdBy: 'Ahmed Hassan',
            createdAt: '2026-05-28T10:15:00.000Z',
            documentDate: '2026-05-28',
            status: 'APPROVED',
            postedAt: '2026-05-28T10:45:00.000Z',
            reason: isEmployee ? 'Staff mishandling during setup' : 'Accountability: Company Loss',
            tenantName: 'DX OSE Hotels',
            suggestedAction: isEmployee ? 'EMPLOYEE' : 'HOTEL',
            responsibleEmployeeName: isEmployee ? 'Mohammed Al-Saud' : null,
        },
        lineItems: [
            {
                itemId: 'i1',
                itemName: 'Longdrink - Weinland 390ml / 13oz - H: 145mm / 5 3/4" - D: 66mm / 2 1/2"',
                barcode: '142605910501',
                qty: 1,
                notes: 'Broken during banquet setup',
            },
            { itemId: 'i2', itemName: 'Porcelain Dinner Plate 27cm', barcode: 'PLT-2700', qty: 4, notes: '' },
            { itemId: 'i3', itemName: 'Stainless Steel Serving Spoon', barcode: 'SPO-SS01', qty: 2, notes: 'Damaged handle' },
        ],
        stockImpactSummary: {
            currency: 'SAR',
            totalLossValue: 847.50,
            perItem: [
                { itemId: 'i1', locationName: 'F&B Horizon', wacAtPosting: 8.23, totalLoss: 8.23 },
                { itemId: 'i2', locationName: 'F&B Main Store', wacAtPosting: 62.50, totalLoss: 250.00 },
                { itemId: 'i3', locationName: 'Banquet Store', wacAtPosting: 163.75, totalLoss: 327.50 },
            ],
        },
        approvalHistory: [
            { step: 1, role: 'STOREKEEPER', actedBy: 'Sara Al-Mutairi', actedAt: '2026-05-28T10:15:00.000Z', status: 'APPROVED' },
            { step: 2, role: 'HOD', actedBy: 'Khalid Rahman', actedAt: '2026-05-28T10:20:00.000Z', status: 'APPROVED' },
            { step: 3, role: 'COST_CONTROL', actedBy: 'Omar Khalid', actedAt: '2026-05-28T10:28:00.000Z', status: 'APPROVED', comment: isEmployee ? 'Employee deduction approved per HR policy.' : null },
            { step: 4, role: 'GENERAL_MANAGER', actedBy: 'Fatima Al-Qahtani', actedAt: '2026-05-28T10:35:00.000Z', status: 'APPROVED' },
            { step: 5, role: 'FINANCE_MANAGER', actedBy: 'Layla Nasser', actedAt: '2026-05-28T10:40:00.000Z', status: 'APPROVED' },
        ],
        approvalChainDefinition: [
            { step: 1, role: 'STOREKEEPER', label: 'Storekeeper' },
            { step: 2, role: 'HOD', label: 'HOD Approval' },
            { step: 3, role: 'COST_CONTROL', label: 'Cost Control' },
            { step: 4, role: 'GENERAL_MANAGER', label: 'General Manager' },
            { step: 5, role: 'FINANCE_MANAGER', label: 'Finance Manager' },
        ],
        attachments: photoPaths.map((photoPath, i) => ({
            filename: `breakage-photo-${i + 1}.png`,
            originalName: captions[i],
            url: photoPath,
        })),
        photoEvidence: null,
    };
}

async function writeSample(scenario) {
    const suffix = scenario.toLowerCase();
    const outFile = path.join(OUT_DIR, `audit-evidence-production-gallery-${suffix}-sample.pdf`);
    const buf = await renderBreakageEvidencePack(makeMockEvidence(scenario));
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(outFile, buf);

    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    console.log(`PASS: ${scenario} sample — ${pages} page(s), ${buf.length} bytes`);
    console.log(`INFO: ${outFile}`);
    return { scenario, pages, bytes: buf.length, outFile };
}

async function main() {
    const { resolveFontFile, FONT_CANDIDATES } = require('../src/services/pdf/report-pdf-fonts');
    const fontPath = resolveFontFile(FONT_CANDIDATES.regular);
    const fontName = fontPath ? path.basename(fontPath) : 'Helvetica (fallback)';
    console.log(`INFO: Typography — ${fontName}`);

    await writeSample('HOTEL');
    await writeSample('EMPLOYEE');

    const legacyOut = path.join(OUT_DIR, 'audit-evidence-production-gallery-sample.pdf');
    fs.copyFileSync(
        path.join(OUT_DIR, 'audit-evidence-production-gallery-hotel-sample.pdf'),
        legacyOut,
    );
    console.log(`INFO: Legacy alias — ${legacyOut}`);
}

main().catch((err) => {
    console.error('FAIL:', err.message || err);
    process.exit(1);
});
