const reportService = require('../services/report.service');
const reportAnalyticsService = require('../services/report-analytics.service');
const { normalizeCardId } = require('../services/report-analytics.service');
const { success } = require('../utils/response');
const { generateValuationPDF } = require('../services/pdf/report-valuation-pdf.document');
const { describeValuationBasis } = require('../services/inventoryValuation.service');

const generateReport = async (req, res, next) => {
    try {
        const { reportType, departmentIds, startDate, endDate, categoryId, locationIds, includeSupplier, includeLocationQtys, healthPreset } = req.body;
        const locList = Array.isArray(locationIds)
            ? locationIds
            : locationIds
              ? String(locationIds).split(',').map((s) => s.trim()).filter(Boolean)
              : [];

        const report = await reportService.generateReport(
            req.user.tenantId,
            {
                reportType,
                departmentIds: Array.isArray(departmentIds) ? departmentIds : (departmentIds ? [departmentIds] : []),
                locationIds: locList,
                startDate,
                endDate,
                categoryId,
                includeSupplier,
                includeLocationQtys,
                healthPreset,
                generatedBy: req.user.id,
            },
            req.user,
        );

        return success(res, report, 'Report generated successfully', 201);
    } catch (err) {
        next(err);
    }
};

const getHistory = async (req, res, next) => {
    try {
        const { reportType } = req.query;
        const history = await reportService.getHistory(req.user.tenantId, reportType);
        return success(res, history, 'Report history fetched successfully');
    } catch (err) {
        next(err);
    }
};

const getReportById = async (req, res, next) => {
    try {
        const report = await reportService.getReportById(req.user.tenantId, req.params.id);
        return success(res, report, 'Report fetched successfully');
    } catch (err) {
        next(err);
    }
};

const exportExcel = async (req, res, next) => {
    try {
        const visibleColumns = req.query.visibleColumns
            ? String(req.query.visibleColumns).split(',').map((s) => s.trim()).filter(Boolean)
            : undefined;
        const buf = await reportService.exportExcel(req.user.tenantId, req.params.id, {
            user: req.user,
            sourceFilter: req.query.sourceFilter,
            chargeToFilter: req.query.chargeToFilter,
            ...(visibleColumns !== undefined && { visibleGroupIds: visibleColumns }),
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Report_${req.params.id}.xlsx"`);
        res.send(buf);
    } catch (err) {
        next(err);
    }
};

const exportPdf = async (req, res, next) => {
    try {
        const visibleColumns = req.query.visibleColumns
            ? String(req.query.visibleColumns).split(',').map((s) => s.trim()).filter(Boolean)
            : null;
        const pdfData = await reportService.exportPdf(req.user.tenantId, req.params.id, {
            user: req.user,
            classification: req.query.classification,
            sourceFilter: req.query.sourceFilter,
            chargeToFilter: req.query.chargeToFilter,
            visibleGroupIds: visibleColumns,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Report_${req.params.id}.pdf"`);
        res.send(pdfData);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/reports/valuation
 * Query params: asOfDate (required), locationIds (comma-separated), departmentIds (comma-separated), categoryId
 */
const getValuationReport = async (req, res, next) => {
    try {
        const { asOfDate, locationIds, departmentIds, categoryId, snapshotId, snapshotUsed } = req.query;
        if (!asOfDate) return res.status(400).json({ message: 'asOfDate is required' });

        const filters = {
            locationIds:   locationIds   ? locationIds.split(',').filter(Boolean)   : [],
            departmentIds: departmentIds ? departmentIds.split(',').filter(Boolean) : [],
            categoryId:    categoryId    || undefined,
            snapshotId: (snapshotId || snapshotUsed || undefined),
        };

        const data = await reportService.generateValuationReport(req.user.tenantId, asOfDate, filters);
        return success(res, data, 'Valuation report generated');
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/reports/valuation/excel
 * Same filters as GET /valuation — data from generateValuationReport (no duplicate logic).
 */
const exportValuationExcel = async (req, res, next) => {
    try {
        const { asOfDate, locationIds, departmentIds, categoryId, snapshotId, snapshotUsed } = req.query;
        if (!asOfDate) return res.status(400).json({ message: 'asOfDate is required' });

        const filters = {
            locationIds:   locationIds   ? locationIds.split(',').filter(Boolean)   : [],
            departmentIds: departmentIds ? departmentIds.split(',').filter(Boolean) : [],
            categoryId:    categoryId    || undefined,
            snapshotId: (snapshotId || snapshotUsed || undefined),
        };

        const buf = await reportService.exportValuationExcel(req.user.tenantId, asOfDate, filters);
        const safeDate = String(asOfDate).replace(/[^\d-]/g, '').slice(0, 10);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Valuation_${safeDate || 'export'}.xlsx"`);
        res.send(buf);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/reports/analytics/:analyticsType
 * Query: startDate, endDate, departmentIds (comma-separated), categoryId
 */
const getAnalytics = async (req, res, next) => {
    try {
        const { analyticsType } = req.params;
        const { startDate, endDate, asOfDate, departmentIds, categoryId, locationIds, filterMode, mode, section, lens } = req.query;
        const deptList = departmentIds
            ? String(departmentIds).split(',').map((s) => s.trim()).filter(Boolean)
            : [];
        const locList = locationIds
            ? String(locationIds).split(',').map((s) => s.trim()).filter(Boolean)
            : [];

        const data = await reportAnalyticsService.runAnalytics(req.user.tenantId, analyticsType, {
            startDate,
            endDate,
            asOfDate,
            filterMode: filterMode || undefined,
            departmentIds: deptList,
            locationIds: locList,
            categoryId: categoryId || undefined,
            mode: mode || undefined,
            section: section || undefined,
            lens: lens || undefined,
        });
        return success(res, data, 'Analytics report generated');
    } catch (err) {
        next(err);
    }
};

const exportAnalyticsPdf = async (req, res, next) => {
    try {
        const { analyticsType } = req.params;
        const { startDate, endDate, asOfDate, departmentIds, categoryId, locationIds, filterMode, mode, section, lens } = req.query;
        const deptList = departmentIds
            ? String(departmentIds).split(',').map((s) => s.trim()).filter(Boolean)
            : [];
        const locList = locationIds
            ? String(locationIds).split(',').map((s) => s.trim()).filter(Boolean)
            : [];

        const buf = await reportAnalyticsService.exportAnalyticsPdf(
            req.user.tenantId,
            analyticsType,
            {
                startDate,
                endDate,
                asOfDate,
                filterMode: filterMode || undefined,
                departmentIds: deptList,
                locationIds: locList,
                categoryId: categoryId || undefined,
                mode: mode || undefined,
                section: section || undefined,
                lens: lens || undefined,
            },
            { ...req.user, tenantName: req.user.tenant?.name },
            { classification: req.query.classification },
        );

        const slug = normalizeCardId(analyticsType);
        const modeSuffix = mode ? `-${String(mode).replace(/[^a-z0-9-]/gi, '')}` : '';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Report_${slug}${modeSuffix}.pdf"`);
        res.send(buf);
    } catch (err) {
        next(err);
    }
};

const exportAnalyticsExcel = async (req, res, next) => {
    try {
        const { analyticsType } = req.params;
        const { startDate, endDate, asOfDate, departmentIds, categoryId, locationIds, filterMode, mode, section, lens } = req.query;
        const deptList = departmentIds
            ? String(departmentIds).split(',').map((s) => s.trim()).filter(Boolean)
            : [];
        const locList = locationIds
            ? String(locationIds).split(',').map((s) => s.trim()).filter(Boolean)
            : [];

        const buf = await reportAnalyticsService.exportAnalyticsExcel(
            req.user.tenantId,
            analyticsType,
            {
                startDate,
                endDate,
                asOfDate,
                filterMode: filterMode || undefined,
                departmentIds: deptList,
                locationIds: locList,
                categoryId: categoryId || undefined,
                mode: mode || undefined,
                section: section || undefined,
                lens: lens || undefined,
            },
            req.user,
        );

        const slug = normalizeCardId(analyticsType);
        const modeSuffix = mode ? `-${String(mode).replace(/[^a-z0-9-]/gi, '')}` : '';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Report_${slug}${modeSuffix}.xlsx"`);
        res.send(buf);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/reports/valuation/pdf
 * Same filters as GET /valuation.
 */
const exportValuationPdf = async (req, res, next) => {
    try {
        const { asOfDate, locationIds, departmentIds, categoryId, snapshotId } = req.query;
        if (!asOfDate) return res.status(400).json({ message: 'asOfDate is required' });

        const filters = {
            locationIds:   locationIds   ? locationIds.split(',').filter(Boolean)   : [],
            departmentIds: departmentIds ? departmentIds.split(',').filter(Boolean) : [],
            categoryId:    categoryId    || undefined,
            snapshotId:    snapshotId    || undefined,
        };

        const data = await reportService.generateValuationReport(req.user.tenantId, asOfDate, filters);

        const scopeParts = [];
        if (departmentIds) scopeParts.push(departmentIds.split(',').filter(Boolean).join(', '));
        else scopeParts.push('All departments');

        const buf = await generateValuationPDF({
            rows:         data.rows,
            totalValue:   data.totalValue,
            asOfDate:     data.asOfDate || asOfDate,
            snapshotUsed: data.snapshotUsed || null,
            truthSource:  data.truthSource,
            valuationBasis: data.valuationBasis,
            warning:      data.warning,
            effectiveAsOfDate: data.effectiveAsOfDate,
            requestedAsOfDate: data.requestedAsOfDate,
            metadata: {
                generatedBy:    `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email || 'System',
                generatedAt:    new Date().toISOString(),
                tenantName:     req.user.tenant?.name || 'DX OSE',
                classification: req.query.classification || 'INTERNAL USE',
                reportBasis:    String(asOfDate),
                scopeLabel:     scopeParts.join(' · '),
                valuationBasisLabel: describeValuationBasis(data),
            },
        });

        const safeDate = String(asOfDate).replace(/[^\d-]/g, '').slice(0, 10);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Valuation_${safeDate}.pdf"`);
        res.send(buf);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    generateReport,
    getHistory,
    getReportById,
    exportExcel,
    exportPdf,
    getValuationReport,
    exportValuationExcel,
    exportValuationPdf,
    getAnalytics,
    exportAnalyticsExcel,
    exportAnalyticsPdf,
};
