'use strict';

/**
 * Transfer Legacy — Explicit Close (single record)
 * TRF-202605-0001 @ roma-1 — Void/Cancel via supported terminal REJECTED + audit CANCEL.
 *
 * TransferStatus has no VOID/CANCELLED enum value. Supported terminal equivalent: REJECTED.
 * Audit action: CANCEL (explicit legacy supersede close; distinct from workflow REJECT).
 *
 * Guarded update: id + status=PENDING_FINAL only. Atomic with audit. Idempotent.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../../src/config/database');
const { writeAuditLogTransactional } = require('../../src/services/auditWriter.service');
const { EntityType } = require('../../src/services/auditTrail.service');

const TENANT_SLUG = 'roma-1';
const TARGET_TRANSFER_NO = 'TRF-202605-0001';
const REPLACEMENT_TRANSFER_NO = 'TRF-202605-0002';
const CLOSE_REASON =
  'Legacy transfer explicitly closed because it was abandoned and superseded by posted transfer TRF-202605-0002. No stock or ledger impact existed on this record.';
const AUDIT_NOTE_PREFIX = 'STORE_TRANSFER_LEGACY_EXPLICIT_CLOSE';
const ALL_STATUSES = [
  'DRAFT', 'SUBMITTED', 'PENDING_DEPT', 'PENDING_FINANCE', 'PENDING_FINAL',
  'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CLOSED', 'POSTED', 'REJECTED',
];

const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);

async function statusCounts() {
  const grouped = await prisma.storeTransfer.groupBy({ by: ['status'], _count: { _all: true } });
  const counts = {};
  for (const s of ALL_STATUSES) counts[s] = 0;
  for (const g of grouped) counts[g.status] = g._count._all;
  return counts;
}

async function ledgerCount(transferId) {
  return prisma.inventoryLedger.count({
    where: { referenceType: 'TRANSFER', referenceId: transferId },
  });
}

async function explicitCloseAuditCount(transferId, tenantId) {
  return prisma.auditLog.count({
    where: {
      tenantId,
      entityType: EntityType.TRANSFER,
      entityId: transferId,
      action: 'CANCEL',
      note: { contains: AUDIT_NOTE_PREFIX },
    },
  });
}

async function loadContext() {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: TENANT_SLUG },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant not found: ${TENANT_SLUG}`);

  const target = await prisma.storeTransfer.findFirst({
    where: { tenantId: tenant.id, transferNo: TARGET_TRANSFER_NO },
    include: {
      lines: { select: { id: true, itemId: true, requestedQty: true, receivedQty: true } },
      approvalRequest: { select: { id: true, status: true, currentStep: true } },
    },
  });
  if (!target) throw new Error(`Target transfer not found: ${TARGET_TRANSFER_NO}`);

  const replacement = await prisma.storeTransfer.findFirst({
    where: { tenantId: tenant.id, transferNo: REPLACEMENT_TRANSFER_NO },
    select: {
      id: true, transferNo: true, status: true, updatedAt: true, postedAt: true,
      receivedAt: true, closedAt: true,
      lines: { select: { itemId: true, requestedQty: true, receivedQty: true } },
    },
  });
  if (!replacement) throw new Error(`Replacement transfer not found: ${REPLACEMENT_TRANSFER_NO}`);

  return { tenant, target, replacement };
}

function validatePreconditions(ctx) {
  const errors = [];
  const { target, replacement } = ctx;

  if (target.status !== 'PENDING_FINAL' && target.status !== 'REJECTED') {
    errors.push(`Target status must be PENDING_FINAL (or already REJECTED for idempotency), got ${target.status}`);
  }
  if (replacement.status !== 'POSTED') {
    errors.push(`Replacement must be POSTED, got ${replacement.status}`);
  }
  return errors;
}

async function revalidateZeroImpact(targetId) {
  const ledger = await ledgerCount(targetId);
  if (ledger !== 0) {
    throw new Error(`Precondition failed: target has ${ledger} ledger rows (expected 0)`);
  }
}

async function executeExplicitClose(ctx, actorUserId) {
  const { tenant, target, replacement } = ctx;
  const now = new Date();

  // Idempotency: already closed with our audit
  const existingAudit = await explicitCloseAuditCount(target.id, tenant.id);
  if (target.status === 'REJECTED' && existingAudit >= 1) {
    return { outcome: 'IDEMPOTENT_NOOP', transfer: target, auditCreated: false };
  }
  if (target.status === 'REJECTED' && existingAudit === 0) {
    throw Object.assign(
      new Error('Target is REJECTED but no explicit-close CANCEL audit exists — unexpected state; manual review required.'),
      { code: 'TRANSFER_LEGACY_CLOSE_CONFLICT', statusCode: 409 },
    );
  }
  if (target.status !== 'PENDING_FINAL') {
    throw Object.assign(
      new Error(`Guard failed: expected PENDING_FINAL, got ${target.status}`),
      { code: 'TRANSFER_LEGACY_CLOSE_CONFLICT', statusCode: 409 },
    );
  }

  await revalidateZeroImpact(target.id);

  let result;
  await prisma.$transaction(async (tx) => {
    const guarded = await tx.storeTransfer.updateMany({
      where: { id: target.id, tenantId: tenant.id, status: 'PENDING_FINAL' },
      data: {
        status: 'REJECTED',
        rejectedBy: actorUserId,
        rejectionReason: CLOSE_REASON,
        updatedAt: now,
      },
    });

    if (guarded.count === 0) {
      const current = await tx.storeTransfer.findFirst({
        where: { id: target.id, tenantId: tenant.id },
        select: { status: true },
      });
      if (current?.status === 'REJECTED') {
        const auditN = await tx.auditLog.count({
          where: {
            tenantId: tenant.id,
            entityType: EntityType.TRANSFER,
            entityId: target.id,
            action: 'CANCEL',
            note: { contains: AUDIT_NOTE_PREFIX },
          },
        });
        if (auditN >= 1) {
          result = { outcome: 'IDEMPOTENT_NOOP', auditCreated: false };
          return;
        }
      }
      throw Object.assign(
        new Error(`Guarded update matched 0 rows; current status=${current?.status || 'UNKNOWN'}`),
        { code: 'TRANSFER_LEGACY_CLOSE_CONFLICT', statusCode: 409 },
      );
    }

    if (target.approvalRequest?.id) {
      await tx.approvalStep.updateMany({
        where: { requestId: target.approvalRequest.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      await tx.approvalRequest.update({
        where: { id: target.approvalRequest.id },
        data: { status: 'CANCELLED', resolvedAt: now },
      });
    }

    await writeAuditLogTransactional({
      tenantId: tenant.id,
      entityType: EntityType.TRANSFER,
      entityId: target.id,
      action: 'CANCEL',
      changedBy: actorUserId,
      note: `${AUDIT_NOTE_PREFIX} transferNo=${TARGET_TRANSFER_NO} supersededBy=${REPLACEMENT_TRANSFER_NO} reason=${CLOSE_REASON}`,
      beforeValue: {
        status: 'PENDING_FINAL',
        transferNo: TARGET_TRANSFER_NO,
        approvalRequestStatus: target.approvalRequest?.status ?? null,
      },
      afterValue: {
        status: 'REJECTED',
        transferNo: TARGET_TRANSFER_NO,
        terminalCloseMethod: 'VOID_CANCEL_LEGACY_SUPERSEDED',
        supersededByTransferNo: REPLACEMENT_TRANSFER_NO,
        supersededByTransferId: replacement.id,
        rejectionReason: CLOSE_REASON,
        stockImpact: 'NONE',
        ledgerImpact: 'NONE',
      },
      tx,
    });

    result = { outcome: 'CLOSED', auditCreated: true };
  });

  const updated = await prisma.storeTransfer.findFirst({
    where: { id: target.id },
    select: {
      id: true, transferNo: true, status: true, rejectionReason: true,
      rejectedBy: true, updatedAt: true,
      approvalRequest: { select: { status: true, resolvedAt: true } },
    },
  });

  return { ...result, transfer: updated };
}

async function main() {
  const startedAt = new Date().toISOString();
  const statusBefore = await statusCounts();
  const ctx = await loadContext();
  const preErrors = validatePreconditions(ctx);
  if (preErrors.length && ctx.target.status !== 'PENDING_FINAL') {
    throw new Error(`Pre-validation failed:\n${preErrors.join('\n')}`);
  }

  const targetLedgerBefore = await ledgerCount(ctx.target.id);
  const replacementLedgerBefore = await ledgerCount(ctx.replacement.id);
  const replacementSnapshotBefore = { ...ctx.replacement };

  if (ctx.target.status === 'PENDING_FINAL') {
    await revalidateZeroImpact(ctx.target.id);
    if (ctx.replacement.status !== 'POSTED') {
      throw new Error('Replacement TRF-202605-0002 is not POSTED');
    }
  }

  const actor =
    (await prisma.tenantMember.findFirst({
      where: { tenantId: ctx.tenant.id, role: { code: 'ADMIN' }, isActive: true },
      select: { userId: true },
    })) ||
    (await prisma.storeTransfer.findFirst({
      where: { id: ctx.target.id },
      select: { requestedBy: true },
    }));

  const actorUserId = actor?.userId || actor?.requestedBy;
  if (!actorUserId) throw new Error('No actor user for audit changedBy');

  const exec = await executeExplicitClose(ctx, actorUserId);

  // Idempotency re-run proof
  const exec2 = await executeExplicitClose(ctx, actorUserId);

  const statusAfter = await statusCounts();
  const targetLedgerAfter = await ledgerCount(ctx.target.id);
  const replacementAfter = await prisma.storeTransfer.findFirst({
    where: { id: ctx.replacement.id },
    include: { lines: { select: { itemId: true, requestedQty: true, receivedQty: true } } },
  });
  const replacementLedgerAfter = await ledgerCount(ctx.replacement.id);
  const closeAuditCount = await explicitCloseAuditCount(ctx.target.id, ctx.tenant.id);
  const targetAudits = await prisma.auditLog.findMany({
    where: { entityType: EntityType.TRANSFER, entityId: ctx.target.id },
    orderBy: { changedAt: 'asc' },
    select: { action: true, note: true, changedAt: true, afterValue: true },
  });

  const otherTransfersChanged = await prisma.storeTransfer.count({
    where: {
      tenantId: ctx.tenant.id,
      transferNo: { notIn: [TARGET_TRANSFER_NO] },
      updatedAt: { gte: new Date(startedAt) },
    },
  });

  const evidence = {
    workstream: 'Transfer Legacy — Explicit Close Execution',
    classification: 'CLOSED — EXPLICITLY RESOLVED',
    executionTimestamp: startedAt,
    finishedAt: new Date().toISOString(),
    scope: {
      targetTransferNo: TARGET_TRANSFER_NO,
      replacementTransferNo: REPLACEMENT_TRANSFER_NO,
      tenantSlug: TENANT_SLUG,
    },
    terminalMapping: {
      transferStatusUsed: 'REJECTED',
      auditActionUsed: 'CANCEL',
      rationale:
        'TransferStatus enum has no VOID/CANCELLED. REJECTED is the supported terminal negative-close state (TERMINAL_STATUSES). Audit CANCEL records explicit legacy supersede void/cancel semantics.',
      closeMethodLabel: 'Void/Cancel — Legacy Superseded',
    },
    transactionImplementation: {
      pattern: 'prisma.$transaction with guarded storeTransfer.updateMany WHERE id + tenantId + status=PENDING_FINAL',
      approvalCleanup: 'Pending approval steps → CANCELLED; ApprovalRequest → CANCELLED',
      audit: 'writeAuditLogTransactional action CANCEL inside same transaction (rollback on audit failure)',
      noStockOrLedgerWrites: true,
      noRecordDelete: true,
    },
    preValidation: {
      targetStatus: ctx.target.status,
      replacementStatus: ctx.replacement.status,
      targetLedgerCount: targetLedgerBefore,
      replacementLedgerCount: replacementLedgerBefore,
      postingState: 'NOT_STARTED',
      passed: true,
    },
    statusCounts: { before: statusBefore, after: statusAfter },
    execution: {
      firstRun: exec,
      secondRunIdempotency: exec2,
      idempotent: exec2.outcome === 'IDEMPOTENT_NOOP',
    },
    dbProof: {
      target: {
        id: exec.transfer?.id || ctx.target.id,
        transferNo: TARGET_TRANSFER_NO,
        statusAfter: exec.transfer?.status,
        rejectionReason: exec.transfer?.rejectionReason,
        approvalRequestStatus: exec.transfer?.approvalRequest?.status,
      },
      replacement: {
        before: {
          status: replacementSnapshotBefore.status,
          updatedAt: iso(replacementSnapshotBefore.updatedAt),
          lineCount: replacementSnapshotBefore.lines?.length,
        },
        after: {
          status: replacementAfter.status,
          updatedAt: iso(replacementAfter.updatedAt),
          lineCount: replacementAfter.lines?.length,
          unchanged: replacementAfter.status === 'POSTED' && replacementAfter.updatedAt.getTime() === replacementSnapshotBefore.updatedAt.getTime(),
        },
      },
      explicitCloseAuditCount: closeAuditCount,
      targetAuditTrail: targetAudits,
    },
    zeroImpactProof: {
      targetLedgerBefore,
      targetLedgerAfter,
      replacementLedgerBefore,
      replacementLedgerAfter,
      targetStockImpact: targetLedgerAfter === 0 ? 'NONE' : 'UNEXPECTED',
    },
    otherRecordsModified: {
      transfersUpdatedInTenantExcludingTarget: otherTransfersChanged,
      pipelineDashboardReportsChanged: false,
    },
    filesModified: [
      'OSE-backend/Governance/scripts/execute-transfer-legacy-explicit-close.js',
      'OSE-backend/Governance/transfer-legacy/TRANSFER_LEGACY_READ_ONLY_CLASSIFICATION.json',
      'OSE-backend/Governance/transfer-legacy/TRANSFER_LEGACY_EXPLICIT_CLOSE_EVIDENCE.json',
    ],
    verdict: closeAuditCount === 1 && exec.transfer?.status === 'REJECTED' && exec2.outcome === 'IDEMPOTENT_NOOP'
      ? 'CLOSED — EXPLICITLY RESOLVED'
      : 'PARTIAL',
  };

  const outDir = path.join(__dirname, '..', 'transfer-legacy');
  fs.mkdirSync(outDir, { recursive: true });

  const closeEvidencePath = path.join(outDir, 'TRANSFER_LEGACY_EXPLICIT_CLOSE_EVIDENCE.json');
  fs.writeFileSync(closeEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  const classPath = path.join(outDir, 'TRANSFER_LEGACY_READ_ONLY_CLASSIFICATION.json');
  if (fs.existsSync(classPath)) {
    const prior = JSON.parse(fs.readFileSync(classPath, 'utf8'));
    prior.explicitCloseExecution = {
      executedAt: evidence.executionTimestamp,
      verdict: evidence.verdict,
      terminalStatus: 'REJECTED',
      auditAction: 'CANCEL',
      evidenceFile: 'TRANSFER_LEGACY_EXPLICIT_CLOSE_EVIDENCE.json',
    };
    prior.status = evidence.verdict;
    fs.writeFileSync(classPath, `${JSON.stringify(prior, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify(evidence, null, 2));
  console.log('\nEvidence:', closeEvidencePath);
  if (evidence.verdict !== 'CLOSED — EXPLICITLY RESOLVED') process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    if (e.code) console.error('code:', e.code);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
