const prisma = require('../config/database');
const { openGrnStatusesForQuery } = require('../constants/grnStatus');
const { normalizeRole } = require('./rbac.service');
const { resolveScopeContext, metaFor } = require('./scope/scopeContext');
const { hasActiveAssignmentForProperty } = require('./scope/assignment-mutation.guard');
const {
    getWorkflowPipelineSummary,
    getWorkflowPipelineAlerts,
    getScopedPipelineItems,
} = require('./workflow-pipeline/workflow-pipeline.service');

const emptyOperationalHealth = () => ({
    pendingTransfersCount: 0,
    pendingGrnsCount: 0,
    pendingLossCount: 0,
    overdueLoansCount: 0,
    pendingStockReportsCount: 0,
    details: {
        pendingTransfers: [],
        pendingGrns: [],
        pendingLoss: [],
        overdueLoans: [],
        pendingStockReports: [],
    },
});

/** Align dashboard operationalHealth counts with Workflow Pipeline (single source of truth). */
async function alignOperationalHealthWithPipeline(tenantId, userCtx, operationalHealth) {
    try {
        const [summary, alertItems, pipelineItems] = await Promise.all([
            getWorkflowPipelineSummary(tenantId, userCtx),
            getWorkflowPipelineAlerts(tenantId, userCtx, { limit: 40 }),
            getScopedPipelineItems(tenantId, userCtx),
        ]);
        const oh = summary.operationalHealth || {};
        const mapDetail = (i) => ({
            id: i.documentId,
            transferNo: i.module === 'TRANSFER' ? i.documentNo : undefined,
            documentNo: i.documentNo,
            grnNumber: i.module === 'GRN' ? i.documentNo : undefined,
            passNo: i.module === 'GET_PASS' ? i.documentNo : undefined,
            status: i.status,
            waitingForRole: i.waitingForRole,
            borrowingEntity: i.meta?.borrowingEntity,
            expectedReturnDate: i.meta?.expectedReturnDate,
        });
        const byModule = (mod) => alertItems.filter((i) => i.module === mod).slice(0, 5).map(mapDetail);

        return {
            ...operationalHealth,
            pendingTransfersCount: oh.pendingTransfersCount ?? operationalHealth?.pendingTransfersCount ?? 0,
            pendingGrnsCount: oh.pendingGrnsCount ?? operationalHealth?.pendingGrnsCount ?? 0,
            pendingLossCount: oh.pendingLossCount ?? operationalHealth?.pendingLossCount ?? 0,
            overdueLoansCount: oh.overdueLoansCount ?? summary.getPassOverdue ?? 0,
            pendingStockReportsCount: operationalHealth?.pendingStockReportsCount ?? 0,
            pipeline: {
                total: summary.total,
                mine: summary.mine,
                critical: summary.critical,
                warning: summary.warning,
                overdue: summary.overdue,
                byModule: summary.byModule,
            },
            details: {
                pendingTransfers: byModule('TRANSFER'),
                pendingGrns: byModule('GRN'),
                pendingLoss: [...byModule('BREAKAGE'), ...byModule('LOST')],
                overdueLoans: pipelineItems
                    .filter((i) => i.module === 'GET_PASS' && (i.overdue || i.priority === 'critical'))
                    .slice(0, 5)
                    .map((i) => ({
                        id: i.documentId,
                        loanNo: i.documentNo,
                        passNo: i.documentNo,
                        borrowingEntity: i.meta?.borrowingEntity,
                        expectedReturnDate: i.meta?.expectedReturnDate,
                    })),
                pendingStockReports: operationalHealth?.details?.pendingStockReports || [],
            },
        };
    } catch {
        return operationalHealth;
    }
}

/**
 * UI layout + API payload shape for role-adaptive dashboard.
 * @param {string} role
 * @returns {'executive'|'operations'|'department'|'security'}
 */
function resolveDashboardProfile(role) {
    const r = normalizeRole(role || '');
    if (['SUPER_ADMIN', 'ORG_MANAGER', 'GENERAL_MANAGER', 'FINANCE_MANAGER', 'AUDITOR'].includes(r)) {
        return 'executive';
    }
    if (['STOREKEEPER', 'COST_CONTROL'].includes(r)) return 'operations';
    if (r === 'DEPT_MANAGER') return 'department';
    if (r === 'SECURITY') return 'security';
    return 'executive';
}

/**
 * SaaS Phase 2 — Executive Dashboard Service
 *
 * Single consolidated query function that fires parallel Prisma queries
 * and returns role-scoped widget groups.
 */

const getDashboardSummary = async (tenantId, userCtx = null) => {
    const profile = resolveDashboardProfile(userCtx?.role);
    const scope = userCtx?.id ? await resolveScopeContext(userCtx, tenantId) : null;
    const scopeMeta = scope ? metaFor(scope) : null;

    let payload;
    if (profile === 'security') {
        payload = await buildSecuritySummary(tenantId, userCtx);
    } else if (profile === 'operations') {
        payload = await buildOperationsSummary(tenantId, userCtx, scope);
    } else if (profile === 'department') {
        payload = await buildDepartmentSummary(tenantId, userCtx);
    } else {
        payload = await buildExecutiveSummary(tenantId, userCtx);
    }

    if (userCtx?.id && tenantId && normalizeRole(userCtx.role) !== 'SUPER_ADMIN') {
        const hasAssignment = await hasActiveAssignmentForProperty(userCtx, tenantId);
        if (!hasAssignment && payload.operationalHealth) {
            payload.operationalHealth = emptyOperationalHealth();
        }
    }

    return { ...payload, ...scopeMeta };
};

/** Full financial / GM-style dashboard (default). */
async function buildExecutiveSummary(tenantId, userCtx) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [
        inventoryTotals,
        valueByStore,
        thisMonthMovements,
        prevMonthMovements,
        agingData,
        topConsumed,
        topSlow,
        operationalHealth,
    ] = await Promise.all([
        // ── Q1: Inventory Overview Totals ────────────────────────────────
        (async () => {
            const [balances, storeCount, itemCount] = await Promise.all([
                prisma.stockBalance.aggregate({
                    where: { tenantId },
                    _sum: { qtyOnHand: true },
                }),
                prisma.location.count({ where: { tenantId, isActive: true } }),
                prisma.item.count({ where: { tenantId, isActive: true } }),
            ]);

            // Total inventory value = Σ(qtyOnHand × wacUnitCost) per balance row
            const valueResult = await prisma.$queryRaw`
                SELECT COALESCE(SUM("qtyOnHand" * "wacUnitCost"), 0)::float as "totalValue"
                FROM stock_balances
                WHERE "tenantId" = ${tenantId}::uuid
            `;

            return {
                totalValue: valueResult[0]?.totalValue || 0,
                totalStores: storeCount,
                totalActiveItems: itemCount,
                totalQtyOnHand: Number(balances._sum.qtyOnHand || 0),
            };
        })(),

        // ── Q2: Value by Department ───────────────────────────────────────────
        (async () => {
            const rows = await prisma.$queryRaw`
                SELECT d."name" as "departmentName",
                       COALESCE(SUM(sb."qtyOnHand" * sb."wacUnitCost"), 0)::float as "value"
                FROM stock_balances sb
                JOIN items i ON i."id" = sb."itemId"
                JOIN departments d ON d."id" = i."departmentId"
                WHERE sb."tenantId" = ${tenantId}::uuid
                GROUP BY d."id", d."name"
                ORDER BY "value" DESC
            `;
            return rows;
        })(),

        // ── Q3: This Month Movements ─────────────────────────────────────
        (async () => {
            const consumption = await prisma.$queryRaw`
                SELECT COALESCE(SUM("qtyOut" * "unitCost"), 0)::float as "value"
                FROM inventory_ledger
                WHERE "tenantId" = ${tenantId}::uuid
                  AND "movementType" IN ('ISSUE')
                  AND "createdAt" >= ${monthStart}
            `;
            const transfers = await prisma.inventoryLedger.count({
                where: {
                    tenantId,
                    movementType: 'TRANSFER_OUT',
                    createdAt: { gte: monthStart },
                },
            });
            const lossValue = await prisma.$queryRaw`
                SELECT COALESCE(SUM("qtyOut" * "unitCost"), 0)::float as "value"
                FROM inventory_ledger
                WHERE "tenantId" = ${tenantId}::uuid
                  AND "movementType" = 'BREAKAGE'
                  AND "createdAt" >= ${monthStart}
            `;
            return {
                consumptionValue: consumption[0]?.value || 0,
                transfersCount: transfers,
                lossValue: lossValue[0]?.value || 0,
            };
        })(),

        // ── Q4: Previous Month Movements (for Δ%) ────────────────────────
        (async () => {
            const consumption = await prisma.$queryRaw`
                SELECT COALESCE(SUM("qtyOut" * "unitCost"), 0)::float as "value"
                FROM inventory_ledger
                WHERE "tenantId" = ${tenantId}::uuid
                  AND "movementType" IN ('ISSUE')
                  AND "createdAt" >= ${prevMonthStart}
                  AND "createdAt" <= ${prevMonthEnd}
            `;
            const lossValue = await prisma.$queryRaw`
                SELECT COALESCE(SUM("qtyOut" * "unitCost"), 0)::float as "value"
                FROM inventory_ledger
                WHERE "tenantId" = ${tenantId}::uuid
                  AND "movementType" = 'BREAKAGE'
                  AND "createdAt" >= ${prevMonthStart}
                  AND "createdAt" <= ${prevMonthEnd}
            `;
            return {
                consumptionValue: consumption[0]?.value || 0,
                lossValue: lossValue[0]?.value || 0,
            };
        })(),

        // ── Q6: Aging Buckets ────────────────────────────────────────────
        (async () => {
            const rows = await prisma.$queryRaw`
                SELECT
                    CASE
                        WHEN last_move IS NULL OR NOW() - last_move > INTERVAL '60 days' THEN '60+'
                        WHEN NOW() - last_move > INTERVAL '30 days' THEN '31-60'
                        ELSE '0-30'
                    END as bucket,
                    COUNT(*)::int as count,
                    COALESCE(SUM(sb."qtyOnHand" * sb."wacUnitCost"), 0)::float as "value"
                FROM stock_balances sb
                LEFT JOIN LATERAL (
                    SELECT MAX(il."createdAt") as last_move
                    FROM inventory_ledger il
                    WHERE il."itemId" = sb."itemId"
                      AND il."locationId" = sb."locationId"
                      AND il."tenantId" = sb."tenantId"
                ) lm ON true
                WHERE sb."tenantId" = ${tenantId}::uuid
                  AND sb."qtyOnHand" > 0
                GROUP BY bucket
                ORDER BY bucket
            `;
            return rows;
        })(),

        // ── Q7a: Top 5 Consumed Items ────────────────────────────────────
        (async () => {
            const rows = await prisma.$queryRaw`
                SELECT i."name" as "itemName",
                       SUM(il."qtyOut")::float as "totalQty",
                       SUM(il."qtyOut" * il."unitCost")::float as "totalValue"
                FROM inventory_ledger il
                JOIN items i ON i."id" = il."itemId"
                WHERE il."tenantId" = ${tenantId}::uuid
                  AND il."movementType" = 'ISSUE'
                  AND il."createdAt" >= ${monthStart}
                GROUP BY i."id", i."name"
                ORDER BY "totalValue" DESC
                LIMIT 5
            `;
            return rows;
        })(),

        // ── Q7b: Top 5 Slow Moving Items ─────────────────────────────────
        (async () => {
            const rows = await prisma.$queryRaw`
                SELECT i."name" as "itemName",
                       sb."qtyOnHand"::float as "qtyOnHand",
                       (sb."qtyOnHand" * sb."wacUnitCost")::float as "value",
                       MAX(il."createdAt") as "lastMovement"
                FROM stock_balances sb
                JOIN items i ON i."id" = sb."itemId"
                LEFT JOIN inventory_ledger il
                    ON il."itemId" = sb."itemId"
                   AND il."locationId" = sb."locationId"
                   AND il."tenantId" = sb."tenantId"
                WHERE sb."tenantId" = ${tenantId}::uuid
                  AND sb."qtyOnHand" > 0
                GROUP BY i."id", i."name", sb."qtyOnHand", sb."wacUnitCost"
                ORDER BY MAX(il."createdAt") ASC NULLS FIRST
                LIMIT 5
            `;
            return rows;
        })(),

        // ── Q8: Operational Health ───────────────────────────────────────
        (async () => {
            const [pendingTransfers, pendingGrns, pendingLoss, overdueLoans] = await Promise.all([
                prisma.storeTransfer.findMany({
                    where: { tenantId, status: { in: ['PENDING_DEPT', 'PENDING_FINANCE'] } },
                    select: { id: true, transferNo: true, status: true, sourceLocationId: true, destLocationId: true }
                }).catch(() => []),
                prisma.grnImport.findMany({
                    where: {
                        tenantId,
                        status: { in: openGrnStatusesForQuery() },
                    },
                    select: { id: true, grnNumber: true, status: true, vendorId: true },
                }).catch(() => []),
                prisma.movementDocument.findMany({
                    where: { tenantId, movementType: 'BREAKAGE', status: 'DRAFT' },
                    select: { id: true, documentNo: true, status: true, sourceLocationId: true }
                }).catch(() => []),
                prisma.getPass.findMany({
                    where: { tenantId, status: { in: ['OUT', 'PARTIALLY_RETURNED'] }, expectedReturnDate: { lt: now } },
                    select: { id: true, passNo: true, borrowingEntity: true, expectedReturnDate: true }
                }).catch(() => [])
            ]);
            return {
                pendingTransfersCount: pendingTransfers.length,
                pendingGrnsCount: pendingGrns.length,
                pendingLossCount: pendingLoss.length,
                overdueLoansCount: overdueLoans.length,
                pendingStockReportsCount: 0,
                details: {
                    pendingTransfers: pendingTransfers.slice(0, 5),
                    pendingGrns: pendingGrns.slice(0, 5),
                    pendingLoss: pendingLoss.slice(0, 5),
                    overdueLoans: overdueLoans.slice(0, 5).map(p => ({
                        id: p.id,
                        loanNo: p.passNo, // Legacy mapping for UI compatibility 
                        qty: '-', 
                        borrowingEntity: p.borrowingEntity,
                        expectedReturnDate: p.expectedReturnDate
                    })),
                    pendingStockReports: []
                }
            };
        })(),
    ]);

    // ── Compute deltas ───────────────────────────────────────────────────
    const calcDelta = (curr, prev) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
    };

    const consumptionDelta = calcDelta(thisMonthMovements.consumptionValue, prevMonthMovements.consumptionValue);
    const lossDelta = calcDelta(thisMonthMovements.lossValue, prevMonthMovements.lossValue);
    const lossVsConsumption = thisMonthMovements.consumptionValue > 0
        ? Math.round((thisMonthMovements.lossValue / thisMonthMovements.consumptionValue) * 100 * 10) / 10
        : 0;

    const controlTower = await computeControlTowerMetrics(tenantId, monthStart, userCtx, {
        towerMode: 'full',
        departmentId: null,
    });

    const operationalHealthAligned = await alignOperationalHealthWithPipeline(
        tenantId,
        userCtx,
        operationalHealth,
    );

    return {
        meta: { dashboardProfile: 'executive' },
        inventoryOverview: {
            ...inventoryTotals,
            valueByDepartment: valueByStore,
        },
        monthlyPerformance: {
            consumptionValue: thisMonthMovements.consumptionValue,
            consumptionDelta,
            transfersCount: thisMonthMovements.transfersCount,
            lossValue: thisMonthMovements.lossValue,
            lossDelta,
        },
        riskIndicators: {
            aging: agingData,
            topConsumed,
            topSlow,
            lossVsConsumptionPct: lossVsConsumption,
        },
        operationalHealth: operationalHealthAligned,
        controlTower,
        generatedAt: now.toISOString(),
    };
}

/** Storekeeper / Cost Control — quantities, alerts, pending workflow (lean payload). */
async function buildOperationsSummary(tenantId, userCtx, scope = null) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const stockScopeWhere =
        scope && !scope.isTenantWide && scope.allowedLocationIds?.length
            ? { locationId: { in: scope.allowedLocationIds } }
            : {};

    const [
        inventoryTotals,
        thisMonthMovements,
        prevMonthMovements,
        operationalHealth,
        controlTower,
    ] = await Promise.all([
        (async () => {
            const [balances, storeCount, itemCount] = await Promise.all([
                prisma.stockBalance.aggregate({
                    where: { tenantId, ...stockScopeWhere },
                    _sum: { qtyOnHand: true },
                }),
                prisma.location.count({
                    where: {
                        tenantId,
                        isActive: true,
                        ...(stockScopeWhere.locationId ? { id: stockScopeWhere.locationId } : {}),
                    },
                }),
                prisma.item.count({ where: { tenantId, isActive: true } }),
            ]);
            const valueResult =
                scope && !scope.isTenantWide && scope.allowedLocationIds?.length
                    ? await prisma.$queryRaw`
                SELECT COALESCE(SUM(sb."qtyOnHand" * sb."wacUnitCost"), 0)::float as "totalValue"
                FROM stock_balances sb
                WHERE sb."tenantId" = ${tenantId}::uuid
                  AND sb."locationId" = ANY(${scope.allowedLocationIds}::uuid[])
            `
                    : await prisma.$queryRaw`
                SELECT COALESCE(SUM("qtyOnHand" * "wacUnitCost"), 0)::float as "totalValue"
                FROM stock_balances
                WHERE "tenantId" = ${tenantId}::uuid
            `;
            return {
                totalValue: valueResult[0]?.totalValue || 0,
                totalStores: storeCount,
                totalActiveItems: itemCount,
                totalQtyOnHand: Number(balances._sum.qtyOnHand || 0),
            };
        })(),
        (async () => {
            const consumption = await prisma.$queryRaw`
                SELECT COALESCE(SUM("qtyOut" * "unitCost"), 0)::float as "value"
                FROM inventory_ledger
                WHERE "tenantId" = ${tenantId}::uuid
                  AND "movementType" IN ('ISSUE')
                  AND "createdAt" >= ${monthStart}
            `;
            const transfers = await prisma.inventoryLedger.count({
                where: {
                    tenantId,
                    movementType: 'TRANSFER_OUT',
                    createdAt: { gte: monthStart },
                },
            });
            const lossValue = await prisma.$queryRaw`
                SELECT COALESCE(SUM("qtyOut" * "unitCost"), 0)::float as "value"
                FROM inventory_ledger
                WHERE "tenantId" = ${tenantId}::uuid
                  AND "movementType" = 'BREAKAGE'
                  AND "createdAt" >= ${monthStart}
            `;
            return {
                consumptionValue: consumption[0]?.value || 0,
                transfersCount: transfers,
                lossValue: lossValue[0]?.value || 0,
            };
        })(),
        (async () => {
            const consumption = await prisma.$queryRaw`
                SELECT COALESCE(SUM("qtyOut" * "unitCost"), 0)::float as "value"
                FROM inventory_ledger
                WHERE "tenantId" = ${tenantId}::uuid
                  AND "movementType" IN ('ISSUE')
                  AND "createdAt" >= ${prevMonthStart}
                  AND "createdAt" <= ${prevMonthEnd}
            `;
            const lossValue = await prisma.$queryRaw`
                SELECT COALESCE(SUM("qtyOut" * "unitCost"), 0)::float as "value"
                FROM inventory_ledger
                WHERE "tenantId" = ${tenantId}::uuid
                  AND "movementType" = 'BREAKAGE'
                  AND "createdAt" >= ${prevMonthStart}
                  AND "createdAt" <= ${prevMonthEnd}
            `;
            return {
                consumptionValue: consumption[0]?.value || 0,
                lossValue: lossValue[0]?.value || 0,
            };
        })(),
        (async () => {
            const nowOp = new Date();
            const [pendingTransfers, pendingGrns, pendingLoss, overdueLoans] = await Promise.all([
                prisma.storeTransfer.findMany({
                    where: { tenantId, status: { in: ['PENDING_DEPT', 'PENDING_FINANCE'] } },
                    select: { id: true, transferNo: true, status: true, sourceLocationId: true, destLocationId: true },
                }).catch(() => []),
                prisma.grnImport.findMany({
                    where: {
                        tenantId,
                        status: { in: openGrnStatusesForQuery() },
                    },
                    select: { id: true, grnNumber: true, status: true, vendorId: true },
                }).catch(() => []),
                prisma.movementDocument.findMany({
                    where: { tenantId, movementType: 'BREAKAGE', status: 'DRAFT' },
                    select: { id: true, documentNo: true, status: true, sourceLocationId: true },
                }).catch(() => []),
                prisma.getPass.findMany({
                    where: { tenantId, status: { in: ['OUT', 'PARTIALLY_RETURNED'] }, expectedReturnDate: { lt: nowOp } },
                    select: { id: true, passNo: true, borrowingEntity: true, expectedReturnDate: true },
                }).catch(() => []),
            ]);
            return {
                pendingTransfersCount: pendingTransfers.length,
                pendingGrnsCount: pendingGrns.length,
                pendingLossCount: pendingLoss.length,
                overdueLoansCount: overdueLoans.length,
                pendingStockReportsCount: 0,
                details: {
                    pendingTransfers: pendingTransfers.slice(0, 5),
                    pendingGrns: pendingGrns.slice(0, 5),
                    pendingLoss: pendingLoss.slice(0, 5),
                    overdueLoans: overdueLoans.slice(0, 5).map((p) => ({
                        id: p.id,
                        loanNo: p.passNo,
                        qty: '-',
                        borrowingEntity: p.borrowingEntity,
                        expectedReturnDate: p.expectedReturnDate,
                    })),
                    pendingStockReports: [],
                },
            };
        })(),
        computeControlTowerMetrics(tenantId, monthStart, userCtx, { towerMode: 'operations', departmentId: null }),
    ]);

    const calcDelta = (curr, prev) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
    };
    const consumptionDelta = calcDelta(thisMonthMovements.consumptionValue, prevMonthMovements.consumptionValue);
    const lossDelta = calcDelta(thisMonthMovements.lossValue, prevMonthMovements.lossValue);

    const operationalHealthAligned = await alignOperationalHealthWithPipeline(
        tenantId,
        userCtx,
        operationalHealth,
    );

    return {
        meta: { dashboardProfile: 'operations' },
        inventoryOverview: {
            ...inventoryTotals,
            valueByDepartment: [],
        },
        monthlyPerformance: {
            consumptionValue: thisMonthMovements.consumptionValue,
            consumptionDelta,
            transfersCount: thisMonthMovements.transfersCount,
            lossValue: thisMonthMovements.lossValue,
            lossDelta,
        },
        riskIndicators: null,
        operationalHealth: operationalHealthAligned,
        controlTower,
        generatedAt: now.toISOString(),
    };
}

/** Department manager — scoped to membership department + “my requests”. */
async function buildDepartmentSummary(tenantId, userCtx) {
    const departmentId = userCtx?.departmentId || null;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    if (!departmentId) {
        const controlTower = await computeControlTowerMetrics(tenantId, monthStart, userCtx, {
            towerMode: 'full',
            departmentId: null,
        });
        return {
            meta: { dashboardProfile: 'department', departmentScoped: false },
            inventoryOverview: {
                totalValue: 0,
                totalStores: 0,
                totalActiveItems: 0,
                totalQtyOnHand: 0,
                valueByDepartment: [],
            },
            monthlyPerformance: {
                consumptionValue: 0,
                consumptionDelta: 0,
                transfersCount: 0,
                lossValue: 0,
                lossDelta: 0,
            },
            riskIndicators: null,
            operationalHealth: {
                pendingTransfersCount: 0,
                pendingGrnsCount: 0,
                pendingLossCount: 0,
                overdueLoansCount: 0,
                pendingStockReportsCount: 0,
                details: {
                    pendingTransfers: [],
                    pendingGrns: [],
                    pendingLoss: [],
                    overdueLoans: [],
                    pendingStockReports: [],
                },
            },
            controlTower,
            myRequestStatus: [],
            generatedAt: now.toISOString(),
        };
    }

    const [
        inventoryTotals,
        valueByStore,
        thisMonthMovements,
        prevMonthMovements,
        agingData,
        topConsumed,
        topSlow,
        operationalHealth,
        controlTower,
        myRequestStatus,
    ] = await Promise.all([
        (async () => {
            const [balances, storeCount, itemCount] = await Promise.all([
                prisma.stockBalance.aggregate({
                    where: { tenantId, item: { departmentId } },
                    _sum: { qtyOnHand: true },
                }),
                prisma.location.count({ where: { tenantId, isActive: true, departmentId } }),
                prisma.item.count({ where: { tenantId, isActive: true, departmentId } }),
            ]);
            const valueResult = await prisma.$queryRaw`
                SELECT COALESCE(SUM(sb."qtyOnHand" * sb."wacUnitCost"), 0)::float as "totalValue"
                FROM stock_balances sb
                JOIN items i ON i."id" = sb."itemId"
                WHERE sb."tenantId" = ${tenantId}::uuid
                  AND i."departmentId" = ${departmentId}::uuid
            `;
            return {
                totalValue: valueResult[0]?.totalValue || 0,
                totalStores: storeCount,
                totalActiveItems: itemCount,
                totalQtyOnHand: Number(balances._sum.qtyOnHand || 0),
            };
        })(),
        (async () => {
            const rows = await prisma.$queryRaw`
                SELECT d."name" as "departmentName",
                       COALESCE(SUM(sb."qtyOnHand" * sb."wacUnitCost"), 0)::float as "value"
                FROM stock_balances sb
                JOIN items i ON i."id" = sb."itemId"
                JOIN departments d ON d."id" = i."departmentId"
                WHERE sb."tenantId" = ${tenantId}::uuid
                  AND i."departmentId" = ${departmentId}::uuid
                GROUP BY d."id", d."name"
                ORDER BY "value" DESC
            `;
            return rows;
        })(),
        (async () => {
            const consumption = await prisma.$queryRaw`
                SELECT COALESCE(SUM(il."qtyOut" * il."unitCost"), 0)::float as "value"
                FROM inventory_ledger il
                JOIN items i ON i."id" = il."itemId"
                WHERE il."tenantId" = ${tenantId}::uuid
                  AND il."movementType" IN ('ISSUE')
                  AND il."createdAt" >= ${monthStart}
                  AND i."departmentId" = ${departmentId}::uuid
            `;
            const transfers = await prisma.inventoryLedger.count({
                where: {
                    tenantId,
                    movementType: 'TRANSFER_OUT',
                    createdAt: { gte: monthStart },
                    item: { departmentId },
                },
            });
            const lossValue = await prisma.$queryRaw`
                SELECT COALESCE(SUM(il."qtyOut" * il."unitCost"), 0)::float as "value"
                FROM inventory_ledger il
                JOIN items i ON i."id" = il."itemId"
                WHERE il."tenantId" = ${tenantId}::uuid
                  AND il."movementType" = 'BREAKAGE'
                  AND il."createdAt" >= ${monthStart}
                  AND i."departmentId" = ${departmentId}::uuid
            `;
            return {
                consumptionValue: consumption[0]?.value || 0,
                transfersCount: transfers,
                lossValue: lossValue[0]?.value || 0,
            };
        })(),
        (async () => {
            const consumption = await prisma.$queryRaw`
                SELECT COALESCE(SUM(il."qtyOut" * il."unitCost"), 0)::float as "value"
                FROM inventory_ledger il
                JOIN items i ON i."id" = il."itemId"
                WHERE il."tenantId" = ${tenantId}::uuid
                  AND il."movementType" IN ('ISSUE')
                  AND il."createdAt" >= ${prevMonthStart}
                  AND il."createdAt" <= ${prevMonthEnd}
                  AND i."departmentId" = ${departmentId}::uuid
            `;
            const lossValue = await prisma.$queryRaw`
                SELECT COALESCE(SUM(il."qtyOut" * il."unitCost"), 0)::float as "value"
                FROM inventory_ledger il
                JOIN items i ON i."id" = il."itemId"
                WHERE il."tenantId" = ${tenantId}::uuid
                  AND il."movementType" = 'BREAKAGE'
                  AND il."createdAt" >= ${prevMonthStart}
                  AND il."createdAt" <= ${prevMonthEnd}
                  AND i."departmentId" = ${departmentId}::uuid
            `;
            return {
                consumptionValue: consumption[0]?.value || 0,
                lossValue: lossValue[0]?.value || 0,
            };
        })(),
        (async () => {
            const rows = await prisma.$queryRaw`
                SELECT
                    CASE
                        WHEN last_move IS NULL OR NOW() - last_move > INTERVAL '60 days' THEN '60+'
                        WHEN NOW() - last_move > INTERVAL '30 days' THEN '31-60'
                        ELSE '0-30'
                    END as bucket,
                    COUNT(*)::int as count,
                    COALESCE(SUM(sb."qtyOnHand" * sb."wacUnitCost"), 0)::float as "value"
                FROM stock_balances sb
                JOIN items i ON i."id" = sb."itemId"
                LEFT JOIN LATERAL (
                    SELECT MAX(il."createdAt") as last_move
                    FROM inventory_ledger il
                    WHERE il."itemId" = sb."itemId"
                      AND il."locationId" = sb."locationId"
                      AND il."tenantId" = sb."tenantId"
                ) lm ON true
                WHERE sb."tenantId" = ${tenantId}::uuid
                  AND sb."qtyOnHand" > 0
                  AND i."departmentId" = ${departmentId}::uuid
                GROUP BY bucket
                ORDER BY bucket
            `;
            return rows;
        })(),
        (async () => {
            const rows = await prisma.$queryRaw`
                SELECT i."name" as "itemName",
                       SUM(il."qtyOut")::float as "totalQty",
                       SUM(il."qtyOut" * il."unitCost")::float as "totalValue"
                FROM inventory_ledger il
                JOIN items i ON i."id" = il."itemId"
                WHERE il."tenantId" = ${tenantId}::uuid
                  AND il."movementType" = 'ISSUE'
                  AND il."createdAt" >= ${monthStart}
                  AND i."departmentId" = ${departmentId}::uuid
                GROUP BY i."id", i."name"
                ORDER BY "totalValue" DESC
                LIMIT 5
            `;
            return rows;
        })(),
        (async () => {
            const rows = await prisma.$queryRaw`
                SELECT i."name" as "itemName",
                       sb."qtyOnHand"::float as "qtyOnHand",
                       (sb."qtyOnHand" * sb."wacUnitCost")::float as "value",
                       MAX(il."createdAt") as "lastMovement"
                FROM stock_balances sb
                JOIN items i ON i."id" = sb."itemId"
                LEFT JOIN inventory_ledger il
                    ON il."itemId" = sb."itemId"
                   AND il."locationId" = sb."locationId"
                   AND il."tenantId" = sb."tenantId"
                WHERE sb."tenantId" = ${tenantId}::uuid
                  AND sb."qtyOnHand" > 0
                  AND i."departmentId" = ${departmentId}::uuid
                GROUP BY i."id", i."name", sb."qtyOnHand", sb."wacUnitCost"
                ORDER BY MAX(il."createdAt") ASC NULLS FIRST
                LIMIT 5
            `;
            return rows;
        })(),
        (async () => {
            const nowOp = new Date();
            const [pendingTransfers, pendingGrns, pendingLoss, overdueLoans] = await Promise.all([
                prisma.storeTransfer.findMany({
                    where: { tenantId, status: { in: ['PENDING_DEPT', 'PENDING_FINANCE'] } },
                    select: { id: true, transferNo: true, status: true, sourceLocationId: true, destLocationId: true },
                }).catch(() => []),
                prisma.grnImport.findMany({
                    where: {
                        tenantId,
                        status: { in: openGrnStatusesForQuery() },
                    },
                    select: { id: true, grnNumber: true, status: true, vendorId: true },
                }).catch(() => []),
                prisma.movementDocument.findMany({
                    where: {
                        tenantId,
                        movementType: 'BREAKAGE',
                        status: 'DRAFT',
                        lines: { some: { item: { departmentId } } },
                    },
                    select: { id: true, documentNo: true, status: true, sourceLocationId: true },
                }).catch(() => []),
                prisma.getPass.findMany({
                    where: { tenantId, status: { in: ['OUT', 'PARTIALLY_RETURNED'] }, expectedReturnDate: { lt: nowOp } },
                    select: { id: true, passNo: true, borrowingEntity: true, expectedReturnDate: true },
                }).catch(() => []),
            ]);
            return {
                pendingTransfersCount: pendingTransfers.length,
                pendingGrnsCount: pendingGrns.length,
                pendingLossCount: pendingLoss.length,
                overdueLoansCount: overdueLoans.length,
                pendingStockReportsCount: 0,
                details: {
                    pendingTransfers: pendingTransfers.slice(0, 5),
                    pendingGrns: pendingGrns.slice(0, 5),
                    pendingLoss: pendingLoss.slice(0, 5),
                    overdueLoans: overdueLoans.slice(0, 5).map((p) => ({
                        id: p.id,
                        loanNo: p.passNo,
                        qty: '-',
                        borrowingEntity: p.borrowingEntity,
                        expectedReturnDate: p.expectedReturnDate,
                    })),
                    pendingStockReports: [],
                },
            };
        })(),
        computeControlTowerMetrics(tenantId, monthStart, userCtx, { towerMode: 'full', departmentId }),
        (async () => {
            if (!userCtx?.id) return [];
            const rows = await prisma.movementDocument.groupBy({
                by: ['status'],
                where: {
                    tenantId,
                    createdBy: userCtx.id,
                    movementType: { in: ['BREAKAGE', 'LOST'] },
                },
                _count: { _all: true },
            });
            return rows.map((r) => ({ status: r.status, count: r._count._all }));
        })(),
    ]);

    const calcDelta = (curr, prev) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
    };
    const consumptionDelta = calcDelta(thisMonthMovements.consumptionValue, prevMonthMovements.consumptionValue);
    const lossDelta = calcDelta(thisMonthMovements.lossValue, prevMonthMovements.lossValue);
    const lossVsConsumption = thisMonthMovements.consumptionValue > 0
        ? Math.round((thisMonthMovements.lossValue / thisMonthMovements.consumptionValue) * 100 * 10) / 10
        : 0;

    return {
        meta: { dashboardProfile: 'department', departmentScoped: true, departmentId },
        inventoryOverview: {
            ...inventoryTotals,
            valueByDepartment: valueByStore,
        },
        monthlyPerformance: {
            consumptionValue: thisMonthMovements.consumptionValue,
            consumptionDelta,
            transfersCount: thisMonthMovements.transfersCount,
            lossValue: thisMonthMovements.lossValue,
            lossDelta,
        },
        riskIndicators: {
            aging: agingData,
            topConsumed,
            topSlow,
            lossVsConsumptionPct: lossVsConsumption,
        },
        operationalHealth: await alignOperationalHealthWithPipeline(tenantId, userCtx, operationalHealth),
        controlTower,
        myRequestStatus,
        generatedAt: now.toISOString(),
    };
}

async function buildSecuritySummary(tenantId, userCtx) {
    const now = new Date();
    const [pendingGate, outPasses] = await Promise.all([
        prisma.getPass.count({
            where: { tenantId, status: 'PENDING_SECURITY' },
        }),
        prisma.getPass.count({
            where: { tenantId, status: { in: ['OUT', 'PARTIALLY_RETURNED'] } },
        }),
    ]);

    return {
        meta: { dashboardProfile: 'security' },
        inventoryOverview: null,
        monthlyPerformance: null,
        riskIndicators: null,
        operationalHealth: null,
        controlTower: null,
        securitySnapshot: {
            pendingGateApprovals: pendingGate,
            activeOutPasses: outPasses,
        },
        generatedAt: now.toISOString(),
    };
}

/** Storekeeper / Cost Control — alerts + workflow + pending list only (lean). */
async function computeControlTowerOperations(tenantId, monthStart, userCtx) {
    const role = userCtx?.role ? normalizeRole(userCtx.role) : '';
    const elevated = ['ORG_MANAGER', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(role);

    const [
        workflowGrouped,
        stockAlertRows,
        pendingApprovals,
        pendingPreview,
    ] = await Promise.all([
        prisma.$queryRaw`
            SELECT md.status::text AS "status",
                   COUNT(*)::int AS "count"
            FROM movement_documents md
            WHERE md."tenantId" = ${tenantId}::uuid
              AND md."movementType" IN ('BREAKAGE', 'LOST')
              AND md.status NOT IN ('APPROVED', 'VOID', 'REJECTED')
            GROUP BY md.status
        `,
        prisma.$queryRaw`
            SELECT i.id AS "itemId",
                   i.name AS "itemName",
                   sb."qtyOnHand"::float AS "qtyOnHand",
                   sb."minQty"::float AS "minQty",
                   (sb."minQty" - sb."qtyOnHand")::float AS "shortfall"
            FROM stock_balances sb
            JOIN items i ON i.id = sb."itemId"
            WHERE sb."tenantId" = ${tenantId}::uuid
              AND sb."minQty" > 0
              AND sb."qtyOnHand" < sb."minQty"
            ORDER BY (sb."minQty" - sb."qtyOnHand") DESC
            LIMIT 10
        `,
        prisma.approvalRequest.findMany({
            where: {
                tenantId,
                status: 'PENDING',
                requestType: { in: ['BREAKAGE', 'LOST'] },
                document: {
                    status: { notIn: ['VOID', 'REJECTED', 'APPROVED'] },
                },
            },
            include: {
                steps: { orderBy: { stepNumber: 'asc' }, include: { requiredRole: true } },
            },
        }),
        prisma.approvalRequest.findMany({
            where: {
                tenantId,
                status: 'PENDING',
                requestType: { in: ['BREAKAGE', 'LOST'] },
                document: {
                    status: { notIn: ['VOID', 'REJECTED', 'APPROVED'] },
                },
            },
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
                document: { select: { documentNo: true, movementType: true, status: true } },
            },
        }),
    ]);

    let pendingMyActionCount = 0;
    for (const ar of pendingApprovals) {
        const step = ar.steps.find(
            (s) => s.stepNumber === ar.currentStep && s.status === 'PENDING',
        );
        if (!step) continue;
        const reqCode = step.requiredRole?.code ? normalizeRole(step.requiredRole.code) : '';
        if (elevated) {
            pendingMyActionCount += 1;
        } else if (reqCode && reqCode === role) {
            pendingMyActionCount += 1;
        }
    }

    const workflowHealth = (workflowGrouped || []).map((g) => ({
        status: g.status,
        count: Number(g.count || 0),
    }));

    const stockAlerts = (stockAlertRows || []).map((r) => ({
        itemId: r.itemId,
        itemName: r.itemName,
        qtyOnHand: Number(r.qtyOnHand || 0),
        minQty: Number(r.minQty || 0),
        shortfall: Number(r.shortfall || 0),
    }));

    const pendingApprovalsPreview = (pendingPreview || []).map((p) => ({
        id: p.id,
        documentNo: p.document?.documentNo ?? '',
        movementType: p.document?.movementType ?? '',
        status: p.document?.status ?? '',
    }));

    return {
        monthlyApprovedLosses: { totalValue: 0, documentCount: 0 },
        workflowHealth,
        stockAlerts,
        accountabilityDistribution: {
            companyLoss: 0,
            employeeDeduction: 0,
            targetHotelCompensation: 0,
            unspecified: 0,
        },
        lossVsBreakage: { breakageValue: 0, lostValue: 0 },
        topVulnerableItems: [],
        pendingMyActionCount,
        activeUsersCount: 0,
        pendingApprovalsPreview,
    };
}

/**
 * Control Tower — breakage/lost KPIs, workflow queue, stock alerts, accountability split.
 * @param {{ towerMode?: 'full'|'operations', departmentId?: string|null }} opts
 */
async function computeControlTowerMetrics(tenantId, monthStart, userCtx, opts = {}) {
    const towerMode = opts.towerMode || 'full';
    const departmentId = opts.departmentId || null;

    if (towerMode === 'operations') {
        return computeControlTowerOperations(tenantId, monthStart, userCtx);
    }

    const role = userCtx?.role ? normalizeRole(userCtx.role) : '';
    const elevated = ['ORG_MANAGER', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(role);

    const postedWhere = {
        tenantId,
        movementType: { in: ['BREAKAGE', 'LOST'] },
        status: 'APPROVED',
        postedAt: { gte: monthStart },
        ...(departmentId
            ? { lines: { some: { item: { departmentId } } } }
            : {}),
    };

    const approvalDocWhere = {
        status: { notIn: ['VOID', 'REJECTED', 'APPROVED'] },
        ...(departmentId
            ? { lines: { some: { item: { departmentId } } } }
            : {}),
    };

    const [
        monthlyPostedDocs,
        workflowGrouped,
        stockAlertRows,
        vulnerableRows,
        lossBreakageRows,
        pendingApprovals,
        activeUsersCount,
    ] = await Promise.all([
        prisma.movementDocument.findMany({
            where: postedWhere,
            include: {
                lines: true,
                approvalRequests: {
                    include: { steps: { orderBy: { stepNumber: 'asc' } } },
                },
            },
        }),
        departmentId
            ? prisma.$queryRaw`
            SELECT md.status::text AS "status",
                   COUNT(*)::int AS "count"
            FROM movement_documents md
            WHERE md."tenantId" = ${tenantId}::uuid
              AND md."movementType" IN ('BREAKAGE', 'LOST')
              AND md.status NOT IN ('APPROVED', 'VOID', 'REJECTED')
              AND EXISTS (
                SELECT 1 FROM movement_lines ml
                JOIN items i ON i.id = ml."itemId"
                WHERE ml."documentId" = md.id AND i."departmentId" = ${departmentId}::uuid
              )
            GROUP BY md.status
        `
            : prisma.$queryRaw`
            SELECT md.status::text AS "status",
                   COUNT(*)::int AS "count"
            FROM movement_documents md
            WHERE md."tenantId" = ${tenantId}::uuid
              AND md."movementType" IN ('BREAKAGE', 'LOST')
              AND md.status NOT IN ('APPROVED', 'VOID', 'REJECTED')
            GROUP BY md.status
        `,
        departmentId
            ? prisma.$queryRaw`
            SELECT i.id AS "itemId",
                   i.name AS "itemName",
                   sb."qtyOnHand"::float AS "qtyOnHand",
                   sb."minQty"::float AS "minQty",
                   (sb."minQty" - sb."qtyOnHand")::float AS "shortfall"
            FROM stock_balances sb
            JOIN items i ON i.id = sb."itemId"
            WHERE sb."tenantId" = ${tenantId}::uuid
              AND i."departmentId" = ${departmentId}::uuid
              AND sb."minQty" > 0
              AND sb."qtyOnHand" < sb."minQty"
            ORDER BY (sb."minQty" - sb."qtyOnHand") DESC
            LIMIT 5
        `
            : prisma.$queryRaw`
            SELECT i.id AS "itemId",
                   i.name AS "itemName",
                   sb."qtyOnHand"::float AS "qtyOnHand",
                   sb."minQty"::float AS "minQty",
                   (sb."minQty" - sb."qtyOnHand")::float AS "shortfall"
            FROM stock_balances sb
            JOIN items i ON i.id = sb."itemId"
            WHERE sb."tenantId" = ${tenantId}::uuid
              AND sb."minQty" > 0
              AND sb."qtyOnHand" < sb."minQty"
            ORDER BY (sb."minQty" - sb."qtyOnHand") DESC
            LIMIT 5
        `,
        departmentId
            ? prisma.$queryRaw`
            SELECT i.name AS "itemName",
                   COUNT(*)::int AS "eventCount",
                   COALESCE(SUM(il."qtyOut" * il."unitCost"), 0)::float AS "totalCost"
            FROM inventory_ledger il
            JOIN items i ON i.id = il."itemId"
            WHERE il."tenantId" = ${tenantId}::uuid
              AND i."departmentId" = ${departmentId}::uuid
              AND il."movementType" IN ('BREAKAGE', 'LOST')
              AND il."createdAt" >= ${monthStart}
            GROUP BY i.id, i.name
            ORDER BY COALESCE(SUM(il."qtyOut" * il."unitCost"), 0) DESC
            LIMIT 5
        `
            : prisma.$queryRaw`
            SELECT i.name AS "itemName",
                   COUNT(*)::int AS "eventCount",
                   COALESCE(SUM(il."qtyOut" * il."unitCost"), 0)::float AS "totalCost"
            FROM inventory_ledger il
            JOIN items i ON i.id = il."itemId"
            WHERE il."tenantId" = ${tenantId}::uuid
              AND il."movementType" IN ('BREAKAGE', 'LOST')
              AND il."createdAt" >= ${monthStart}
            GROUP BY i.id, i.name
            ORDER BY COALESCE(SUM(il."qtyOut" * il."unitCost"), 0) DESC
            LIMIT 5
        `,
        departmentId
            ? prisma.$queryRaw`
            SELECT il."movementType"::text AS "movementType",
                   COALESCE(SUM(il."qtyOut" * il."unitCost"), 0)::float AS "value"
            FROM inventory_ledger il
            JOIN items i ON i.id = il."itemId"
            WHERE il."tenantId" = ${tenantId}::uuid
              AND i."departmentId" = ${departmentId}::uuid
              AND il."movementType" IN ('BREAKAGE', 'LOST')
              AND il."createdAt" >= ${monthStart}
            GROUP BY il."movementType"
        `
            : prisma.$queryRaw`
            SELECT il."movementType"::text AS "movementType",
                   COALESCE(SUM(il."qtyOut" * il."unitCost"), 0)::float AS "value"
            FROM inventory_ledger il
            WHERE il."tenantId" = ${tenantId}::uuid
              AND il."movementType" IN ('BREAKAGE', 'LOST')
              AND il."createdAt" >= ${monthStart}
            GROUP BY il."movementType"
        `,
        prisma.approvalRequest.findMany({
            where: {
                tenantId,
                status: 'PENDING',
                requestType: { in: ['BREAKAGE', 'LOST'] },
                document: approvalDocWhere,
            },
            include: {
                steps: { orderBy: { stepNumber: 'asc' }, include: { requiredRole: true } },
            },
        }),
        prisma.tenantMember.count({
            where: { tenantId, isActive: true, user: { isActive: true } },
        }),
    ]);

    let monthlyApprovedLossValue = 0;
    for (const d of monthlyPostedDocs) {
        for (const line of d.lines) {
            monthlyApprovedLossValue += Number(line.totalValue || 0);
        }
    }

    const accountabilityDistribution = {
        companyLoss: 0,
        employeeDeduction: 0,
        targetHotelCompensation: 0,
        unspecified: 0,
    };

    for (const d of monthlyPostedDocs) {
        const steps = d.approvalRequests?.steps ?? [];
        let acc = null;
        for (let i = steps.length - 1; i >= 0; i -= 1) {
            if (steps[i].accountabilityType) {
                acc = steps[i].accountabilityType;
                break;
            }
        }
        const docVal = d.lines.reduce((s, l) => s + Number(l.totalValue || 0), 0);
        if (acc === 'COMPANY_LOSS') accountabilityDistribution.companyLoss += docVal;
        else if (acc === 'EMPLOYEE_DEDUCTION') accountabilityDistribution.employeeDeduction += docVal;
        else if (acc === 'TARGET_HOTEL_COMPENSATION') accountabilityDistribution.targetHotelCompensation += docVal;
        else accountabilityDistribution.unspecified += docVal;
    }

    let breakageMonthValue = 0;
    let lostMonthValue = 0;
    for (const row of lossBreakageRows) {
        const mt = String(row.movementType || '');
        const v = Number(row.value || 0);
        if (mt === 'BREAKAGE') breakageMonthValue += v;
        if (mt === 'LOST') lostMonthValue += v;
    }

    let pendingMyActionCount = 0;
    for (const ar of pendingApprovals) {
        const step = ar.steps.find(
            (s) => s.stepNumber === ar.currentStep && s.status === 'PENDING',
        );
        if (!step) continue;
        const reqCode = step.requiredRole?.code ? normalizeRole(step.requiredRole.code) : '';
        if (elevated) {
            pendingMyActionCount += 1;
        } else if (reqCode && reqCode === role) {
            pendingMyActionCount += 1;
        }
    }

    const workflowHealth = (workflowGrouped || []).map((g) => ({
        status: g.status,
        count: Number(g.count || 0),
    }));

    const stockAlerts = (stockAlertRows || []).map((r) => ({
        itemId: r.itemId,
        itemName: r.itemName,
        qtyOnHand: Number(r.qtyOnHand || 0),
        minQty: Number(r.minQty || 0),
        shortfall: Number(r.shortfall || 0),
    }));

    const topVulnerableItems = (vulnerableRows || []).map((r) => ({
        itemName: r.itemName,
        eventCount: Number(r.eventCount || 0),
        totalCost: Number(r.totalCost || 0),
    }));

    return {
        monthlyApprovedLosses: {
            totalValue: monthlyApprovedLossValue,
            documentCount: monthlyPostedDocs.length,
        },
        workflowHealth,
        stockAlerts,
        accountabilityDistribution,
        lossVsBreakage: {
            breakageValue: breakageMonthValue,
            lostValue: lostMonthValue,
        },
        topVulnerableItems,
        pendingMyActionCount,
        activeUsersCount,
    };
}

/**
 * Analytics chart data — consumption trend, department breakdown, top consumed, low stock
 * (executive-style roles only; others get empty series to keep payloads lean).
 */
const getChartData = async (tenantId, userCtx = null) => {
    const profile = resolveDashboardProfile(userCtx?.role);
    if (profile !== 'executive') {
        return {
            consumptionByMonth: [],
            deptBreakdown: [],
            topConsumed: [],
            lowStockData: [],
        };
    }

    const now = new Date();

    // Generate last 6 months
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            start: d,
            end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
            label: d.toLocaleDateString('en', { month: 'short', year: '2-digit' }),
        });
    }

    const [consumptionByMonth, deptBreakdown, topConsumed, lowStockData] = await Promise.all([
        // 1. Consumption trend (last 6 months)
        Promise.all(months.map(async (m) => {
            const result = await prisma.inventoryLedger.aggregate({
                where: {
                    tenantId,
                    movementType: 'ISSUE',
                    createdAt: { gte: m.start, lte: m.end },
                },
                _sum: { qtyOut: true },
                _count: true,
            });
            // Also get breakage
            const breakage = await prisma.inventoryLedger.aggregate({
                where: {
                    tenantId,
                    movementType: 'BREAKAGE',
                    createdAt: { gte: m.start, lte: m.end },
                },
                _sum: { qtyOut: true },
            });
            return {
                month: m.label,
                consumption: Number(result._sum.qtyOut || 0),
                breakage: Number(breakage._sum.qtyOut || 0),
                transactions: result._count || 0,
            };
        })),

        // 2. Inventory value by department
        (async () => {
            const depts = await prisma.department.findMany({
                where: { tenantId, isActive: true },
                select: { id: true, name: true },
            });
            const results = await Promise.all(depts.map(async (dept) => {
                const value = await prisma.$queryRaw`
                    SELECT COALESCE(SUM(sb."qtyOnHand" * sb."wacUnitCost"), 0)::float as value
                    FROM stock_balances sb
                    JOIN items i ON sb."itemId" = i.id
                    WHERE sb."tenantId" = ${tenantId}::uuid
                    AND i."departmentId" = ${dept.id}::uuid
                `;
                const itemCount = await prisma.item.count({
                    where: { tenantId, departmentId: dept.id, isActive: true },
                });
                return { name: dept.name, value: value[0]?.value || 0, items: itemCount };
            }));
            return results.filter(r => r.value > 0 || r.items > 0).sort((a, b) => b.value - a.value);
        })(),

        // 3. Top 10 consumed items (last 30 days)
        (async () => {
            const thirtyAgo = new Date(now.getTime() - 30 * 86400000);
            const result = await prisma.inventoryLedger.groupBy({
                by: ['itemId'],
                where: {
                    tenantId,
                    movementType: 'ISSUE',
                    createdAt: { gte: thirtyAgo },
                },
                _sum: { qtyOut: true },
                orderBy: { _sum: { qtyOut: 'desc' } },
                take: 10,
            });
            const itemIds = result.map(r => r.itemId);
            const items = await prisma.item.findMany({
                where: { id: { in: itemIds } },
                select: { id: true, name: true },
            });
            const nameMap = Object.fromEntries(items.map(i => [i.id, i.name]));
            return result.map(r => ({
                name: nameMap[r.itemId] || 'Unknown',
                qty: Number(r._sum.qtyOut || 0),
            }));
        })(),

        // 4. Low stock summary — count DISTINCT items (not stockBalance rows per location)
        (async () => {
            const balances = await prisma.stockBalance.findMany({
                where: {
                    tenantId,
                    OR: [
                        { reorderPoint: { gt: 0 } },
                        { minQty: { gt: 0 } },
                        { maxQty: { gt: 0 } },
                    ]
                },
            });

            // Group by itemId and determine worst status per distinct item
            const itemMap = new Map(); // itemId → worst status: 'critical' | 'warning' | 'ok'
            for (const b of balances) {
                const qty = Number(b.qtyOnHand || 0);
                const min = Number(b.minQty || 0);
                const reorder = Number(b.reorderPoint || 0);

                let status = 'ok';
                if (qty === 0 || (min > 0 && qty < min)) status = 'critical';
                else if (reorder > 0 && qty <= reorder) status = 'warning';

                const prev = itemMap.get(b.itemId);
                // Worst-case: critical > warning > ok
                if (!prev || (status === 'critical') || (status === 'warning' && prev === 'ok')) {
                    itemMap.set(b.itemId, status);
                }
            }

            let critical = 0, warning = 0, ok = 0;
            for (const status of itemMap.values()) {
                if (status === 'critical') critical++;
                else if (status === 'warning') warning++;
                else ok++;
            }

            return [
                { name: 'Critical', value: critical, fill: '#ef4444' },
                { name: 'Warning', value: warning, fill: '#f59e0b' },
                { name: 'OK', value: ok, fill: '#22c55e' },
            ];
        })(),
    ]);

    return { consumptionByMonth, deptBreakdown, topConsumed, lowStockData };
};

/**
 * Per-branch metrics for org comparison (child tenants only).
 * Inventory value matches executive dashboard (Σ qtyOnHand × wacUnitCost).
 * Consumption: ISSUE ledger value for current calendar month.
 * Waste: BREAKAGE ledger value for current month (MovementType has no LOSS; aligns with dashboard loss).
 * Pending tasks: same pending definitions as operational health (transfers + GRNs + open stock counts).
 */
const aggregateBranchMetrics = async (tenantId, monthStart) => {
    const [
        inventoryRow,
        consumptionRow,
        wasteRow,
        pendingTransfers,
        pendingGrns,
        pendingInventories,
    ] = await Promise.all([
        prisma.$queryRaw`
            SELECT COALESCE(SUM("qtyOnHand" * "wacUnitCost"), 0)::float as "totalValue"
            FROM stock_balances
            WHERE "tenantId" = ${tenantId}::uuid
        `,
        prisma.$queryRaw`
            SELECT COALESCE(SUM("qtyOut" * "unitCost"), 0)::float as "value"
            FROM inventory_ledger
            WHERE "tenantId" = ${tenantId}::uuid
              AND "movementType" = 'ISSUE'
              AND "createdAt" >= ${monthStart}
        `,
        prisma.$queryRaw`
            SELECT COALESCE(SUM("qtyOut" * "unitCost"), 0)::float as "value"
            FROM inventory_ledger
            WHERE "tenantId" = ${tenantId}::uuid
              AND "movementType" = 'BREAKAGE'
              AND "createdAt" >= ${monthStart}
        `,
        prisma.storeTransfer.count({
            where: {
                tenantId,
                status: { in: ['PENDING_DEPT', 'PENDING_FINANCE'] },
            },
        }),
        prisma.grnImport.count({
            where: {
                tenantId,
                status: { in: openGrnStatusesForQuery() },
            },
        }),
        prisma.stockCountSession.count({
            where: {
                tenantId,
                status: { in: ['DRAFT', 'PENDING_APPROVAL'] },
            },
        }),
    ]);

    return {
        inventoryValue: Number(inventoryRow[0]?.totalValue || 0),
        consumption: Number(consumptionRow[0]?.value || 0),
        waste: Number(wasteRow[0]?.value || 0),
        pendingTasks: pendingTransfers + pendingGrns + pendingInventories,
    };
};

/**
 * @param {string} parentTenantId — root organization tenant id (parentId must be null)
 * @returns {Promise<Array<{ branchName: string, inventoryValue: number, consumption: number, waste: number, pendingTasks: number }>>}
 */
const getOrganizationSummary = async (parentTenantId) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const branches = await prisma.tenant.findMany({
        where: { parentId: parentTenantId },
        select: { id: true, name: true, slug: true, subStatus: true },
        orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
        branches.map(async (b) => {
            const m = await aggregateBranchMetrics(b.id, monthStart);
            return {
                branchName: b.name,
                tenantId: b.id,
                tenantSlug: b.slug,
                subStatus: b.subStatus,
                inventoryValue: m.inventoryValue,
                consumption: m.consumption,
                waste: m.waste,
                pendingTasks: m.pendingTasks,
            };
        }),
    );

    return rows;
};

module.exports = { getDashboardSummary, getChartData, getOrganizationSummary };
