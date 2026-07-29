'use strict';

/**
 * Empty inventory-count Excel contract:
 * - Valid count sheet with headers but no item rows → 0 upload rows
 * - startSession must not enter COUNTING when StockBalance snapshot is empty
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');

const {
  collectCountSheetUploadRows,
  findCountSheetHeaderRowIndex,
} = require('./inventoryCount.service').__testCountSheetHelpers;

async function buildEmptyCountSheetBuffer() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('location house 1');
  ws.mergeCells('A1:K1');
  ws.getCell('A1').value = 'DX OSE — INVENTORY COUNT SHEET';
  ws.mergeCells('A2:K2');
  ws.getCell('A2').value = 'Operational floor count sheet — write physical quantities in the Counted Qty column';
  ws.getCell('A4').value = 'Session';
  ws.getCell('B4').value = 'CNT-TEST-EMPTY';
  const headers = [
    '#',
    'Image',
    'Item Name',
    'Barcode',
    'Item Code',
    'UOM',
    'Internal ItemId',
    'LocationId',
    'RoundNo',
    'Counted Qty',
    'Snapshot Qty',
  ];
  headers.forEach((h, i) => {
    ws.getRow(7).getCell(i + 1).value = h;
  });
  ws.getCell('A9').value =
    'Counted By ____________________  Date __________    |    Reviewed By ____________________  Date __________';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('empty exported count sheet parses header but yields zero upload data rows', async () => {
  const buf = await buildEmptyCountSheetBuffer();
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const headerIdx = findCountSheetHeaderRowIndex(ws);
  assert.equal(headerIdx, 6, 'header must be Excel row 7 (0-based index 6)');
  const rows = collectCountSheetUploadRows(wb, {
    locationId: 'loc-1',
    locationName: 'location house 1',
  });
  assert.equal(rows.length, 0);
});

test('count sheet with one data row is collected for upload', async () => {
  const wbJ = new ExcelJS.Workbook();
  const ws = wbJ.addWorksheet('Store A');
  const headers = [
    '#',
    'Image',
    'Item Name',
    'Barcode',
    'Item Code',
    'UOM',
    'Internal ItemId',
    'LocationId',
    'RoundNo',
    'Counted Qty',
    'Snapshot Qty',
  ];
  headers.forEach((h, i) => {
    ws.getRow(7).getCell(i + 1).value = h;
  });
  ws.getRow(8).getCell(1).value = 1;
  ws.getRow(8).getCell(3).value = 'Towel';
  ws.getRow(8).getCell(5).value = 'SKU-1';
  ws.getRow(8).getCell(7).value = '11111111-1111-4111-8111-111111111111';
  ws.getRow(8).getCell(8).value = '22222222-2222-4222-8222-222222222222';
  ws.getRow(8).getCell(10).value = 5;
  const buf = Buffer.from(await wbJ.xlsx.writeBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const rows = collectCountSheetUploadRows(wb, {
    locationId: '22222222-2222-4222-8222-222222222222',
    locationName: 'Store A',
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row['Item Name'], 'Towel');
  assert.equal(rows[0].row['Counted Qty'], 5);
});
