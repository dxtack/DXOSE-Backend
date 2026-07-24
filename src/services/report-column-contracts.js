'use strict';

/** @typedef {'text'|'qty'|'sar'|'date'|'int'} ReportColumnFormat */

/**
 * Enterprise column contracts for analytics reports.
 * Headers are English for Excel/PDF; UI uses labelKey via i18n.
 *
 * @typedef {object} ReportColumnDef
 * @property {string} key
 * @property {string} header
 * @property {string} [labelKey]
 * @property {number} [width]
 * @property {'left'|'right'|'center'} [align]
 * @property {ReportColumnFormat} [format]
 * @property {boolean} [signed]
 * @property {boolean} [subtotal]
 * @property {boolean} [visible]
 */

const col = (key, header, opts = {}) => ({
    key,
    header,
    labelKey: opts.labelKey || `REPORTS.COLS.${key.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toUpperCase()}`,
    width: opts.width ?? 12,
    align: opts.align ?? (opts.format === 'qty' || opts.format === 'sar' || opts.format === 'int' ? 'right' : 'left'),
    format: opts.format ?? 'text',
    signed: opts.signed ?? false,
    subtotal: opts.subtotal ?? (opts.format === 'qty' || opts.format === 'sar'),
    visible: opts.visible !== false,
    ...opts,
});

const IDENTITY_STOCK = [
    col('location', 'Location', { labelKey: 'REPORTS.COLS.LOCATION', width: 14 }),
    col('category', 'Category', { labelKey: 'REPORTS.COLS.CATEGORY', width: 12 }),
    col('itemCode', 'Code', { labelKey: 'REPORTS.COLS.CODE', width: 10 }),
    col('itemName', 'Item', { labelKey: 'REPORTS.COLS.ITEM', width: 18 }),
];

const QTY_VALUE = [
    col('qtyOnHand', 'Qty on hand', { labelKey: 'REPORTS.COLS.QTY', format: 'qty', width: 10 }),
    col('value', 'Value (SAR)', { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 12 }),
];

const COLUMN_CONTRACTS = {
    'count-variance-report': {
        bands: [
            { id: 'identity', label: 'Session / item', colspan: 5 },
            { id: 'book', label: 'Snapshot', colspan: 1, className: 'band-book' },
            { id: 'count', label: 'Physical count', colspan: 1, className: 'band-count' },
            { id: 'variance', label: 'Variance', colspan: 2, className: 'band-variance' },
            { id: 'meta', label: 'Status', colspan: 3 },
        ],
        columns: [
            col('sessionNo', 'Session', { labelKey: 'REPORTS.COLS.SESSION_NO', width: 11, subtotal: false }),
            col('countDate', 'Count date', { labelKey: 'REPORTS.COLS.COUNT_DATE', format: 'date', width: 10, subtotal: false }),
            col('locationName', 'Location', { labelKey: 'REPORTS.COLS.LOCATION', width: 14, subtotal: false }),
            col('itemCode', 'Code', { labelKey: 'REPORTS.COLS.CODE', width: 10, subtotal: false }),
            col('itemName', 'Item', { labelKey: 'REPORTS.COLS.ITEM', width: 18, subtotal: false }),
            col('bookQty', 'Snapshot qty', { labelKey: 'REPORTS.COLS.SNAPSHOT_QTY', format: 'qty', width: 9 }),
            col('countedQty', 'Counted qty', { labelKey: 'REPORTS.COLS.COUNTED_QTY', format: 'qty', width: 9 }),
            col('varianceQty', 'Variance qty', { labelKey: 'REPORTS.COLS.VARIANCE_QTY', format: 'qty', width: 9, signed: true }),
            col('wacUnitCost', 'WAC (SAR)', { labelKey: 'REPORTS.COLS.UNIT_COST', format: 'sar', width: 10, subtotal: false }),
            col('varianceValue', 'Variance value (SAR)', { labelKey: 'REPORTS.COLS.VARIANCE_VALUE', format: 'sar', width: 12, signed: true }),
            col('status', 'Status', { labelKey: 'REPORTS.COLS.STATUS', width: 10, subtotal: false }),
            col('wacSource', 'WAC source', { labelKey: 'REPORTS.COLS.WAC_SOURCE', width: 10, subtotal: false }),
            col('postedBy', 'Posted by', { labelKey: 'REPORTS.COLS.POSTED_BY', width: 12, subtotal: false }),
        ],
    },
    'variance-by-location': {
        columns: [
            col('locationName', 'Location', { labelKey: 'REPORTS.COLS.LOCATION', width: 18, subtotal: false }),
            col('bookQty', 'Snapshot qty', { labelKey: 'REPORTS.COLS.SNAPSHOT_QTY', format: 'qty', width: 11 }),
            col('countedQty', 'Counted qty', { labelKey: 'REPORTS.COLS.COUNTED_QTY', format: 'qty', width: 11 }),
            col('varianceQty', 'Variance qty', { labelKey: 'REPORTS.COLS.VARIANCE_QTY', format: 'qty', width: 11, signed: true }),
            col('varianceValue', 'Variance value (SAR)', { labelKey: 'REPORTS.COLS.VARIANCE_VALUE', format: 'sar', width: 14, signed: true }),
            col('lineCount', 'Lines', { labelKey: 'REPORTS.COLS.LINE_COUNT', format: 'int', width: 8, subtotal: false }),
        ],
    },
    'variance-by-department': {
        columns: [
            col('department', 'Department', { labelKey: 'REPORTS.COLS.DEPARTMENT', width: 18, subtotal: false }),
            col('bookQty', 'Snapshot qty', { labelKey: 'REPORTS.COLS.SNAPSHOT_QTY', format: 'qty', width: 11 }),
            col('countedQty', 'Counted qty', { labelKey: 'REPORTS.COLS.COUNTED_QTY', format: 'qty', width: 11 }),
            col('varianceQty', 'Variance qty', { labelKey: 'REPORTS.COLS.VARIANCE_QTY', format: 'qty', width: 11, signed: true }),
            col('varianceValue', 'Variance value (SAR)', { labelKey: 'REPORTS.COLS.VARIANCE_VALUE', format: 'sar', width: 14, signed: true }),
            col('lineCount', 'Lines', { labelKey: 'REPORTS.COLS.LINE_COUNT', format: 'int', width: 8, subtotal: false }),
        ],
    },
    'variance-by-category': {
        columns: [
            col('category', 'Category', { labelKey: 'REPORTS.COLS.CATEGORY', width: 18, subtotal: false }),
            col('bookQty', 'Snapshot qty', { labelKey: 'REPORTS.COLS.SNAPSHOT_QTY', format: 'qty', width: 11 }),
            col('countedQty', 'Counted qty', { labelKey: 'REPORTS.COLS.COUNTED_QTY', format: 'qty', width: 11 }),
            col('varianceQty', 'Variance qty', { labelKey: 'REPORTS.COLS.VARIANCE_QTY', format: 'qty', width: 11, signed: true }),
            col('varianceValue', 'Variance value (SAR)', { labelKey: 'REPORTS.COLS.VARIANCE_VALUE', format: 'sar', width: 14, signed: true }),
            col('lineCount', 'Lines', { labelKey: 'REPORTS.COLS.LINE_COUNT', format: 'int', width: 8, subtotal: false }),
        ],
    },
    'variance-by-counter': {
        columns: [
            col('postedBy', 'Counter / posted by', { labelKey: 'REPORTS.COLS.POSTED_BY', width: 18, subtotal: false }),
            col('bookQty', 'Snapshot qty', { labelKey: 'REPORTS.COLS.SNAPSHOT_QTY', format: 'qty', width: 11 }),
            col('countedQty', 'Counted qty', { labelKey: 'REPORTS.COLS.COUNTED_QTY', format: 'qty', width: 11 }),
            col('varianceQty', 'Variance qty', { labelKey: 'REPORTS.COLS.VARIANCE_QTY', format: 'qty', width: 11, signed: true }),
            col('varianceValue', 'Variance value (SAR)', { labelKey: 'REPORTS.COLS.VARIANCE_VALUE', format: 'sar', width: 14, signed: true }),
            col('lineCount', 'Lines', { labelKey: 'REPORTS.COLS.LINE_COUNT', format: 'int', width: 8, subtotal: false }),
        ],
    },
    'current-stock-balance': {
        columns: [
            col('department', 'Department', { labelKey: 'REPORTS.COLS.DEPARTMENT', width: 12 }),
            col('location', 'Location', { labelKey: 'REPORTS.COLS.LOCATION', width: 14 }),
            col('category', 'Category', { labelKey: 'REPORTS.COLS.CATEGORY', width: 12 }),
            col('itemCode', 'Code', { labelKey: 'REPORTS.COLS.CODE', width: 10 }),
            col('uom', 'UOM', { labelKey: 'REPORTS.COLS.UOM', width: 8, subtotal: false }),
            col('itemName', 'Item', { labelKey: 'REPORTS.COLS.ITEM', width: 20 }),
            ...QTY_VALUE,
            col('unitCost', 'WAC (SAR)', { labelKey: 'REPORTS.COLS.UNIT_COST', format: 'sar', width: 10, subtotal: false }),
        ],
    },
    'inventory-by-location': 'current-stock-balance',
    'negative-stock-report': {
        columns: [...IDENTITY_STOCK, ...QTY_VALUE],
    },
    'critical-stock-levels': {
        columns: [
            ...IDENTITY_STOCK,
            col('qtyOnHand', 'Qty on hand', { labelKey: 'REPORTS.COLS.QTY', format: 'qty', width: 10 }),
            col('reorderPoint', 'Reorder point', { labelKey: 'REPORTS.COLS.REORDER', format: 'qty', width: 10, subtotal: false }),
            col('value', 'Value (SAR)', { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 12 }),
        ],
    },
    'inventory-health-aging': {
        columns: [
            ...IDENTITY_STOCK,
            ...QTY_VALUE,
            col('lastReceiveDate', 'Last receive', { labelKey: 'REPORTS.COLS.LAST_RECEIVE', format: 'date', width: 11, subtotal: false }),
            col('daysOld', 'Days old', { labelKey: 'REPORTS.COLS.DAYS_OLD', format: 'int', width: 9, subtotal: false }),
            col('bucket', 'Aging bucket', { labelKey: 'REPORTS.COLS.BUCKET', width: 12, subtotal: false }),
        ],
    },
    'high-consumption-items': {
        columns: [
            col('itemCode', 'Code', { labelKey: 'REPORTS.COLS.CODE', width: 10 }),
            col('itemName', 'Item', { labelKey: 'REPORTS.COLS.ITEM', width: 20 }),
            col('category', 'Category', { labelKey: 'REPORTS.COLS.CATEGORY', width: 12 }),
            col('totalQty', 'Total qty', { labelKey: 'REPORTS.COLS.TOTAL_QTY', format: 'qty', width: 11 }),
            col('totalValue', 'Total value (SAR)', { labelKey: 'REPORTS.COLS.TOTAL_VALUE', format: 'sar', width: 14 }),
        ],
    },
    'count-session-report': {
        columns: [
            col('sessionNo', 'Session', { labelKey: 'REPORTS.COLS.SESSION_NO', width: 12, subtotal: false }),
            col('countDate', 'Count date', { labelKey: 'REPORTS.COLS.COUNT_DATE', format: 'date', width: 10, subtotal: false }),
            col('status', 'Status', { labelKey: 'REPORTS.COLS.STATUS', width: 12, subtotal: false }),
            col('location', 'Location', { labelKey: 'REPORTS.COLS.LOCATION', width: 14, subtotal: false }),
            col('department', 'Department', { labelKey: 'REPORTS.COLS.DEPARTMENT', width: 12, subtotal: false }),
            col('blindMode', 'Blind mode', { labelKey: 'REPORTS.COLS.BLIND_MODE', width: 9, subtotal: false }),
            col('createdBy', 'Created by', { labelKey: 'REPORTS.COLS.CREATED_BY', width: 14, subtotal: false }),
            col('postedAt', 'Posted at', { labelKey: 'REPORTS.COLS.POSTED_AT', format: 'date', width: 10, subtotal: false }),
        ],
    },
    'count-approval-history': {
        columns: [
            col('sessionNo', 'Session', { labelKey: 'REPORTS.COLS.SESSION_NO', width: 12, subtotal: false }),
            col('countDate', 'Count date', { labelKey: 'REPORTS.COLS.COUNT_DATE', format: 'date', width: 10, subtotal: false }),
            col('status', 'Status', { labelKey: 'REPORTS.COLS.STATUS', width: 11, subtotal: false }),
            col('approvalStatus', 'Approval status', { labelKey: 'REPORTS.COLS.APPROVAL_STATUS', width: 12, subtotal: false }),
            col('approvalResolvedAt', 'Resolved at', { labelKey: 'REPORTS.COLS.APPROVAL_RESOLVED', format: 'date', width: 11, subtotal: false }),
            col('location', 'Location', { labelKey: 'REPORTS.COLS.LOCATION', width: 14, subtotal: false }),
            col('department', 'Department', { labelKey: 'REPORTS.COLS.DEPARTMENT', width: 12, subtotal: false }),
        ],
    },
    'get-pass-report': {
        columns: [
            col('passNo', 'Pass no.', { labelKey: 'REPORTS.COLS.PASS_NO', width: 12, subtotal: false }),
            col('status', 'Status', { labelKey: 'REPORTS.COLS.STATUS', width: 11, subtotal: false }),
            col('transferType', 'Transfer type', { labelKey: 'REPORTS.COLS.TRANSFER_TYPE', width: 12, subtotal: false }),
            col('borrowingEntity', 'Borrower', { labelKey: 'REPORTS.COLS.BORROWER', width: 14, subtotal: false }),
            col('sourceLocations', 'Source location(s)', { labelKey: 'REPORTS.COLS.SOURCE_LOCATIONS', width: 16, subtotal: false }),
            col('qtyOut', 'Qty out', { labelKey: 'REPORTS.COLS.QTY_OUT', format: 'qty', width: 9 }),
            col('qtyReturned', 'Qty returned', { labelKey: 'REPORTS.COLS.QTY_RETURNED', format: 'qty', width: 10 }),
            col('qtyOutstanding', 'Qty outstanding', { labelKey: 'REPORTS.COLS.QTY_OUTSTANDING', format: 'qty', width: 11 }),
            col('exposureValue', 'Exposure (SAR)', { labelKey: 'REPORTS.COLS.EXPOSURE_VALUE', format: 'sar', width: 12 }),
            col('checkedOutAt', 'Checked out', { labelKey: 'REPORTS.COLS.CHECKED_OUT', format: 'date', width: 10, subtotal: false }),
            col('expectedReturnDate', 'Expected return', { labelKey: 'REPORTS.COLS.EXPECTED_RETURN', format: 'date', width: 11, subtotal: false }),
            col('daysOutstanding', 'Days outstanding', { labelKey: 'REPORTS.COLS.DAYS_OUTSTANDING', format: 'int', width: 9, subtotal: false }),
            col('daysOverdue', 'Days overdue', { labelKey: 'REPORTS.COLS.DAYS_OVERDUE', format: 'int', width: 9, subtotal: false }),
            col('returnedDate', 'Returned', { labelKey: 'REPORTS.COLS.RETURNED_DATE', format: 'date', width: 10, subtotal: false }),
            col('closedAt', 'Closed at', { labelKey: 'REPORTS.COLS.CLOSED_AT', format: 'date', width: 10, subtotal: false }),
            col('workflowStep', 'Workflow step', { labelKey: 'REPORTS.COLS.WORKFLOW_STEP', width: 14, subtotal: false }),
            col('waitingRole', 'Waiting for', { labelKey: 'REPORTS.COLS.WAITING_ROLE', width: 12, subtotal: false }),
            col('operationalBucket', 'Section', { labelKey: 'REPORTS.COLS.OPERATIONAL_BUCKET', width: 10, subtotal: false, visible: false }),
            col('sectionGroup', 'Section group', { labelKey: 'REPORTS.COLS.SECTION_GROUP', width: 10, subtotal: false, visible: false }),
            col('createdAt', 'Created', { labelKey: 'REPORTS.COLS.CREATED_AT', format: 'date', width: 10, subtotal: false }),
        ],
    },
    'lost-items-register': {
        columns: [
            col('itemName', 'Item', { labelKey: 'REPORTS.COLS.ITEM', width: 18, subtotal: false }),
            col('status', 'Status', { labelKey: 'REPORTS.COLS.STATUS', width: 11, subtotal: false }),
            col('description', 'Description', { labelKey: 'REPORTS.COLS.DESCRIPTION', width: 22, subtotal: false }),
            col('createdAt', 'Created', { labelKey: 'REPORTS.COLS.CREATED_AT', format: 'date', width: 10, subtotal: false }),
            col('handedOverTo', 'Handed over to', { labelKey: 'REPORTS.COLS.HANDED_OVER', width: 14, subtotal: false }),
        ],
    },
    'period-close-report': {
        columns: [
            col('year', 'Year', { labelKey: 'REPORTS.COLS.YEAR', format: 'int', width: 8, subtotal: false }),
            col('month', 'Month', { labelKey: 'REPORTS.COLS.MONTH', format: 'int', width: 8, subtotal: false }),
            col('status', 'Status', { labelKey: 'REPORTS.COLS.STATUS', width: 11, subtotal: false }),
            col('closedAt', 'Closed at', { labelKey: 'REPORTS.COLS.CLOSED_AT', format: 'date', width: 11, subtotal: false }),
            col('notes', 'Notes', { labelKey: 'REPORTS.COLS.NOTES', width: 24, subtotal: false }),
        ],
    },
    'pending-operations-report': {
        columns: [
            col('area', 'Area', { labelKey: 'REPORTS.COLS.AREA', width: 18, subtotal: false }),
            col('pendingCount', 'Pending count', { labelKey: 'REPORTS.COLS.PENDING_COUNT', format: 'int', width: 12 }),
        ],
    },
    'omc-report': {
        columns: [
            col('department',  'Department',   { labelKey: 'REPORTS.COLS.DEPARTMENT', width: 14 }),
            col('location',    'Location',     { labelKey: 'REPORTS.COLS.LOCATION',   width: 14 }),
            col('itemCode',    'Code',         { labelKey: 'REPORTS.COLS.CODE',       width: 10 }),
            col('itemName',    'Item',         { labelKey: 'REPORTS.COLS.ITEM',       width: 20 }),
            col('openingQty',  'Opening',      { labelKey: 'REPORTS.OMC.OPENING',     format: 'qty', width: 9 }),
            col('grnQty',      'GRN',          { labelKey: 'REPORTS.OMC.GRN',         format: 'qty', width: 8 }),
            col('tfrInQty',    'Transfer In',  { labelKey: 'REPORTS.OMC.TFR_IN',      format: 'qty', width: 10 }),
            col('returnQty',   'Return In',    { labelKey: 'REPORTS.OMC.RETURN',      format: 'qty', width: 9 }),
            col('breakageQty', 'Breakage',     { labelKey: 'REPORTS.OMC.BREAKAGE',    format: 'qty', width: 9 }),
            col('lostQty',     'Lost',         { labelKey: 'REPORTS.OMC.LOST',        format: 'qty', width: 8 }),
            col('tfrOutQty',   'Transfer Out', { labelKey: 'REPORTS.OMC.TFR_OUT',     format: 'qty', width: 10 }),
            col('issueQty',      'Consumption',  { labelKey: 'REPORTS.OMC.CONSUMPTION',  format: 'qty', width: 10 }),
            col('getPassOutQty', 'Get Pass Out', { labelKey: 'REPORTS.OMC.GET_PASS_OUT', format: 'qty', width: 10 }),
            col('adjQty',        'Adjustment',   { labelKey: 'REPORTS.OMC.ADJ',          format: 'qty', width: 9 }),
            col('closingQty',  'Closing',      { labelKey: 'REPORTS.OMC.CLOSING',     format: 'qty', width: 9 }),
            col('closingValue','Closing Value',{ labelKey: 'REPORTS.OMC.CLOSE_VALUE', format: 'sar', width: 12 }),
            col('unitCost',    'WAC',          { labelKey: 'REPORTS.COLS.UNIT_COST',  format: 'sar', width: 10, subtotal: false }),
        ],
    },
    'detail-report': {
        columns: [
            col('category',         'Category',         { labelKey: 'REPORTS.COLS.CATEGORY', width: 12, subtotal: false }),
            col('itemCode',         'Code',             { labelKey: 'REPORTS.COLS.CODE', width: 10, subtotal: false }),
            col('itemName',         'Item',             { labelKey: 'REPORTS.COLS.ITEM', width: 18, subtotal: false }),
            col('unitPrice',        'Unit price (SAR)', { labelKey: 'REPORTS.COLS.UNIT_COST', format: 'sar', width: 10, subtotal: false }),
            col('openingQty',       'Open Qty',         { labelKey: 'REPORTS.SUMMARY.COLUMNS.QTY', format: 'qty', width: 9 }),
            col('openingValue',     'Open Val (SAR)',   { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 11 }),
            col('inwardQty',        'GRN Qty',          { labelKey: 'REPORTS.SUMMARY.COLUMNS.QTY', format: 'qty', width: 9 }),
            col('inwardValue',      'GRN Val (SAR)',    { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 11 }),
            col('breakageQty',      'Brk Qty',          { labelKey: 'REPORTS.SUMMARY.COLUMNS.QTY', format: 'qty', width: 9 }),
            col('breakageValue',    'Brk Val (SAR)',    { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 11 }),
            col('gatePassQty',      'Pass Qty',         { labelKey: 'REPORTS.SUMMARY.COLUMNS.QTY', format: 'qty', width: 9 }),
            col('gatePassValue',    'Pass Val (SAR)',   { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 11 }),
            col('theoreticalQty',   'Book Qty',         { labelKey: 'REPORTS.SUMMARY.COLUMNS.QTY', format: 'qty', width: 9 }),
            col('theoreticalValue', 'Book Val (SAR)',   { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 11 }),
            col('physicalQty',      'Phys Qty',         { labelKey: 'REPORTS.SUMMARY.COLUMNS.QTY', format: 'qty', width: 9 }),
            col('physicalValue',    'Phys Val (SAR)',   { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 11 }),
            col('varianceQty',      'Var Qty',          { labelKey: 'REPORTS.SUMMARY.COLUMNS.QTY', format: 'qty', width: 9, signed: true }),
            col('varianceValue',    'Var Val (SAR)',    { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 11, signed: true }),
            col('closingQty',       'Close Qty',        { labelKey: 'REPORTS.SUMMARY.COLUMNS.QTY', format: 'qty', width: 9 }),
            col('closingValue',     'Close Val (SAR)',  { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 11 }),
        ],
    },
    'audit-activity-report': {
        columns: [
            col('date', 'Date', { labelKey: 'REPORTS.COLS.DATE', format: 'date', width: 10, subtotal: false }),
            col('time', 'Time', { labelKey: 'REPORTS.GOVERNANCE.TIME', width: 8, subtotal: false }),
            col('entityType', 'Module', { labelKey: 'REPORTS.GOVERNANCE.MODULE', width: 14, subtotal: false }),
            col('action', 'Action', { labelKey: 'REPORTS.GOVERNANCE.ACTION', width: 12, subtotal: false }),
            col('changedBy', 'User', { labelKey: 'REPORTS.GOVERNANCE.USER', width: 14, subtotal: false }),
            col('note', 'Note', { labelKey: 'REPORTS.GOVERNANCE.NOTE', width: 24, subtotal: false }),
        ],
    },
    'breakage-loss-report': {
        columns: [
            col('date', 'Date', { labelKey: 'REPORTS.COLS.DATE', format: 'date', width: 10, subtotal: false }),
            col('documentNo', 'Document', { labelKey: 'REPORTS.COLS.DOC_NO', width: 14, subtotal: false }),
            col('sourceLabel', 'Source', { labelKey: 'REPORTS.BREAKAGE.SOURCE', width: 14, subtotal: false }),
            col('chargeToLabel', 'Charge to', { labelKey: 'REPORTS.BREAKAGE.CHARGE_TO', width: 16, subtotal: false }),
            col('itemCode', 'Code', { labelKey: 'REPORTS.COLS.CODE', width: 10, subtotal: false }),
            col('itemName', 'Item', { labelKey: 'REPORTS.COLS.ITEM', width: 18, subtotal: false }),
            col('uom', 'UOM', { labelKey: 'REPORTS.COLS.UOM', width: 8, subtotal: false }),
            col('qty', 'Qty', { labelKey: 'REPORTS.COLS.QTY', format: 'qty', width: 9 }),
            col('unitCost', 'Unit cost', { labelKey: 'REPORTS.COLS.UNIT_COST', format: 'sar', width: 10, subtotal: false }),
            col('lineValue', 'Total value', { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 12 }),
            col('status', 'Status', { labelKey: 'REPORTS.COLS.STATUS', width: 10, subtotal: false }),
            col('postedBy', 'Posted by', { labelKey: 'REPORTS.COLS.POSTED_BY', width: 12, subtotal: false }),
        ],
    },
    'open-transfers': {
        columns: [
            col('transferNo', 'Transfer no.', { labelKey: 'REPORTS.TRANSFERS.TRANSFER_NO', width: 14, subtotal: false }),
            col('status', 'Status', { labelKey: 'COMMON.STATUS', width: 12, subtotal: false }),
            col('transferDate', 'Date', { labelKey: 'REPORTS.COLS.DATE', format: 'date', width: 10, subtotal: false }),
            col('fromLocation', 'From', { labelKey: 'REPORTS.TRANSFERS.FROM', width: 14, subtotal: false }),
            col('toLocation', 'To', { labelKey: 'REPORTS.TRANSFERS.TO', width: 14, subtotal: false }),
            col('receivedAt', 'Received', { labelKey: 'REPORTS.TRANSFERS.RECEIVED', format: 'date', width: 10, subtotal: false }),
        ],
    },
    'transfer-history': {
        columns: [
            col('transferDate', 'Date', { labelKey: 'REPORTS.COLS.DATE', format: 'date', width: 10, subtotal: false }),
            col('transferNo', 'Transfer no.', { labelKey: 'REPORTS.TRANSFERS.TRANSFER_NO', width: 14, subtotal: false }),
            col('type', 'Type', { labelKey: 'REPORTS.COLS.TYPE', width: 12, subtotal: false }),
            col('fromLocation', 'From', { labelKey: 'REPORTS.TRANSFERS.FROM', width: 14, subtotal: false }),
            col('toLocation', 'To', { labelKey: 'REPORTS.TRANSFERS.TO', width: 14, subtotal: false }),
            col('itemCode', 'Code', { labelKey: 'REPORTS.COLS.CODE', width: 10, subtotal: false }),
            col('itemName', 'Item', { labelKey: 'REPORTS.COLS.ITEM', width: 18, subtotal: false }),
            col('qty', 'Qty', { labelKey: 'REPORTS.COLS.QTY', format: 'qty', width: 9 }),
            col('value', 'Value (SAR)', { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 12 }),
            col('receivedAt', 'Received', { labelKey: 'REPORTS.TRANSFERS.RECEIVED', format: 'date', width: 10, subtotal: false }),
            col('status', 'Status', { labelKey: 'REPORTS.COLS.STATUS', width: 10, subtotal: false }),
            col('requestedBy', 'Requested by', { labelKey: 'REPORTS.COLS.REQUESTED_BY', width: 14, subtotal: false }),
        ],
    },
    'inventory-change-history': {
        columns: [
            col('date', 'Date', { labelKey: 'REPORTS.COLS.DATE', format: 'date', width: 10, subtotal: false }),
            col('docNo', 'Document', { labelKey: 'REPORTS.COLS.DOC_NO', width: 12, subtotal: false }),
            col('movementType', 'Document type', { labelKey: 'REPORTS.COLS.DOC_TYPE', width: 12, subtotal: false }),
            col('location', 'Location', { labelKey: 'REPORTS.COLS.LOCATION', width: 14, subtotal: false }),
            col('itemCode', 'Code', { labelKey: 'REPORTS.COLS.CODE', width: 10, subtotal: false }),
            col('itemName', 'Item', { labelKey: 'REPORTS.COLS.ITEM', width: 18, subtotal: false }),
            col('qtyIn', 'Qty in', { labelKey: 'REPORTS.COLS.QTY_IN', format: 'qty', width: 9 }),
            col('qtyOut', 'Qty out', { labelKey: 'REPORTS.COLS.QTY_OUT', format: 'qty', width: 9 }),
            col('lineValue', 'Value (SAR)', { labelKey: 'REPORTS.COLS.VALUE', format: 'sar', width: 12 }),
            col('unitCost',  'Unit cost',   { labelKey: 'REPORTS.COLS.UNIT_COST', format: 'sar', width: 10, subtotal: false }),
        ],
    },
};

const ALIASES = {
    'variance-value-impact': 'count-variance-report',
    'top-variance-items': 'count-variance-report',
    'inventory-by-location': 'current-stock-balance',
    'slow-moving-items': 'inventory-health-aging',
    'dead-stock': 'inventory-health-aging',
    'zero-movement-items': 'inventory-health-aging',
    'count-sessions-history': 'count-session-report',
    'open-count-sessions': 'count-session-report',
    'pending-approval-sessions': 'count-session-report',
    'rejected-count-sessions': 'count-session-report',
    'count-posting-summary': 'count-session-report',
    'count-exceptions': 'count-session-report',
    'count-accuracy-pct': 'count-session-report',
    'blind-count-review': 'count-session-report',
    'recount-analysis': 'count-session-report',
    'cycle-count-performance': 'count-session-report',
    'multi-location-count-review': 'count-session-report',
    'count-timeline-report': 'count-session-report',
    'missing-items-report': 'count-session-report',
    'unexpected-found-items': 'count-session-report',
    'rejected-transactions': 'count-session-report',
    'missing-approval-detection': 'count-session-report',
    'evidence-completeness-report': 'count-session-report',
    'pending-review-queue': 'count-session-report',
    'reviewer-action-queue': 'count-session-report',
    'high-risk-sessions': 'count-session-report',
    'critical-variance-review': 'count-session-report',
    'escalated-operational-issues': 'count-session-report',
    'reviewer-sla-tracking': 'count-session-report',
    'reviewer-workload': 'count-session-report',
    'operational-follow-up-tracker': 'count-session-report',
    'get-pass-activity': 'get-pass-report',
    'open-get-passes': 'get-pass-report',
    'overdue-returns': 'get-pass-report',
    'temporary-movement-report': 'get-pass-report',
    'returned-vs-outstanding-assets': 'get-pass-report',
    'period-close-validation': 'period-close-report',
    'posting-integrity-check': 'period-close-report',
    'pending-operational-actions': 'pending-operations-report',
    'daily-operational-review': 'pending-operations-report',
    'operational-attention-report': 'pending-operations-report',
    'posting-activity-report': 'inventory-change-history',
    'adjustment-history': 'inventory-change-history',
    'stock-adjustment-summary': 'inventory-change-history',
    'breakage-workflow': 'inventory-change-history',
    'stock-movement-analysis': 'inventory-change-history',
    'workflow-completion-analysis': 'inventory-change-history',
    'workflow-timeline-report': 'inventory-change-history',
    'transfer-delays': 'open-transfers',
    'transfer-aging': 'open-transfers',
    'operational-delays': 'open-transfers',
    'breakage-trend-analysis': 'breakage-loss-report',
    'loss-analysis': 'breakage-loss-report',
    'user-operational-activity': 'audit-activity-report',
    'approval-activity-report': 'audit-activity-report',
    'workflow-violations': 'audit-activity-report',
    'inter-location-movement': 'transfer-history',
};

/** Cards that intentionally remain dynamic (no stable row shape). */
const INTENTIONALLY_DYNAMIC = new Set([
    'workflow-exceptions',
    'workflow-bottlenecks',
    'unauthorized-actions-review',
    'manual-override-tracking',
    'operational-exceptions-report',
    'audit-reconstruction-report',
    'operational-accountability-report',
    'reviewer-activity-report-gov',
    'governance-exceptions',
]);

function resolveContractId(cardId) {
    if (INTENTIONALLY_DYNAMIC.has(cardId)) return null;
    if (ALIASES[cardId]) return ALIASES[cardId];
    const ref = COLUMN_CONTRACTS[cardId];
    if (typeof ref === 'string') return ref;
    return cardId;
}

function getReportContract(cardId) {
    const id = resolveContractId(cardId);
    if (!id) return null;
    const raw = COLUMN_CONTRACTS[id];
    if (!raw) return null;
    if (typeof raw === 'string') return getReportContract(raw);
    return { reportId: id, ...raw };
}

function getReportColumns(cardId) {
    const contract = getReportContract(cardId);
    const cols = contract?.columns ?? null;
    if (!cols?.length) return null;
    return cols.filter((c) => c.visible !== false);
}

function projectRowsForContract(cardId, rows) {
    const cols = getReportColumns(cardId);
    if (!cols?.length || !Array.isArray(rows)) return rows;
    const keys = cols.map((c) => c.key);
    return rows.map((row) => {
        const out = {};
        for (const k of keys) {
            if (row[k] !== undefined) out[k] = row[k];
        }
        return out;
    });
}

function listContractCoverage() {
    const explicit = Object.keys(COLUMN_CONTRACTS);
    const aliased = Object.keys(ALIASES);
    return { explicit, aliased, intentionallyDynamic: [...INTENTIONALLY_DYNAMIC] };
}

module.exports = {
    getReportContract,
    getReportColumns,
    projectRowsForContract,
    resolveContractId,
    listContractCoverage,
    INTENTIONALLY_DYNAMIC,
};
