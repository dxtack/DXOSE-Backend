'use strict';

const { stockSnapshot, ledgerRowsForRef, auditCount, auditCountTotal, auditSuccessCount } = require('./phase-5-posting-assertions.lib.cjs');

async function mutationSnapshot(prisma, tenantId, opts = {}) {
  const { referenceId, entityType, itemId, locationId, destLocationId } = opts;
  const snap = {
    status: null,
    concurrencyVersion: null,
    ledger: referenceId ? (await ledgerRowsForRef(tenantId, referenceId)).length : 0,
    auditTotal: referenceId && entityType ? await auditCountTotal(tenantId, entityType, referenceId) : 0,
    auditSuccess: referenceId && entityType ? await auditSuccessCount(tenantId, entityType, referenceId) : 0,
    auditPost: referenceId && entityType ? await auditCount(tenantId, entityType, referenceId, 'POST') : 0,
    stock: itemId && locationId ? await stockSnapshot(tenantId, itemId, locationId) : null,
    stockDest: itemId && destLocationId ? await stockSnapshot(tenantId, itemId, destLocationId) : null,
  };
  if (opts.transferId) {
    const row = await prisma.storeTransfer.findFirst({
      where: { id: opts.transferId, tenantId },
      select: { status: true, concurrencyVersion: true },
    });
    snap.status = row?.status ?? null;
    snap.concurrencyVersion = row?.concurrencyVersion ?? null;
  }
  if (opts.movementId) {
    const row = await prisma.movementDocument.findFirst({
      where: { id: opts.movementId, tenantId },
      select: { status: true, concurrencyVersion: true, postedAt: true },
    });
    snap.status = row?.status ?? null;
    snap.concurrencyVersion = row?.concurrencyVersion ?? null;
    snap.postedAt = row?.postedAt ?? null;
  }
  return snap;
}

function assertUnchanged(before, after, fields = ['status', 'ledger', 'auditSuccess']) {
  const issues = [];
  for (const f of fields) {
    if (JSON.stringify(before[f]) !== JSON.stringify(after[f])) {
      issues.push({ field: f, before: before[f], after: after[f] });
    }
  }
  if (before.stock && after.stock) {
    if (JSON.stringify(before.stock) !== JSON.stringify(after.stock)) {
      issues.push({ field: 'stock', before: before.stock, after: after.stock });
    }
  }
  if (before.stockDest && after.stockDest) {
    if (JSON.stringify(before.stockDest) !== JSON.stringify(after.stockDest)) {
      issues.push({ field: 'stockDest', before: before.stockDest, after: after.stockDest });
    }
  }
  return { pass: issues.length === 0, issues };
}

module.exports = {
  mutationSnapshot,
  assertUnchanged,
};
