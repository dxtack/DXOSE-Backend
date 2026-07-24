'use strict';

const prisma = require('../../OSE-backend/src/config/database');

async function stockSnapshot(tenantId, itemId, locationId) {
  const b = await prisma.stockBalance.findUnique({
    where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
  });
  return {
    qtyOnHand: Number(b?.qtyOnHand ?? 0),
    totalQtyDamage: Number(b?.totalQtyDamage ?? 0),
    totalQtyLost: Number(b?.totalQtyLost ?? 0),
  };
}

async function ledgerRowsForRef(tenantId, referenceId) {
  return prisma.inventoryLedger.findMany({
    where: { tenantId, referenceId },
    select: {
      id: true,
      movementType: true,
      itemId: true,
      locationId: true,
      qtyIn: true,
      qtyOut: true,
      unitCost: true,
      totalValue: true,
      referenceId: true,
      referenceType: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function auditSuccessCount(tenantId, entityType, entityId) {
  const logs = await prisma.auditLog.findMany({
    where: { tenantId, entityType, entityId: String(entityId) },
    select: { action: true, note: true },
  });
  return logs.filter(
    (l) => !(String(l.action || '').toUpperCase() === 'UPDATE' && String(l.note || '').includes('CONCURRENCY_CONFLICT')),
  ).length;
}

async function auditCount(tenantId, entityType, entityId, action = null) {
  const where = { tenantId, entityType, entityId: String(entityId) };
  if (action) where.action = action;
  return prisma.auditLog.count({ where });
}

async function auditCountTotal(tenantId, entityType, entityId) {
  return auditCount(tenantId, entityType, entityId, null);
}

function num(v) {
  return Number(v ?? 0);
}

function assertLedgerRowFields(row, exp, prefix, issues) {
  if (!row) return;
  if (exp.movementType && row.movementType !== exp.movementType) issues.push(`${prefix}_movementType`);
  if (exp.itemId && row.itemId !== exp.itemId) issues.push(`${prefix}_item`);
  if (exp.locationId && row.locationId !== exp.locationId) issues.push(`${prefix}_location`);
  if (exp.qtyOut != null && num(row.qtyOut) !== num(exp.qtyOut)) issues.push(`${prefix}_qtyOut:${row.qtyOut}`);
  if (exp.qtyIn != null && num(row.qtyIn) !== num(exp.qtyIn)) issues.push(`${prefix}_qtyIn:${row.qtyIn}`);
  if (exp.referenceId && row.referenceId !== exp.referenceId) issues.push(`${prefix}_ref`);
  if (exp.referenceType && row.referenceType !== exp.referenceType) issues.push(`${prefix}_refType:${row.referenceType}`);
  if (exp.unitCost != null && Math.abs(num(row.unitCost) - num(exp.unitCost)) > 0.0001) {
    issues.push(`${prefix}_unitCost:${row.unitCost}`);
  }
  if (exp.totalValue != null && Math.abs(num(row.totalValue) - num(exp.totalValue)) > 0.0001) {
    issues.push(`${prefix}_totalValue:${row.totalValue}`);
  }
}

function assertExactTransferPosting(rows, exp) {
  const issues = [];
  const outRows = rows.filter((r) => r.movementType === 'TRANSFER_OUT');
  const inRows = rows.filter((r) => r.movementType === 'TRANSFER_IN');
  if (outRows.length !== 1) issues.push(`transfer_out_count:${outRows.length}`);
  if (inRows.length !== 1) issues.push(`transfer_in_count:${inRows.length}`);
  const out = outRows[0];
  const inn = inRows[0];
  const refType = exp.referenceType || 'TRANSFER';
  const unitCost = exp.unitCost;
  const totalValue = exp.totalValue ?? (unitCost != null && exp.qty != null ? unitCost * exp.qty : null);

  assertLedgerRowFields(
    out,
    {
      movementType: 'TRANSFER_OUT',
      itemId: exp.itemId,
      locationId: exp.sourceLocationId,
      qtyOut: exp.qty,
      qtyIn: 0,
      referenceId: exp.referenceId,
      referenceType: refType,
      unitCost,
      totalValue,
    },
    'transfer_out',
    issues,
  );
  assertLedgerRowFields(
    inn,
    {
      movementType: 'TRANSFER_IN',
      itemId: exp.itemId,
      locationId: exp.destLocationId,
      qtyIn: exp.qty,
      qtyOut: 0,
      referenceId: exp.referenceId,
      referenceType: refType,
      unitCost,
      totalValue,
    },
    'transfer_in',
    issues,
  );
  return { pass: issues.length === 0, issues, outRows, inRows, ledgerFieldMismatchCount: issues.length };
}

function assertExactBreakagePosting(rows, exp) {
  const issues = [];
  const brk = rows.filter((r) => r.movementType === 'BREAKAGE');
  if (brk.length !== 1) issues.push(`breakage_count:${brk.length}`);
  const row = brk[0];
  const unitCost = exp.unitCost;
  const totalValue = exp.totalValue ?? (unitCost != null && exp.qty != null ? unitCost * exp.qty : null);
  assertLedgerRowFields(
    row,
    {
      movementType: 'BREAKAGE',
      itemId: exp.itemId,
      locationId: exp.locationId,
      qtyOut: exp.qty,
      qtyIn: 0,
      referenceId: exp.referenceId,
      referenceType: exp.referenceType || 'BREAKAGE',
      unitCost,
      totalValue,
    },
    'breakage',
    issues,
  );
  return { pass: issues.length === 0, issues, row, ledgerFieldMismatchCount: issues.length };
}

function assertExactLostPosting(rows, exp) {
  const issues = [];
  const lost = rows.filter((r) => r.movementType === 'LOST');
  if (lost.length !== 1) issues.push(`lost_count:${lost.length}`);
  const row = lost[0];
  const unitCost = exp.unitCost;
  const totalValue = exp.totalValue ?? (unitCost != null && exp.qty != null ? unitCost * exp.qty : null);
  assertLedgerRowFields(
    row,
    {
      movementType: 'LOST',
      itemId: exp.itemId,
      locationId: exp.locationId,
      qtyOut: exp.qty,
      qtyIn: 0,
      referenceId: exp.referenceId,
      referenceType: exp.referenceType || 'LOST',
      unitCost,
      totalValue,
    },
    'lost',
    issues,
  );
  return { pass: issues.length === 0, issues, row, ledgerFieldMismatchCount: issues.length };
}

function assertStockDelta(before, after, { qtyDelta = 0, totalQtyDamageDelta = 0, totalQtyLostDelta = 0 }) {
  const issues = [];
  if (num(after.qtyOnHand) - num(before.qtyOnHand) !== qtyDelta) {
    issues.push(`qtyOnHand delta expected ${qtyDelta} got ${num(after.qtyOnHand) - num(before.qtyOnHand)}`);
  }
  if (num(after.totalQtyDamage) - num(before.totalQtyDamage) !== totalQtyDamageDelta) {
    issues.push(`totalQtyDamage delta expected ${totalQtyDamageDelta}`);
  }
  if (num(after.totalQtyLost) - num(before.totalQtyLost) !== totalQtyLostDelta) {
    issues.push(`totalQtyLost delta expected ${totalQtyLostDelta}`);
  }
  return { pass: issues.length === 0, issues };
}

function fullListDetailFields(module) {
  if (module === 'TRANSFER') {
    return [
      { listKey: 'transferNo', detailKey: 'transferNo' },
      { listKey: 'status', detailKey: 'status' },
      { listKey: 'userFacingState', detailKey: 'constitutionUserFacingState', altDetailKey: 'userFacingState' },
    ];
  }
  return [
    { listKey: 'documentNo', detailKey: 'documentNo' },
    { listKey: 'status', detailKey: 'status' },
    { listKey: 'userFacingState', detailKey: 'constitutionUserFacingState', altDetailKey: 'userFacingState' },
  ];
}

function compareListDetailFull(listRow, detail, module, lineHelpers) {
  const mismatches = [];
  const fields = fullListDetailFields(module);
  for (const f of fields) {
    let a = listRow?.[f.listKey];
    let b = detail?.[f.detailKey] ?? detail?.[f.altDetailKey];
    if (String(a ?? '') !== String(b ?? '') && Number(a) !== Number(b)) {
      mismatches.push({ field: f.listKey, list: a, detail: b });
    }
  }
  const listLineCount = listRow?.lineCount ?? listRow?._count?.lines ?? listRow?.lines?.length;
  const detailLines = detail?.lines?.length ?? 0;
  if (listLineCount != null && Number(listLineCount) !== Number(detailLines)) {
    mismatches.push({ field: 'lineCount', list: listLineCount, detail: detailLines });
  }
  if (lineHelpers) {
    const lq = lineHelpers.sumLineQty(detail?.lines);
    const lv = lineHelpers.sumLineTotals(detail?.lines);
    if (listRow?.totalQty != null && Number(listRow.totalQty) !== lq) {
      mismatches.push({ field: 'totalQty', list: listRow.totalQty, detail: lq });
    }
    if (listRow?.totalQtyDamaged != null && Number(listRow.totalQtyDamaged) !== lq) {
      mismatches.push({ field: 'totalQtyDamaged', list: listRow.totalQtyDamaged, detail: lq });
    }
    if (listRow?.totalValue != null && Number(listRow.totalValue) !== lv) {
      mismatches.push({ field: 'totalValue', list: listRow.totalValue, detail: lv });
    }
    if (listRow?.mediaCount != null && detail?.mediaCount != null && Number(listRow.mediaCount) !== Number(detail.mediaCount)) {
      mismatches.push({ field: 'mediaCount', list: listRow.mediaCount, detail: detail.mediaCount });
    }
  }
  return mismatches;
}

module.exports = {
  stockSnapshot,
  ledgerRowsForRef,
  auditCount,
  auditCountTotal,
  auditSuccessCount,
  assertExactTransferPosting,
  assertExactBreakagePosting,
  assertExactLostPosting,
  assertStockDelta,
  compareListDetailFull,
  fullListDetailFields,
  num,
};
