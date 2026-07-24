const prisma = require('../config/database');
const {
    getWorkflowPipelineSummary,
    getWorkflowPipelineAlerts,
} = require('./workflow-pipeline/workflow-pipeline.service');

/**
 * Get low stock alerts — items where qtyOnHand <= reorderPoint (per StockBalance)
 */
const getLowStockAlerts = async (tenantId) => {
    const balances = await prisma.stockBalance.findMany({
        where: {
            tenantId,
            OR: [{ reorderPoint: { gt: 0 } }, { minQty: { gt: 0 } }],
        },
        include: {
            item: {
                select: {
                    id: true,
                    name: true,
                    barcode: true,
                    imageUrl: true,
                    unitPrice: true,
                    category: { select: { name: true } },
                    supplier: { select: { name: true } },
                    department: { select: { name: true } },
                },
            },
            location: { select: { id: true, name: true } },
        },
    });

    const alerts = [];
    for (const bal of balances) {
        const qty = Number(bal.qtyOnHand);
        const reorder = Number(bal.reorderPoint);
        const min = Number(bal.minQty);

        const isBelowReorder = reorder > 0 && qty <= reorder;
        const isBelowMin = min > 0 && qty < min;
        const isOutOfStock = qty === 0;

        if (!isOutOfStock && !isBelowMin && !isBelowReorder) continue;

        let severity;
        if (isOutOfStock) severity = 'critical';
        else if (isBelowMin) severity = 'high';
        else severity = 'warning';

        let message;
        if (isOutOfStock) {
            message = `${bal.item.name} is OUT OF STOCK at ${bal.location.name}!`;
        } else if (isBelowMin) {
            message = `${bal.item.name} stock (${qty}) is below minimum (${min}) at ${bal.location.name}`;
        } else {
            message = `${bal.item.name} stock (${qty}) is below reorder point (${reorder}) at ${bal.location.name}`;
        }

        alerts.push({
            id: `${bal.itemId}_${bal.locationId}`,
            type: 'LOW_STOCK',
            itemName: bal.item.name,
            barcode: bal.item.barcode,
            category: bal.item.category?.name || null,
            department: bal.item.department?.name || null,
            supplier: bal.item.supplier?.name || null,
            locationName: bal.location.name,
            currentStock: qty,
            reorderPoint: reorder,
            minQty: min,
            severity,
            message,
            deepLink: '/stock',
        });
    }

    const severityOrder = { critical: 0, high: 1, warning: 2, info: 3 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return alerts;
};

/**
 * Notification summary — workflow pipeline (SSOT) + low stock + system unread.
 */
const getNotificationSummary = async (tenantId, userId, userRole) => {
    const userCtx = { id: userId, role: userRole };
    const [stockAlerts, pipelineSummary, pipelineAlerts] = await Promise.all([
        getLowStockAlerts(tenantId),
        getWorkflowPipelineSummary(tenantId, userCtx).catch(() => null),
        getWorkflowPipelineAlerts(tenantId, userCtx, { limit: 12 }).catch(() => []),
    ]);

    let systemUnread = 0;
    if (userId) {
        systemUnread = await prisma.systemNotification
            .count({
                where: { tenantId, userId, readAt: null },
            })
            .catch(() => 0);
    }

    const workflowCount = pipelineSummary?.total ?? 0;
    const criticalWorkflow = pipelineSummary?.critical ?? 0;
    const warningWorkflow = pipelineSummary?.warning ?? 0;
    const mine = pipelineSummary?.mine ?? 0;
    const overdueLoans = pipelineSummary?.getPassOverdue ?? 0;

    const workflowNotifications = pipelineAlerts.map((item) => ({
        id: item.id,
        type: 'WORKFLOW',
        module: item.module,
        severity: item.priority === 'critical' ? 'critical' : item.priority === 'warning' ? 'warning' : 'info',
        message: `${item.documentNo}: waiting for ${item.waitingForLabel || item.waitingForRole}`,
        documentNo: item.documentNo,
        status: item.status,
        waitingForRole: item.waitingForRole,
        waitingForLabel: item.waitingForLabel,
        overdue: item.overdue,
        deepLink: item.deepLink,
        createdAt: item.pendingSince,
    }));

    const totalCount =
        stockAlerts.length + workflowCount + systemUnread;

    return {
        totalCount,
        lowStock: stockAlerts.length,
        criticalStock: stockAlerts.filter((a) => a.severity === 'critical').length,
        warningStock: stockAlerts.filter((a) => a.severity === 'warning').length,
        pendingApprovals: (pipelineSummary?.byModule?.BREAKAGE || 0) + (pipelineSummary?.byModule?.LOST || 0),
        pendingBreakages: pipelineSummary?.byModule?.BREAKAGE || 0,
        pendingTransfers: pipelineSummary?.byModule?.TRANSFER || 0,
        pendingGrns: pipelineSummary?.byModule?.GRN || 0,
        pendingStockReports: 0,
        overdueLoans,
        overdueLoansList: workflowNotifications
            .filter((n) => n.module === 'GET_PASS' && n.overdue)
            .slice(0, 5),
        workflowCount,
        workflowMine: mine,
        workflowCritical: criticalWorkflow,
        workflowWarning: warningWorkflow,
        systemUnread,
        alerts: [
            ...workflowNotifications,
            ...stockAlerts.slice(0, 8).map((a) => ({
                ...a,
                deepLink: a.deepLink || '/stock',
            })),
        ].slice(0, 20),
        pipelineSummary,
    };
};

module.exports = { getLowStockAlerts, getNotificationSummary };
