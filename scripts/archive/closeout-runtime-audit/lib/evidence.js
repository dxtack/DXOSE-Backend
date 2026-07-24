'use strict';

const prisma = require('../../../src/config/database');

async function fetchMovementDocumentEvidence(documentId, tenantId) {
  const doc = await prisma.movementDocument.findFirst({
    where: { id: documentId, tenantId },
    include: {
      lines: { select: { id: true, itemId: true, locationId: true, qtyRequested: true } },
      approvalRequests: {
        include: {
          steps: {
            orderBy: { stepNumber: 'asc' },
            include: {
              actedByUser: { select: { email: true } },
              requiredRole: { select: { code: true } },
            },
          },
        },
      },
    },
  });
  if (!doc) return null;

  const approval = doc.approvalRequests || null;
  const ledger = await prisma.inventoryLedger.findMany({
    where: { tenantId, referenceId: documentId },
    select: { id: true, movementType: true, qtyIn: true, qtyOut: true, balanceAfter: true, totalValue: true },
    take: 5,
  });

  let stockDelta = null;
  if (doc.lines?.[0]) {
    const line = doc.lines[0];
    const bal = await prisma.stockBalance.findUnique({
      where: { tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId: line.locationId } },
      select: { qtyOnHand: true },
    });
    stockDelta = { itemId: line.itemId, locationId: line.locationId, qtyOnHandAfter: bal?.qtyOnHand ?? null };
  }

  const audit = await prisma.auditLog.findMany({
    where: { tenantId, entityId: documentId },
    orderBy: { changedAt: 'desc' },
    take: 10,
    select: { action: true, changedAt: true, changedBy: true },
  });

  return {
    documentId: doc.id,
    documentNo: doc.documentNo,
    movementType: doc.movementType,
    status: doc.status,
    sourceType: doc.sourceType,
    postedAt: doc.postedAt,
    approvalRequest: approval
      ? {
          id: approval.id,
          status: approval.status,
          currentStep: approval.currentStep,
          totalSteps: approval.totalSteps,
          accWorkflowVersionId: approval.accWorkflowVersionId,
          steps: approval.steps.map((s) => ({
            stepNumber: s.stepNumber,
            requiredRole: s.requiredRole?.code || s.requiredRole,
            status: s.status,
            actedBy: s.actedByUser?.email || null,
            actedAt: s.actedAt,
            comment: s.comment,
          })),
        }
      : null,
    ledger,
    stockDelta,
    audit: audit.map((a) => ({ action: a.action, changedAt: a.changedAt, changedBy: a.changedBy })),
  };
}

async function fetchGetPassEvidence(getPassId, tenantId) {
  if (!getPassId) return null;
  const gp = await prisma.getPass.findFirst({
    where: { id: getPassId, tenantId },
    select: {
      id: true,
      passNo: true,
      status: true,
      accWorkflowVersionId: true,
      deptApprovedBy: true,
      deptApprovedAt: true,
      costControlApprovedBy: true,
      costControlApprovedAt: true,
      financeApprovedBy: true,
      financeApprovedAt: true,
      gmApprovedBy: true,
      gmApprovedAt: true,
      securityApprovedBy: true,
      securityApprovedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!gp) return null;

  const audit = await prisma.auditLog.findMany({
    where: { tenantId, entityId: getPassId },
    orderBy: { changedAt: 'desc' },
    take: 15,
    select: { action: true, changedAt: true, changedBy: true },
  });

  return { ...gp, audit };
}

async function getStockFixture(tenantId, minQty = 2) {
  const bal = await prisma.stockBalance.findFirst({
    where: { tenantId, qtyOnHand: { gte: minQty + 1 } },
    include: {
      item: { select: { id: true, name: true, unitPrice: true } },
      location: { select: { id: true, name: true, departmentId: true } },
    },
  });
  if (!bal) return null;
  return {
    itemId: bal.itemId,
    itemName: bal.item.name,
    locationId: bal.locationId,
    locationName: bal.location.name,
    departmentId: bal.location.departmentId,
    qtyOnHand: Number(bal.qtyOnHand),
    unitCost: Number(bal.item.unitPrice) || 1,
  };
}

async function getDepartments(tenantId) {
  return prisma.department.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, code: true, name: true },
  });
}

module.exports = {
  fetchMovementDocumentEvidence,
  fetchGetPassEvidence,
  getStockFixture,
  getDepartments,
  prisma,
};
