const prisma = require('../config/database');
const itemService = require('../services/item.service');
const { success } = require('../utils/response');
const { randomUUID } = require('crypto');
const {
    putBuffer,
    deleteFile,
    buildItemImageKey,
} = require('../middleware/upload.middleware');

const IMPORT_PREVIEW_TTL_MS = 30 * 60 * 1000; // 30 minutes
const importPreviewCache = new Map();

const buildImportPreviewToken = () => `import-preview://${randomUUID()}`;

const storeImportPreview = ({ tenantId, rows, asOpeningBalance }) => {
    const filePath = buildImportPreviewToken();
    importPreviewCache.set(filePath, {
        tenantId,
        rows,
        asOpeningBalance: !!asOpeningBalance,
        createdAt: Date.now(),
    });
    return filePath;
};

const resolveImportPreview = ({ filePath, tenantId }) => {
    const cached = importPreviewCache.get(filePath);
    if (!cached) return null;
    if (cached.tenantId !== tenantId) return null;
    if (Date.now() - cached.createdAt > IMPORT_PREVIEW_TTL_MS) {
        importPreviewCache.delete(filePath);
        return null;
    }
    return cached;
};

// ── Item Master prerequisites (canCreateItem vs isOpeningBalanceAllowed) ───────
const checkItemCreationRequirements = async (req, res, next) => {
    try {
        const result = await itemService.checkItemCreationRequirements(req.user.tenantId);
        return success(res, result, 'Item creation requirements checked');
    } catch (err) { next(err); }
};

// ── Create Item ───────────────────────────────────────────────────────────────
const createItem = async (req, res, next) => {
    try {
        const item = await itemService.createItem(req.body, req.user.tenantId, req.user.id);
        return success(res, item, 'Item created successfully', 201);
    } catch (err) { next(err); }
};

// ── List Items ────────────────────────────────────────────────────────────────
const getItems = async (req, res, next) => {
    try {
        const result = await itemService.getItems(req.user.tenantId, req.query);
        if (result.slim) {
            return success(res, result.items, 'Items fetched successfully', 200);
        }
        return success(res, result.items, 'Items fetched successfully', 200, {
            total: result.total,
            skip: result.skip,
            take: result.take,
        });
    } catch (err) { next(err); }
};

// ── Get Single Item ───────────────────────────────────────────────────────────
const getItem = async (req, res, next) => {
    try {
        const item = await itemService.getItemById(req.params.id, req.user.tenantId);
        return success(res, item, 'Item fetched successfully');
    } catch (err) { next(err); }
};

// ── Update Item ───────────────────────────────────────────────────────────────
const updateItem = async (req, res, next) => {
    try {
        const item = await itemService.updateItem(req.params.id, req.body, req.user.tenantId, req.user.id);
        const warnings = item._warnings || [];
        if (item._warnings) delete item._warnings;
        return success(res, item, warnings.length > 0 ? warnings[0] : 'Item updated successfully');
    } catch (err) { next(err); }
};

// ── Upload Item Image ─────────────────────────────────────────────────────────
const uploadItemImage = async (req, res, next) => {
    try {
        if (!req.file) {
            const e = new Error('No image file uploaded.'); e.statusCode = 400; throw e;
        }

        const current = await itemService.getItemById(req.params.id, req.user.tenantId);
        const oldKey = current.imageUrl || null;

        const key = buildItemImageKey(req.user.tenantId, req.file.originalname, req.params.id);
        await putBuffer(key, req.file);

        const item = await itemService.updateItemImage(req.params.id, req.user.tenantId, key, oldKey);
        return success(res, item, 'Image uploaded successfully');
    } catch (err) {
        next(err);
    }
};

// ── Delete Item ───────────────────────────────────────────────────────────────
const deleteItem = async (req, res, next) => {
    try {
        await itemService.deleteItem(req.params.id, req.user.tenantId);
        return success(res, null, 'Item deleted successfully');
    } catch (err) { next(err); }
};

// ── Toggle Active ─────────────────────────────────────────────────────────────
const toggleActive = async (req, res, next) => {
    try {
        const item = await itemService.toggleActive(req.params.id, req.user.tenantId);
        return success(res, item, `Item ${item.isActive ? 'activated' : 'deactivated'} successfully`);
    } catch (err) { next(err); }
};

// ── Get Item Units ────────────────────────────────────────────────────────────
const getItemUnits = async (req, res, next) => {
    try {
        const units = await itemService.getItemUnits(req.params.id, req.user.tenantId);
        return success(res, units, 'Item units fetched successfully');
    } catch (err) { next(err); }
};

// ── Update Item Units ─────────────────────────────────────────────────────────
const updateItemUnits = async (req, res, next) => {
    try {
        const units = await itemService.updateItemUnits(
            req.params.id,
            req.user.tenantId,
            req.body.itemUnits || []
        );
        return success(res, units, 'Item units updated successfully');
    } catch (err) { next(err); }
};

// ── Import: Parse & Preview ───────────────────────────────────────────────────
// With memory-backed multer the file lives in `req.file.buffer`; the preview
// step parses it in-memory. We cache parsed rows behind a temporary `filePath`
// token so V2 clients can confirm using { filePath }.
const importPreview = async (req, res, next) => {
    try {
        if (!req.file) {
            const e = new Error('No file uploaded.'); e.statusCode = 400; throw e;
        }
        const asOpeningBalance = String(req.body?.asOpeningBalance ?? req.query?.asOpeningBalance ?? '').toLowerCase() === 'true';
        const result = await itemService.parseImportFile(req.file.buffer, req.user.tenantId, { asOpeningBalance });
        const filePath = storeImportPreview({
            tenantId: req.user.tenantId,
            rows: result.preview,
            asOpeningBalance,
        });
        result.filePath = filePath;
        return success(res, result, 'File parsed successfully');
    } catch (err) {
        next(err);
    }
};

// ── Import: Confirm ───────────────────────────────────────────────────────────
const importConfirm = async (req, res, next) => {
    try {
        const { rows, filePath, asOpeningBalance } = req.body || {};

        let rowsToConfirm = Array.isArray(rows) ? rows : null;
        let asOpeningBalanceFinal = !!asOpeningBalance;

        if (!rowsToConfirm && filePath) {
            const cached = resolveImportPreview({ filePath, tenantId: req.user.tenantId });
            if (!cached) {
                const e = new Error('Import preview has expired or is invalid. Please upload the file again.');
                e.statusCode = 400;
                throw e;
            }
            rowsToConfirm = cached.rows;
            if (asOpeningBalance === undefined || asOpeningBalance === null) {
                asOpeningBalanceFinal = !!cached.asOpeningBalance;
            }
        }

        if (!rowsToConfirm || !Array.isArray(rowsToConfirm)) {
            const e = new Error('Invalid import payload. Provide either rows or filePath.');
            e.statusCode = 400;
            throw e;
        }

        const result = await itemService.confirmImport(
            rowsToConfirm,
            req.user.tenantId,
            req.user.id,
            asOpeningBalanceFinal,
            req.user,
        );
        return success(res, result, `Import complete: ${result.inserted} inserted, ${result.updated} updated, ${result.failed} failed`);
    } catch (err) { next(err); }
};
// ── Bulk Upload Images (ZIP) — preview / confirm ─────────────────────────────
const bulkUploadImagesPreview = async (req, res, next) => {
    try {
        if (!req.file) {
            const e = new Error('No ZIP file uploaded.'); e.statusCode = 400; throw e;
        }
        const result = await itemService.previewBulkItemImages(req.file.buffer, req.user.tenantId);
        return success(res, result, 'Bulk image preview ready');
    } catch (err) {
        next(err);
    }
};

const bulkUploadImagesConfirm = async (req, res, next) => {
    try {
        const { previewToken, replaceExisting } = req.body || {};
        if (!previewToken || typeof previewToken !== 'string') {
            const e = new Error('previewToken is required.'); e.statusCode = 400; throw e;
        }
        const replace = String(replaceExisting ?? 'false').toLowerCase() === 'true'
            || replaceExisting === true;
        const result = await itemService.confirmBulkItemImages(
            previewToken,
            req.user.tenantId,
            { replaceExisting: replace },
        );
        return success(
            res,
            result,
            `Bulk upload complete: ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.failed} failed`,
        );
    } catch (err) {
        next(err);
    }
};

// ── Bulk Upload Images (ZIP) — legacy direct upload ───────────────────────────
/** @deprecated Prefer bulkUploadImagesPreview + bulkUploadImagesConfirm */
const bulkUploadImages = async (req, res, next) => {
    try {
        if (!req.file) {
            const e = new Error('No ZIP file uploaded.'); e.statusCode = 400; throw e;
        }
        const result = await itemService.bulkUploadImages(req.file.buffer, req.user.tenantId);
        return success(res, result, `Bulk upload complete: ${result.matched} matched, ${result.skipped} skipped`);
    } catch (err) {
        next(err);
    }
};

// ── Shared: Style a header row ────────────────────────────────────────────────
function _styleHeaderRow(sheet, columnCount) {
    const headerRow = sheet.getRow(1);
    headerRow.height = 22;
    for (let col = 1; col <= columnCount; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            bottom: { style: 'thin', color: { argb: 'FF0D47A1' } },
        };
    }
    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    // Auto-filter on all columns
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnCount } };
}

/** Excel named-range safe key from a department label (spaces/special chars → `_`). */
function _toExcelNamedRangeKey(label) {
    const cleaned = String(label || '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    const base = cleaned || 'UNNAMED';
    // Leading underscore avoids collisions with cell refs (A1, C3, …).
    return `_${base}`.slice(0, 200);
}

function _excelColLetter(colNumber) {
    let n = colNumber;
    let s = '';
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

/**
 * Assign unique Excel named-range keys per department (handles sanitize collisions).
 */
function _withUniqueRangeKeys(departmentsWithLocations) {
    const used = new Map();
    return departmentsWithLocations.map((dept) => {
        let rangeKey = _toExcelNamedRangeKey(dept.name);
        if (used.has(rangeKey)) {
            const next = used.get(rangeKey) + 1;
            used.set(rangeKey, next);
            rangeKey = `${rangeKey}_${next}`.slice(0, 200);
        } else {
            used.set(rangeKey, 1);
        }
        return { ...dept, rangeKey };
    });
}

/**
 * Hidden Lookups sheet + named ranges for cascading Department → Location lists.
 * A = department names, B = range keys, C2 = empty sentinel, D+ = per-dept locations.
 * ExcelJS definedNames.add(location, name) — location first.
 */
function _buildCascadingLookupsSheet(wb, departmentsWithLocations) {
    const depts = _withUniqueRangeKeys(departmentsWithLocations);
    const ws = wb.addWorksheet('Lookups', {
        properties: { defaultColWidth: 22 },
        state: 'veryHidden',
    });

    ws.getCell('A1').value = 'Department';
    ws.getCell('B1').value = 'RangeKey';
    ws.getCell('C1').value = '__EMPTY';
    ws.getCell('C2').value = '';
    wb.definedNames.add('Lookups!$C$2:$C$2', '__EMPTY');

    depts.forEach((dept, idx) => {
        const row = idx + 2;
        ws.getCell(row, 1).value = dept.name;
        ws.getCell(row, 2).value = dept.rangeKey;

        const locCol = 4 + idx;
        const locs = dept.locations || [];
        if (locs.length === 0) {
            ws.getCell(2, locCol).value = '';
        } else {
            locs.forEach((loc, locIdx) => {
                ws.getCell(locIdx + 2, locCol).value = loc.name;
            });
        }
        // Always use explicit $Col$2:$Col$N (even for one location) so list DV stays stable.
        const lastLocRow = Math.max(2, locs.length + 1);
        const colL = _excelColLetter(locCol);
        const rangeAddr = `Lookups!$${colL}$2:$${colL}$${lastLocRow}`;
        wb.definedNames.add(rangeAddr, dept.rangeKey);
    });

    const deptLastRow = Math.max(2, depts.length + 1);
    if (depts.length > 0) {
        wb.definedNames.add(`Lookups!$A$2:$A$${deptLastRow}`, 'Departments');
    }

    return { deptLastRow, departmentCount: depts.length, depts };
}

// ── Export Items to Excel ─────────────────────────────────────────────────────
const exportItems = async (req, res, next) => {
    try {
        const ExcelJS = require('exceljs');
        const { slim: _slim, ...exportQuery } = req.query;
        const result = await itemService.getItems(req.user.tenantId, { ...exportQuery, take: 10000 });
        const items = result.items;

        const wb = new ExcelJS.Workbook();
        wb.creator = 'OS&E Cloud';
        wb.created = new Date();

        const ws = wb.addWorksheet('Items', {
            properties: { defaultColWidth: 18 },
        });

        // Define columns
        ws.columns = [
            { header: 'Item Name', key: 'name', width: 28 },
            { header: 'Barcode', key: 'barcode', width: 16 },
            { header: 'Department', key: 'department', width: 20 },
            { header: 'Category', key: 'category', width: 22 },
            { header: 'Default Store', key: 'store', width: 22 },
            { header: 'Vendor', key: 'vendor', width: 22 },
            { header: 'Base Unit', key: 'baseUnit', width: 14 },
            { header: 'Unit Price', key: 'unitPrice', width: 12 },
            { header: 'Description', key: 'description', width: 32 },
            { header: 'Status', key: 'status', width: 10 },
        ];

        // Add data rows
        items.forEach((item, idx) => {
            const baseUnit = item.itemUnits?.find(u => u.unitType === 'BASE');
            const row = ws.addRow({
                name: item.name,
                barcode: item.barcode || '',
                department: item.department?.name || '',
                category: item.category?.name || '',
                store: item.defaultStore?.name || '',
                vendor: item.supplier?.name || '',
                baseUnit: baseUnit ? `${baseUnit.unit?.name || ''} (${baseUnit.unit?.abbreviation || ''})` : '',
                unitPrice: parseFloat(item.unitPrice || 0),
                description: item.description || '',
                status: item.isActive ? 'Active' : 'Inactive',
            });
            // Alternating row color
            if (idx % 2 === 1) {
                row.eachCell({ includeEmpty: true }, (cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                });
            }
            // Format price column
            row.getCell('unitPrice').numFmt = '#,##0.00';
            row.getCell('unitPrice').alignment = { horizontal: 'right' };
        });

        // Style header
        _styleHeaderRow(ws, 10);

        // Write to buffer
        const buf = await wb.xlsx.writeBuffer();
        res.setHeader('Content-Disposition', `attachment; filename="Items_Export_${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(Buffer.from(buf));
    } catch (err) { next(err); }
};

// ── Download Import Template (.xlsx) ──────────────────────────────────────────
const downloadTemplate = async (req, res, next) => {
    try {
        const ExcelJS = require('exceljs');
        const tenantId = req.user.tenantId;

        // Departments that have ≥1 active location — cascading Department → Location only.
        const [categories, units, departmentsWithLocations, suppliers] = await Promise.all([
            prisma.category.findMany({
                where: { tenantId, isActive: true },
                select: { name: true },
                orderBy: { name: 'asc' },
            }),
            prisma.unit.findMany({
                where: { tenantId, isActive: true },
                select: { name: true, abbreviation: true },
                orderBy: { name: 'asc' },
            }),
            prisma.department.findMany({
                where: {
                    tenantId,
                    isActive: true,
                    locations: { some: { isActive: true } },
                },
                select: {
                    name: true,
                    locations: {
                        where: { isActive: true },
                        select: { name: true },
                        orderBy: { name: 'asc' },
                    },
                },
                orderBy: { name: 'asc' },
            }),
            prisma.supplier.findMany({
                where: { tenantId, isActive: true },
                select: { name: true },
                orderBy: { name: 'asc' },
            }),
        ]);

        // Dept—Store pairs for Reference only (not used by dropdowns; avoids flat all-stores list).
        const deptStorePairs = departmentsWithLocations.flatMap((d) =>
            (d.locations || []).map((loc) => `${d.name} — ${loc.name}`),
        );

        const wb = new ExcelJS.Workbook();
        wb.creator = 'OS&E Cloud';
        wb.created = new Date();

        // ── Sheet 1: Items Template (row-based — no cross-dept location qty columns) ──
        const wsItems = wb.addWorksheet('Items', {
            properties: { defaultColWidth: 18 },
        });

        const columns = [
            { header: 'Name', key: 'name', width: 28 },
            { header: 'Department', key: 'department', width: 20 },
            { header: 'Location', key: 'location', width: 22 },
            { header: 'Opening Quantity', key: 'openingQuantity', width: 16 },
            { header: 'Category', key: 'category', width: 22 },
            { header: 'Vendor', key: 'vendor', width: 22 },
            { header: 'Base Unit', key: 'baseUnit', width: 14 },
            { header: 'Unit Price', key: 'unitPrice', width: 12 },
        ];
        wsItems.columns = columns;
        const totalColumns = columns.length;

        // P2 #26 — no nameless example row; leave row 2 empty for the user.

        _styleHeaderRow(wsItems, totalColumns);

        // ── Sheet 2: Hidden Lookups (cascading named ranges) ──
        const { deptLastRow, departmentCount } = _buildCascadingLookupsSheet(
            wb,
            departmentsWithLocations,
        );

        // ── Sheet 3: Visible Reference (human-readable) ──
        const wsRef = wb.addWorksheet('Reference', {
            properties: { defaultColWidth: 22 },
        });

        wsRef.columns = [
            { header: 'Available Departments', key: 'dept', width: 24 },
            { header: 'Available Categories', key: 'cat', width: 26 },
            { header: 'Available Vendors', key: 'vendor', width: 26 },
            { header: 'Department — Store', key: 'deptStore', width: 36 },
            { header: 'Available Units', key: 'unit', width: 22 },
        ];

        const maxRows = Math.max(
            categories.length,
            units.length,
            departmentsWithLocations.length,
            deptStorePairs.length,
            suppliers.length,
            0,
        );
        for (let i = 0; i < maxRows; i++) {
            wsRef.addRow({
                dept: departmentsWithLocations[i]?.name || '',
                cat: categories[i]?.name || '',
                vendor: suppliers[i]?.name || '',
                deptStore: deptStorePairs[i] || '',
                unit: units[i] ? `${units[i].name} (${units[i].abbreviation})` : '',
            });
        }

        _styleHeaderRow(wsRef, 5);

        // ── Data Validation ──
        const VALIDATION_ROWS = 30;
        const catList = categories.map((c) => c.name).filter(Boolean);
        const unitList = units.map((u) => `${u.name} (${u.abbreviation})`).filter(Boolean);
        const vendorList = suppliers.map((s) => s.name).filter(Boolean);

        const validationConfig = [
            {
                col: 'department',
                list: departmentsWithLocations,
                formula: departmentCount > 0 ? 'Departments' : null,
            },
            {
                col: 'category',
                list: catList,
                formula: catList.length ? `Reference!$B$2:$B$${categories.length + 1}` : null,
            },
            {
                col: 'vendor',
                list: vendorList,
                formula: vendorList.length ? `Reference!$C$2:$C$${suppliers.length + 1}` : null,
            },
            {
                col: 'baseUnit',
                list: unitList,
                formula: unitList.length ? `Reference!$E$2:$E$${units.length + 1}` : null,
            },
        ];

        for (const { col, list, formula } of validationConfig) {
            if (!list.length || !formula) continue;
            const colIdx = wsItems.getColumn(col).number;
            for (let row = 2; row <= VALIDATION_ROWS; row++) {
                wsItems.getCell(row, colIdx).dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: [formula],
                    showErrorMessage: true,
                    errorTitle: 'Invalid Value',
                    error: 'Please select a value from the dropdown list.',
                };
            }
        }

        // Cascading Location: always pass a named-range *string* into INDIRECT
        // (IFERROR returning __EMPTY's value breaks Excel list DV when Department is blank).
        if (departmentCount > 0) {
            const locationColIdx = wsItems.getColumn('location').number;
            const deptColLetter = _excelColLetter(wsItems.getColumn('department').number);
            for (let row = 2; row <= VALIDATION_ROWS; row++) {
                const cascadingFormula =
                    `INDIRECT(IF($${deptColLetter}${row}="","__EMPTY",VLOOKUP($${deptColLetter}${row},Lookups!$A$2:$B$${deptLastRow},2,FALSE)))`;
                wsItems.getCell(row, locationColIdx).dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: [cascadingFormula],
                    showErrorMessage: true,
                    errorTitle: 'Invalid Location',
                    error: 'Select a Location that belongs to the chosen Department.',
                    showInputMessage: true,
                    promptTitle: 'Location',
                    prompt: 'Pick a department first. Only locations for that department appear here.',
                };
            }
        }

        // Opening Quantity — numeric only
        const qtyColIdx = wsItems.getColumn('openingQuantity').number;
        for (let row = 2; row <= VALIDATION_ROWS; row++) {
            wsItems.getCell(row, qtyColIdx).numFmt = '#,##0.####';
        }

        wsItems.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
        wsItems.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: totalColumns },
        };

        const buf = await wb.xlsx.writeBuffer();
        res.setHeader('Content-Disposition', 'attachment; filename="Item_Import_Template.xlsx"');
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.send(Buffer.from(buf));
    } catch (err) {
        next(err);
    }
};

module.exports = {
    checkItemCreationRequirements,
    createItem,
    getItems,
    getItem,
    updateItem,
    uploadItemImage,
    deleteItem,
    toggleActive,
    getItemUnits,
    updateItemUnits,
    importPreview,
    importConfirm,
    bulkUploadImagesPreview,
    bulkUploadImagesConfirm,
    bulkUploadImages,
    downloadTemplate,
    exportItems,
    // Cascading template helpers (used by consumer smoke tests)
    _toExcelNamedRangeKey,
    _excelColLetter,
    _withUniqueRangeKeys,
    _buildCascadingLookupsSheet,
};
