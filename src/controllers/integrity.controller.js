const periodCloseGovernance = require('../services/periodCloseGovernance.service');
const integrityMonitoring = require('../services/integrityMonitoring.service');
const { runInventoryTruthReconciliation } = require('../services/inventoryTruthReconciliation.service');
const { logGovernedEvent } = require('../services/auditGoverned.service');
const { getGovernanceTrackingContext } = require('../services/governanceTracking.service');

const monthEndChecklist = async (req, res, next) => {
    try {
        const { year, month } = req.query;
        const data = await periodCloseGovernance.runMonthEndCloseChecklist(req.user.tenantId, {
            year: year ? Number(year) : undefined,
            month: month ? Number(month) : undefined,
        });
        res.json({ success: true, data });
    } catch (e) {
        next(e);
    }
};

const integrityScan = async (req, res, next) => {
    try {
        const sample = req.query.sampleSize ? Number(req.query.sampleSize) : undefined;
        const persist = req.query.persist !== 'false';
        const data = persist
            ? await integrityMonitoring.runAndPersistIntegrityScan(req.user.tenantId, {
                  stockLedgerSampleSize: sample,
                  triggeredBy: `USER:${req.user.id}`,
              })
            : await integrityMonitoring.runIntegrityScan(req.user.tenantId, {
                  stockLedgerSampleSize: sample,
              });
        await logGovernedEvent({
            tenantId: req.user.tenantId,
            entityType: 'SETTINGS',
            entityId: req.user.tenantId,
            action: 'UPDATE',
            changedBy: req.user.id,
            eventType: 'INTEGRITY_SCAN',
            note: `Integrity scan healthy=${data.healthy}`,
            afterValue: data.summary,
        });
        res.json({ success: true, data });
    } catch (e) {
        next(e);
    }
};

const integrityHistory = async (req, res, next) => {
    try {
        const limit = req.query.limit ? Number(req.query.limit) : 20;
        const data = await integrityMonitoring.getIntegrityScanHistory(req.user.tenantId, { limit });
        res.json({ success: true, data });
    } catch (e) {
        next(e);
    }
};

const reconciliationDashboard = async (req, res, next) => {
    try {
        const [scan, checklist] = await Promise.all([
            integrityMonitoring.runIntegrityScan(req.user.tenantId, { stockLedgerSampleSize: 200 }),
            periodCloseGovernance.runMonthEndCloseChecklist(req.user.tenantId),
        ]);
        res.json({
            success: true,
            data: {
                integrity: scan,
                monthEnd: checklist,
                scannedAt: new Date().toISOString(),
            },
        });
    } catch (e) {
        next(e);
    }
};

const inventoryTruthReconciliation = async (req, res, next) => {
    try {
        const parseList = (raw) =>
            String(raw || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);

        const locationIds = parseList(req.query.locationIds);
        const departmentIds = parseList(req.query.departmentIds);
        const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date();
        const limit = req.query.limit ? Number(req.query.limit) : 500;
        const includeInactive = req.query.includeInactive !== 'false';

        const data = await runInventoryTruthReconciliation(req.user.tenantId, {
            asOfDate,
            locationIds,
            departmentIds,
            categoryId: req.query.categoryId || undefined,
            includeInactive,
            limit,
        });

        await logGovernedEvent({
            tenantId: req.user.tenantId,
            entityType: 'SETTINGS',
            entityId: req.user.tenantId,
            action: 'READ',
            changedBy: req.user.id,
            eventType: 'INVENTORY_TRUTH_RECONCILIATION',
            note: `healthy=${data.healthy} driftRows=${data.totals?.driftRowCount ?? 0}`,
            afterValue: data.totals,
        });

        res.json({ success: true, data });
    } catch (e) {
        next(e);
    }
};

const governanceTrackingContext = async (req, res, next) => {
    try {
        const data = await getGovernanceTrackingContext(req.user.tenantId);
        res.json({ success: true, data });
    } catch (e) {
        next(e);
    }
};

module.exports = {
    monthEndChecklist,
    integrityScan,
    integrityHistory,
    reconciliationDashboard,
    inventoryTruthReconciliation,
    governanceTrackingContext,
};
