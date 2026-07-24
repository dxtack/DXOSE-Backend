#!/usr/bin/env node
'use strict';

/**
 * Generate Inventory Count Audit Shell sample PDF for visual review.
 * KPI check: abs variance = 200 SAR (+100, -100 lines); table net value = 0 SAR.
 */
const fs = require('fs');
const path = require('path');
const { renderInventoryCountEvidencePdf } = require('../src/services/pdf/inventory-count-pdf.renderer');

const OUT_DIR = path.join(__dirname, '../tmp');

function makeMockPayload() {
    const lines = [
        {
            location: 'F&B Main Store',
            item: 'Premium Bath Towel - White - 70x140cm',
            barcode: 'TWL-7001',
            itemCode: 'TWL-7001',
            bookQty: 100,
            countedQty: 110,
            varianceQty: 10,
            varianceValueEstimate: 100,
            valuationBasis: 'WAC',
        },
        {
            location: 'Housekeeping Store',
            item: 'Stainless Steel Serving Spoon',
            barcode: 'SPO-SS01',
            itemCode: 'SPO-SS01',
            bookQty: 50,
            countedQty: 40,
            varianceQty: -10,
            varianceValueEstimate: -100,
            valuationBasis: 'WAC',
        },
        {
            location: 'F&B Main Store',
            item: 'Porcelain Dinner Plate 27cm',
            barcode: 'PLT-2700',
            itemCode: 'PLT-2700',
            bookQty: 200,
            countedQty: 200,
            varianceQty: 0,
            varianceValueEstimate: 0,
            valuationBasis: 'WAC',
        },
        {
            location: 'Banquet Store',
            item: 'Commercial Grade Stainless Steel Chafing Dish Lid Replacement Cover 45cm',
            barcode: 'CHF-LID-4500-EXT',
            itemCode: 'CHF-LID-4500-EXT',
            bookQty: 12,
            countedQty: 11,
            varianceQty: -1,
            varianceValueEstimate: -15,
            valuationBasis: 'WAC',
        },
    ];

    return {
        sessionInfo: {
            sessionNo: 'CNT-2026-0042',
            status: 'POSTED',
            roundNo: 1,
            blindMode: false,
            tenantName: 'DX OSE Hotels',
            primaryLocation: 'F&B Main Store',
            scope: {
                department: 'Food & Beverage',
                locations: ['F&B Main Store', 'Housekeeping Store', 'Banquet Store', 'Pool Bar'],
            },
            createdAt: '2026-05-20T08:00:00.000Z',
            createdBy: 'Sara Al-Mutairi',
            snapshotAt: '2026-05-20T08:15:00.000Z',
            postedAt: '2026-05-22T14:30:00.000Z',
        },
        kpis: {
            linesCounted: lines.length,
            itemsWithVariance: 3,
            totalNetVarianceValue: -15,
            totalAbsVarianceValue: 215,
            ledgerEntries: 4,
        },
        approvalHistory: [
            {
                step: 'VARIANCE REVIEW',
                role: 'Cost Control',
                actor: null,
                actedAt: '2026-05-21T09:00:00.000Z',
                status: 'COMPLETED',
                kind: 'MILESTONE',
            },
            {
                step: 'FINANCE APPROVED',
                role: null,
                actor: 'Layla Nasser',
                actedAt: '2026-05-22T10:00:00.000Z',
                status: 'APPROVED',
                kind: 'APPROVAL',
            },
            {
                step: 'GENERAL MANAGER APPROVED',
                role: null,
                actor: 'Omar Haddad',
                actedAt: '2026-05-22T12:00:00.000Z',
                status: 'APPROVED',
                kind: 'APPROVAL',
            },
            {
                step: 'POSTED TO INVENTORY',
                role: null,
                actor: null,
                actedAt: '2026-05-22T14:30:00.000Z',
                status: 'POSTED',
                kind: 'POSTING',
            },
        ],
        lines,
    };
}

function verifySampleTotals(payload) {
    const absKpi = payload.kpis.totalAbsVarianceValue;
    const netValue = payload.lines.reduce((s, l) => s + Number(l.varianceValueEstimate || 0), 0);
    const absFromLines = payload.lines.reduce((s, l) => s + Math.abs(Number(l.varianceValueEstimate || 0)), 0);

    if (Math.abs(absKpi - 215) > 1e-9) {
        throw new Error(`KPI ABS VARIANCE: expected 215, got ${absKpi}`);
    }
    if (Math.abs(absFromLines - 215) > 1e-9) {
        throw new Error(`Sum |line values|: expected 215, got ${absFromLines}`);
    }
    const netKpi = payload.kpis.totalNetVarianceValue;
    if (Math.abs(netKpi - (-15)) > 1e-9) {
        throw new Error(`KPI NET VARIANCE: expected -15, got ${netKpi}`);
    }
    if (Math.abs(netValue - (-15)) > 1e-9) {
        throw new Error(`Net table variance value: expected -15, got ${netValue}`);
    }
    if (payload.approvalHistory.length !== 4) {
        throw new Error(`Expected 4 workflow slots, got ${payload.approvalHistory.length}`);
    }
    console.log('PASS: KPI net -15 SAR, abs 215 SAR; 4-slot presentation timeline');
}

async function main() {
    const { resolveFontFile, FONT_CANDIDATES } = require('../src/services/pdf/report-pdf-fonts');
    const fontPath = resolveFontFile(FONT_CANDIDATES.regular);
    const fontName = fontPath ? path.basename(fontPath) : 'Helvetica (fallback)';
    console.log(`INFO: Typography — ${fontName}`);

    const payload = makeMockPayload();
    verifySampleTotals(payload);

    const outFile = path.join(OUT_DIR, 'audit-evidence-inventory-count-sample.pdf');
    const buf = await renderInventoryCountEvidencePdf(payload);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(outFile, buf);

    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    console.log(`PASS: Inventory Count sample — ${pages} page(s), ${buf.length} bytes`);
    console.log(`INFO: ${outFile}`);
}

main().catch((err) => {
    console.error('FAIL:', err.message || err);
    process.exit(1);
});
