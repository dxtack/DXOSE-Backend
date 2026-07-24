const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const postingService = require('./posting.service');
const { isLegacyStockCountBlocked } = require('../middleware/blockLegacyStockCountMutations');
const { checkPeriodLock } = require('./periodGuard.service');
const { logAction, EntityType } = require('./auditTrail.service');
const { generateDocNumber } = require('./docNumbering.service');
const {
    resolveScopeContext,
    scopeWhereFor,
    metaFor,
    assertInScope,
    SCOPE_MODULE,
} = require('./scope/scopeContext');
const { connectRole } = require('./rbac.service');
const locationItemResolution = require('./location-item-resolution.service');
const {
    resolveWorkflowForDocument,
    approvalRequestVersionPin,
} = require('./acc-workflow-runtime.service');
const { assertUserHasCountStepPermission } = require('../acc-authority/step-permission-enforcement');
const { submitStatusFromChain, countStatusForPendingStep } = require('./acc-workflow-count.runtime');

const LEGACY_COUNT_APPROVAL_STATUSES = [
    'PENDING_FINANCE',
    'PENDING_GM',
    'PENDING_APPROVAL',
    'FINANCE_APPROVED',
];

/**
 * Creates a new Stock Count Session for a given location.
 * Takes a static snapshot of current Stock Balances and WAC.
 */
const createSession = async (tenantId, locationId, createdBy, notes, countDate) => {
    // ── Period Guard ─────────────────────────────────────────────────────────
    const sessionDate = countDate ? new Date(countDate) : new Date();
    await checkPeriodLock(tenantId, sessionDate);
    // ─────────────────────────────────────────────────────────────────────────

    // Check if location exists
    const location = await prisma.location.findUnique({
        where: { id: locationId, tenantId }
    });
    if (!location) throw new Error('Location not found');

    // Generate unique session number
    const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
    const count = await prisma.stockCountSession.count({ where: { tenantId } });
    const sessionNo = `CNT-${dateStr}-${String(count + 1).padStart(4, '0')}`;

    // Get expected items for this location (including newly created ones with no stock balance yet)
    const { items } = await locationItemResolution.resolveItemsForLocation(tenantId, locationId, {
        mode: locationItemResolution.MODES.RECEIVING,
        take: 10000,
    });

    const itemIds = items.map((it) => it.id);

    const balances = await prisma.stockBalance.findMany({
        where: { tenantId, locationId, itemId: { in: itemIds } },
    });
    const balanceMap = new Map(balances.map((b) => [b.itemId, b]));

    const fullItems = await prisma.item.findMany({
        where: { tenantId, id: { in: itemIds } },
        select: { id: true, unitPrice: true },
    });
    const itemMap = new Map(fullItems.map((it) => [it.id, it]));

    const activePasses = await prisma.getPassLine.findMany({
        where: {
            locationId,
            status: { in: ['OUT', 'PARTIALLY_RETURNED'] },
            getPass: { tenantId }
        }
    });
    
    const loanedQuantities = activePasses.reduce((acc, pass) => {
        acc[pass.itemId] = (acc[pass.itemId] || 0) + (Number(pass.qty) - Number(pass.qtyReturned));
        return acc;
    }, {});

    // We take a snapshot of all items stored in this location
    const sessionLines = items.map((it) => {
        const b = balanceMap.get(it.id);
        const fullItem = itemMap.get(it.id);
        return {
            itemId: it.id,
            bookQty: b ? Number(b.qtyOnHand) : 0,
            qtyOnLoan: loanedQuantities[it.id] || 0,
            wacUnitCost: b ? Number(b.wacUnitCost) : (fullItem ? Number(fullItem.unitPrice || 0) : 0),
            varianceQty: 0,
            varianceValue: 0
        };
    });

    const session = await prisma.stockCountSession.create({
        data: {
            tenantId,
            locationId,
            sessionNo,
            createdBy,
            notes,
            lines: {
                create: sessionLines
            }
        },
        include: { lines: { include: { item: true } }, createdByUser: true }
    });

    return session;
};

const getSessions = async (tenantId, params = {}, user = null) => {
    const { status, locationId, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const scope = user ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope ? scopeWhereFor(SCOPE_MODULE.INVENTORY_COUNT, scope) : {};

    const where = { tenantId, ...scopeWhere };
    if (status) where.status = status;
    if (locationId) where.locationId = locationId;

    const [data, total] = await Promise.all([
        prisma.stockCountSession.findMany({
            where,
            include: { location: true, createdByUser: true },
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit)
        }),
        prisma.stockCountSession.count({ where })
    ]);

    const scopeMeta = scope ? metaFor(scope, { total }) : null;
    return { data, total, page: Number(page), limit: Number(limit), ...scopeMeta };
};

const getSessionById = async (id, tenantId, user = null) => {
    const session = await prisma.stockCountSession.findUnique({
        where: { id, tenantId },
        include: {
            location: true,
            createdByUser: true,
            lines: {
                include: { item: true },
                orderBy: { item: { name: 'asc' } }
            },
            approvalRequest: {
                include: {
                    steps: {
                        include: { actedByUser: true, requiredRole: { select: { code: true } } },
                        orderBy: { stepNumber: 'asc' }
                    }
                }
            }
        }
    });

    if (!session) throw new Error('Session not found');
    if (user) {
        const scope = await resolveScopeContext(user, tenantId);
        await assertInScope(SCOPE_MODULE.INVENTORY_COUNT, session, scope, 'read');
    }
    return session;
};

/**
 * Updates counted quantities for a session. Supports partial saves.
 * Calculates variance immediately based on static unitCost.
 */
const updateCountLines = async (id, tenantId, lineUpdates) => {
    const session = await getSessionById(id, tenantId);
    if (!['DRAFT', 'COUNTING'].includes(session.status)) {
        throw new Error('Can only update lines when status is DRAFT or COUNTING');
    }

    await prisma.$transaction(async (tx) => {

        for (const update of lineUpdates) {
            const line = session.lines.find(l => l.itemId === update.itemId);
            if (!line) continue;

            const countedQty = update.countedQty !== null ? Number(update.countedQty) : null;

            if (countedQty !== null) {
                const varianceQty = countedQty - Number(line.bookQty);
                const varianceValue = varianceQty * Number(line.wacUnitCost);

                await tx.stockCountLine.update({
                    where: { id: line.id },
                    data: {
                        countedQty,
                        varianceQty,
                        varianceValue
                    }
                });
            } else {
                // If setting back to null (clearing the field)
                await tx.stockCountLine.update({
                    where: { id: line.id },
                    data: {
                        countedQty: null,
                        varianceQty: 0,
                        varianceValue: 0
                    }
                });
            }
        }
    });

    return getSessionById(id, tenantId);
};

const submitForApproval = async (id, tenantId, userId) => {
    const session = await getSessionById(id, tenantId);

    if (!['DRAFT', 'COUNTING'].includes(session.status)) {
        throw new Error('Can only submit DRAFT or COUNTING sessions');
    }

    // Check if any items are uncounted
    const uncounted = session.lines.filter(l => l.countedQty === null);
    if (uncounted.length > 0) {
        throw new Error(`Cannot submit because ${uncounted.length} items have not been counted. Please enter 0 or the actual quantity.`);
    }

    const chain = await resolveWorkflowForDocument({ moduleKey: 'STOCK_COUNT', tenantId });
    const roleCodes = chain.roleCodes || [];
    if (!roleCodes.length) {
        throw new Error('ACC published STOCK_COUNT workflow is required.');
    }
    const { status: submitStatus, pendingStepNumber } = submitStatusFromChain(chain, 1);

    const approvalRequest = await prisma.$transaction(async (tx) => {
        const request = await tx.approvalRequest.create({
            data: {
                tenantId,
                requestType: 'COUNT_ADJUSTMENT',
                status: 'PENDING',
                StockCountSession: { connect: { id } },
                currentStep: pendingStepNumber,
                totalSteps: roleCodes.length,
                createdBy: userId,
                ...approvalRequestVersionPin(chain),
                steps: {
                    create: roleCodes.map((roleCode, index) => ({
                        stepNumber: index + 1,
                        requiredRole: connectRole(roleCode),
                        status: 'PENDING',
                    })),
                },
            },
        });

        await tx.stockCountSession.update({
            where: { id },
            data: { status: submitStatus, approvalRequestId: request.id },
        });

        return request;
    });

    await logAction({
        tenantId,
        entityType: EntityType.STOCK_COUNT,
        entityId: id,
        action: 'SUBMIT',
        changedBy: userId,
        note: `LEGACY_STOCK_COUNT_SUBMIT_FOR_APPROVAL sessionNo=${session.sessionNo}`,
        afterValue: { sessionNo: session.sessionNo, approvalRequestId: approvalRequest.id },
    });

    return approvalRequest;
};

const processApproval = async (id, tenantId, user, comment, isApproved) => {
    const session = await getSessionById(id, tenantId);
    if (!LEGACY_COUNT_APPROVAL_STATUSES.includes(session.status) || !session.approvalRequest) {
        throw new Error('Session is not pending approval');
    }

    const chain = session.approvalRequest.accWorkflowVersionId
        ? await require('./acc-workflow-runtime.service').resolveWorkflowByVersionId(
              session.approvalRequest.accWorkflowVersionId,
          )
        : await resolveWorkflowForDocument({ moduleKey: 'STOCK_COUNT', tenantId });

    const reqId = session.approvalRequestId;
    const request = session.approvalRequest;

    const currentStepNum = request.currentStep;
    const step = request.steps.find(s => s.stepNumber === currentStepNum);

    if (!step || step.status !== 'PENDING') throw new Error('No pending approval step found');
    const stepRoleCode = step.requiredRole?.code ?? step.requiredRole;
    assertUserHasCountStepPermission(user, session.status, stepRoleCode);

    if (!isApproved) {
        // REJECT
        await prisma.$transaction(async (tx) => {
            await tx.approvalStep.update({
                where: { id: step.id },
                data: { status: 'REJECTED', actedBy: user.id, actedAt: new Date(), comment }
            });
            await tx.approvalRequest.update({
                where: { id: reqId },
                data: { status: 'REJECTED', resolvedAt: new Date() }
            });
            await tx.stockCountSession.update({
                where: { id },
                data: { status: 'REJECTED' }
            });
        });
        await logAction({
            tenantId,
            entityType: EntityType.STOCK_COUNT,
            entityId: id,
            action: 'COUNT_REJECT',
            changedBy: user.id,
            note: `LEGACY_STOCK_COUNT_REJECT sessionNo=${session.sessionNo}`,
            afterValue: { sessionNo: session.sessionNo },
        });
        return { success: true, status: 'REJECTED' };
    } else {
        // APPROVE
        const isFinal = currentStepNum >= request.totalSteps;

        await prisma.$transaction(async (tx) => {
            await tx.approvalStep.update({
                where: { id: step.id },
                data: { status: 'APPROVED', actedBy: user.id, actedAt: new Date(), comment }
            });

            if (isFinal) {
                await tx.approvalRequest.update({
                    where: { id: reqId },
                    data: { status: 'APPROVED', currentStep: currentStepNum, resolvedAt: new Date() }
                });
            } else {
                const nextStepNo = currentStepNum + 1;
                await tx.approvalRequest.update({
                    where: { id: reqId },
                    data: { currentStep: nextStepNo }
                });
                await tx.stockCountSession.update({
                    where: { id },
                    data: { status: countStatusForPendingStep(chain, nextStepNo) }
                });
            }
        });

        await logAction({
            tenantId,
            entityType: EntityType.STOCK_COUNT,
            entityId: id,
            action: 'COUNT_APPROVE',
            changedBy: user.id,
            note: isFinal
                ? `LEGACY_STOCK_COUNT_APPROVE_FINAL sessionNo=${session.sessionNo}`
                : `LEGACY_STOCK_COUNT_APPROVE_STEP step=${currentStepNum}/${request.totalSteps} sessionNo=${session.sessionNo}`,
            afterValue: {
                sessionNo: session.sessionNo,
                stepNumber: currentStepNum,
                totalSteps: request.totalSteps,
                final: isFinal,
            },
        });

        if (isFinal) {
            if (isLegacyStockCountBlocked()) {
                throw Object.assign(
                    new Error(
                        'Legacy stock-count posting is disabled. Approve via POST /api/inventory-count/sessions/:id/approve.',
                    ),
                    { statusCode: 403, code: 'LEGACY_STOCK_COUNT_POST_DISABLED' },
                );
            }
            await postingService.postStockCount(id, tenantId, user.id);
            return { success: true, status: 'POSTED' };
        }

        return { success: true, status: isFinal ? 'POSTED' : countStatusForPendingStep(chain, currentStepNum + 1) };
    }
};

const voidSession = async (id, tenantId, userId) => {
    const session = await getSessionById(id, tenantId);

    if (session.status === 'POSTED') {
        throw new Error('Cannot void a session that is already POSTED');
    }

    await prisma.stockCountSession.update({
        where: { id },
        data: { status: 'VOID' }
    });

    return { success: true };
};

module.exports = {
    createSession,
    getSessions,
    getSessionById,
    updateCountLines,
    submitForApproval,
    processApproval,
    voidSession
};
