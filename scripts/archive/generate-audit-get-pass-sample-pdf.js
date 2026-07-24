#!/usr/bin/env node
'use strict';

/**
 * Generate Get Pass Audit Shell sample PDF for visual review.
 * KPI check: total qty out 1125, total good returned (PDF Qty Returned) 925.
 */
const fs = require('fs');
const path = require('path');
const { renderGetPassControlledDocument } = require('../src/services/pdf/get-pass-pdf.renderer');
const {
    resolveGetPassPdfGoodReturnedQty,
    resolveGetPassPdfLineOutcome,
} = require('../src/services/pdf/report-pdf-audit-shell');

const OUT_DIR = path.join(__dirname, '../tmp');

function makeMockPass() {
    const lines = [
        {
            qty: 500,
            qtyReturned: 500,
            returnedGoodQty: 500,
            returnedDamagedQty: 0,
            returnedLostQty: 0,
            status: 'RETURNED',
            notes: 'Full good return',
            item: { name: 'Premium Bath Towel - White - 70x140cm', code: 'TWL-7001', barcode: 'TWL-7001' },
            location: { name: 'F&B Main Store' },
        },
        {
            qty: 425,
            qtyReturned: 425,
            returnedGoodQty: 425,
            returnedDamagedQty: 0,
            returnedLostQty: 0,
            status: 'RETURNED',
            item: { name: 'Stainless Steel Serving Spoon', code: 'SPO-SS01', barcode: 'SPO-SS01' },
            location: { name: 'Housekeeping Store' },
        },
        {
            qty: 100,
            qtyReturned: 100,
            returnedGoodQty: 0,
            returnedDamagedQty: 0,
            returnedLostQty: 100,
            status: 'LOST',
            notes: 'Gate inspection — lost',
            item: { name: 'Porcelain Dinner Plate 27cm', code: 'PLT-2700', barcode: 'PLT-2700' },
            location: { name: 'F&B Main Store' },
        },
        {
            qty: 100,
            qtyReturned: 100,
            returnedGoodQty: 0,
            returnedDamagedQty: 100,
            returnedLostQty: 0,
            status: 'RETURNED',
            notes: 'Gate inspection — damaged',
            item: { name: 'Glass Water Jug 1.5L', code: 'JUG-1500', barcode: 'JUG-1500' },
            location: { name: 'F&B Main Store' },
        },
    ];

    return {
        passNo: 'GP-2026-0088',
        status: 'RETURNED',
        transferType: 'TEMPORARY',
        reason: 'test',
        expectedReturnDate: '2026-06-15T00:00:00.000Z',
        borrowingEntity: 'Elite Catering Co.',
        createdAt: '2026-05-28T08:30:00.000Z',
        deptApprovedAt: '2026-05-28T09:00:00.000Z',
        costControlApprovedAt: '2026-05-28T09:30:00.000Z',
        financeApprovedAt: '2026-05-28T10:00:00.000Z',
        gmApprovedAt: '2026-05-28T10:30:00.000Z',
        securityApprovedAt: '2026-05-28T11:00:00.000Z',
        checkedOutAt: '2026-05-28T11:15:00.000Z',
        tenant: { name: 'DX OSE Hotels' },
        department: { name: 'Food & Beverage' },
        createdByUser: { firstName: 'Sara', lastName: 'Al-Mutairi', email: 'sara@example.com' },
        deptApprover: { firstName: 'Omar', lastName: 'Khalid', email: 'omar@example.com' },
        costControlApprover: { firstName: 'Fatima', lastName: 'Hassan', email: 'fatima@example.com' },
        financeApprover: { firstName: 'Layla', lastName: 'Nasser', email: 'layla@example.com' },
        gmApprover: { firstName: 'Khalid', lastName: 'Rahman', email: 'khalid@example.com' },
        securityApprover: { firstName: 'Youssef', lastName: 'Ali', email: 'youssef@example.com' },
        checkoutUser: { firstName: 'Youssef', lastName: 'Ali', email: 'youssef@example.com' },
        lines,
    };
}

function verifySampleTotals(pass) {
    const totalOut = pass.lines.reduce((s, l) => s + Number(l.qty || 0), 0);
    const totalGood = pass.lines.reduce((s, l) => s + resolveGetPassPdfGoodReturnedQty(l), 0);
    const checks = [
        { label: 'TOTAL QTY OUT', expected: 1125, actual: totalOut },
        { label: 'TOTAL QTY RETURNED (good)', expected: 925, actual: totalGood },
    ];
    for (const c of checks) {
        if (Math.abs(c.actual - c.expected) > 1e-9) {
            throw new Error(`${c.label}: expected ${c.expected}, got ${c.actual}`);
        }
    }
    const lostLine = pass.lines[2];
    const damagedLine = pass.lines[3];
    if (resolveGetPassPdfGoodReturnedQty(lostLine) !== 0) {
        throw new Error('Lost row: Qty Returned (good) must be 0');
    }
    if (resolveGetPassPdfLineOutcome(lostLine) !== 'Lost') {
        throw new Error(`Lost row: Condition expected Lost, got ${resolveGetPassPdfLineOutcome(lostLine)}`);
    }
    if (resolveGetPassPdfGoodReturnedQty(damagedLine) !== 0) {
        throw new Error('Damaged row: Qty Returned (good) must be 0');
    }
    if (resolveGetPassPdfLineOutcome(damagedLine) !== 'Damaged') {
        throw new Error(`Damaged row: Condition expected Damaged, got ${resolveGetPassPdfLineOutcome(damagedLine)}`);
    }
    console.log('PASS: Sample totals — out 1125, good returned 925; lost/damaged rows show 0 good');
}

async function main() {
    const { resolveFontFile, FONT_CANDIDATES } = require('../src/services/pdf/report-pdf-fonts');
    const fontPath = resolveFontFile(FONT_CANDIDATES.regular);
    const fontName = fontPath ? path.basename(fontPath) : 'Helvetica (fallback)';
    console.log(`INFO: Typography — ${fontName}`);

    const pass = makeMockPass();
    verifySampleTotals(pass);

    const outFile = path.join(OUT_DIR, 'audit-evidence-get-pass-sample.pdf');
    const buf = await renderGetPassControlledDocument(pass);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(outFile, buf);

    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    console.log(`PASS: Get Pass sample — ${pages} page(s), ${buf.length} bytes`);
    console.log(`INFO: ${outFile}`);
}

main().catch((err) => {
    console.error('FAIL:', err.message || err);
    process.exit(1);
});
