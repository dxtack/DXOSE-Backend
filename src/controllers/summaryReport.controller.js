const { getSummaryReport } = require('../services/summaryReport.service');
const { exportSummaryInventoryPdf, exportSummaryInventoryExcel } = require('../services/summaryReportExport.service');
const { success } = require('../utils/response');

const parseSummaryFilters = (query) => {
    const { startDate, endDate, departmentIds, categoryId, locationIds } = query;
    const dIds = departmentIds ? departmentIds.split(',').map((id) => id.trim()).filter(Boolean) : [];
    const locIds = locationIds
        ? String(locationIds).split(',').map((id) => id.trim()).filter(Boolean)
        : [];
    return {
        startDate,
        endDate,
        departmentIds: dIds,
        categoryId,
        locationIds: locIds,
    };
};

const getSummary = async (req, res, next) => {
    try {
        const data = await getSummaryReport(req.user.tenantId, parseSummaryFilters(req.query));
        return success(res, data, 'Summary report generated');
    } catch (err) { next(err); }
};

const exportSummaryPdf = async (req, res, next) => {
    try {
        const visibleColumns = req.query.visibleColumns
            ? String(req.query.visibleColumns).split(',').map((s) => s.trim()).filter(Boolean)
            : null;
        const buf = await exportSummaryInventoryPdf(
            req.user.tenantId,
            parseSummaryFilters(req.query),
            { ...req.user, tenantName: req.user.tenant?.name },
            { classification: req.query.classification, visibleGroupIds: visibleColumns },
        );
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="Summary_Inventory_Report.pdf"');
        res.send(buf);
    } catch (err) {
        next(err);
    }
};

const exportSummaryExcel = async (req, res, next) => {
    try {
        const filters = parseSummaryFilters(req.query);
        const buf = await exportSummaryInventoryExcel(
            req.user.tenantId,
            filters,
            { ...req.user, tenantName: req.user.tenant?.name },
        );
        const safeStart = String(filters.startDate || '').replace(/[^\d-]/g, '').slice(0, 10);
        const safeEnd = String(filters.endDate || '').replace(/[^\d-]/g, '').slice(0, 10);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="Summary_Inventory_${safeStart || 'export'}_${safeEnd || 'export'}.xlsx"`,
        );
        res.send(buf);
    } catch (err) {
        next(err);
    }
};

module.exports = { getSummary, exportSummaryPdf, exportSummaryExcel };
