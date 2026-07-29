'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const controllerPath = path.join(backendRoot, 'src/controllers/item.controller.js');

function extractDownloadTemplateBlock(src) {
    const start = src.indexOf('const downloadTemplate = async');
    assert.ok(start >= 0, 'downloadTemplate must exist');
    const nextExport = src.indexOf('module.exports = {', start);
    assert.ok(nextExport > start, 'module.exports must follow downloadTemplate');
    return src.slice(start, nextExport);
}

test('item.controller — downloadTemplate uses shared database client', () => {
    const src = fs.readFileSync(controllerPath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    const block = extractDownloadTemplateBlock(src);
    assert.doesNotMatch(block, /new PrismaClient\(\)/);
    assert.doesNotMatch(block, /\$disconnect/);
    assert.match(block, /prisma\.category\.findMany/);
    assert.match(block, /prisma\.unit\.findMany/);
});

test('item.controller — Excel template branches preserved', () => {
    const src = fs.readFileSync(controllerPath, 'utf8');
    const block = extractDownloadTemplateBlock(src);
    assert.match(block, /addWorksheet\('Items'/);
    assert.match(block, /addWorksheet\('Reference'/);
    assert.match(block, /_buildCascadingLookupsSheet/);
    assert.match(src, /addWorksheet\('Lookups'/);
    assert.match(block, /Item_Import_Template\.xlsx/);
    assert.match(block, /dataValidation/);
    assert.match(block, /autoFilter/);
    assert.match(block, /Departments/);
    // Reliable cascade: INDIRECT(IF(...,"__EMPTY",VLOOKUP(...))) — not IFERROR
    assert.match(block, /INDIRECT\(IF\(/);
    assert.match(block, /VLOOKUP\(/);
    assert.doesNotMatch(block, /IFERROR\(INDIRECT/);
    assert.match(block, /header: 'Location'/);
    assert.doesNotMatch(block, /header: 'Default Store'/);
    assert.match(block, /Opening Quantity/);
    assert.match(block, /Department — Store/);
    assert.match(block, /locations:\s*\{\s*some:\s*\{\s*isActive:\s*true/);
    // Option A: no dynamic per-location qty header columns
    assert.doesNotMatch(block, /store__/);
    assert.doesNotMatch(block, /FF2E7D32/);
});

test('item.controller — cascading lookup helpers exist', () => {
    const src = fs.readFileSync(controllerPath, 'utf8');
    assert.match(src, /function _toExcelNamedRangeKey/);
    assert.match(src, /function _buildCascadingLookupsSheet/);
    assert.match(src, /definedNames\.add/);
    assert.match(src, /veryHidden/);
});

test('item.controller — exports unchanged', () => {
    const controller = require('./item.controller');
    for (const key of [
        'checkItemCreationRequirements',
        'createItem',
        'getItems',
        'getItem',
        'updateItem',
        'uploadItemImage',
        'deleteItem',
        'toggleActive',
        'getItemUnits',
        'updateItemUnits',
        'importPreview',
        'importConfirm',
        'bulkUploadImagesPreview',
        'bulkUploadImagesConfirm',
        'bulkUploadImages',
        'downloadTemplate',
        'exportItems',
    ]) {
        assert.equal(typeof controller[key], 'function', `export ${key} must remain a function`);
    }
});

test('item.controller — cascading Lookups workbook smoke', async () => {
    const ExcelJS = require('exceljs');
    const {
        _buildCascadingLookupsSheet,
        _excelColLetter,
    } = require('./item.controller');

    // Caller filters empty depts (same as downloadTemplate Prisma filter).
    const departmentsWithLocations = [
        { name: 'Housekeeping', locations: [{ name: 'HK Store' }, { name: 'HK Closet' }] },
        { name: 'Kitchen', locations: [{ name: 'Kitchen Store' }] },
    ];
    const emptyFilteredOut = { name: 'ewew', locations: [] };

    const wb = new ExcelJS.Workbook();
    const wsItems = wb.addWorksheet('Items');
    wsItems.columns = [
        { header: 'Name', key: 'name', width: 28 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Location', key: 'location', width: 22 },
        { header: 'Opening Quantity', key: 'openingQuantity', width: 16 },
    ];

    const { deptLastRow, departmentCount, depts } = _buildCascadingLookupsSheet(
        wb,
        departmentsWithLocations,
    );

    assert.equal(departmentCount, 2);
    assert.equal(depts.length, 2);
    assert.ok(!depts.some((d) => d.name === emptyFilteredOut.name));

    const deptColLetter = _excelColLetter(wsItems.getColumn('department').number);
    const locationColIdx = wsItems.getColumn('location').number;
    for (let row = 2; row <= 4; row++) {
        wsItems.getCell(row, 2).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['Departments'],
        };
        const cascadingFormula =
            `INDIRECT(IF($${deptColLetter}${row}="","__EMPTY",VLOOKUP($${deptColLetter}${row},Lookups!$A$2:$B$${deptLastRow},2,FALSE)))`;
        wsItems.getCell(row, locationColIdx).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [cascadingFormula],
        };
    }

    const buf = await wb.xlsx.writeBuffer();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf);

    const items = wb2.getWorksheet('Items');
    const headers = [1, 2, 3, 4].map((c) => items.getCell(1, c).value);
    assert.deepEqual(headers, ['Name', 'Department', 'Location', 'Opening Quantity']);
    assert.equal(items.getCell(1, 5).value, null);

    const lookups = wb2.getWorksheet('Lookups');
    assert.ok(lookups);
    assert.equal(lookups.state, 'veryHidden');
    assert.equal(lookups.getCell(2, 1).value, 'Housekeeping');
    assert.equal(lookups.getCell(3, 1).value, 'Kitchen');
    // Empty dept never written
    assert.notEqual(lookups.getCell(4, 1).value, 'ewew');

    const names = (wb2.definedNames.model || []).map((n) => n.name);
    assert.ok(names.includes('Departments'));
    assert.ok(names.includes('__EMPTY'));
    assert.ok(names.includes('_Housekeeping'));
    assert.ok(names.includes('_Kitchen'));

    const storeDv = items.getCell(2, 3).dataValidation;
    assert.ok(storeDv);
    assert.match(storeDv.formulae[0], /^INDIRECT\(IF\(\$B2="","__EMPTY",VLOOKUP/);
    assert.doesNotMatch(storeDv.formulae[0], /IFERROR/);

    const hkRange = (wb2.definedNames.model || []).find((n) => n.name === '_Housekeeping');
    assert.ok(hkRange);
    assert.match(hkRange.ranges[0], /Lookups!\$D\$2/);
});
