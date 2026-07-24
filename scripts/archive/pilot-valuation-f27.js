'use strict';

/**
 * Finding #27 Phase 2 — pilot validation for valuation open-month fix.
 * Usage: node scripts/pilot-valuation-f27.js [tenantId] [asOfDate]
 */
const { PrismaClient } = require('@prisma/client');
const { generateStockBackedValuationReport } = require('../src/services/inventoryValuation.service');

const prisma = new PrismaClient();

async function stockTotals(tenantId) {
    const rows = await prisma.stockBalance.findMany({
        where: { tenantId, qtyOnHand: { not: 0 } },
        select: { qtyOnHand: true, wacUnitCost: true },
    });
    let qty = 0;
    let value = 0;
    for (const r of rows) {
        const q = Number(r.qtyOnHand || 0);
        const wac = Number(r.wacUnitCost || 0);
        qty += q;
        value += q * wac;
    }
    return { qty: Number(qty.toFixed(4)), value: Number(value.toFixed(2)) };
}

async function main() {
    const tenantId = process.argv[2] || (await prisma.tenant.findFirst({ select: { id: true } }))?.id;
    const asOfDate = process.argv[3] || '2026-06-30';

    if (!tenantId) {
        console.error('No tenant found.');
        process.exit(1);
    }

    const stock = await stockTotals(tenantId);
    const report = await generateStockBackedValuationReport(tenantId, asOfDate, {});

    let reportQty = 0;
    for (const row of report.rows || []) {
        reportQty += Number(row.qtyOnHand || 0);
    }

    const pilot = {
        tenantId,
        asOfDate,
        requestedAsOfDate: report.requestedAsOfDate,
        effectiveAsOfDate: report.effectiveAsOfDate,
        truthSource: report.truthSource,
        valuationBasis: report.valuationBasis,
        warning: report.warning || null,
        rowCount: report.rows?.length ?? 0,
        reportQty: Number(reportQty.toFixed(4)),
        reportValue: report.totalValue,
        stockQty: stock.qty,
        stockValue: stock.value,
        qtyMatch: Math.abs(reportQty - stock.qty) < 0.0002,
        valueMatch: Math.abs(Number(report.totalValue) - stock.value) <= 0.01,
        openPeriodLive: report.valuationBasis === 'OPEN_PERIOD_LIVE',
        nonEmpty: (report.rows?.length ?? 0) > 0,
    };

    console.log(JSON.stringify(pilot, null, 2));

    const pass =
        pilot.nonEmpty
        && pilot.qtyMatch
        && pilot.valueMatch
        && (pilot.openPeriodLive || pilot.valuationBasis === 'TODAY');

    process.exit(pass ? 0 : 1);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
