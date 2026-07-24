#!/usr/bin/env node
'use strict';

const { buildGroupedReport } = require('../src/services/report-grouping.engine');
const { getGroupingSpec, resolveFamily } = require('../src/services/report-family-registry');

const results = [];
const assert = (name, ok, detail = '') => {
    results.push({ name, pass: ok });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const varianceLines = [
    { sessionNo: 'CNT-1', locationName: 'Store A', bookQty: 10, countedQty: 8, varianceQty: -2, varianceValue: -20 },
    { sessionNo: 'CNT-1', locationName: 'Store A', bookQty: 5, countedQty: 5, varianceQty: 0, varianceValue: 0 },
    { sessionNo: 'CNT-1', locationName: 'Store B', bookQty: 3, countedQty: 4, varianceQty: 1, varianceValue: 10 },
    { sessionNo: 'CNT-2', locationName: 'Kitchen', bookQty: 1, countedQty: 0, varianceQty: -1, varianceValue: -5 },
];

const spec = getGroupingSpec('count-variance-report');
const grouped = buildGroupedReport(varianceLines, spec, 'count-variance');

assert('Tree has 2 sessions', grouped.tree.length === 2, `got ${grouped.tree.length}`);
assert('Session CNT-1 has 2 location children', grouped.tree[0].children?.length === 2);
assert('Grand total varianceValue', grouped.grandTotals.varianceValue === -15);
assert('Flat rows include GROUP_HEADER', grouped.flatRows.some((r) => r.rowType === 'GROUP_HEADER'));
assert('Flat rows include LINE', grouped.flatRows.filter((r) => r.rowType === 'LINE').length === 4);

const stockSpec = getGroupingSpec('current-stock-balance');
const stockGrouped = buildGroupedReport(
    [
        { department: 'F&B', location: 'Main', qtyOnHand: 10, value: 100 },
        { department: 'F&B', location: 'Main', qtyOnHand: 5, value: 50 },
    ],
    stockSpec,
    'stock-balance',
);
assert('Stock grand total value', stockGrouped.grandTotals.value === 150);

const family = resolveFamily('count-variance-report');
assert('Family id', family.familyId === 'count-variance');

const ledgerLines = [
    { date: '2026-05-01', documentKey: 'ISSUE-D1', docNo: 'D1', qtyIn: 0, qtyOut: 2, lineValue: -20 },
    { date: '2026-05-01', documentKey: 'ISSUE-D1', docNo: 'D1', qtyIn: 0, qtyOut: 1, lineValue: -10 },
    { date: '2026-05-02', documentKey: 'GRN-D2', docNo: 'D2', qtyIn: 5, qtyOut: 0, lineValue: 50 },
];
const ledgerSpec = getGroupingSpec('inventory-change-history');
const ledgerGrouped = buildGroupedReport(ledgerLines, ledgerSpec, 'ledger');
assert('Ledger tree has 2 dates', ledgerGrouped.tree.length === 2);
assert('Ledger date 2026-05-01 has document child', ledgerGrouped.tree[0].children?.length === 1);
assert('Ledger document has 2 lines', ledgerGrouped.tree[0].children?.[0].rows?.length === 2);

const transferLines = [
    { transferNo: 'TRF-1', status: 'IN_TRANSIT', transferDate: '2026-05-01' },
    { transferNo: 'TRF-2', status: 'SUBMITTED', transferDate: '2026-05-02' },
];
const trfSpec = getGroupingSpec('open-transfers');
const trfGrouped = buildGroupedReport(transferLines, trfSpec, 'transfers');
assert('Transfer tree count', trfGrouped.tree.length === 2);
assert('Transfer node has rows', trfGrouped.tree[0].rows?.length === 1);

const breakageLines = [
    { documentKey: 'BRK-001', documentNo: 'BRK-001', category: 'Glassware', itemCode: 'G1', qty: 2, unitCost: 10, lineValue: 20 },
    { documentKey: 'BRK-001', documentNo: 'BRK-001', category: 'Glassware', itemCode: 'G2', qty: 1, unitCost: 15, lineValue: 15 },
    { documentKey: 'BRK-001', documentNo: 'BRK-001', category: 'Chinaware', itemCode: 'C1', qty: 3, unitCost: 8, lineValue: 24 },
    { documentKey: 'BRK-002', documentNo: 'BRK-002', category: 'Chinaware', itemCode: 'C2', qty: 0, unitCost: 5, lineValue: 0 },
];
const brkSpec = getGroupingSpec('breakage-loss-report');
const brkGrouped = buildGroupedReport(breakageLines, brkSpec, 'breakage');
assert('Breakage tree has 2 documents', brkGrouped.tree.length === 2);
assert('Breakage doc BRK-001 has 2 categories', brkGrouped.tree[0].children?.length === 2);
const glassCat = brkGrouped.tree[0].children?.find((c) => c.label === 'Glassware');
assert('Breakage Glassware subtotal', glassCat?.subtotals?.lineValue === 35);
assert('Breakage doc subtotal', brkGrouped.tree[0].subtotals?.lineValue === 59);
assert('Breakage grand total lineValue', brkGrouped.grandTotals.lineValue === 59);
const brkFlatQty = brkGrouped.flatRows
    .filter((r) => r.rowType === 'LINE')
    .reduce((s, r) => s + Number(r.qty || 0), 0);
assert('Breakage flat line qty sum', brkFlatQty === 6);
assert('Breakage flat has SUBTOTAL', brkGrouped.flatRows.some((r) => r.rowType === 'GROUP_SUBTOTAL'));
const brkFamily = resolveFamily('breakage-loss-report');
assert('Breakage family dedicated', brkFamily.dedicatedView === true && brkFamily.familyId === 'breakage');

const omcLines = [
    { category: 'Beverage', itemCode: 'B1', openingQty: 10, inQty: 5, outQty: 2, closingQty: 13, openingValue: 100, closingValue: 130 },
    { category: 'Beverage', itemCode: 'B2', openingQty: 0, inQty: 10, outQty: 0, closingQty: 10, openingValue: 0, closingValue: 80 },
    { category: 'Dry', itemCode: 'D1', openingQty: 5, inQty: 0, outQty: 1, closingQty: 4, openingValue: 25, closingValue: 20 },
];
const omcSpec = getGroupingSpec('omc-report');
const omcGrouped = buildGroupedReport(omcLines, omcSpec, 'omc');
assert('OMC tree has 2 categories', omcGrouped.tree.length === 2);
assert('OMC Beverage subtotal closingQty', omcGrouped.tree.find((n) => n.label === 'Beverage')?.subtotals?.closingQty === 23);
assert('OMC grand closingQty', omcGrouped.grandTotals.closingQty === 27);
const omcFamily = resolveFamily('omc-report');
assert('OMC family dedicated', omcFamily.dedicatedView === true && omcFamily.familyId === 'omc');

const govLines = [
    { moduleKey: 'Transfer', documentKey: 'Transfer-1', date: '2026-05-01', action: 'SUBMIT' },
    { moduleKey: 'Transfer', documentKey: 'Transfer-1', date: '2026-05-01', action: 'APPROVE' },
    { moduleKey: 'Breakage', documentKey: 'Breakage-2', date: '2026-05-02', action: 'POST' },
];
const govSpec = getGroupingSpec('audit-activity-report');
const govGrouped = buildGroupedReport(govLines, govSpec, 'governance');
assert('Governance tree has 2 modules', govGrouped.tree.length === 2);
assert('Governance Transfer doc has 2 events', govGrouped.tree.find((n) => n.label === 'Transfer')?.children?.[0]?.rows?.length === 2);
const govFamily = resolveFamily('audit-activity-report');
assert('Governance family dedicated', govFamily.dedicatedView === true && govFamily.familyId === 'governance');

const passed = results.filter((r) => r.pass).length;
console.log(`\n--- Phase 2 Grouping UAT: ${passed}/${results.length} ---`);
process.exit(passed === results.length ? 0 : 1);
