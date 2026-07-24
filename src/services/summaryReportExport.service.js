'use strict';

const { getSummaryReport } = require('./summaryReport.service');
const { generateSummaryInventoryPDF } = require('./pdf/report-summary-pdf.document');
const excelService = require('./excel.service');
const { buildReportReference } = require('../utils/report-format.util');
const { resolvePdfClassification } = require('./pdf/report-pdf-signatures.util');

/** Flat export columns — same row keys as summary API (presentation only). */
const SUMMARY_EXPORT_COLUMNS = [
    { header: 'Department / Category', key: 'label', width: 18, align: 'left', format: 'text' },
    { header: 'Opening Qty', key: 'openQty', width: 10, format: 'qty', align: 'right' },
    { header: 'Opening SAR', key: 'openVal', width: 12, format: 'sar', align: 'right' },
    { header: 'GRN Qty', key: 'grnQty', width: 10, format: 'qty', align: 'right' },
    { header: 'GRN SAR', key: 'grnVal', width: 12, format: 'sar', align: 'right' },
    { header: 'Breakage Qty', key: 'brkQty', width: 10, format: 'qty', align: 'right' },
    { header: 'Breakage SAR', key: 'brkVal', width: 12, format: 'sar', align: 'right' },
    { header: 'Gate pass Qty', key: 'passQty', width: 10, format: 'qty', align: 'right' },
    { header: 'Gate pass SAR', key: 'passVal', width: 12, format: 'sar', align: 'right' },
    { header: 'Movement Qty', key: 'theorQty', width: 10, format: 'qty', align: 'right' },
    { header: 'Movement SAR', key: 'theorVal', width: 12, format: 'sar', align: 'right' },
    { header: 'Variance Qty', key: 'varQty', width: 10, format: 'qty', align: 'right' },
    { header: 'Variance SAR', key: 'varVal', width: 12, format: 'sar', align: 'right' },
    { header: 'Physical Qty', key: 'physQty', width: 10, format: 'qty', align: 'right' },
    { header: 'Physical SAR', key: 'physVal', width: 12, format: 'sar', align: 'right' },
    { header: 'Closing Qty', key: 'closeQty', width: 10, format: 'qty', align: 'right' },
    { header: 'Closing SAR', key: 'closeVal', width: 12, format: 'sar', align: 'right' },
];

function buildSummaryExportRows(rows, totals) {
    const exportRows = rows.map((r) => ({
        label: r.label,
        openQty: r.openQty,
        openVal: r.openVal,
        grnQty: r.grnQty,
        grnVal: r.grnVal,
        brkQty: r.brkQty,
        brkVal: r.brkVal,
        passQty: r.passQty,
        passVal: r.passVal,
        theorQty: r.theorQty,
        theorVal: r.theorVal,
        varQty: r.varQty,
        varVal: r.varVal,
        physQty: r.physQty,
        physVal: r.physVal,
        closeQty: r.closeQty,
        closeVal: r.closeVal,
    }));

    if (totals) {
        exportRows.push({
            rowType: 'GRAND_TOTAL',
            label: 'TOTAL',
            openQty: totals.openQty,
            openVal: totals.openVal,
            grnQty: totals.grnQty,
            grnVal: totals.grnVal,
            brkQty: totals.brkQty,
            brkVal: totals.brkVal,
            passQty: totals.passQty,
            passVal: totals.passVal,
            theorQty: totals.theorQty,
            theorVal: totals.theorVal,
            varQty: totals.varQty,
            varVal: totals.varVal,
            physQty: totals.physQty,
            physVal: totals.physVal,
            closeQty: totals.closeQty,
            closeVal: totals.closeVal,
        });
    }

    return exportRows;
}

const exportSummaryInventoryPdf = async (tenantId, filters = {}, user = {}, exportOptions = {}) => {
    const data = await getSummaryReport(tenantId, filters);
    if (!data.rows?.length) {
        throw Object.assign(new Error('No data to export'), { status: 400 });
    }

    const start = data.period?.startDate;
    const end = data.period?.endDate;
    const reportBasis =
        start && end
            ? `${new Date(start).toLocaleDateString('en-GB')} – ${new Date(end).toLocaleDateString('en-GB')}`
            : 'Selected period';

    const generatedAt = new Date().toISOString();
    const generatedBy = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'OS&E';
    const classification = resolvePdfClassification(user, exportOptions.classification);

    return generateSummaryInventoryPDF({
        rows: data.rows,
        totals: data.totals,
        visibleGroupIds: exportOptions.visibleGroupIds || null,
        metadata: {
            generatedBy,
            generatedAt,
            tenantName: user.tenantName || 'DX OSE',
            classification,
            reportBasis,
            reportReference: buildReportReference('summary-inventory', generatedAt),
            totalRows: data.rows.length,
        },
    });
};

const exportSummaryInventoryExcel = async (tenantId, filters = {}, user = {}) => {
    const data = await getSummaryReport(tenantId, filters);
    if (!data.rows?.length) {
        throw Object.assign(new Error('No data to export'), { status: 400 });
    }

    const exportRows = buildSummaryExportRows(data.rows, data.totals);

    const start = data.period?.startDate;
    const end = data.period?.endDate;
    const startLabel = start ? new Date(start).toLocaleDateString('en-GB') : filters.startDate;
    const endLabel = end ? new Date(end).toLocaleDateString('en-GB') : filters.endDate;

    const metadata = {
        generatedBy: user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'OSE Inventory',
        generatedAt: new Date().toISOString(),
        filters: {
            ...(startLabel && endLabel && { startDate: startLabel, endDate: endLabel }),
            ...(filters.departmentIds?.length && { departmentIds: filters.departmentIds.join(', ') }),
            ...(filters.categoryId && { categoryId: filters.categoryId }),
            ...(filters.locationIds?.length && { locationCount: String(filters.locationIds.length) }),
        },
    };

    return excelService.generateExcelBuffer(
        exportRows,
        SUMMARY_EXPORT_COLUMNS,
        'Summary Inventory',
        metadata,
    );
};

module.exports = {
    SUMMARY_EXPORT_COLUMNS,
    buildSummaryExportRows,
    exportSummaryInventoryPdf,
    exportSummaryInventoryExcel,
};
