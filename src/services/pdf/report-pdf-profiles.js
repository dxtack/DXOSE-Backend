'use strict';

const { GOLDEN_REPORTING_V1_BASE } = require('./report-golden-language');
const { PDF_GOLDEN_PROFILE_ALIASES } = require('./report-golden-rollout.registry');

/**
 * Report-family PDF presentation profiles (fixed pt widths, column subsets).
 * Does not alter data contracts or calculations.
 */

const COUNT_VARIANCE_LINE = [
    {
        key: 'itemCode',
        header: 'Code',
        widthPt: 72,
        format: 'text',
        align: 'left',
        cellRole: 'code',
        maxLines: 1,
        maxLength: 22,
    },
    {
        key: 'itemName',
        header: 'Item',
        widthPt: 210,
        format: 'text',
        align: 'left',
        cellRole: 'itemName',
        maxLines: 1,
        maxLength: 56,
    },
    { key: 'bookQty', header: 'Snapshot qty', widthPt: 52, format: 'qty', align: 'right', maxLines: 1 },
    { key: 'countedQty', header: 'Counted qty', widthPt: 52, format: 'qty', align: 'right', maxLines: 1 },
    { key: 'varianceQty', header: 'Variance qty', widthPt: 52, format: 'qty', align: 'right', maxLines: 1, signed: true, semanticRole: 'adj' },
    {
        key: 'varianceValue',
        header: 'Variance (SAR)',
        widthPt: 62,
        format: 'sar',
        align: 'right',
        maxLines: 1,
        sarNumbersOnly: true,
        signed: true,
        semanticRole: 'adj',
    },
    { key: 'status', header: 'Status', widthPt: 48, format: 'text', align: 'left', maxLines: 1, maxLength: 12 },
];

const STOCK_BALANCE_LINE = [
    {
        key: 'itemCode',
        header: 'Code',
        widthPt: 68,
        format: 'text',
        align: 'left',
        cellRole: 'code',
        maxLines: 1,
        maxLength: 22,
    },
    { key: 'uom', header: 'UOM', widthPt: 36, format: 'text', align: 'center', maxLines: 1, maxLength: 8 },
    {
        key: 'itemName',
        header: 'Item',
        widthPt: 212,
        format: 'text',
        align: 'left',
        cellRole: 'itemName',
        maxLines: 1,
        maxLength: 58,
    },
    { key: 'qtyOnHand', header: 'Qty on hand', widthPt: 58, format: 'qty', align: 'right', maxLines: 1 },
    {
        key: 'value',
        header: 'Value (SAR)',
        widthPt: 72,
        format: 'sar',
        align: 'right',
        maxLines: 1,
        sarNumbersOnly: true,
    },
    {
        key: 'unitCost',
        header: 'WAC (SAR)',
        widthPt: 58,
        format: 'sar',
        align: 'right',
        maxLines: 1,
        sarNumbersOnly: true,
    },
];

const LEDGER_LINE = [
    {
        key: 'date',
        header: 'Date',
        widthPt: 48,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 12,
    },
    {
        key: 'docNo',
        header: 'Document',
        widthPt: 62,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 18,
    },
    {
        key: 'movementType',
        header: 'Type',
        widthPt: 48,
        format: 'text',
        align: 'left',
        cellRole: 'movementType',
        maxLines: 1,
    },
    {
        key: 'location',
        header: 'Location',
        widthPt: 62,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 20,
    },
    {
        key: 'itemCode',
        header: 'Code',
        widthPt: 52,
        format: 'text',
        align: 'left',
        cellRole: 'code',
        maxLines: 1,
        maxLength: 18,
    },
    {
        key: 'itemName',
        header: 'Item',
        widthPt: 168,
        format: 'text',
        align: 'left',
        cellRole: 'itemName',
        maxLines: 1,
        maxLength: 48,
    },
    { key: 'qtyIn',  header: 'Qty in',  widthPt: 44, format: 'qty', align: 'right', maxLines: 1, semanticRole: 'inbound' },
    { key: 'qtyOut', header: 'Qty out', widthPt: 44, format: 'qty', align: 'right', maxLines: 1, semanticRole: 'outbound' },
    {
        key: 'lineValue',
        header: 'Value (SAR)',
        widthPt: 58,
        format: 'sar',
        align: 'right',
        maxLines: 1,
        sarNumbersOnly: true,
    },
    {
        key: 'unitCost',
        header: 'Unit cost',
        widthPt: 48,
        format: 'sar',
        align: 'right',
        maxLines: 1,
        sarNumbersOnly: true,
    },
];

const BREAKAGE_LINE = [
    {
        key: 'itemCode',
        header: 'Code',
        widthPt: 58,
        format: 'text',
        align: 'left',
        cellRole: 'code',
        maxLines: 1,
        maxLength: 18,
    },
    {
        key: 'itemName',
        header: 'Item',
        widthPt: 168,
        format: 'text',
        align: 'left',
        cellRole: 'itemName',
        maxLines: 1,
        maxLength: 48,
    },
    { key: 'qty', header: 'Qty', widthPt: 44, format: 'qty', align: 'right', maxLines: 1 },
    {
        key: 'lineValue',
        header: 'Value (SAR)',
        widthPt: 58,
        format: 'sar',
        align: 'right',
        maxLines: 1,
        sarNumbersOnly: true,
    },
    {
        key: 'unitCost',
        header: 'Unit cost',
        widthPt: 48,
        format: 'sar',
        align: 'right',
        maxLines: 1,
        sarNumbersOnly: true,
    },
    { key: 'sourceLabel', header: 'Source', widthPt: 72, format: 'text', align: 'left', maxLines: 1, maxLength: 20 },
    { key: 'status', header: 'Status', widthPt: 48, format: 'text', align: 'left', maxLines: 1, maxLength: 12 },
];

const LOST_LINE = [
    {
        key: 'itemName',
        header: 'Item',
        widthPt: 200,
        format: 'text',
        align: 'left',
        cellRole: 'itemName',
        maxLines: 1,
        maxLength: 52,
    },
    { key: 'status', header: 'Status', widthPt: 52, format: 'text', align: 'left', maxLines: 1, maxLength: 14 },
    {
        key: 'description',
        header: 'Description',
        widthPt: 180,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 48,
    },
    {
        key: 'createdAt',
        header: 'Created',
        widthPt: 72,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 14,
    },
];

const TRANSFER_LINE = [
    {
        key: 'itemCode',
        header: 'Code',
        widthPt: 58,
        format: 'text',
        align: 'left',
        cellRole: 'code',
        maxLines: 1,
        maxLength: 18,
    },
    {
        key: 'itemName',
        header: 'Item',
        widthPt: 168,
        format: 'text',
        align: 'left',
        cellRole: 'itemName',
        maxLines: 1,
        maxLength: 48,
    },
    {
        key: 'fromLocation',
        header: 'From',
        widthPt: 72,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 20,
    },
    {
        key: 'toLocation',
        header: 'To',
        widthPt: 72,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 20,
    },
    { key: 'qty', header: 'Qty', widthPt: 44, format: 'qty', align: 'right', maxLines: 1 },
    {
        key: 'value',
        header: 'Value (SAR)',
        widthPt: 58,
        format: 'sar',
        align: 'right',
        maxLines: 1,
        sarNumbersOnly: true,
    },
    { key: 'status', header: 'Status', widthPt: 48, format: 'text', align: 'left', maxLines: 1, maxLength: 12 },
    {
        key: 'receivedAt',
        header: 'Received',
        widthPt: 52,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 12,
    },
];

const OPEN_TRANSFER_LINE = [
    {
        key: 'transferNo',
        header: 'Transfer',
        widthPt: 88,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 18,
    },
    { key: 'status', header: 'Status', widthPt: 52, format: 'text', align: 'left', maxLines: 1, maxLength: 12 },
    {
        key: 'fromLocation',
        header: 'From',
        widthPt: 88,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 20,
    },
    {
        key: 'toLocation',
        header: 'To',
        widthPt: 88,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 20,
    },
    {
        key: 'transferDate',
        header: 'Date',
        widthPt: 62,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 12,
    },
    {
        key: 'receivedAt',
        header: 'Received',
        widthPt: 62,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 12,
    },
];

const GET_PASS_LINE = [
    {
        key: 'passNo',
        header: 'Pass no.',
        widthPt: 52,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 14,
    },
    { key: 'status', header: 'Status', widthPt: 40, format: 'text', align: 'left', maxLines: 1, maxLength: 10 },
    {
        key: 'borrowingEntity',
        header: 'Borrower',
        widthPt: 72,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 20,
    },
    {
        key: 'sourceLocations',
        header: 'Location',
        widthPt: 64,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 18,
    },
    {
        key: 'qtyOutstanding',
        header: 'Qty out',
        widthPt: 36,
        format: 'text',
        align: 'right',
        maxLines: 1,
        maxLength: 8,
    },
    {
        key: 'exposureValue',
        header: 'Exposure',
        widthPt: 48,
        format: 'sar',
        align: 'right',
        maxLines: 1,
        sarNumbersOnly: true,
    },
    {
        key: 'daysOverdue',
        header: 'Days late',
        widthPt: 32,
        format: 'text',
        align: 'right',
        maxLines: 1,
        maxLength: 4,
    },
    {
        key: 'expectedReturnDate',
        header: 'Return',
        widthPt: 44,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 12,
    },
];

const PENDING_OPS_LINE = [
    {
        key: 'area',
        header: 'Area',
        widthPt: 200,
        format: 'text',
        align: 'left',
        maxLines: 1,
        maxLength: 40,
    },
    {
        key: 'pendingCount',
        header: 'Pending',
        widthPt: 72,
        format: 'qty',
        align: 'right',
        maxLines: 1,
    },
];

const OMC_LINE = [
    { key: 'itemCode',    header: 'Code',        widthPt: 52,  format: 'text', align: 'left',  cellRole: 'code',     maxLines: 1, maxLength: 16 },
    { key: 'itemName',    header: 'Item',        widthPt: 130, format: 'text', align: 'left',  cellRole: 'itemName', maxLines: 1, maxLength: 38 },
    { key: 'openingQty',  header: 'Opening',     widthPt: 44,  format: 'qty',  align: 'right', maxLines: 1 },
    { key: 'grnQty',      header: 'GRN',         widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1, semanticRole: 'inbound' },
    { key: 'tfrInQty',    header: 'Tfr In',      widthPt: 38,  format: 'qty',  align: 'right', maxLines: 1, semanticRole: 'inbound' },
    { key: 'returnQty',   header: 'Return',      widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1, semanticRole: 'inbound' },
    { key: 'breakageQty', header: 'Breakage',    widthPt: 40,  format: 'qty',  align: 'right', maxLines: 1, semanticRole: 'outbound' },
    { key: 'lostQty',     header: 'Lost',        widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1, semanticRole: 'outbound' },
    { key: 'tfrOutQty',   header: 'Tfr Out',     widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1, semanticRole: 'outbound' },
    { key: 'issueQty',    header: 'Consumption', widthPt: 44,  format: 'qty',  align: 'right', maxLines: 1, semanticRole: 'outbound' },
    { key: 'getPassOutQty', header: 'Get Pass Out', widthPt: 48, format: 'qty', align: 'right', maxLines: 1, semanticRole: 'outbound' },
    { key: 'adjQty',      header: 'Adj',         widthPt: 34,  format: 'qty',  align: 'right', maxLines: 1, semanticRole: 'adj' },
    { key: 'closingQty',  header: 'Closing',     widthPt: 42,  format: 'qty',  align: 'right', maxLines: 1 },
    { key: 'closingValue',header: 'Close Val',   widthPt: 56,  format: 'sar',  align: 'right', maxLines: 1, sarNumbersOnly: true },
    { key: 'unitCost',    header: 'WAC',         widthPt: 40,  format: 'sar',  align: 'right', maxLines: 1, sarNumbersOnly: true },
];

const DETAIL_ALWAYS_VISIBLE_KEYS = new Set([
    'category', 'itemCode', 'itemName', 'unitPrice',
    'openingQty', 'openingValue',
    'physicalQty', 'physicalValue',
    'varianceQty', 'varianceValue',
    'closingQty', 'closingValue',
]);

const DETAIL_OPTIONAL_GROUP_KEYS = {
    grn: ['inwardQty', 'inwardValue'],
    brk: ['breakageQty', 'breakageValue'],
    pass: ['gatePassQty', 'gatePassValue'],
    theor: ['theoreticalQty', 'theoreticalValue'],
};

const DETAIL_LINE = [
    { key: 'category',         header: 'Category',   headerGroup: 'Item',     subHeader: 'Category', widthPt: 48,  format: 'text', align: 'left',  maxLines: 1, maxLength: 14 },
    { key: 'itemCode',         header: 'Code',       headerGroup: 'Item',     subHeader: 'Code',     widthPt: 44,  format: 'text', align: 'left',  cellRole: 'code', maxLines: 1, maxLength: 14 },
    { key: 'itemName',         header: 'Item',       headerGroup: 'Item',     subHeader: 'Item',     widthPt: 110, format: 'text', align: 'left',  cellRole: 'itemName', maxLines: 1, maxLength: 34 },
    { key: 'unitPrice',        header: 'Unit (SAR)', headerGroup: 'Item',     subHeader: 'Unit',     widthPt: 40,  format: 'sar',  align: 'right', maxLines: 1, sarNumbersOnly: true, subtotal: false },
    { key: 'openingQty',       header: 'Open Qty',   headerGroup: 'Opening',  subHeader: 'Qty',      widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1 },
    { key: 'openingValue',     header: 'Open Val',   headerGroup: 'Opening',  subHeader: 'Val',      widthPt: 44,  format: 'sar',  align: 'right', maxLines: 1, sarNumbersOnly: true },
    { key: 'inwardQty',        header: 'GRN Qty',    headerGroup: 'GRN',      subHeader: 'Qty',      widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1, semanticRole: 'inbound', presentationGroup: 'grn' },
    { key: 'inwardValue',      header: 'GRN Val',    headerGroup: 'GRN',      subHeader: 'Val',      widthPt: 44,  format: 'sar',  align: 'right', maxLines: 1, sarNumbersOnly: true, presentationGroup: 'grn' },
    { key: 'breakageQty',      header: 'Brk Qty',    headerGroup: 'Breakage', subHeader: 'Qty',      widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1, semanticRole: 'outbound', presentationGroup: 'brk' },
    { key: 'breakageValue',    header: 'Brk Val',    headerGroup: 'Breakage', subHeader: 'Val',      widthPt: 44,  format: 'sar',  align: 'right', maxLines: 1, sarNumbersOnly: true, presentationGroup: 'brk' },
    { key: 'gatePassQty',      header: 'Pass Qty',   headerGroup: 'Gate Pass',subHeader: 'Qty',      widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1, presentationGroup: 'pass' },
    { key: 'gatePassValue',    header: 'Pass Val',   headerGroup: 'Gate Pass',subHeader: 'Val',      widthPt: 44,  format: 'sar',  align: 'right', maxLines: 1, sarNumbersOnly: true, presentationGroup: 'pass' },
    { key: 'theoreticalQty',   header: 'Book Qty',   headerGroup: 'Book',     subHeader: 'Qty',      widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1, presentationGroup: 'theor' },
    { key: 'theoreticalValue', header: 'Book Val',   headerGroup: 'Book',     subHeader: 'Val',      widthPt: 44,  format: 'sar',  align: 'right', maxLines: 1, sarNumbersOnly: true, presentationGroup: 'theor' },
    { key: 'physicalQty',      header: 'Phys Qty',   headerGroup: 'Physical', subHeader: 'Qty',      widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1 },
    { key: 'physicalValue',    header: 'Phys Val',   headerGroup: 'Physical', subHeader: 'Val',      widthPt: 44,  format: 'sar',  align: 'right', maxLines: 1, sarNumbersOnly: true },
    { key: 'varianceQty',      header: 'Var Qty',    headerGroup: 'Variance', subHeader: 'Qty',      widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1, signed: true },
    { key: 'varianceValue',    header: 'Var Val',    headerGroup: 'Variance', subHeader: 'Val',      widthPt: 44,  format: 'sar',  align: 'right', maxLines: 1, sarNumbersOnly: true, signed: true },
    { key: 'closingQty',       header: 'Close Qty',  headerGroup: 'Closing',  subHeader: 'Qty',      widthPt: 36,  format: 'qty',  align: 'right', maxLines: 1 },
    { key: 'closingValue',     header: 'Close Val',  headerGroup: 'Closing',  subHeader: 'Val',      widthPt: 46,  format: 'sar',  align: 'right', maxLines: 1, sarNumbersOnly: true },
];

function buildDetailHeaderGroups(columns) {
    const groups = [];
    for (const col of columns) {
        const label = col.headerGroup || col.header || col.key;
        const last = groups[groups.length - 1];
        if (last && last.label === label) {
            last.width += col.widthPt || 60;
            last.columns.push(col);
        } else {
            groups.push({ label, width: col.widthPt || 60, columns: [col] });
        }
    }
    return groups;
}

function resolveDetailVisibleColumnKeys(visibleGroupIds) {
    const keys = new Set(DETAIL_ALWAYS_VISIBLE_KEYS);
    if (Array.isArray(visibleGroupIds) && visibleGroupIds.length) {
        for (const id of visibleGroupIds) {
            const groupKeys = DETAIL_OPTIONAL_GROUP_KEYS[id];
            if (groupKeys) groupKeys.forEach((k) => keys.add(k));
        }
    }
    return keys;
}

function scaleDetailColumnWidths(cols, targetWidthPt) {
    const current = cols.reduce((s, c) => s + (c.widthPt || 60), 0);
    if (!current || !targetWidthPt) return cols;
    let used = 0;
    return cols.map((c, i) => {
        const w =
            i === cols.length - 1
                ? targetWidthPt - used
                : Math.round((c.widthPt || 60) * (targetWidthPt / current));
        used += w;
        const minW = c.key === 'itemName' ? 72 : 32;
        return { ...c, widthPt: Math.max(minW, w) };
    });
}

function filterDetailProfileByVisibleGroups(profile, visibleGroupIds, pageWidthPt) {
    if (!profile || profile.id !== 'detail-report') return profile;
    const visibleKeys = resolveDetailVisibleColumnKeys(visibleGroupIds);
    const filtered = (profile.lineColumns || []).filter((c) => visibleKeys.has(c.key));
    const baseWidth = (profile.lineColumns || []).reduce((s, c) => s + (c.widthPt || 60), 0);
    return {
        ...profile,
        lineColumns: scaleDetailColumnWidths(filtered, pageWidthPt || baseWidth),
    };
}

function filterDetailColumnDefs(columnDefs, visibleGroupIds) {
    if (!columnDefs?.length) return columnDefs;
    const visibleKeys = resolveDetailVisibleColumnKeys(visibleGroupIds);
    return columnDefs.filter((c) => visibleKeys.has(c.key));
}

const AGING_LINE = [
    { key: 'location', header: 'Location', widthPt: 72, format: 'text', align: 'left', maxLines: 1 },
    { key: 'category', header: 'Category', widthPt: 60, format: 'text', align: 'left', maxLines: 1 },
    { key: 'itemName', header: 'Item', widthPt: 180, format: 'text', align: 'left', cellRole: 'itemName', maxLines: 1, maxLength: 42 },
    { key: 'qtyOnHand', header: 'Qty on hand', widthPt: 52, format: 'qty', align: 'right', maxLines: 1 },
    { key: 'value', header: 'Value (SAR)', widthPt: 62, format: 'sar', align: 'right', maxLines: 1, sarNumbersOnly: true },
    { key: 'lastReceiveDate', header: 'Last receipt', widthPt: 58, format: 'text', align: 'left', maxLines: 1 },
    { key: 'daysOld', header: 'Days old', widthPt: 44, format: 'text', align: 'right', maxLines: 1 },
    { key: 'bucket', header: 'Bucket', widthPt: 56, format: 'text', align: 'left', maxLines: 1 },
];

const PDF_PROFILES = {
    'count-variance-report': {
        id: 'count-variance-report',
        ...GOLDEN_REPORTING_V1_BASE,
        lineColumns: COUNT_VARIANCE_LINE,
        omitLineKeys: new Set([
            'sessionNo',
            'countDate',
            'locationName',
            'department',
            'wacUnitCost',
            'wacSource',
            'postedBy',
        ]),
        columnWeightPct: [11, 38, 11, 11, 11, 9, 9],
        kpiKeys: ['totalVarianceValue', 'totalVarianceQty', 'rowCount', 'wacMissingCount'],
    },
    'breakage-loss-report': {
        id: 'breakage-loss-report',
        ...GOLDEN_REPORTING_V1_BASE,
        lineColumns: BREAKAGE_LINE,
        omitLineKeys: new Set(['date', 'documentNo', 'documentKey', 'category']),
        columnWeightPct: [10, 38, 10, 14, 12, 16],
        kpiKeys: ['totalValue', 'totalQty', 'rowCount'],
    },
    'lost-items-register': {
        id: 'lost-items-register',
        ...GOLDEN_REPORTING_V1_BASE,
        mode: 'flat',
        lineColumns: LOST_LINE,
        columnWeightPct: [32, 14, 36, 18],
        kpiKeys: ['rowCount'],
    },
    'transfer-history': {
        id: 'transfer-history',
        ...GOLDEN_REPORTING_V1_BASE,
        lineColumns: TRANSFER_LINE,
        omitLineKeys: new Set(['transferNo', 'transferDate', 'type', 'requestedBy']),
        columnWeightPct: [9, 28, 12, 12, 9, 11, 9, 10],
        kpiKeys: ['totalValue', 'totalQty', 'rowCount'],
    },
    'open-transfers': {
        id: 'open-transfers',
        ...GOLDEN_REPORTING_V1_BASE,
        mode: 'flat',
        lineColumns: OPEN_TRANSFER_LINE,
        columnWeightPct: [22, 14, 22, 22, 10, 10],
        kpiKeys: ['rowCount'],
    },
    'get-pass-report': {
        id: 'get-pass-report',
        ...GOLDEN_REPORTING_V1_BASE,
        mode: 'flat',
        lineColumns: GET_PASS_LINE,
        columnWeightPct: [12, 9, 16, 14, 9, 12, 8, 20],
        kpiKeys: ['exposureValue', 'openCount', 'overdueCount', 'outstandingQty', 'activeBorrowers', 'returnedCount'],
        grandTotalSuppressZero: true,
    },
    'pending-operations-report': {
        id: 'pending-operations-report',
        ...GOLDEN_REPORTING_V1_BASE,
        mode: 'flat',
        lineColumns: PENDING_OPS_LINE,
        columnWeightPct: [72, 28],
        kpiKeys: ['totalPendingCount', 'rowCount'],
    },
    'current-stock-balance': {
        id: 'current-stock-balance',
        ...GOLDEN_REPORTING_V1_BASE,
        lineColumns: STOCK_BALANCE_LINE,
        omitLineKeys: new Set(['department', 'location', 'category']),
        columnWeightPct: [12, 46, 14, 14, 14],
        kpiKeys: ['totalValue', 'totalQty', 'rowCount', 'locationCount', 'totalWacBlended'],
        grandTotalShowWac: true,
    },
    'inventory-by-location': {
        id: 'inventory-by-location',
        ...GOLDEN_REPORTING_V1_BASE,
        lineColumns: STOCK_BALANCE_LINE,
        omitLineKeys: new Set(['department', 'location', 'category']),
        columnWeightPct: [12, 46, 14, 14, 14],
        kpiKeys: ['totalValue', 'totalQty', 'rowCount'],
        grandTotalShowWac: true,
    },
    'inventory-change-history': {
        id: 'inventory-change-history',
        ...GOLDEN_REPORTING_V1_BASE,
        lineColumns: LEDGER_LINE,
        omitLineKeys: new Set(['documentKey']),
        columnWeightPct: [6, 10, 9, 9, 7, 22, 6, 6, 9, 6],
        kpiKeys: ['totalValue', 'totalQtyIn', 'totalQtyOut', 'totalNetQty', 'rowCount'],
    },
    'omc-report': {
        id: 'omc-report',
        ...GOLDEN_REPORTING_V1_BASE,
        lineColumns: OMC_LINE,
        omitLineKeys: new Set(['department', 'location', 'category']),
        columnWeightPct: [7, 18, 6, 5, 5, 5, 5, 5, 5, 6, 7, 5, 6, 8, 7],
        kpiKeys: ['totalOpeningQty', 'totalInQty', 'totalOutQty', 'totalClosingQty', 'totalClosingValue'],
        grandTotalKpiDefs: [
            { key: 'totalOpeningQty',   label: 'Opening',       format: 'qty' },
            { key: 'totalInQty',        label: 'In (+)',         format: 'qty' },
            { key: 'totalOutQty',       label: 'Out (−)',        format: 'qty' },
            { key: 'totalClosingQty',   label: 'Closing',       format: 'qty' },
            { key: 'totalClosingValue', label: 'Closing Value', format: 'sar' },
        ],
    },
    'detail-report': {
        id: 'detail-report',
        ...GOLDEN_REPORTING_V1_BASE,
        shellCompact: true,
        detailTwoRowHeader: true,
        detailGroupRowHeightPt: 12,
        detailSubRowHeightPt: 14,
        grandTotalCloseGapPt: 14,
        lineColumns: DETAIL_LINE,
        omitLineKeys: new Set([
            'departmentName',
            'locationName',
            'department',
            'location',
            'locationId',
            'itemId',
            'supplier',
            'outwardQty',
            'outwardValue',
        ]),
        columnWeightPct: [4, 4, 14, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6],
        kpiKeys: ['totalVarianceValue', 'totalVarianceQty', 'totalClosingQty', 'totalClosingValue', 'rowCount'],
        grandTotalKpiDefs: [
            { key: 'totalVarianceValue', label: 'Variance Value', format: 'sar' },
            { key: 'totalVarianceQty',   label: 'Variance Qty',   format: 'qty' },
            { key: 'totalClosingQty',    label: 'Closing Qty',    format: 'qty' },
            { key: 'totalClosingValue',  label: 'Closing Value',  format: 'sar' },
        ],
    },
    'inventory-health-aging': {
        id: 'inventory-health-aging',
        ...GOLDEN_REPORTING_V1_BASE,
        lineColumns: AGING_LINE,
        columnWeightPct: [12, 9, 28, 8, 10, 9, 8, 16],
        kpiKeys: ['totalValue', 'totalQty', 'rowCount', 'criticalCount'],
    },
};

const PROFILE_ALIASES = PDF_GOLDEN_PROFILE_ALIASES;

function resolvePdfProfile(reportType) {
    if (!reportType) return null;
    const alias = PROFILE_ALIASES[reportType] || reportType;
    const entry = PDF_PROFILES[alias];
    if (!entry) return null;
    if (typeof entry === 'string') return PDF_PROFILES[entry] || null;
    return entry;
}

function profileLineColumns(profile, pageWidthPt) {
    const cols = profile?.lineColumns || [];
    const weights = profile?.columnWeightPct;
    if (weights?.length === cols.length && pageWidthPt > 0) {
        const sum = weights.reduce((a, b) => a + b, 0) || 100;
        let used = 0;
        return cols.map((c, i) => {
            const w =
                i === cols.length - 1
                    ? pageWidthPt - used
                    : Math.floor((pageWidthPt * weights[i]) / sum);
            used += w;
            return { ...c, widthPt: Math.max(28, w) };
        });
    }
    const total = cols.reduce((s, c) => s + (c.widthPt || 60), 0);
    const scale = profile?.fillPageWidth
        ? pageWidthPt / total
        : total > pageWidthPt
          ? pageWidthPt / total
          : 1;
    return cols.map((c) => ({
        ...c,
        widthPt: Math.floor((c.widthPt || 60) * scale),
    }));
}

module.exports = {
    PDF_PROFILES,
    resolvePdfProfile,
    profileLineColumns,
    resolveDetailVisibleColumnKeys,
    filterDetailProfileByVisibleGroups,
    filterDetailColumnDefs,
    buildDetailHeaderGroups,
    DETAIL_ALWAYS_VISIBLE_KEYS,
    DETAIL_OPTIONAL_GROUP_KEYS,
    COUNT_VARIANCE_LINE,
    STOCK_BALANCE_LINE,
    LEDGER_LINE,
    OMC_LINE,
    DETAIL_LINE,
    BREAKAGE_LINE,
    LOST_LINE,
    TRANSFER_LINE,
    OPEN_TRANSFER_LINE,
    GET_PASS_LINE,
    PENDING_OPS_LINE,
    PROFILE_ALIASES,
};
