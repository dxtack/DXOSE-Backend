const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { checkPeriodLock } = require('./periodGuard.service');
const {
  assertIntegerQuantity,
  isIntegerQuantity,
} = require('./integerQuantityGuard.service');

/** Governance date for period lock — session count date, not wall-clock at button press. */
function resolveCountGovernanceDate(session) {
  if (session?.countDate) return new Date(session.countDate);
  if (session?.createdAt) return new Date(session.createdAt);
  return new Date();
}
const { connectRole, normalizeRole } = require('./rbac.service');
const postingEngine = require('./postingEngine.service');
const {
    resolveUnitCost,
    estimateVarianceValue,
    VALUATION_BASIS,
} = require('./valuationGovernance.service');
const { logAction, EntityType } = require('./auditTrail.service');
const { writeAuditLogTransactional } = require('./auditWriter.service');
const { renderInventoryCountEvidencePdf } = require('./pdf/inventory-count-pdf.renderer');
const {
  buildInventoryCountWorkflowTimelineForSession,
  mapSlotsToPdfApprovalHistory,
} = require('./inventory-count-workflow-presentation.util');
const { withUserFacingState } = require('../platform/lifecyclePresentation.service');
const {
  countStatusForPendingStep,
  inferLegacyCountApprovalState,
  submitApprovalProjection,
} = require('./acc-workflow-count.runtime');
const {
  assertCountPrepareActor,
  assertCountCancelActor,
  assertCountExecuteActor,
  assertCountRecountActor,
  assertCountSubmitActor,
  pendingApprovalStep,
  assertCanActOnApprovalStep,
  assertDepartmentManagerSessionScope,
  resolveChainForSession,
  resolvePinnedVersionId,
  buildApprovalStepCreates,
  COUNT_APPROVAL_ACTIVE_STATUSES,
  CANCELLABLE_STATUSES,
  approvalRequestVersionPin,
  ROLE_DEPT_MANAGER,
} = require('./inventory-count-workflow.helpers');
const { resolveWorkflowForDocument } = require('./acc-workflow-runtime.service');
const { executeWorkflowSendBackInTx, normalizeReason } = require('../platform/workflowSendBack.service');
const {
  appendSendBackNotes,
} = require('../platform/lifecyclePresentation.service');
const {
  assertConcurrencyVersion,
  bumpConcurrencyUpdate,
} = require('../platform/concurrency.service');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { getStorage } = require('../config/storage');
const { listOperationalCellsForLocations } = require('./location-item-resolution.service');

function bizError(statusCode, code, message, details = []) {
  return { isBizError: true, statusCode, code, message, details };
}

function mapConcurrencyError(err) {
  if (err?.status === 409 && err?.code) {
    throw bizError(409, err.code, err.message);
  }
  throw err;
}

function parseSessionVersion(body) {
  if (body == null || body.concurrencyVersion == null || body.concurrencyVersion === '') return null;
  return Number(body.concurrencyVersion);
}

function assertSessionConcurrency(session, expectedVersion, userId, { required = true } = {}) {
  try {
    assertConcurrencyVersion(expectedVersion, session.concurrencyVersion, {
      required,
      audit: {
        tenantId: session.tenantId,
        entityType: EntityType.STOCK_COUNT,
        entityId: session.id,
        changedBy: userId,
      },
    });
  } catch (err) {
    mapConcurrencyError(err);
  }
}

async function guardedSessionUpdate(tx, session, expectedVersion, data) {
  const version = Number(expectedVersion);
  const guarded = await tx.stockCountSession.updateMany({
    where: { id: session.id, tenantId: session.tenantId, concurrencyVersion: version },
    data: bumpConcurrencyUpdate(data),
  });
  if (guarded.count === 0) {
    throw bizError(
      409,
      'CONCURRENCY_CONFLICT',
      'Document was modified by another user. Reload and try again.',
    );
  }
  return version + 1;
}

function parseIntSafe(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function mustGetSession(tenantId, id) {
  const session = await prisma.stockCountSession.findFirst({
    where: { id, tenantId },
    include: {
      location: { select: { id: true, name: true } },
      createdByUser: { select: { id: true, firstName: true, lastName: true } },
      scopedLocations: { include: { location: { select: { id: true, name: true, isActive: true } } } },
      approvalRequest: {
        include: {
          steps: {
            orderBy: { stepNumber: 'asc' },
            include: {
              requiredRole: { select: { code: true } },
              actedByUser: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  if (!session) throw bizError(404, 'COUNT_SESSION_NOT_FOUND', 'Count session not found');
  return session;
}

const { userDisplayName } = require('../utils/timeline-present.util');

/**
 * Same picker contract as GRN/Transfer: Creator + prior approval participants only.
 */
function buildInventoryCountSendBackTargets(session, approval) {
  if (!session || !approval) return [];
  const currentStepNo = Number(approval.currentStep);
  if (currentStepNo <= 0) return [];

  const creatorId = session.createdBy || session.createdByUser?.id || null;
  const targets = [
    {
      stepNumber: 0,
      targetType: 'CREATOR',
      roleCode: null,
      actorName: userDisplayName(session.createdByUser) || null,
    },
  ];

  const steps = Array.isArray(approval.steps)
    ? [...approval.steps].sort((a, b) => a.stepNumber - b.stepNumber)
    : [];

  for (const st of steps) {
    if (st.stepNumber >= currentStepNo) break;
    const actedById = st.actedBy || st.actedByUser?.id || null;
    if (creatorId && actedById && String(actedById) === String(creatorId)) {
      continue;
    }
    const roleCode = st.requiredRole?.code || st.requiredRole || null;
    targets.push({
      stepNumber: st.stepNumber,
      targetType: 'STEP',
      roleCode,
      actorName: userDisplayName(st.actedByUser) || null,
    });
  }

  return targets;
}

async function mapApprovalRequestsForResponse(approvalRequest) {
  if (!approvalRequest) return [];

  const createdByUser = approvalRequest.createdBy
    ? await prisma.user.findUnique({
        where: { id: approvalRequest.createdBy },
        select: { id: true, firstName: true, lastName: true },
      })
    : null;

  return [
    {
      id: approvalRequest.id,
      status: approvalRequest.status,
      currentStep: approvalRequest.currentStep,
      totalSteps: approvalRequest.totalSteps,
      createdAt: approvalRequest.createdAt,
      resolvedAt: approvalRequest.resolvedAt,
      createdByUser,
      steps: (approvalRequest.steps || []).map((step) => ({
        id: step.id,
        stepNumber: step.stepNumber,
        status: step.status,
        actedAt: step.actedAt,
        comment: step.comment || null,
        requiredRole: step.requiredRole ? { code: step.requiredRole.code } : null,
        actedByUser: step.actedByUser || null,
      })),
    },
  ];
}

async function backfillCountApprovalRequest(session, tenantId, tx) {
  const pinnedId = await resolvePinnedVersionId(session, tenantId);
  const chain = pinnedId
    ? await require('./acc-workflow-runtime.service').resolveWorkflowByVersionId(pinnedId)
    : await resolveWorkflowForDocument({ moduleKey: 'STOCK_COUNT', tenantId });
  const roleCodes = chain.roleCodes || [];
  if (!roleCodes.length) {
    throw bizError(422, 'COUNT_ACC_WORKFLOW_REQUIRED', 'ACC published workflow is required to backfill approval request.');
  }

  const { approvedCount, pendingStep } = inferLegacyCountApprovalState(session.status, chain);
  const now = new Date();
  const projectedStatus = countStatusForPendingStep(chain, pendingStep);

  const req = await tx.approvalRequest.create({
    data: {
      tenantId,
      requestType: 'COUNT_ADJUSTMENT',
      status: 'PENDING',
      StockCountSession: { connect: { id: session.id } },
      currentStep: pendingStep,
      totalSteps: roleCodes.length,
      createdBy: session.createdBy,
      ...approvalRequestVersionPin(chain),
      steps: {
        create: roleCodes.map((roleCode, index) => {
          const stepNumber = index + 1;
          const isApproved = stepNumber <= approvedCount;
          return {
            stepNumber,
            requiredRole: connectRole(roleCode),
            status: isApproved ? 'APPROVED' : 'PENDING',
            ...(isApproved
              ? {
                  actedByUser: { connect: { id: session.createdBy } },
                  actedAt: now,
                  comment: 'Backfilled from legacy document status for ACC compatibility',
                }
              : {}),
          };
        }),
      },
    },
  });

  await tx.stockCountSession.update({
    where: { id: session.id },
    data: { approvalRequestId: req.id, status: projectedStatus, updatedAt: now },
  });

  return req;
}

function approvalRoleLabel(roleCode) {
  switch ((roleCode || '').toUpperCase()) {
    case 'FINANCE_MANAGER':
      return 'Finance Manager';
    case 'ADMIN':
      return 'Admin';
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'COST_CONTROL':
      return 'Cost Control';
    case 'DEPT_MANAGER':
      return 'Department Manager';
    case 'STOREKEEPER':
      return 'Storekeeper';
    case 'GENERAL_MANAGER':
      return 'General Manager';
    case 'ORG_MANAGER':
      return 'Organization Manager';
    default:
      return roleCode || 'Approver';
  }
}

async function getScopedLocationIds(session) {
  const ids = (session.scopedLocations || []).map((x) => x.locationId);
  // Backward compat: if scopedLocations empty, fall back to session.locationId
  return ids.length ? ids : [session.locationId];
}

async function assertLocationsBelongToTenant(tenantId, locationIds) {
  const found = await prisma.location.findMany({
    where: { tenantId, id: { in: locationIds }, isActive: true },
    select: { id: true, departmentId: true },
  });
  if (found.length !== locationIds.length) {
    throw bizError(400, 'COUNT_SESSION_INVALID_LOCATIONS', 'One or more locations are invalid or inactive.');
  }
  return found;
}

/**
 * Ensure count sheet cells exist only for (itemId, locationId) pairs that have StockBalance.
 * No cartesian product — operational canonical source.
 */
async function ensureCountSheetCells(tx, tenantId, session, locationIds, roundNo = 1, opts = {}) {
  if (!locationIds.length) {
    return { scopedItems: [], uniqueItemCount: 0, cellsCreated: 0 };
  }

  const itemScope = {
    departmentId: session.departmentId || undefined,
    categoryId: session.categoryId || undefined,
  };

  const balanceRows = await listOperationalCellsForLocations(tx, tenantId, locationIds, itemScope);

  if (!balanceRows.length) {
    return { scopedItems: [], uniqueItemCount: 0, cellsCreated: 0 };
  }

  const existingCells = await tx.stockCountLocationQty.findMany({
    where: {
      sessionId: session.id,
      locationId: { in: locationIds },
      roundNo,
    },
    select: { itemId: true, locationId: true },
  });

  const existingKeys = new Set(existingCells.map((cell) => `${cell.itemId}:${cell.locationId}`));
  const batch = [];
  let cellsCreated = 0;

  for (const balance of balanceRows) {
    const key = `${balance.itemId}:${balance.locationId}`;
    if (existingKeys.has(key)) continue;

    batch.push({
      sessionId: session.id,
      itemId: balance.itemId,
      locationId: balance.locationId,
      roundNo,
      bookQty: Number(balance.qtyOnHand) || 0,
      countedQty: null,
      varianceQty: 0,
    });
    existingKeys.add(key);
    cellsCreated += 1;

    if (batch.length >= 5000) {
      await tx.stockCountLocationQty.createMany({
        data: batch.splice(0, batch.length),
        skipDuplicates: true,
      });
    }
  }

  if (batch.length > 0) {
    await tx.stockCountLocationQty.createMany({
      data: batch,
      skipDuplicates: true,
    });
  }

  const uniqueItemIds = new Set(balanceRows.map((b) => b.itemId));
  const scopedItems = [...uniqueItemIds].map((id) => ({ id }));

  return {
    scopedItems,
    uniqueItemCount: uniqueItemIds.size,
    cellsCreated,
  };
}

exports.createSession = async (tenantId, user, body) => {
  const userId = user.id;
  assertCountPrepareActor(user);

  const { departmentId, categoryId, locationIds, blindMode, notes, countDate: countDateRaw } = body || {};
  if (!departmentId) throw bizError(400, 'COUNT_SESSION_DEPARTMENT_REQUIRED', 'departmentId is required');
  if (!Array.isArray(locationIds) || locationIds.length === 0) {
    throw bizError(400, 'COUNT_SESSION_LOCATIONS_REQUIRED', 'locationIds is required');
  }
  if (typeof blindMode !== 'boolean') {
    throw bizError(400, 'COUNT_SESSION_BLINDMODE_REQUIRED', 'blindMode must be boolean');
  }

  const locs = await assertLocationsBelongToTenant(tenantId, locationIds);
  // Best-effort: ensure dept matches selected locations (all must belong to dept)
  const mismatched = locs.find((l) => l.departmentId && l.departmentId !== departmentId);
  if (mismatched) {
    throw bizError(400, 'COUNT_SESSION_LOCATION_DEPT_MISMATCH', 'All locations must belong to the selected department.');
  }

  // Session number strategy: keep aligned with existing CNT-YYMM-#### pattern
  const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
  const count = await prisma.stockCountSession.count({ where: { tenantId } });
  const sessionNo = `CNT-${dateStr}-${String(count + 1).padStart(4, '0')}`;

  const primaryLocationId = locationIds[0];
  const countDate = countDateRaw ? new Date(countDateRaw) : new Date();
  if (Number.isNaN(countDate.getTime())) {
    throw bizError(400, 'COUNT_SESSION_COUNT_DATE_INVALID', 'countDate must be a valid date.');
  }
  await checkPeriodLock(tenantId, countDate);

  const session = await prisma.stockCountSession.create({
    data: {
      tenantId,
      locationId: primaryLocationId,
      departmentId,
      categoryId: categoryId || null,
      blindMode,
      countDate,
      currentRound: 1,
      sessionNo,
      createdBy: userId,
      notes: notes || null,
      status: 'DRAFT',
      scopedLocations: {
        create: locationIds.map((id) => ({ locationId: id })),
      },
    },
    include: {
      scopedLocations: { include: { location: { select: { id: true, name: true } } } },
    },
  });

  await logAction({
    tenantId,
    entityType: EntityType.STOCK_COUNT,
    entityId: session.id,
    action: 'CREATE',
    changedBy: userId,
    note: `INVENTORY_COUNT_CREATED_BY sessionNo=${session.sessionNo}`,
    afterValue: { sessionNo: session.sessionNo, createdBy: userId, departmentId },
  });

  return {
    id: session.id,
    sessionNo: session.sessionNo,
    status: session.status,
    blindMode: session.blindMode,
    departmentId: session.departmentId,
    categoryId: session.categoryId,
    locations: session.scopedLocations.map((x) => x.location),
    countDate: session.countDate,
    snapshotAt: null,
    currentRound: session.currentRound,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    concurrencyVersion: session.concurrencyVersion ?? 0,
  };
};

exports.listSessions = async (tenantId, query = {}) => {
  const page = Math.max(1, parseIntSafe(query.page, 1));
  const pageSize = Math.min(200, Math.max(1, parseIntSafe(query.pageSize, 25)));
  const skip = (page - 1) * pageSize;
  const where = { tenantId };
  if (query.status) {
    const statuses = String(query.status)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (statuses.length === 1) where.status = statuses[0];
    else if (statuses.length > 1) where.status = { in: statuses };
  }
  if (query.departmentId) where.departmentId = query.departmentId;

  const [rows, total] = await Promise.all([
    prisma.stockCountSession.findMany({
      where,
      include: {
        scopedLocations: { include: { location: { select: { id: true, name: true } } } },
        createdByUser: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.stockCountSession.count({ where }),
  ]);

  return {
    page,
    pageSize,
    total,
    data: rows.map((s) =>
      withUserFacingState(
        'INVENTORY_COUNT',
        {
          id: s.id,
          sessionNo: s.sessionNo,
          status: s.status,
          notes: s.notes ?? null,
          blindMode: s.blindMode,
          countDate: s.countDate,
          snapshotAt: s.snapshotAt,
          postedAt: s.postedAt,
          departmentId: s.departmentId,
          categoryId: s.categoryId,
          locations: (s.scopedLocations || []).map((x) => x.location),
          createdAt: s.createdAt,
          createdBy: s.createdByUser ? `${s.createdByUser.firstName} ${s.createdByUser.lastName}` : null,
          concurrencyVersion: s.concurrencyVersion ?? 0,
        },
        { notes: s.notes },
      ),
    ),
  };
};

exports.getSession = async (tenantId, id) => {
  const s = await mustGetSession(tenantId, id);
  const locIds = await getScopedLocationIds(s);
  const approvalRequests = await mapApprovalRequestsForResponse(s.approvalRequest);
  const workflowTimeline = await buildInventoryCountWorkflowTimelineForSession(tenantId, s);
  const { buildInventoryCountWorkflowContext } = require('./inventoryCountWorkflowContext.util');
  let chain = null;
  try {
    if (s.approvalRequest?.accWorkflowVersionId) {
      const { resolveWorkflowByVersionId } = require('./acc-workflow-runtime.service');
      chain = await resolveWorkflowByVersionId(s.approvalRequest.accWorkflowVersionId);
    } else {
      const { resolveWorkflowForDocument } = require('./acc-workflow-runtime.service');
      chain = await resolveWorkflowForDocument({ moduleKey: 'STOCK_COUNT', tenantId });
    }
  } catch {
    chain = null;
  }
  const workflow = buildInventoryCountWorkflowContext(
    { ...s, approvalRequest: s.approvalRequest, approvalRequests },
    chain,
  );
  const sendBackTargets =
    COUNT_APPROVAL_ACTIVE_STATUSES.includes(s.status) && s.approvalRequest
      ? buildInventoryCountSendBackTargets(s, s.approvalRequest)
      : [];
  return withUserFacingState(
    'INVENTORY_COUNT',
    {
      id: s.id,
      sessionNo: s.sessionNo,
      status: s.status,
      notes: s.notes ?? null,
      blindMode: s.blindMode,
      countDate: s.countDate,
      snapshotAt: s.snapshotAt,
      postedAt: s.postedAt,
      departmentId: s.departmentId,
      categoryId: s.categoryId,
      currentRound: s.currentRound,
      locations: (s.scopedLocations || []).map((x) => x.location),
      primaryLocation: s.location,
      scopedLocationIds: locIds,
      approvalRequestId: s.approvalRequestId || null,
      approvalRequests,
      workflowTimeline,
      workflow,
      sendBackTargets,
      createdBy: s.createdBy || null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      concurrencyVersion: s.concurrencyVersion ?? 0,
    },
    { notes: s.notes },
  );
};

exports.startSession = async (tenantId, user, id, body = {}) => {
  assertCountPrepareActor(user);
  const userId = user.id;
  const s = await mustGetSession(tenantId, id);
  const expectedVersion = parseSessionVersion(body);
  assertSessionConcurrency(s, expectedVersion, userId, { required: true });
  if (s.status !== 'DRAFT') {
    throw bizError(400, 'COUNT_SESSION_INVALID_STATE', 'Session must be DRAFT to start', [
      { field: 'status', reason: `Expected DRAFT, got ${s.status}` },
    ]);
  }

  // Guard: period lock uses session countDate (governance), not wall-clock at start.
  await checkPeriodLock(tenantId, resolveCountGovernanceDate(s));

  const locationIds = await getScopedLocationIds(s);

  const snapshotAt = new Date();
  let scopedItems = [];
  let uniqueItemCount = 0;

  // Create per-location rows for every scoped item×location snapshot cell.
  // Snapshot is StockBalance-only (no cartesian item×location product). Empty
  // balances must fail before COUNTING so export/upload are not a dead end.
  await prisma.$transaction(async (tx) => {
    await guardedSessionUpdate(tx, s, expectedVersion, {
      status: 'COUNTING',
      snapshotAt,
      currentRound: 1,
      updatedAt: new Date(),
    });

    const ensured = await ensureCountSheetCells(tx, tenantId, s, locationIds, 1, { useLiveBalances: true });
    scopedItems = ensured.scopedItems;
    uniqueItemCount = ensured.uniqueItemCount ?? scopedItems.length;

    if (!uniqueItemCount) {
      throw bizError(
        400,
        'COUNT_SESSION_EMPTY_SNAPSHOT',
        'Cannot start count: no stock balances found for the selected location(s). Receive or open stock first, then start again.',
        [{ field: 'locationIds', reason: 'No StockBalance rows in session scope' }],
      );
    }
  });

  return {
    id: s.id,
    status: 'COUNTING',
    snapshotAt,
    snapshotSource: (body && body.snapshotSource) || 'STOCK_BALANCE',
    currentRound: 1,
    locationCount: locationIds.length,
    itemsCount: uniqueItemCount,
    concurrencyVersion: (s.concurrencyVersion ?? 0) + 1,
  };
};

exports.cancelSession = async (tenantId, user, id, body = {}) => {
  assertCountCancelActor(user);
  const userId = user.id;
  const s = await mustGetSession(tenantId, id);
  if (s.status === 'VOID') {
    throw bizError(409, 'COUNT_SESSION_ALREADY_VOID', 'Session is already void.', [
      { field: 'status', reason: 'VOID' },
    ]);
  }
  const expectedVersion = parseSessionVersion(body);
  assertSessionConcurrency(s, expectedVersion, userId, { required: true });
  const cancelReason = String(body?.reason || '').trim();
  if (!cancelReason) {
    throw bizError(400, 'COUNT_SESSION_CANCEL_REASON_REQUIRED', 'Cancel reason is required.', [
      { field: 'reason', reason: 'Required' },
    ]);
  }
  // Fast-fail pre-checks (clear errors before opening a transaction). The
  // authoritative guard is the conditional update inside the transaction below,
  // so two concurrent cancels can never both succeed.
  if (!CANCELLABLE_STATUSES.includes(s.status)) {
    throw bizError(400, 'COUNT_SESSION_INVALID_STATE', 'Cancel is allowed only in DRAFT, COUNTING, or RECOUNTING before variance submit.', [
      { field: 'status', reason: `Expected DRAFT, COUNTING, or RECOUNTING, got ${s.status}` },
    ]);
  }

  const cancelledAt = new Date();
  await prisma.$transaction(async (tx) => {
    // Atomic guarded transition: only rows still in a cancellable state flip to
    // VOID. Under READ COMMITTED the second concurrent cancel blocks on the row
    // lock, then re-evaluates the WHERE against the committed VOID row → count 0.
    const guarded = await tx.stockCountSession.updateMany({
      where: {
        id: s.id,
        tenantId,
        status: { in: [...CANCELLABLE_STATUSES] },
        concurrencyVersion: Number(expectedVersion),
      },
      data: bumpConcurrencyUpdate({
        status: 'VOID',
        updatedAt: cancelledAt,
        notes: `${s.notes ? `${s.notes}\n\n` : ''}Voided on ${cancelledAt.toISOString()}. Reason: ${cancelReason}`,
      }),
    });

    if (guarded.count === 0) {
      const current = await tx.stockCountSession.findFirst({
        where: { id: s.id, tenantId },
        select: { status: true },
      });
      if (current?.status === 'VOID') {
        throw bizError(409, 'COUNT_SESSION_ALREADY_VOID', 'Session is already void.', [
          { field: 'status', reason: 'VOID' },
        ]);
      }
      throw bizError(409, 'COUNT_SESSION_CANCEL_CONFLICT', 'Cancel could not be applied due to a concurrent state change.', [
        { field: 'status', reason: current?.status || 'UNKNOWN' },
      ]);
    }

    if (s.approvalRequestId) {
      await tx.approvalStep.updateMany({
        where: { requestId: s.approvalRequestId },
        data: { status: 'CANCELLED' },
      });
      await tx.approvalRequest.update({
        where: { id: s.approvalRequestId },
        data: { status: 'CANCELLED', resolvedAt: cancelledAt },
      });
    }

    await writeAuditLogTransactional({
      tenantId,
      entityType: EntityType.STOCK_COUNT,
      entityId: s.id,
      action: 'CANCEL',
      changedBy: userId,
      note: `INVENTORY_COUNT_CANCELLED sessionNo=${s.sessionNo} reason=${cancelReason}`,
      beforeValue: { status: s.status },
      afterValue: { status: 'VOID', sessionNo: s.sessionNo },
      tx,
    });
  });

  return {
    id: s.id,
    status: 'VOID',
    cancelledAt,
    concurrencyVersion: (s.concurrencyVersion ?? 0) + 1,
  };
};

exports.getCountSheet = async (tenantId, sessionId, locationId, query = {}) => {
  const s = await mustGetSession(tenantId, sessionId);
  const locationIds = await getScopedLocationIds(s);
  const includeAllLocations = String(locationId || '').toUpperCase() === 'ALL';
  if (!includeAllLocations && !locationIds.includes(locationId)) {
    throw bizError(403, 'COUNT_SESSION_LOCATION_FORBIDDEN', 'Location is not part of this session.');
  }

  if (['COUNTING', 'RECOUNTING'].includes(s.status)) {
    await ensureCountSheetCells(prisma, tenantId, s, locationIds, s.currentRound, { useLiveBalances: false });
  }

  const page = Math.max(1, parseIntSafe(query.page, 1));
  const pageSize = Math.min(200, Math.max(1, parseIntSafe(query.pageSize, 50)));
  const skip = (page - 1) * pageSize;
  const search = String(query.search || '').trim();
  const onlyMissing = String(query.onlyMissing || '') === 'true';

  const where = {
    sessionId,
    roundNo: s.currentRound,
  };

  where.locationId = includeAllLocations ? { in: locationIds } : locationId;

  if (onlyMissing) where.countedQty = null;

  // Item search
  const itemWhere = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }
    : undefined;

  const [rows, total] = await Promise.all([
    prisma.stockCountLocationQty.findMany({
      where: { ...where, ...(itemWhere ? { item: itemWhere } : {}) },
      include: {
        item: { select: { id: true, name: true, barcode: true, code: true, imageUrl: true } },
        location: { select: { id: true, name: true } },
        countedByUser: { select: { firstName: true, lastName: true } },
      },
      orderBy: includeAllLocations
        ? [{ location: { name: 'asc' } }, { item: { name: 'asc' } }]
        : [{ item: { name: 'asc' } }],
      skip,
      take: pageSize,
    }),
    prisma.stockCountLocationQty.count({
      where: { ...where, ...(itemWhere ? { item: itemWhere } : {}) },
    }),
  ]);

  const isBlindCounting = !!s.blindMode && (s.status === 'COUNTING' || s.status === 'RECOUNTING');

  return {
    session: { id: s.id, status: s.status, blindMode: s.blindMode, currentRound: s.currentRound },
    location: includeAllLocations
      ? null
      : await prisma.location.findFirst({ where: { id: locationId, tenantId }, select: { id: true, name: true } }),
    page,
    pageSize,
    total,
    lines: rows.map((r) => ({
      itemId: r.itemId,
      locationId: r.locationId,
      locationName: r.location?.name || null,
      itemCode: r.item.code,
      barcode: r.item.barcode,
      name: r.item.name,
      imageUrl: r.item.imageUrl || null,
      count: {
        roundNo: r.roundNo,
        countedQty: r.countedQty != null ? Number(r.countedQty) : null,
        countedAt: r.countedAt,
        countedBy: r.countedByUser
          ? { name: `${r.countedByUser.firstName} ${r.countedByUser.lastName}` }
          : null,
      },
      book: isBlindCounting ? null : { bookQty: Number(r.bookQty), snapshotAt: s.snapshotAt },
      variance: isBlindCounting
        ? null
        : {
            varianceQty: Number(r.varianceQty),
            // value is an estimate for review; posting uses current WAC at posting time
            varianceValueEstimate: null,
            valuationBasis: 'CURRENT_WAC_AT_POSTING',
          },
    })),
  };
};

exports.updateCountedQty = async (tenantId, user, sessionId, locationId, itemId, body) => {
  assertCountExecuteActor(user);
  const userId = user.id;
  const s = await mustGetSession(tenantId, sessionId);
  const expectedVersion = parseSessionVersion(body);
  assertSessionConcurrency(s, expectedVersion, userId, { required: true });
  if (!['COUNTING', 'RECOUNTING'].includes(s.status)) {
    throw bizError(400, 'COUNT_SESSION_INVALID_STATE', 'Session must be COUNTING to update counts.', [
      { field: 'status', reason: `Got ${s.status}` },
    ]);
  }

  const locationIds = await getScopedLocationIds(s);
  if (!locationIds.includes(locationId)) {
    throw bizError(403, 'COUNT_SESSION_LOCATION_FORBIDDEN', 'Location is not part of this session.');
  }

  const roundNo = parseIntSafe(body.roundNo, s.currentRound);
  if (roundNo !== s.currentRound) {
    throw bizError(409, 'COUNT_SESSION_ROUND_CONFLICT', 'roundNo must match currentRound.', [
      { field: 'roundNo', reason: `Expected ${s.currentRound}, got ${roundNo}` },
    ]);
  }

  const countedQty = body.countedQty === null ? null : Number(body.countedQty);
  if (countedQty !== null && (!Number.isFinite(countedQty) || countedQty < 0)) {
    throw bizError(400, 'COUNT_SESSION_INVALID_QTY', 'countedQty must be a non-negative number.');
  }
  if (countedQty !== null) {
    try {
      assertIntegerQuantity({
        qty: countedQty,
        field: 'countedQty',
        message: 'Quantity must be a whole number (integer). Fractional quantities are not allowed.',
        details: { countedQty },
      });
    } catch (e) {
      throw bizError(e.statusCode || 422, e.code || 'NON_INTEGER_QUANTITY', e.message);
    }
  }

  const row = await prisma.stockCountLocationQty.findFirst({
    where: { sessionId, locationId, itemId, roundNo },
  });
  if (!row) {
    throw bizError(404, 'COUNT_SESSION_CELL_NOT_FOUND', 'Count cell not found for this item/location/round.');
  }

  const varianceQty = countedQty === null ? 0 : countedQty - Number(row.bookQty);

  const nextVersion = await prisma.$transaction(async (tx) => {
    await tx.stockCountLocationQty.update({
      where: { id: row.id },
      data: {
        countedQty: countedQty === null ? null : countedQty,
        varianceQty,
        countedBy: countedQty === null ? null : userId,
        countedAt: countedQty === null ? null : new Date(),
        countNote: body.countNote ? String(body.countNote).slice(0, 500) : null,
      },
    });
    return guardedSessionUpdate(tx, s, expectedVersion, { updatedAt: new Date() });
  });

  const updated = await prisma.stockCountLocationQty.findFirst({
    where: { id: row.id },
    include: {
      countedByUser: { select: { firstName: true, lastName: true } },
    },
  });

  const isBlindCounting = !!s.blindMode && (s.status === 'COUNTING' || s.status === 'RECOUNTING');

  return {
    itemId,
    locationId,
    roundNo,
    countedQty: updated.countedQty != null ? Number(updated.countedQty) : null,
    countedAt: updated.countedAt,
    countedBy: updated.countedByUser ? `${updated.countedByUser.firstName} ${updated.countedByUser.lastName}` : null,
    book: isBlindCounting ? null : { bookQty: Number(updated.bookQty), snapshotAt: s.snapshotAt },
    variance: isBlindCounting
      ? null
      : { varianceQty: Number(updated.varianceQty), valuationBasis: 'CURRENT_WAC_AT_POSTING' },
    concurrencyVersion: nextVersion,
  };
};

exports.submitCounts = async (tenantId, user, sessionId, body = {}) => {
  assertCountExecuteActor(user);
  const userId = user.id;
  const s = await mustGetSession(tenantId, sessionId);
  const expectedVersion = parseSessionVersion(body);
  assertSessionConcurrency(s, expectedVersion, userId, { required: true });
  if (!['COUNTING', 'RECOUNTING'].includes(s.status)) {
    throw bizError(400, 'COUNT_SESSION_INVALID_STATE', 'Session must be COUNTING to submit counts.');
  }

  const missing = await prisma.stockCountLocationQty.count({
    where: { sessionId, roundNo: s.currentRound, countedQty: null },
  });
  if (missing > 0) {
    throw bizError(400, 'COUNT_SESSION_MISSING_COUNTS', `Cannot submit: ${missing} cells are not counted.`, [
      { field: 'countedQty', reason: 'Some counts are missing' },
    ]);
  }

  const nextVersion = await prisma.$transaction(async (tx) =>
    guardedSessionUpdate(tx, s, expectedVersion, {
      status: 'REVEAL_REVIEW',
      updatedAt: new Date(),
    }),
  );

  await logAction({
    tenantId,
    entityType: EntityType.STOCK_COUNT,
    entityId: s.id,
    action: 'SUBMIT',
    changedBy: userId,
    note: `INVENTORY_COUNT_SUBMIT_COUNTS sessionNo=${s.sessionNo} countedReviewedBy=${userId}`,
    beforeValue: { status: s.status },
    afterValue: { status: 'REVEAL_REVIEW', sessionNo: s.sessionNo, countedReviewedBy: userId },
  });

  return {
    id: s.id,
    status: 'REVEAL_REVIEW',
    countLockedAt: new Date(),
    currentRound: s.currentRound,
    valuationBasis: 'CURRENT_WAC_AT_POSTING',
    concurrencyVersion: nextVersion,
  };
};

/**
 * Request a recount from variance review or reopen after rejection —
 * increments currentRound and returns to RECOUNTING sheet.
 */
exports.startRecount = async (tenantId, user, sessionId, body = {}) => {
  assertCountRecountActor(user);
  const userId = user.id;
  const s = await mustGetSession(tenantId, sessionId);
  const expectedVersion = parseSessionVersion(body);
  assertSessionConcurrency(s, expectedVersion, userId, { required: true });

  const allowedFrom = ['REVEAL_REVIEW', 'REJECTED'];
  if (!allowedFrom.includes(s.status)) {
    throw bizError(
      400,
      'COUNT_SESSION_INVALID_STATE',
      'Recount is allowed only during variance review (REVEAL_REVIEW) or after rejection (REJECTED).',
    );
  }

  const locationIds = await getScopedLocationIds(s);
  const nextRound = (s.currentRound || 1) + 1;
  const reason = String(body?.reason || '').trim() || null;
  if (s.status === 'REJECTED' && !reason) {
    throw bizError(
      400,
      'COUNT_RECOUNT_REASON_REQUIRED',
      'A reason is required to reopen a rejected count session for recount.',
    );
  }

  const priorStatus = s.status;

  const nextVersion = await prisma.$transaction(async (tx) => {
    if (priorStatus === 'REJECTED' && s.approvalRequestId) {
      await tx.approvalStep.updateMany({
        where: { requestId: s.approvalRequestId },
        data: { status: 'CANCELLED' },
      });
      await tx.approvalRequest.update({
        where: { id: s.approvalRequestId },
        data: { status: 'CANCELLED', resolvedAt: new Date() },
      });
    }

    const version = await guardedSessionUpdate(tx, s, expectedVersion, {
      status: 'RECOUNTING',
      currentRound: nextRound,
      updatedAt: new Date(),
      ...(priorStatus === 'REJECTED'
        ? {
            approvalRequestId: null,
            notes: `${s.notes ? `${s.notes}\n\n` : ''}[Recount reopen] ${reason}`,
          }
        : {}),
    });
    await ensureCountSheetCells(tx, tenantId, { ...s, currentRound: nextRound }, locationIds, nextRound, {
      useLiveBalances: false,
    });
    return version;
  });

  await logAction({
    tenantId,
    entityType: EntityType.STOCK_COUNT,
    entityId: s.id,
    action: 'UPDATE',
    changedBy: userId,
    note: `INVENTORY_COUNT_RECOUNT_REQUESTED sessionNo=${s.sessionNo} round=${nextRound}${
      reason ? ` reason=${reason}` : ''
    }`,
    beforeValue: { status: priorStatus, currentRound: s.currentRound },
    afterValue: { status: 'RECOUNTING', currentRound: nextRound },
  });

  return { id: s.id, status: 'RECOUNTING', currentRound: nextRound, concurrencyVersion: nextVersion };
};

function reduceFinalCells(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.itemId}:${r.locationId}`;
    const prev = map.get(key);
    if (!prev || r.roundNo > prev.roundNo) map.set(key, r);
  }
  return [...map.values()];
}

/**
 * Single source for IC variance rows + KPIs (API + evidence PDF).
 * `itemsWithVariance` = distinct items whose net variance qty !== 0 (not merely counted).
 */
async function computeSessionVarianceReview(tenantId, sessionId) {
  const rows = await prisma.stockCountLocationQty.findMany({
    where: { sessionId },
    include: {
      item: { select: { id: true, name: true, barcode: true, code: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: [{ itemId: 'asc' }, { locationId: 'asc' }, { roundNo: 'desc' }],
  });

  const finalCells = reduceFinalCells(rows).filter((r) => r.countedQty != null);

  let totalAbsVarianceQty = 0;
  // Value is an estimate; final posting uses WAC at posting time.
  let totalAbsVarianceValue = 0;
  let totalNetVarianceValue = 0;
  let incompleteValuationLines = 0;
  const valuationWarnings = [];
  const byItem = new Map();
  const flatLines = [];

  for (const c of finalCells) {
    const key = c.itemId;
    if (!byItem.has(key)) {
      byItem.set(key, {
        itemId: c.itemId,
        name: c.item.name,
        barcode: c.item.barcode,
        itemCode: c.item.code,
        locations: [],
        total: { bookQty: 0, countedQty: 0, varianceQty: 0, varianceValueEstimate: 0 },
      });
    }
    const row = byItem.get(key);
    const bookQty = Number(c.bookQty);
    const countedQty = Number(c.countedQty);
    const varianceQty = countedQty - bookQty;
    const resolved = await resolveUnitCost(prisma, {
      tenantId,
      itemId: c.itemId,
      locationId: c.locationId,
    });
    const { varianceValueEstimate, valuationBasis, incompleteValuation } = estimateVarianceValue(
      varianceQty,
      resolved.unitCost,
      resolved.valuationBasis,
    );
    if (incompleteValuation) {
      incompleteValuationLines += 1;
      valuationWarnings.push({
        itemId: c.itemId,
        locationId: c.locationId,
        varianceQty,
        valuationBasis: VALUATION_BASIS.MISSING_WAC,
        message:
          'Quantity variance exists but no WAC, GRN, or item price is available for financial valuation.',
      });
    }
    row.locations.push({
      locationId: c.locationId,
      bookQty,
      countedQty,
      varianceQty,
      varianceValueEstimate,
      unitCostUsed: resolved.unitCost,
      valuationBasis,
      incompleteValuation,
      wacAtLocation: resolved.wacAtLocation,
    });
    row.total.bookQty += bookQty;
    row.total.countedQty += countedQty;
    row.total.varianceQty += varianceQty;
    row.total.varianceValueEstimate += varianceValueEstimate;

    totalAbsVarianceQty += Math.abs(varianceQty);
    totalAbsVarianceValue += Math.abs(varianceValueEstimate);
    totalNetVarianceValue += varianceValueEstimate;

    flatLines.push({
      location: c.location?.name || c.locationId,
      item: c.item.name,
      barcode: c.item.barcode || '—',
      itemCode: c.item.code || '—',
      bookQty,
      countedQty,
      varianceQty,
      unitCost: resolved.unitCost,
      varianceValueEstimate,
      valuationBasis,
    });
  }

  const itemRows = [...byItem.values()];
  const itemsWithVariance = itemRows.filter((row) => Number(row.total.varianceQty) !== 0).length;

  return {
    rows: itemRows,
    flatLines,
    valuationWarnings,
    kpis: {
      totalAbsVarianceQty,
      totalAbsVarianceValue,
      totalNetVarianceValue,
      itemsWithVariance,
      incompleteValuationLines,
      linesCounted: flatLines.length,
    },
  };
}

exports.getVariances = async (tenantId, sessionId, query = {}) => {
  const s = await mustGetSession(tenantId, sessionId);
  if (
    ![
      'REVEAL_REVIEW',
      'PENDING_COST_CONTROL',
      'PENDING_DEPT',
      'PENDING_FINANCE',
      'PENDING_GM',
      'PENDING_APPROVAL',
      'FINANCE_APPROVED',
      'POSTED',
    ].includes(s.status)
  ) {
    throw bizError(400, 'COUNT_SESSION_INVALID_STATE', 'Variances are visible only after submit (REVEAL_REVIEW).');
  }

  const review = await computeSessionVarianceReview(tenantId, sessionId);

  return {
    session: {
      id: s.id,
      status: s.status,
      valuationBasis: 'GOVERNED_RESOLUTION_AT_REVIEW',
      postingValuationBasis: 'CURRENT_WAC_AT_POSTING',
    },
    kpis: {
      totalAbsVarianceQty: review.kpis.totalAbsVarianceQty,
      totalAbsVarianceValue: review.kpis.totalAbsVarianceValue,
      itemsWithVariance: review.kpis.itemsWithVariance,
      incompleteValuationLines: review.kpis.incompleteValuationLines,
    },
    valuationWarnings: review.valuationWarnings,
    rows: review.rows,
  };
};

exports.submitForApproval = async (tenantId, user, sessionId, body = {}) => {
  assertCountSubmitActor(user);
  const userId = user.id;
  const s = await mustGetSession(tenantId, sessionId);
  const expectedVersion = parseSessionVersion(body);
  assertSessionConcurrency(s, expectedVersion, userId, { required: true });
  if (s.status !== 'REVEAL_REVIEW') {
    throw bizError(400, 'COUNT_SESSION_INVALID_STATE', 'Session must be REVEAL_REVIEW to submit for approval.');
  }

  const pinnedId = await resolvePinnedVersionId(s, tenantId);
  const chain = pinnedId
    ? await require('./acc-workflow-runtime.service').resolveWorkflowByVersionId(pinnedId)
    : await resolveWorkflowForDocument({ moduleKey: 'STOCK_COUNT', tenantId });
  const roleCodes = chain.roleCodes || [];
  if (!roleCodes.length) {
    throw bizError(422, 'COUNT_ACC_WORKFLOW_REQUIRED', 'ACC published STOCK_COUNT workflow is required.');
  }

  const { status: submitStatus, pendingStepNumber, autoApproveStepNumbers } = submitApprovalProjection(chain);

  const request = await prisma.$transaction(async (tx) => {
    if (s.approvalRequestId) {
      await tx.approvalStep.updateMany({
        where: { requestId: s.approvalRequestId },
        data: { status: 'CANCELLED' },
      });
      await tx.approvalRequest.update({
        where: { id: s.approvalRequestId },
        data: { status: 'CANCELLED', resolvedAt: new Date() },
      });
    }
    const req = await tx.approvalRequest.create({
      data: {
        tenantId,
        requestType: 'COUNT_ADJUSTMENT',
        status: 'PENDING',
        StockCountSession: { connect: { id: s.id } },
        currentStep: pendingStepNumber,
        totalSteps: roleCodes.length,
        createdBy: userId,
        ...approvalRequestVersionPin(chain),
        steps: {
          create: buildApprovalStepCreates(roleCodes, {
            autoApproveStepNumbers,
            autoApprovedBy: userId,
          }),
        },
      },
    });
    await guardedSessionUpdate(tx, s, expectedVersion, {
      status: submitStatus,
      approvalRequestId: req.id,
      notes: body?.managementNotes || s.notes || null,
      updatedAt: new Date(),
    });
    return req;
  });

  await logAction({
    tenantId,
    entityType: EntityType.STOCK_COUNT,
    entityId: s.id,
    action: 'SUBMIT',
    changedBy: userId,
    note: `INVENTORY_COUNT_SUBMIT_FOR_APPROVAL sessionNo=${s.sessionNo} submittedBy=${userId}`,
    beforeValue: { status: 'REVEAL_REVIEW' },
    afterValue: {
      status: submitStatus,
      approvalRequestId: request.id,
      sessionNo: s.sessionNo,
      submittedBy: userId,
      accWorkflowVersionId: request.accWorkflowVersionId,
    },
  });

  return {
    id: s.id,
    status: submitStatus,
    approvalRequestId: request.id,
    concurrencyVersion: (s.concurrencyVersion ?? 0) + 1,
  };
};

exports.sendBack = async (tenantId, userId, user, sessionId, body = {}) => {
  const reason = normalizeReason(body?.reason);
  const requestedTarget = body?.targetStepNumber;

  let s = await mustGetSession(tenantId, sessionId);
  const expectedVersion = parseSessionVersion(body);
  assertSessionConcurrency(s, expectedVersion, userId, { required: true });
  if (!COUNT_APPROVAL_ACTIVE_STATUSES.includes(s.status)) {
    throw bizError(400, 'COUNT_SESSION_INVALID_STATE', 'Session is not in an approval step that supports Send Back.');
  }
  if (!s.approvalRequestId) {
    await prisma.$transaction(async (tx) => {
      await backfillCountApprovalRequest(s, tenantId, tx);
    });
    s = await mustGetSession(tenantId, sessionId);
  }

  const approval = s.approvalRequest;
  if (!approval) {
    throw bizError(404, 'COUNT_SESSION_NO_APPROVAL', 'Approval request missing.');
  }
  const currentStepNo = Number(approval.currentStep);
  const step = approval.steps?.find((st) => st.stepNumber === currentStepNo);
  if (!step || String(step.status || '').toUpperCase() !== 'PENDING') {
    throw bizError(400, 'COUNT_SESSION_NO_PENDING_STEP', 'No pending approval step found.');
  }
  assertCanActOnApprovalStep(step, user, s.status);
  if (normalizeRole(step.requiredRole?.code) === ROLE_DEPT_MANAGER) {
    await assertDepartmentManagerSessionScope(user, tenantId, s);
  }

  const allowedTargets = buildInventoryCountSendBackTargets(s, approval);
  let targetStepNo;
  if (requestedTarget == null || requestedTarget === '') {
    // Same omit default as GRN/Transfer
    targetStepNo = currentStepNo <= 1 ? 0 : currentStepNo - 1;
  } else {
    targetStepNo = Number(requestedTarget);
    if (!Number.isInteger(targetStepNo) || !allowedTargets.some((t) => t.stepNumber === targetStepNo)) {
      throw bizError(422, 'COUNT_SEND_BACK_INVALID_TARGET', 'Send Back target must be a prior workflow participant.');
    }
  }

  const chain = await resolveChainForSession(s, tenantId);
  // Creator (0) = IC operational desk REVEAL_REVIEW (resubmit); prior ACC steps = statusKey.
  // Same picker + forceTargetStepNumber contract as GRN/Transfer; only the zero-step status label differs by module.
  const returnStatus =
    targetStepNo === 0 ? 'REVEAL_REVIEW' : countStatusForPendingStep(chain, targetStepNo);
  const actedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const guarded = await tx.stockCountSession.updateMany({
      where: {
        id: s.id,
        tenantId,
        status: s.status,
        concurrencyVersion: Number(expectedVersion),
      },
      data: bumpConcurrencyUpdate({
        status: returnStatus,
        updatedAt: actedAt,
        ...(targetStepNo === 0 ? { notes: appendSendBackNotes(s.notes, reason) } : {}),
      }),
    });
    if (guarded.count === 0) {
      throw bizError(409, 'CONCURRENCY_CONFLICT', 'Document was modified by another user. Reload and try again.');
    }
    await executeWorkflowSendBackInTx(tx, {
      approvalRequest: approval,
      sourceStepNumber: currentStepNo,
      forceTargetStepNumber: targetStepNo,
      reason,
      userId,
      tenantId,
      entityType: EntityType.STOCK_COUNT,
      entityId: s.id,
      documentStatusBefore: s.status,
      documentStatusAfter: returnStatus,
    });
  });

  const refreshed = await mustGetSession(tenantId, sessionId);
  return {
    id: refreshed.id,
    status: refreshed.status,
    sendBackReason: reason,
    targetStepNumber: targetStepNo,
    concurrencyVersion: refreshed.concurrencyVersion ?? 0,
  };
};

exports.approve = async (tenantId, userId, user, sessionId, body = {}) => {
  let s = await mustGetSession(tenantId, sessionId);
  const expectedVersion = parseSessionVersion(body);
  assertSessionConcurrency(s, expectedVersion, userId, { required: true });
  if (!COUNT_APPROVAL_ACTIVE_STATUSES.includes(s.status)) {
    throw bizError(400, 'COUNT_SESSION_INVALID_STATE', 'Session is not pending approval.');
  }

  if (!s.approvalRequestId) {
    await prisma.$transaction(async (tx) => {
      await backfillCountApprovalRequest(s, tenantId, tx);
    });
    s = await mustGetSession(tenantId, sessionId);
  }
  if (!s.approvalRequestId) {
    throw bizError(400, 'COUNT_SESSION_NO_APPROVAL', 'Approval request missing.');
  }

  const chain = await resolveChainForSession(s, tenantId);
  const step = pendingApprovalStep(s.approvalRequest);
  if (!step) {
    throw bizError(400, 'COUNT_SESSION_NO_PENDING_STEP', 'No pending approval step found.');
  }
  const { required } = assertCanActOnApprovalStep(step, user, s.status);
  if (normalizeRole(required) === ROLE_DEPT_MANAGER) {
    await assertDepartmentManagerSessionScope(user, tenantId, s);
  }

  const comment = String(body?.comment || '').trim();
  const actedAt = new Date();
  const totalSteps = s.approvalRequest.totalSteps || step.stepNumber;
  const isFinalStep = step.stepNumber >= totalSteps;

  if (isFinalStep) {
    await checkPeriodLock(tenantId, resolveCountGovernanceDate(s));
  }

  const stepComment = comment || null;

  await prisma.$transaction(async (tx) => {
    await tx.approvalStep.update({
      where: { id: step.id },
      data: {
        status: 'APPROVED',
        actedByUser: { connect: { id: userId } },
        actedAt,
        comment: stepComment,
      },
    });

    if (isFinalStep) {
      await tx.approvalRequest.update({
        where: { id: s.approvalRequestId },
        data: { status: 'APPROVED', currentStep: step.stepNumber, resolvedAt: actedAt },
      });
    } else {
      const nextStepNo = step.stepNumber + 1;
      const nextStatus = countStatusForPendingStep(chain, nextStepNo);
      await tx.approvalRequest.update({
        where: { id: s.approvalRequestId },
        data: { status: 'PENDING', currentStep: nextStepNo },
      });
      await guardedSessionUpdate(tx, s, expectedVersion, {
        status: nextStatus,
        updatedAt: actedAt,
      });
    }
  });

  const intermediateStatus = isFinalStep ? null : countStatusForPendingStep(chain, step.stepNumber + 1);

  await logAction({
    tenantId,
    entityType: EntityType.STOCK_COUNT,
    entityId: s.id,
    action: 'COUNT_APPROVE',
    changedBy: userId,
    note: isFinalStep
      ? `INVENTORY_COUNT_APPROVE_FINAL sessionNo=${s.sessionNo} approvedBy=${userId} role=${required}`
      : `INVENTORY_COUNT_APPROVE_STEP sessionNo=${s.sessionNo} step=${step.stepNumber} approvedBy=${userId} role=${required}`,
    afterValue: {
      approvalRequestId: s.approvalRequestId,
      sessionNo: s.sessionNo,
      stepNumber: step.stepNumber,
      final: isFinalStep,
      status: intermediateStatus,
    },
  });

  if (!isFinalStep) {
    return {
      id: s.id,
      status: intermediateStatus,
      approvalRequestId: s.approvalRequestId,
    };
  }

  let postingSummary;
  try {
    postingSummary = await postingEngine.postInventoryCountSession(sessionId, tenantId, userId);
  } catch (err) {
    if (err?.code === 'COUNT_POLICY_B_STOCK_CHANGED') {
      throw bizError(
        409,
        'COUNT_POLICY_B_STOCK_CHANGED',
        'Live stock kept changing while the inventory count was posting. Retry posting from the current stock balance.',
        err.details ? [err.details] : [],
      );
    }
    throw err;
  }

  return {
    id: s.id,
    status: 'POSTED',
    postedAt: postingSummary.postedAt,
    postingSummary,
  };
};

exports.reject = async (tenantId, userId, user, sessionId, body = {}) => {
  let s = await mustGetSession(tenantId, sessionId);
  const expectedVersion = parseSessionVersion(body);
  assertSessionConcurrency(s, expectedVersion, userId, { required: true });
  if (!COUNT_APPROVAL_ACTIVE_STATUSES.includes(s.status)) {
    throw bizError(400, 'COUNT_SESSION_INVALID_STATE', 'Session is not pending approval.');
  }
  const reason = String(body?.reason || '').trim();
  if (!reason) throw bizError(400, 'COUNT_SESSION_REJECT_REASON_REQUIRED', 'Reject reason is required.');

  if (!s.approvalRequestId) {
    await prisma.$transaction(async (tx) => {
      await backfillCountApprovalRequest(s, tenantId, tx);
    });
    s = await mustGetSession(tenantId, sessionId);
  }

  const step = pendingApprovalStep(s.approvalRequest);
  if (!step) {
    throw bizError(400, 'COUNT_SESSION_NO_PENDING_STEP', 'No pending approval step found.');
  }
  assertCanActOnApprovalStep(step, user, s.status);

  const actedAt = new Date();

  await prisma.$transaction(async (tx) => {
    if (s.approvalRequestId) {
      await tx.approvalStep.update({
        where: { id: step.id },
        data: { status: 'REJECTED', actedByUser: { connect: { id: userId } }, actedAt, comment: reason },
      });
      await tx.approvalRequest.update({
        where: { id: s.approvalRequestId },
        data: { status: 'REJECTED', currentStep: step.stepNumber, resolvedAt: actedAt },
      });
    }
    await guardedSessionUpdate(tx, s, expectedVersion, {
      status: 'REJECTED',
      notes: `${s.notes ? s.notes + '\n\n' : ''}Rejected: ${reason}`,
    });
  });

  await logAction({
    tenantId,
    entityType: EntityType.STOCK_COUNT,
    entityId: s.id,
    action: 'COUNT_REJECT',
    changedBy: userId,
    note: `INVENTORY_COUNT_REJECT sessionNo=${s.sessionNo}`,
    afterValue: { rejectReason: reason, sessionNo: s.sessionNo },
  });

  return { id: s.id, status: 'REJECTED', rejectReason: reason };
};

/** Load Item Master image bytes for Excel embed (read-only; no new storage). */
async function loadItemImageBuffer(imageKey) {
  if (!imageKey) return null;
  const normalized = String(imageKey).trim();
  if (!normalized) return null;

  try {
    if (/^https?:\/\//i.test(normalized)) {
      const response = await fetch(normalized);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    }

    if (normalized.startsWith('tenants/')) {
      const storage = getStorage();
      const signed = await storage.getSignedUrl(normalized);
      if (!signed) return null;
      const response = await fetch(signed);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    }

    const backendRoot = path.join(__dirname, '../..');
    const localPath = normalized.startsWith('/uploads/')
      ? path.join(backendRoot, normalized.replace(/^\/+/, ''))
      : normalized.includes('/uploads/')
        ? path.join(backendRoot, normalized.substring(normalized.indexOf('/uploads/') + 1))
        : path.isAbsolute(normalized)
          ? normalized
          : path.join(backendRoot, 'uploads', path.basename(normalized));

    return fs.existsSync(localPath) ? fs.readFileSync(localPath) : null;
  } catch {
    return null;
  }
}

/** ExcelJS embed — square PNG thumb; display via tl+ext (fixed px, no stretch). */
const EXCEL_IMAGE_COL_WIDTH = 14;
const EXCEL_IMAGE_ROW_HEIGHT_PT = 52;
const EXCEL_IMAGE_DISPLAY_PX = 46;

async function prepareExcelImageEmbed(imageKey) {
  const raw = await loadItemImageBuffer(imageKey);
  if (!raw) return null;

  try {
    const sharp = require('sharp');
    const pngBuffer = await sharp(raw, { failOn: 'error' })
      .rotate()
      .resize(EXCEL_IMAGE_DISPLAY_PX, EXCEL_IMAGE_DISPLAY_PX, {
        fit: 'cover',
        position: 'centre',
      })
      .png()
      .toBuffer();
    return { buffer: pngBuffer, extension: 'png' };
  } catch {
    return null;
  }
}

/** Center a fixed-size image inside the Image column cell (0-based col index). */
function excelImageCellPlacement(imageColIndex, excelRow1Based) {
  const row0 = excelRow1Based - 1;
  const colWidthPx = Math.round(EXCEL_IMAGE_COL_WIDTH * 7 + 5);
  const rowHeightPx = Math.round(EXCEL_IMAGE_ROW_HEIGHT_PT * (96 / 72));
  const img = EXCEL_IMAGE_DISPLAY_PX;
  const colOffset = Math.max(0, (colWidthPx - img) / 2) / colWidthPx;
  const rowOffset = Math.max(0, (rowHeightPx - img) / 2) / rowHeightPx;
  return {
    tl: { col: imageColIndex + colOffset, row: row0 + rowOffset },
    ext: { width: img, height: img },
    editAs: 'oneCell',
  };
}

function excelImageExtension(imageKey) {
  const ext = path.extname(String(imageKey || '')).toLowerCase();
  if (ext === '.png') return 'png';
  if (ext === '.gif') return 'gif';
  if (ext === '.webp') return 'png';
  return 'jpeg';
}

function excelSafeSheetName(name) {
  const cleaned = String(name || 'Sheet')
    .replace(/[\[\]\*\/\\\?\:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 31) || 'Sheet';
}

/** Shared layout contract — export and upload must stay aligned. */
const COUNT_EXCEL_DATA_HEADER_ROW = 7;
const COUNT_EXCEL_FOOTER_MARKERS = [
  'floor verification',
  'counted by __',
  'reviewed by __',
  'counted by ____________________',
  'reviewed by ____________________',
  'dx ose — inventory count sheet',
  'operational floor count sheet — write',
];

function exportItemCode(item, itemId) {
  const code = item?.code != null ? String(item.code).trim() : '';
  if (code) return code;
  const barcode = item?.barcode != null ? String(item.barcode).trim() : '';
  if (barcode) return barcode;
  return String(itemId);
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  );
}

function findCountSheetHeaderRowIndex(ws, fallback = COUNT_EXCEL_DATA_HEADER_ROW - 1) {
  const ref = ws['!ref'];
  if (!ref) return fallback;
  const range = XLSX.utils.decode_range(ref);
  for (let r = 0; r <= Math.min(range.e.r, 30); r++) {
    const vals = [];
    for (let c = 0; c <= Math.min(range.e.c, 14); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell != null && cell.v != null && cell.v !== '') {
        vals.push(String(cell.v).trim().toLowerCase());
      }
    }
    if (!vals.length) continue;
    const hasItem = vals.some((v) => v === 'item name' || v.startsWith('item name'));
    const hasCounted = vals.some((v) => v.includes('counted qty') || v === 'counted');
    const hasNum = vals[0] === '#' || vals.includes('#');
    if (hasItem && hasCounted && (hasNum || vals.includes('itemid') || vals.includes('internal itemid'))) {
      return r;
    }
    if (hasItem && hasCounted) return r;
  }
  return fallback;
}

function isCountSheetMetaOrFooterRow(row) {
  const text = Object.values(row)
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!text) return true;
  return COUNT_EXCEL_FOOTER_MARKERS.some((m) => text.includes(m));
}

function isCountSheetDataRow(row) {
  if (isCountSheetMetaOrFooterRow(row)) return false;
  const itemId = String(
    pickRowValue(row, ['ItemId', 'itemId', 'Internal ItemId', 'internalItemId']) || '',
  ).trim();
  const code = String(pickRowValue(row, ['Item Code', 'itemCode', 'Code', 'code', 'SKU', 'sku']) || '').trim();
  const barcode = String(pickRowValue(row, ['Barcode', 'barcode']) || '').trim();
  const name = String(pickRowValue(row, ['Item Name', 'Item', 'name']) || '').trim();
  const qty = pickRowValue(row, ['Counted Qty', 'Counted', 'countedQty', 'Qty', 'qty']);
  const num = String(pickRowValue(row, ['#', 'num', 'Num']) || '').trim();
  if (num && !/^\d+$/.test(num) && !itemId && !code && !barcode) return false;
  if (!itemId && !code && !barcode && !name) {
    return !(qty !== '' && qty !== undefined && qty !== null);
  }
  return true;
}

function parseCountSheetUploadRows(ws) {
  const headerRowIndex = findCountSheetHeaderRowIndex(ws);
  let rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRowIndex });
  if (!rawRows.length && headerRowIndex !== 3) {
    rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', range: 3 });
  }
  if (!rawRows.length) {
    rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  }
  const excelHeaderRow = headerRowIndex + 1;
  const rows = [];
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!isCountSheetDataRow(row)) continue;
    rows.push({ row, excelRowNo: excelHeaderRow + 1 + i });
  }
  return { rows, headerRowIndex, excelHeaderRow };
}

function collectCountSheetUploadRows(wb, opts = {}) {
  if (opts.locationId) {
    let ws = wb.Sheets[wb.SheetNames[0]];
    if (opts.locationName) {
      const safeName = excelSafeSheetName(opts.locationName);
      const matchedSheet =
        wb.SheetNames.find((n) => n === safeName) ||
        wb.SheetNames.find((n) => n.toLowerCase() === safeName.toLowerCase());
      if (matchedSheet) ws = wb.Sheets[matchedSheet];
    }
    return parseCountSheetUploadRows(ws).rows;
  }
  const allRows = [];
  for (const sheetName of wb.SheetNames) {
    const parsed = parseCountSheetUploadRows(wb.Sheets[sheetName]);
    allRows.push(...parsed.rows);
  }
  return allRows;
}

function writeCountSheetMetaTriple(ws, row, labelStyle, valueStyle, left, mid, right) {
  const writePair = (startCol, pair) => {
    if (!pair) return;
    ws.getCell(row, startCol).value = pair.label;
    ws.getCell(row, startCol).style = labelStyle;
    ws.getCell(row, startCol + 1).value = pair.value ?? '—';
    ws.getCell(row, startCol + 1).style = valueStyle;
  };
  writePair(1, left);
  writePair(4, mid);
  writePair(7, right);
}

exports.exportExcel = async (tenantId, sessionId, opts = {}) => {
  const ExcelJS = require('exceljs');
  const s = await mustGetSession(tenantId, sessionId);
  const locationIds = await getScopedLocationIds(s);

  const requestedLoc = opts.locationId;
  if (requestedLoc && !locationIds.includes(requestedLoc)) {
    throw bizError(403, 'COUNT_SESSION_LOCATION_FORBIDDEN', 'Location is not part of this session.');
  }

  const isBlind = !!s.blindMode;
  const roundNo = s.currentRound || 1;
  const countDateLabel = s.countDate
    ? new Date(s.countDate).toLocaleDateString('en-GB')
    : '—';
  const snapshotLabel = s.snapshotAt ? new Date(s.snapshotAt).toLocaleString('en-GB') : 'Pending start';

  const [department, locations] = await Promise.all([
    s.departmentId
      ? prisma.department.findFirst({ where: { tenantId, id: s.departmentId }, select: { name: true } })
      : null,
    prisma.location.findMany({
      where: { tenantId, id: { in: requestedLoc ? [requestedLoc] : locationIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'DX OSE Inventory';
  wb.created = new Date();

  const DX_NAVY = 'FF1F3B63';
  const DX_GOLD = 'FFD4A84B';
  const DX_SLATE = 'FF475569';
  const DX_BORDER = 'FFCBD5E1';
  const DX_COUNT_FILL = 'FFFFF7E6';
  const DATA_HEADER_ROW = COUNT_EXCEL_DATA_HEADER_ROW;

  const headerStyle = {
    font: { bold: true, size: 10, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: DX_NAVY } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: {
      top: { style: 'thin', color: { argb: DX_BORDER } },
      left: { style: 'thin', color: { argb: DX_BORDER } },
      bottom: { style: 'thin', color: { argb: DX_BORDER } },
      right: { style: 'thin', color: { argb: DX_BORDER } },
    },
  };
  const dataBorder = {
    top: { style: 'thin', color: { argb: DX_BORDER } },
    left: { style: 'thin', color: { argb: DX_BORDER } },
    bottom: { style: 'thin', color: { argb: DX_BORDER } },
    right: { style: 'thin', color: { argb: DX_BORDER } },
  };
  const metaLabelStyle = {
    font: { bold: true, size: 9, color: { argb: DX_SLATE } },
    alignment: { vertical: 'middle' },
  };
  const metaValueStyle = {
    font: { size: 10, color: { argb: 'FF0F172A' } },
    alignment: { vertical: 'middle' },
  };

  for (const loc of locations) {
    const lastCol = isBlind ? 'J' : 'K';
    const ws = wb.addWorksheet(excelSafeSheetName(loc.name), {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
      headerFooter: {
        oddFooter: '&L&D &T&C DX OSE — Inventory Count&RPage &P of &N',
      },
    });

    ws.mergeCells(`A1:${lastCol}1`);
    ws.getCell('A1').value = 'DX OSE — INVENTORY COUNT SHEET';
    ws.getCell('A1').style = {
      font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: DX_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    };
    ws.getRow(1).height = 32;

    ws.mergeCells(`A2:${lastCol}2`);
    ws.getCell('A2').value = 'Operational floor count sheet — write physical quantities in the Counted Qty column';
    ws.getCell('A2').style = {
      font: { size: 9, italic: true, color: { argb: DX_SLATE } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    };
    ws.getRow(2).height = 18;

    ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DX_GOLD } };
    ws.mergeCells(`A3:${lastCol}3`);
    ws.getRow(3).height = 4;

    writeCountSheetMetaTriple(
      ws,
      4,
      metaLabelStyle,
      metaValueStyle,
      { label: 'Session', value: s.sessionNo },
      { label: 'Location / store', value: loc.name },
      { label: 'Round', value: roundNo },
    );
    writeCountSheetMetaTriple(
      ws,
      5,
      metaLabelStyle,
      metaValueStyle,
      { label: 'Count date', value: countDateLabel },
      { label: 'Department', value: department?.name || 'All' },
      { label: 'Blind mode', value: isBlind ? 'Yes' : 'No' },
    );
    writeCountSheetMetaTriple(
      ws,
      6,
      metaLabelStyle,
      metaValueStyle,
      { label: 'Snapshot frozen', value: snapshotLabel },
      { label: 'Printed', value: new Date().toLocaleString('en-GB') },
      null,
    );
    ws.getRow(4).height = 20;
    ws.getRow(5).height = 20;
    ws.getRow(6).height = 20;

    const cols = [
      { header: '#', key: 'num', width: 5 },
      { header: 'Image', key: 'image', width: EXCEL_IMAGE_COL_WIDTH, imageCol: true },
      { header: 'Item Name', key: 'name', width: 30 },
      { header: 'Barcode', key: 'barcode', width: 14 },
      { header: 'Item Code', key: 'code', width: 18 },
      { header: 'UOM', key: 'uom', width: 8 },
      { header: 'Internal ItemId', key: 'itemId', width: 38, hidden: true },
      { header: 'LocationId', key: 'locationId', width: 38, hidden: true },
      { header: 'RoundNo', key: 'roundNo', width: 8, hidden: true },
      { header: 'Counted Qty', key: 'countedQty', width: 14, countCol: true },
    ];

    if (!isBlind) {
      cols.push({
        header: 'Snapshot Qty',
        key: 'bookQty',
        width: 14,
        note: 'Frozen quantity captured at snapshot time.',
      });
    }

    ws.columns = cols.map((c) => ({ key: c.key, width: c.width, hidden: !!c.hidden }));

    const headerRow = ws.getRow(DATA_HEADER_ROW);
    headerRow.height = 32;
    cols.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.style = headerStyle;
      if (c.note) {
        cell.note = c.note;
      }
    });
    ws.views = [{ state: 'frozen', ySplit: DATA_HEADER_ROW, showGridLines: true }];

    const rows = await prisma.stockCountLocationQty.findMany({
      where: { sessionId: s.id, locationId: loc.id, roundNo },
      include: {
        item: {
          select: {
            name: true,
            barcode: true,
            code: true,
            imageUrl: true,
            itemUnits: { where: { isDefault: true }, include: { unit: true } },
          },
        },
      },
      orderBy: { item: { name: 'asc' } },
    });

    const countedColIndex = cols.findIndex((c) => c.key === 'countedQty') + 1;
    const nameColIndex = cols.findIndex((c) => c.key === 'name') + 1;
    const imageColIndex = cols.findIndex((c) => c.key === 'image');
    const imageColNumber = imageColIndex + 1;

    for (let idx = 0; idx < rows.length; idx += 1) {
      const r = rows[idx];
      const uom = r.item.itemUnits?.[0]?.unit?.abbreviation || r.item.itemUnits?.[0]?.unit?.name || '';
      const counted = r.countedQty != null ? Number(r.countedQty) : null;
      const book = Number(r.bookQty);

      const row = ws.addRow({
        num: idx + 1,
        image: '',
        name: r.item.name,
        barcode: r.item.barcode || '',
        code: exportItemCode(r.item, r.itemId),
        uom,
        itemId: r.itemId,
        locationId: r.locationId,
        roundNo: r.roundNo,
        countedQty: counted,
        ...(isBlind ? {} : { bookQty: book }),
      });
      row.height = EXCEL_IMAGE_ROW_HEIGHT_PT;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > cols.length) return;
        cell.border = dataBorder;
        cell.alignment = { vertical: 'middle', wrapText: colNumber === nameColIndex };
        if (colNumber === imageColNumber) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
        if (colNumber === countedColIndex) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DX_COUNT_FILL } };
          cell.font = { size: 11, bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
        if (['bookQty', 'num'].includes(cols[colNumber - 1]?.key)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          if (cols[colNumber - 1]?.key === 'num') cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });

      const imageKey = r.item.imageUrl;
      if (!imageKey || imageColIndex < 0) continue;
      const prepared = await prepareExcelImageEmbed(imageKey);
      if (!prepared) continue;

      try {
        const imageId = wb.addImage({ buffer: prepared.buffer, extension: prepared.extension });
        const excelRow = DATA_HEADER_ROW + 1 + idx;
        ws.addImage(imageId, excelImageCellPlacement(imageColIndex, excelRow));
      } catch {
        // Best-effort visual aid — skip broken images without failing export.
      }
    }

    const lastDataRow = rows.length > 0 ? ws.lastRow.number : DATA_HEADER_ROW;
    const sigStart = lastDataRow + 2;
    ws.mergeCells(`A${sigStart}:${lastCol}${sigStart}`);
    ws.getCell(`A${sigStart}`).value =
      'Counted By ____________________  Date __________    |    Reviewed By ____________________  Date __________';
    ws.getCell(`A${sigStart}`).style = {
      font: { size: 9, color: { argb: DX_SLATE } },
      alignment: { vertical: 'middle' },
    };
    ws.getRow(sigStart).height = 18;
  }

  return wb.xlsx.writeBuffer();
};

exports.exportPdf = async (tenantId, sessionId) => {
  const s = await mustGetSession(tenantId, sessionId);
  if (s.status !== 'POSTED') {
    throw bizError(400, 'COUNT_SESSION_INVALID_STATE', 'PDF is available only after the session is posted.');
  }

  const locationIds = await getScopedLocationIds(s);
  const [department, tenant, createdByUser, submittedByUser, review, locations, ledgerEntries] = await Promise.all([
    s.departmentId
      ? prisma.department.findFirst({ where: { tenantId, id: s.departmentId }, select: { name: true } })
      : null,
    prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true } }),
    s.createdBy
      ? prisma.user.findUnique({ where: { id: s.createdBy }, select: { firstName: true, lastName: true } })
      : null,
    s.approvalRequest?.createdBy
      ? prisma.user.findUnique({ where: { id: s.approvalRequest.createdBy }, select: { firstName: true, lastName: true } })
      : null,
    computeSessionVarianceReview(tenantId, s.id),
    prisma.location.findMany({
      where: { tenantId, id: { in: locationIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.inventoryLedger.findMany({
      where: {
        tenantId,
        referenceType: 'COUNT_SESSION',
        referenceId: s.id,
      },
      select: {
        itemId: true,
        locationId: true,
        movementType: true,
        qtyIn: true,
        qtyOut: true,
        totalValue: true,
        postingDate: true,
        assignedPostingPeriod: true,
        createdAt: true,
      },
      orderBy: [
        { postingDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
    }),
  ]);

  // Same variance source as GET .../variances; keep prior PDF row order (location → item).
  const lines = [...review.flatLines].sort((a, b) => {
    const byLocation = String(a.location || '').localeCompare(String(b.location || ''));
    if (byLocation !== 0) return byLocation;
    return String(a.item || '').localeCompare(String(b.item || ''));
  });

  const { buildInventoryCountTimelineRawEntries } = require('../platform/timeline/inventoryCountTimeline.builder');
  const { buildTimelineEntries } = require('../platform/timeline/timelineEntry.merge');
  const {
    mapTimelineEntriesToPdfApprovalWorkflow,
    PDF_LIFECYCLE_TYPES,
  } = require('./evidence-pdf-approval-from-timeline.util');

  const auditEvents = await prisma.auditLog.findMany({
    where: { tenantId, entityType: 'STOCK_COUNT', entityId: String(s.id) },
    orderBy: { changedAt: 'asc' },
    take: 200,
    include: { changedByUser: { select: { id: true, firstName: true, lastName: true } } },
  });
  const roundRows = await prisma.stockCountLocationQty.findMany({
    where: { sessionId: s.id, countedQty: { not: null } },
    select: { roundNo: true },
    distinct: ['roundNo'],
  });
  const roundNumbers = roundRows.map((r) => r.roundNo).sort((a, b) => a - b);
  const rawTimeline = buildInventoryCountTimelineRawEntries(s, auditEvents, { roundNumbers });
  const timelineEntries = buildTimelineEntries([rawTimeline]);
  const hasLifecycle = timelineEntries.some(
    (e) =>
      e.entryType === 'LIFECYCLE_EVENT' &&
      PDF_LIFECYCLE_TYPES.has(String(e.lifecycleEventType || '').toUpperCase()),
  );

  let approvalHistory;
  if (hasLifecycle) {
    const mapped = mapTimelineEntriesToPdfApprovalWorkflow(timelineEntries, {
      moduleKey: 'INVENTORY_COUNT',
      ensurePostingSlot: true,
      includeMilestones: true,
      includeCountSubmit: false,
      postedAt: s.postingDate || s.postedAt,
      postedBy: 'Auto posted by DX',
    });
    approvalHistory = mapped.approvalHistory.length
      ? mapped.approvalHistory
      : mapSlotsToPdfApprovalHistory(await buildInventoryCountWorkflowTimelineForSession(tenantId, s));
  } else {
    approvalHistory = mapSlotsToPdfApprovalHistory(
      await buildInventoryCountWorkflowTimelineForSession(tenantId, s),
    );
  }

  const payload = {
    sessionInfo: {
      sessionNo: s.sessionNo,
      status: s.status,
      roundNo: s.currentRound,
      blindMode: !!s.blindMode,
      tenantName: tenant?.name || 'DX OSE Hotels',
      primaryLocation: s.location?.name || '—',
      scope: {
        department: department?.name || 'All departments',
        locations: locations.map((location) => location.name),
      },
      createdAt: s.createdAt,
      createdBy: userDisplayName(createdByUser) || 'System user',
      snapshotAt: s.snapshotAt,
      postedAt: s.postingDate || s.postedAt,
      assignedPostingPeriod: s.assignedPostingPeriod || null,
    },
    kpis: {
      linesCounted: review.kpis.linesCounted,
      itemsWithVariance: review.kpis.itemsWithVariance,
      totalAbsVarianceQty: review.kpis.totalAbsVarianceQty,
      totalAbsVarianceValue: review.kpis.totalAbsVarianceValue,
      totalNetVarianceValue: review.kpis.totalNetVarianceValue,
      ledgerEntries: ledgerEntries.length,
      totalQtyIn: ledgerEntries.reduce((sum, row) => sum + Number(row.qtyIn || 0), 0),
      totalQtyOut: ledgerEntries.reduce((sum, row) => sum + Number(row.qtyOut || 0), 0),
      totalLedgerValue: ledgerEntries.reduce((sum, row) => sum + Math.abs(Number(row.totalValue || 0)), 0),
    },
    approvalHistory,
    lines,
  };

  return renderInventoryCountEvidencePdf(payload);
};

function normalizeHeaderKey(k) {
  return String(k || '').trim().toLowerCase();
}

function pickRowValue(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }
  // fallback: case-insensitive keys
  const map = new Map(Object.keys(row).map((x) => [normalizeHeaderKey(x), x]));
  for (const k of keys) {
    const actual = map.get(normalizeHeaderKey(k));
    if (actual) return row[actual];
  }
  return undefined;
}

exports.uploadExcel = async (tenantId, user, sessionId, fileBuffer, opts = {}) => {
  assertCountExecuteActor(user);
  const userId = user.id;
  const s = await mustGetSession(tenantId, sessionId);
  if (!['COUNTING', 'RECOUNTING'].includes(s.status)) {
    throw bizError(400, 'COUNT_UPLOAD_INVALID_STATE', 'Upload allowed only in COUNTING / RECOUNTING.');
  }
  assertSessionConcurrency(s, opts.concurrencyVersion, userId, { required: true });

  const locationIds = await getScopedLocationIds(s);
  const roundNo = opts.roundNo ? parseIntSafe(opts.roundNo, s.currentRound) : s.currentRound;
  if (roundNo !== s.currentRound) {
    throw bizError(409, 'COUNT_SESSION_ROUND_CONFLICT', 'roundNo must match currentRound.', [
      { field: 'roundNo', reason: `Expected ${s.currentRound}, got ${roundNo}` },
    ]);
  }

  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  let uploadSheetOpts = { locationId: opts.locationId || null };
  if (opts.locationId) {
    const uploadLoc = await prisma.location.findFirst({
      where: { tenantId, id: opts.locationId },
      select: { name: true },
    });
    if (uploadLoc) {
      uploadSheetOpts = { ...uploadSheetOpts, locationName: uploadLoc.name };
    }
  }

  const snapshotCellCount = await prisma.stockCountLocationQty.count({
    where: {
      sessionId,
      roundNo,
      ...(opts.locationId ? { locationId: opts.locationId } : {}),
    },
  });
  if (!snapshotCellCount) {
    throw bizError(
      400,
      'COUNT_UPLOAD_EMPTY_SNAPSHOT',
      'This count session has no snapshot lines for the selected location. Excel upload can only update items frozen at start — cancel this session, ensure stock exists at the location, then create and start a new count.',
    );
  }

  const uploadRows = collectCountSheetUploadRows(wb, uploadSheetOpts);
  if (!uploadRows.length) {
    throw bizError(
      400,
      'COUNT_UPLOAD_NO_DATA',
      'No data rows found in sheet. Download Export sheet from this session, edit only the Counted Qty column, and upload that file without changing headers.',
    );
  }

  // Build maps for matching (itemId → code → barcode → name)
  const itemIds = [];
  const barcodes = [];
  const itemCodes = [];
  const itemNames = [];

  for (const { row: r } of uploadRows) {
    const itemId = String(
      pickRowValue(r, ['Internal ItemId', 'ItemId', 'itemId', 'internalItemId']) || '',
    ).trim();
    const barcode = String(pickRowValue(r, ['Barcode', 'barcode']) || '').trim();
    const code = String(pickRowValue(r, ['Item Code', 'itemCode', 'Code', 'code', 'SKU', 'sku']) || '').trim();
    const name = String(pickRowValue(r, ['Item Name', 'Item', 'name']) || '').trim();
    if (itemId) itemIds.push(itemId);
    if (barcode) barcodes.push(barcode);
    if (code) {
      itemCodes.push(code);
      if (isUuidLike(code)) itemIds.push(code);
    }
    if (name) itemNames.push(name);
  }

  const items = await prisma.item.findMany({
    where: {
      tenantId,
      OR: [
        ...(itemIds.length ? [{ id: { in: itemIds } }] : []),
        ...(barcodes.length ? [{ barcode: { in: barcodes } }] : []),
        ...(itemCodes.length ? [{ code: { in: itemCodes } }] : []),
        ...(itemNames.length ? [{ name: { in: itemNames } }] : []),
      ],
    },
    select: { id: true, name: true, barcode: true, code: true },
  });
  const byId = new Map(items.map((i) => [i.id.toLowerCase(), i.id]));
  const byBarcode = new Map(items.filter((i) => i.barcode).map((i) => [String(i.barcode).toLowerCase(), i.id]));
  const byCode = new Map(items.filter((i) => i.code).map((i) => [String(i.code).toLowerCase(), i.id]));
  const byName = new Map(items.map((i) => [i.name.toLowerCase(), i.id]));

  // Duplicates detection (after resolving itemId+locationId)
  const seen = new Map(); // key -> { rows: number[], matchedBy: string }
  const updates = []; // { itemId, locationId, countedQty, rowNo, matchedBy }
  const errors = [];

  for (const { row, excelRowNo: rowNo } of uploadRows) {
    const rawLocId = String(pickRowValue(row, ['LocationId', 'locationId']) || '').trim();
    const locationId = opts.locationId || rawLocId;
    if (!locationId) {
      errors.push({ row: rowNo, error: 'Missing locationId (provide in file or request).' });
      continue;
    }
    if (!locationIds.includes(locationId)) {
      errors.push({ row: rowNo, error: 'Location outside session scope.', locationId });
      continue;
    }

    const rawItemId = String(
      pickRowValue(row, ['Internal ItemId', 'ItemId', 'itemId', 'internalItemId']) || '',
    ).trim();
    const rawBarcode = String(pickRowValue(row, ['Barcode', 'barcode']) || '').trim().toLowerCase();
    const rawCodeRaw = String(pickRowValue(row, ['Item Code', 'itemCode', 'Code', 'code', 'SKU', 'sku']) || '').trim();
    const rawCode = rawCodeRaw.toLowerCase();
    const rawName = String(pickRowValue(row, ['Item Name', 'Item', 'name']) || '').trim().toLowerCase();

    let resolvedItemId = null;
    let matchedBy = null;
    if (rawItemId) {
      resolvedItemId = byId.get(rawItemId.toLowerCase()) || null;
      matchedBy = resolvedItemId ? 'itemId' : null;
    }
    if (!resolvedItemId && rawCodeRaw && isUuidLike(rawCodeRaw)) {
      resolvedItemId = byId.get(rawCode) || null;
      matchedBy = resolvedItemId ? 'itemId' : matchedBy;
    }
    if (!resolvedItemId && rawCode) {
      resolvedItemId = byCode.get(rawCode) || null;
      matchedBy = resolvedItemId ? 'itemCode' : matchedBy;
    }
    if (!resolvedItemId && rawBarcode) {
      resolvedItemId = byBarcode.get(rawBarcode) || null;
      matchedBy = resolvedItemId ? 'barcode' : matchedBy;
    }
    if (!resolvedItemId && rawName) {
      resolvedItemId = byName.get(rawName) || null;
      matchedBy = resolvedItemId ? 'itemName' : matchedBy;
    }

    if (!resolvedItemId) {
      errors.push({ row: rowNo, error: 'Item not found.', itemId: rawItemId || null, barcode: rawBarcode || null, itemCode: rawCode || null });
      continue;
    }

    const rawQty = pickRowValue(row, ['Counted Qty', 'Counted', 'countedQty', 'Qty', 'qty']);
    if (rawQty === '' || rawQty === undefined || rawQty === null) {
      // allow blank row; skip
      continue;
    }
    const countedQty = Number(rawQty);
    if (!Number.isFinite(countedQty) || countedQty < 0) {
      errors.push({ row: rowNo, error: 'Invalid countedQty (must be non-negative).', value: rawQty });
      continue;
    }
    if (!isIntegerQuantity(countedQty)) {
      errors.push({
        row: rowNo,
        error: 'Quantity must be a whole number (integer). Fractional quantities are not allowed.',
        value: rawQty,
      });
      continue;
    }

    const key = `${sessionId}:${roundNo}:${locationId}:${resolvedItemId}`;
    if (!seen.has(key)) {
      seen.set(key, { rows: [rowNo], matchedBy });
    } else {
      const v = seen.get(key);
      v.rows.push(rowNo);
      seen.set(key, v);
    }

    updates.push({ itemId: resolvedItemId, locationId, countedQty, rowNo, matchedBy });
  }

  // Reject duplicates (spec decision B)
  const dupDetails = [];
  for (const [key, v] of seen.entries()) {
    if (v.rows.length > 1) {
      const parts = key.split(':');
      dupDetails.push({
        key: {
          sessionId: parts[0],
          roundNo: Number(parts[1]),
          locationId: parts[2],
          itemId: parts.slice(3).join(':'),
        },
        rows: v.rows,
        matchedBy: v.matchedBy,
      });
    }
  }
  if (dupDetails.length) {
    throw bizError(
      400,
      'COUNT_UPLOAD_DUPLICATE_ROWS',
      'Duplicate rows detected for the same item/location in the uploaded sheet.',
      dupDetails,
    );
  }

  // Apply updates
  let updated = 0;
  let nextConcurrencyVersion = Number(s.concurrencyVersion ?? 0);
  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      const cell = await tx.stockCountLocationQty.findFirst({
        where: { sessionId, locationId: u.locationId, itemId: u.itemId, roundNo },
      });
      if (!cell) {
        // cell not in snapshot: reject (outside scope or not present in location snapshot)
        errors.push({ row: u.rowNo, error: 'Item not present in session snapshot for this location.', itemId: u.itemId, locationId: u.locationId });
        continue;
      }
      const varianceQty = u.countedQty - Number(cell.bookQty);
      await tx.stockCountLocationQty.update({
        where: { id: cell.id },
        data: {
          countedQty: u.countedQty,
          varianceQty,
          countedBy: userId,
          countedAt: new Date(),
        },
      });
      updated += 1;
    }
    if (updated > 0) {
      nextConcurrencyVersion = await guardedSessionUpdate(tx, s, opts.concurrencyVersion, {});
    }
  });

  if (errors.length) {
    // If any errors remain, return 400 with details (keeps workflow strict)
    throw bizError(400, 'COUNT_UPLOAD_INVALID_ROWS', 'Some rows could not be imported.', errors);
  }

  return {
    roundNo,
    locationId: opts.locationId || null,
    updated,
    skipped: uploadRows.length - updated,
    errors: [],
    concurrencyVersion: nextConcurrencyVersion,
  };
};

module.exports.backfillCountApprovalRequest = backfillCountApprovalRequest;
module.exports.__testCountSheetHelpers = {
  isCountSheetDataRow,
  pickRowValue,
  findCountSheetHeaderRowIndex,
  collectCountSheetUploadRows,
  parseCountSheetUploadRows,
  excelImageExtension,
  prepareExcelImageEmbed,
  excelImageCellPlacement,
  EXCEL_IMAGE_DISPLAY_PX,
  EXCEL_IMAGE_COL_WIDTH,
  EXCEL_IMAGE_ROW_HEIGHT_PT,
};
