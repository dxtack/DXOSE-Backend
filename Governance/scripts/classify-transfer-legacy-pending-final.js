'use strict';

/**
 * Transfer Legacy — Read-Only Data Classification (PENDING_FINAL focus)
 * =====================================================================
 * STRICTLY READ-ONLY. This script performs ZERO database writes.
 *
 * - No create / update / updateMany / upsert / delete / deleteMany.
 * - No raw write SQL ($executeRaw / $executeRawUnsafe).
 * - No $transaction (could wrap writes).
 * - A hard runtime guard wraps the Prisma client and THROWS if any write
 *   method is invoked, aborting the script instead of mutating data.
 *
 * Output: prints a report and writes a JSON evidence file to
 *   Governance/transfer-legacy/TRANSFER_LEGACY_READ_ONLY_CLASSIFICATION.json
 *
 * Usage:
 *   node Governance/scripts/classify-transfer-legacy-pending-final.js
 */

const fs = require('fs');
const path = require('path');
const rawPrisma = require('../../src/config/database');

// ── Read-only guard ────────────────────────────────────────────────────────
const FORBIDDEN_MODEL_METHODS = new Set([
  'create', 'createMany', 'createManyAndReturn',
  'update', 'updateMany',
  'upsert',
  'delete', 'deleteMany',
]);
const FORBIDDEN_TOP_METHODS = new Set([
  '$executeRaw', '$executeRawUnsafe', '$transaction',
]);
const GUARDED_MODELS = new Set([
  'storeTransfer', 'storeTransferLine', 'tenant', 'location', 'item',
  'inventoryLedger', 'auditLog', 'approvalRequest', 'approvalStep',
  'accModule', 'accWorkflowDefinition', 'accWorkflowVersion', 'user', 'stockBalance',
]);

function violation(name) {
  throw new Error(`READ-ONLY VIOLATION: attempted write via "${name}" — script aborted, no data changed.`);
}

function guardModel(modelName, delegate) {
  return new Proxy(delegate, {
    get(t, prop) {
      if (typeof prop === 'string' && FORBIDDEN_MODEL_METHODS.has(prop)) {
        return () => violation(`${modelName}.${prop}`);
      }
      const v = t[prop];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

const prisma = new Proxy(rawPrisma, {
  get(t, prop) {
    if (typeof prop === 'string' && FORBIDDEN_TOP_METHODS.has(prop)) {
      return () => violation(prop);
    }
    const v = t[prop];
    if (typeof prop === 'string' && GUARDED_MODELS.has(prop) && v && typeof v === 'object') {
      return guardModel(prop, v);
    }
    return typeof v === 'function' ? v.bind(t) : v;
  },
});

// ── Constants (mirror application SSOT) ──────────────────────────────────────
const ALL_TRANSFER_STATUSES = [
  'DRAFT', 'SUBMITTED', 'PENDING_DEPT', 'PENDING_FINANCE', 'PENDING_FINAL',
  'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CLOSED', 'POSTED', 'REJECTED',
];
const TRANSFER_LEGACY_OPEN_STATUSES = ['SUBMITTED', 'PENDING_FINAL', 'APPROVED', 'IN_TRANSIT'];
const FOCUS_STATUS = 'PENDING_FINAL';

const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);
const num = (v) => (v == null ? null : Number(v));

function maskDbUrl(url) {
  if (!url) return { present: false };
  try {
    const u = new URL(url);
    return {
      present: true,
      protocol: u.protocol.replace(':', ''),
      host: u.hostname,
      port: u.port || null,
      database: u.pathname.replace(/^\//, '') || null,
      user: u.username ? `${u.username.slice(0, 2)}***` : null,
      credentialsMasked: true,
    };
  } catch {
    return { present: true, parseError: true, credentialsMasked: true };
  }
}

function classifyEnvironment(db) {
  const local = ['127.0.0.1', 'localhost', '::1'].includes(db.host);
  const name = (db.database || '').toLowerCase();
  const looksTest = /test|dev|local|staging/.test(name) || local;
  return {
    isLocalHost: local,
    classification: local && looksTest ? 'LOCAL_DEV_TEST' : local ? 'LOCAL' : 'REMOTE_UNKNOWN',
    productionSuspected: !local && !/test|dev|staging/.test(name),
  };
}

async function ledgerForTransfers(tenantId, ids) {
  if (!ids.length) return [];
  return prisma.inventoryLedger.findMany({
    where: { tenantId, referenceType: 'TRANSFER', referenceId: { in: ids } },
    select: {
      id: true, referenceId: true, movementType: true, itemId: true,
      qtyIn: true, qtyOut: true, balanceAfter: true, createdAt: true, locationId: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function auditForTransfer(tenantId, id) {
  return prisma.auditLog.findMany({
    where: { entityType: 'TRANSFER', entityId: id, tenantId },
    orderBy: { changedAt: 'asc' },
    select: { action: true, note: true, changedBy: true, changedAt: true, beforeValue: true, afterValue: true },
  });
}

// ── Deterministic analytical classification (NOT an execution decision) ──────
function classifyRecord(rec) {
  const evidence = [];
  const hasOut = rec.ledger.some((l) => l.movementType === 'TRANSFER_OUT');
  const hasIn = rec.ledger.some((l) => l.movementType === 'TRANSFER_IN');
  const hasLedger = rec.ledger.length > 0;
  const missing = rec.missingReferences.length > 0;

  if (missing) {
    evidence.push(`Missing/broken references: ${rec.missingReferences.join(', ')}`);
    return { classification: 'DATA_INCONSISTENT', evidence };
  }
  if (hasOut || hasIn) {
    evidence.push(`Inventory ledger already contains ${hasOut ? 'TRANSFER_OUT ' : ''}${hasIn ? 'TRANSFER_IN ' : ''}rows while status is PENDING_FINAL (stock already moved but status not POSTED).`);
    return { classification: 'DATA_INCONSISTENT', evidence };
  }
  if (rec.supersededByPostedSibling) {
    evidence.push(`A sibling transfer with identical source/dest/lines is already POSTED (${rec.supersededByPostedSibling}).`);
    return { classification: 'DUPLICATE_OR_SUPERSEDED', evidence };
  }
  // No stock/ledger impact at all → closing is stock-neutral.
  if (!hasLedger && rec.lineCount >= 0) {
    evidence.push('No inventory ledger rows for this transfer (referenceType=TRANSFER): closing has zero stock/ledger effect.');
    evidence.push(`postingState=${rec.postingState}`);
    if (rec.approvalHistory && rec.approvalHistory.length > 0) {
      evidence.push('Approval history exists but posting never occurred.');
    }
    return { classification: 'SAFE_TO_CLOSE', evidence };
  }
  evidence.push('Evidence insufficient to classify automatically.');
  return { classification: 'INSUFFICIENT_EVIDENCE', evidence };
}

async function main() {
  const startedAt = new Date().toISOString();
  const dbInfo = maskDbUrl(process.env.DATABASE_URL);
  const env = classifyEnvironment(dbInfo);

  console.log('==============================================================');
  console.log(' Transfer Legacy — READ-ONLY Data Classification');
  console.log(' ZERO DATABASE WRITES — guard active');
  console.log('==============================================================');
  console.log('DB:', JSON.stringify(dbInfo), 'ENV:', env.classification);

  // 1) Totals + status counts
  const total = await prisma.storeTransfer.count();
  const grouped = await prisma.storeTransfer.groupBy({ by: ['status'], _count: { _all: true } });
  const statusCounts = {};
  for (const s of ALL_TRANSFER_STATUSES) statusCounts[s] = 0;
  const extraStatuses = {};
  for (const g of grouped) {
    if (statusCounts[g.status] !== undefined) statusCounts[g.status] = g._count._all;
    else extraStatuses[g.status] = g._count._all;
  }

  // Oldest/newest per status
  const dateRangeByStatus = {};
  for (const g of grouped) {
    const agg = await prisma.storeTransfer.aggregate({
      where: { status: g.status },
      _min: { createdAt: true, updatedAt: true },
      _max: { createdAt: true, updatedAt: true },
    });
    dateRangeByStatus[g.status] = {
      count: g._count._all,
      oldestCreatedAt: iso(agg._min.createdAt),
      newestCreatedAt: iso(agg._max.createdAt),
      oldestUpdatedAt: iso(agg._min.updatedAt),
      newestUpdatedAt: iso(agg._max.updatedAt),
    };
  }

  // 2) Tenant distribution
  const byTenant = await prisma.storeTransfer.groupBy({
    by: ['tenantId', 'status'],
    _count: { _all: true },
  });
  const tenantIds = [...new Set(byTenant.map((r) => r.tenantId))];
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, slug: true, name: true },
  });
  const tenantName = Object.fromEntries(tenants.map((t) => [t.id, t.slug || t.name]));
  const tenantDistribution = {};
  for (const r of byTenant) {
    const key = tenantName[r.tenantId] || r.tenantId;
    tenantDistribution[key] = tenantDistribution[key] || { total: 0, byStatus: {} };
    tenantDistribution[key].byStatus[r.status] = r._count._all;
    tenantDistribution[key].total += r._count._all;
  }

  // 3) Impact aggregates across ALL transfers
  const allTransfers = await prisma.storeTransfer.findMany({
    select: {
      id: true, tenantId: true, transferNo: true, status: true, postedAt: true,
      sourceLocationId: true, destLocationId: true,
      approvalRequest: { select: { id: true, accWorkflowVersionId: true, status: true, totalSteps: true } },
    },
  });
  const ledgerRefIds = new Set(
    (await prisma.inventoryLedger.findMany({
      where: { referenceType: 'TRANSFER' },
      select: { referenceId: true },
      distinct: ['referenceId'],
    })).map((r) => r.referenceId),
  );
  const aggregates = {
    withLedgerEntries: 0,
    withStockImpact: 0,
    withApprovalHistory: 0,
    withWorkflowVersionRef: 0,
    duplicateDocumentNumbers: 0,
    missingReferences: 0,
  };
  for (const t of allTransfers) {
    if (ledgerRefIds.has(t.id)) { aggregates.withLedgerEntries += 1; aggregates.withStockImpact += 1; }
    if (t.approvalRequest) aggregates.withApprovalHistory += 1;
    if (t.approvalRequest?.accWorkflowVersionId) aggregates.withWorkflowVersionRef += 1;
  }
  // Duplicate transferNo within tenant (unique constraint exists → expect 0)
  const dupCheck = await prisma.storeTransfer.groupBy({
    by: ['tenantId', 'transferNo'],
    _count: { _all: true },
    having: { transferNo: { _count: { gt: 1 } } },
  });
  aggregates.duplicateDocumentNumbers = dupCheck.length;

  // 4) Migrate feasibility context — published TRANSFER ACC workflow?
  const transferModule = await prisma.accModule.findUnique({ where: { key: 'TRANSFER' }, select: { id: true, key: true, isActive: true } });
  let publishedTransferVersions = [];
  if (transferModule) {
    publishedTransferVersions = await prisma.accWorkflowVersion.findMany({
      where: { status: 'PUBLISHED', definition: { moduleId: transferModule.id } },
      select: { id: true, versionNumber: true, publishedAt: true, definitionId: true },
      orderBy: { versionNumber: 'desc' },
    });
  }

  // 5) PENDING_FINAL deep inspection
  const pendingFinal = await prisma.storeTransfer.findMany({
    where: { status: FOCUS_STATUS },
    include: {
      lines: { select: { id: true, itemId: true, uomId: true, requestedQty: true, receivedQty: true, unitCost: true, totalValue: true } },
      sourceLocation: { select: { id: true, name: true, isActive: true, departmentId: true } },
      destLocation: { select: { id: true, name: true, isActive: true, departmentId: true } },
      requestedByUser: { select: { id: true, firstName: true, lastName: true, isActive: true } },
      approvedByUser: { select: { id: true, firstName: true, lastName: true, isActive: true } },
      postedByUser: { select: { id: true, firstName: true, lastName: true } },
      receivedByUser: { select: { id: true, firstName: true, lastName: true } },
      approvalRequest: {
        select: {
          id: true, status: true, requestType: true, currentStep: true, totalSteps: true,
          accWorkflowVersionId: true, createdAt: true, resolvedAt: true,
          steps: {
            orderBy: { stepNumber: 'asc' },
            select: { stepNumber: true, status: true, requiredRole: { select: { code: true } }, actedBy: true, actedAt: true },
          },
        },
      },
    },
  });

  const pendingFinalIds = pendingFinal.map((t) => t.id);
  const detailInspections = [];
  for (const t of pendingFinal) {
    const ledger = (await ledgerForTransfers(t.tenantId, [t.id])).map((l) => ({
      id: l.id, movementType: l.movementType, itemId: l.itemId, locationId: l.locationId,
      qtyIn: num(l.qtyIn), qtyOut: num(l.qtyOut), balanceAfter: num(l.balanceAfter), createdAt: iso(l.createdAt),
    }));
    const audit = (await auditForTransfer(t.tenantId, t.id)).map((a) => ({
      action: a.action, note: a.note, changedBy: a.changedBy, changedAt: iso(a.changedAt),
    }));

    // Reference integrity
    const missingReferences = [];
    if (!t.sourceLocation) missingReferences.push('sourceLocation');
    if (!t.destLocation) missingReferences.push('destLocation');
    if (!t.requestedByUser) missingReferences.push('requestedBy');
    const itemIds = [...new Set(t.lines.map((l) => l.itemId))];
    const foundItems = await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true } });
    const foundItemIds = new Set(foundItems.map((i) => i.id));
    const missingItems = itemIds.filter((id) => !foundItemIds.has(id));
    if (missingItems.length) missingReferences.push(`items(${missingItems.length})`);

    // Posting state
    let postingState = 'NOT_STARTED';
    const hasOut = ledger.some((l) => l.movementType === 'TRANSFER_OUT');
    const hasIn = ledger.some((l) => l.movementType === 'TRANSFER_IN');
    if (t.postedAt || t.status === 'POSTED') postingState = 'COMPLETED';
    else if (hasOut && hasIn) postingState = 'COMPLETED_LEDGER_ONLY';
    else if (hasOut || hasIn) postingState = 'PARTIALLY_POSTED';
    else postingState = 'NOT_STARTED';

    // Superseded check: a POSTED sibling with same source/dest and same line item set
    const siblings = await prisma.storeTransfer.findMany({
      where: {
        tenantId: t.tenantId,
        id: { not: t.id },
        status: 'POSTED',
        sourceLocationId: t.sourceLocationId,
        destLocationId: t.destLocationId,
      },
      select: {
        id: true, transferNo: true, status: true, createdAt: true, receivedAt: true, closedAt: true,
        lines: { select: { itemId: true, requestedQty: true, receivedQty: true } },
      },
    });
    const myItems = new Set(itemIds);
    const myQtyByItem = new Map(t.lines.map((l) => [l.itemId, Number(l.requestedQty || 0)]));
    const supersededSibling = siblings.find((s) => {
      const sItems = new Set(s.lines.map((l) => l.itemId));
      if (sItems.size !== myItems.size) return false;
      for (const it of myItems) if (!sItems.has(it)) return false;
      return true;
    });
    let supersedeDetail = null;
    if (supersededSibling) {
      const sibLedger = await ledgerForTransfers(t.tenantId, [supersededSibling.id]);
      const qtyMatch = supersededSibling.lines.every(
        (l) => myQtyByItem.get(l.itemId) === Number(l.requestedQty || 0),
      );
      supersedeDetail = {
        siblingTransferNo: supersededSibling.transferNo,
        siblingStatus: supersededSibling.status,
        siblingCreatedAt: iso(supersededSibling.createdAt),
        siblingReceivedAt: iso(supersededSibling.receivedAt),
        sameRoute: true,
        sameItemSet: true,
        sameRequestedQty: qtyMatch,
        siblingLedgerRows: sibLedger.length,
        siblingPostedStockForSameItems: sibLedger.length > 0,
      };
    }
    const superseded = supersededSibling;

    const rec = {
      transferId: t.id,
      documentNo: t.transferNo,
      tenant: tenantName[t.tenantId] || t.tenantId,
      createdAt: iso(t.createdAt),
      updatedAt: iso(t.updatedAt),
      transferDate: iso(t.transferDate),
      createdBy: t.requestedByUser ? `${t.requestedByUser.firstName || ''} ${t.requestedByUser.lastName || ''}`.trim() : null,
      createdByActive: t.requestedByUser?.isActive ?? null,
      sourceStore: t.sourceLocation ? { id: t.sourceLocation.id, name: t.sourceLocation.name, active: t.sourceLocation.isActive, departmentId: t.sourceLocation.departmentId } : null,
      destStore: t.destLocation ? { id: t.destLocation.id, name: t.destLocation.name, active: t.destLocation.isActive, departmentId: t.destLocation.departmentId } : null,
      lineCount: t.lines.length,
      totalRequestedQty: t.lines.reduce((n, l) => n + Number(l.requestedQty || 0), 0),
      totalValue: t.lines.reduce((n, l) => n + Number(l.totalValue || 0), 0),
      currentLegacyStatus: t.status,
      approvedBy: t.approvedByUser ? `${t.approvedByUser.firstName || ''} ${t.approvedByUser.lastName || ''}`.trim() : null,
      postedBy: t.postedByUser ? `${t.postedByUser.firstName || ''} ${t.postedByUser.lastName || ''}`.trim() : null,
      receivedBy: t.receivedByUser ? `${t.receivedByUser.firstName || ''} ${t.receivedByUser.lastName || ''}`.trim() : null,
      approvedAt: iso(t.approvedAt),
      postedAt: iso(t.postedAt),
      dispatchedAt: iso(t.dispatchedAt),
      receivedAt: iso(t.receivedAt),
      closedAt: iso(t.closedAt),
      approvalRequest: t.approvalRequest
        ? {
            id: t.approvalRequest.id, status: t.approvalRequest.status, requestType: t.approvalRequest.requestType,
            currentStep: t.approvalRequest.currentStep, totalSteps: t.approvalRequest.totalSteps,
            accWorkflowVersionId: t.approvalRequest.accWorkflowVersionId,
            createdAt: iso(t.approvalRequest.createdAt), resolvedAt: iso(t.approvalRequest.resolvedAt),
          }
        : null,
      approvalHistory: t.approvalRequest?.steps?.map((s) => ({
        stepNumber: s.stepNumber, status: s.status, requiredRole: s.requiredRole?.code || null,
        actedBy: s.actedBy || null, actedAt: iso(s.actedAt),
      })) || [],
      workflowVersionRef: t.approvalRequest?.accWorkflowVersionId || null,
      ledger,
      ledgerCount: ledger.length,
      stockMovementExists: ledger.length > 0,
      stockBalanceImpact: ledger.length > 0 ? 'PRESENT' : 'NONE',
      auditLogs: audit,
      auditCount: audit.length,
      relatedMovementIds: ledger.map((l) => l.id),
      postingState,
      supersededByPostedSibling: superseded ? superseded.transferNo : null,
      supersedeDetail,
      doublePostingRiskIfCompleted:
        supersedeDetail && supersedeDetail.siblingPostedStockForSameItems
          ? 'HIGH — a POSTED sibling already moved identical stock; completing/migrating this record would post the same movement twice.'
          : ledger.length > 0
            ? 'MEDIUM — ledger rows exist for this record; re-posting could duplicate.'
            : 'LOW — no ledger for this record, but confirm no equivalent movement exists before any completion.',
      missingReferences,
    };
    rec.analyticalClassification = classifyRecord(rec);
    detailInspections.push(rec);
  }

  // Migrate feasibility (deterministic, no execution)
  const migrateFeasibility = {
    accTransferModuleExists: Boolean(transferModule),
    publishedTransferWorkflowVersionCount: publishedTransferVersions.length,
    publishedTransferWorkflowVersions: publishedTransferVersions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, publishedAt: iso(v.publishedAt) })),
    pinnableVersion: publishedTransferVersions.length > 0,
    notes: [
      publishedTransferVersions.length === 0
        ? 'No PUBLISHED ACC TRANSFER workflow version found — cannot deterministically pin a version for migration.'
        : 'A published ACC TRANSFER workflow version exists and is pinnable.',
      'PENDING_FINAL is a legacy logistics status with no equivalent ACC approval step; the correct current step cannot be derived deterministically from status+date alone.',
      'Application code never writes PENDING_FINAL (transfer.service only writes PENDING_DEPT and POSTED); such records are read-only (isTransferReadOnly=true) and cannot be advanced through the V2 flow.',
    ],
  };

  const evidence = {
    workstream: 'Transfer Legacy — Read-Only Data Classification',
    focusStatus: FOCUS_STATUS,
    executionTimestamp: startedAt,
    finishedAt: new Date().toISOString(),
    readOnlyConfirmation: {
      guard: 'Prisma client wrapped; write methods throw. No $transaction/$executeRaw used.',
      zeroDatabaseWrites: true,
    },
    environment: { database: dbInfo, ...env },
    dataInventory: {
      totalTransfers: total,
      statusCounts,
      extraStatusesObserved: extraStatuses,
      dateRangeByStatus,
      legacyOpenStatuses: TRANSFER_LEGACY_OPEN_STATUSES,
    },
    tenantDistribution,
    impactAggregates: aggregates,
    pendingFinal: {
      count: pendingFinal.length,
      ids: pendingFinalIds,
      inspections: detailInspections,
    },
    migrateFeasibility,
    activeRouteVerification: {
      transferRoutesMounted: true,
      mountPoint: '/api/transfers (src/routes/index.js → transfer.routes.js)',
      activeEndpoints: [
        'POST /transfers (TRANSFER_CREATE)',
        'POST /transfers/:id/submit', 'POST /transfers/:id/approve', 'POST /transfers/:id/reject',
        'POST /transfers/:id/dispatch', 'POST /transfers/:id/receive',
        'GET /transfers, GET /transfers/:id, GET /transfers/:id/evidence(/pdf)',
        'PATCH/DELETE /transfers/:id (DRAFT only)',
      ],
      legacyStatusPathActive: false,
      note: 'Create/approve/post routes are ACTIVE for NEW transfers (V2: DRAFT→PENDING_DEPT→POSTED). However PENDING_FINAL is a legacy status the code never writes; such a record resolves as workflowGeneration=LEGACY and isTransferReadOnly=true, so it cannot be advanced/posted through the live V2 endpoints. Its only surfaces are the workflow pipeline/dashboard (as a legacy item) and the transfers list (Awaiting Posting bucket).',
    },
    closeFeasibility: {
      note: 'Options are analytical only — no new status is proposed and none is selected.',
      options: [
        {
          option: 'Reject with explicit legacy reason (status REJECTED)',
          stockImpact: 'None (no ledger exists).',
          ledgerImpact: 'None.',
          reports: 'Appears as Rejected; removed from open/pipeline counts.',
          pipelineDashboard: 'Drops out of TRANSFER_LEGACY_OPEN_STATUSES → disappears from pipeline & SLA breach.',
          auditability: 'Preserved; adds an explicit REJECT audit with reason.',
          misleadingRisk: 'Slight — "Rejected" implies a decision to refuse, whereas it was actually superseded/abandoned. Reason text must state "superseded by TRF-202605-0002".',
        },
        {
          option: 'Void/Cancel with explicit legacy reason',
          stockImpact: 'None.',
          ledgerImpact: 'None.',
          pipelineDashboard: 'Drops out of open statuses.',
          reports: 'Shows as voided/cancelled historical record.',
          auditability: 'Preserved with explicit reason.',
          misleadingRisk: 'Low if reason references the superseding posted transfer. NOTE: TransferStatus enum has no VOID/CANCELLED value today (would require schema change — OUT OF SCOPE).',
        },
        {
          option: 'Archive as non-operational historical record (leave status, exclude from open lists)',
          stockImpact: 'None.',
          ledgerImpact: 'None.',
          pipelineDashboard: 'Requires removing PENDING_FINAL from TRANSFER_LEGACY_OPEN_STATUSES (code change) — affects only this legacy bucket.',
          reports: 'Remains visible in history; hidden from operational queues.',
          auditability: 'Fully preserved (no record mutation).',
          misleadingRisk: 'Lowest — preserves exact history; but leaves a permanently "PENDING_FINAL" row that future readers may misread without the archive note.',
        },
        {
          option: 'Mark as manually resolved without stock impact',
          stockImpact: 'None.',
          ledgerImpact: 'None.',
          pipelineDashboard: 'Drops out of open statuses once mapped to a terminal state.',
          reports: 'Shows as resolved.',
          auditability: 'Preserved with explicit manual-resolution note.',
          misleadingRisk: 'Low with a clear note; needs a terminal state to map to.',
        },
      ],
    },
    codeReferenceInventory: [
      { file: 'OSE-backend/src/services/workflow-pipeline/workflow-pending.definitions.js', role: 'SSOT for open-status predicates + SLA', statuses: 'TRANSFER_LEGACY_OPEN_STATUSES = [SUBMITTED, PENDING_FINAL, APPROVED, IN_TRANSIT]; SLA_RULES.TRANSFER_LEGACY 24h/48h', includesPendingFinal: true, removableAfterResolution: true, kind: 'Operational (pipeline/SLA)' },
      { file: 'OSE-backend/src/services/workflow-pipeline/workflow-pipeline.collectors.js', role: 'collectTransfers() surfaces legacy transfers in pipeline/dashboard with currentStep "Legacy transfer — resolve via migration"', statuses: 'TRANSFER_PIPELINE_STATUSES (incl. legacy)', includesPendingFinal: true, removableAfterResolution: true, kind: 'Operational (pipeline/dashboard)' },
      { file: 'OSE-backend/src/services/transferWorkflow.util.js', role: 'LEGACY_TRANSFER_STATUSES, resolveWorkflowGeneration (LEGACY), isTransferReadOnly (true), Awaiting-Posting/Pending-Review list buckets', statuses: 'PENDING_FINAL classified LEGACY + AWAITING_POSTING', includesPendingFinal: true, removableAfterResolution: false, kind: 'Operational (list display, read-only gating)' },
      { file: 'OSE-backend/src/acc-authority/workflow-step-permissions.js', role: 'TRANSFER_LEGACY_STATUSES gate for waiting-permission resolution', statuses: 'incl. PENDING_FINAL', includesPendingFinal: true, removableAfterResolution: true, kind: 'Operational (permission gating)' },
      { file: 'OSE-backend/src/platform/lifecyclePresentation.service.js', role: 'User-facing state mapping PENDING_FINAL → "In Review"', statuses: 'PENDING_FINAL', includesPendingFinal: true, removableAfterResolution: false, kind: 'Presentation' },
      { file: 'OSE-backend/src/constants/governed-movement.constants.js', role: 'Governed-movement status constant list includes PENDING_FINAL', statuses: 'PENDING_FINAL', includesPendingFinal: true, removableAfterResolution: false, kind: 'Constant' },
      { file: 'OSE-backend/src/routes/transfer.routes.js + controllers/transfer.controller.js + services/transfer.service.js', role: 'ACTIVE V2 transfer routes; never write PENDING_FINAL (only PENDING_DEPT/POSTED)', statuses: 'V2', includesPendingFinal: false, removableAfterResolution: false, kind: 'Operational (active routes)' },
      { file: 'OSE-backend/scripts/assess-transfer-migration.js', role: 'EXISTING migration/auto-post assessment script — CONTAINS WRITE PATHS (--apply-auto-post). NOT used by this read-only analysis.', statuses: 'legacy set incl. PENDING_FINAL', includesPendingFinal: true, removableAfterResolution: false, kind: 'Tooling (write-capable — excluded here)' },
      { file: 'OSE-Frontend/src/app/core/models/enums.ts', role: 'TransferStatus union includes PENDING_FINAL', statuses: 'PENDING_FINAL', includesPendingFinal: true, removableAfterResolution: false, kind: 'FE type' },
      { file: 'OSE-Frontend/src/app/features/transfers/utils/transfer-workflow.helpers.ts', role: 'LEGACY status set + workflowGeneration detection', statuses: 'PENDING_FINAL (LEGACY)', includesPendingFinal: true, removableAfterResolution: false, kind: 'FE display' },
      { file: 'OSE-Frontend/src/app/features/transfers/utils/transfer-status-display.util.ts', role: 'AWAITING_POSTING display mapping', statuses: 'legacy → AWAITING_POSTING', includesPendingFinal: false, removableAfterResolution: false, kind: 'FE display' },
      { file: 'OSE-Frontend/src/app/features/movements/utils/movement-register-display.util.ts', role: 'Movement register display incl. PENDING_FINAL → AWAITING_POSTING', statuses: 'PENDING_FINAL', includesPendingFinal: true, removableAfterResolution: false, kind: 'FE display' },
    ],
    unresolvedQuestions: [
      'Business intent: was TRF-202605-0001 abandoned and deliberately re-created as TRF-202605-0002 (which posted the identical F&B Horizon→Store Floor 1, item 575826b3, qty 3)? Amr to confirm.',
      'Preferred terminal representation for close: Reject-with-reason vs Archive vs a new terminal state (the latter needs a schema change and is out of the current read-only scope).',
      'Whether PENDING_FINAL should be permanently removed from TRANSFER_LEGACY_OPEN_STATUSES after this single record is resolved (no other rows carry legacy-open statuses today).',
    ],
    zeroWriteConfirmation: 'ZERO DATABASE WRITES',
  };

  const outDir = path.join(__dirname, '..', 'transfer-legacy');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'TRANSFER_LEGACY_READ_ONLY_CLASSIFICATION.json');
  fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  console.log('\n--- SUMMARY ---');
  console.log('total transfers:', total);
  console.log('status counts:', JSON.stringify(statusCounts));
  if (Object.keys(extraStatuses).length) console.log('extra statuses:', JSON.stringify(extraStatuses));
  console.log('PENDING_FINAL count:', pendingFinal.length);
  console.log('impact aggregates:', JSON.stringify(aggregates));
  console.log('published TRANSFER workflow versions:', publishedTransferVersions.length);
  for (const r of detailInspections) {
    console.log(`  PF ${r.documentNo} [${r.tenant}] posting=${r.postingState} ledger=${r.ledgerCount} audit=${r.auditCount} class=${r.analyticalClassification.classification}`);
  }
  console.log('\nEvidence written to:', outPath);
  console.log('ZERO DATABASE WRITES');
}

main()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  })
  .finally(() => rawPrisma.$disconnect());
