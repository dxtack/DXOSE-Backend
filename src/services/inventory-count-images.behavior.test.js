'use strict';

/**
 * Inventory Count item images — upload/export contract checks.
 * Image column is visual-only; upload parser must ignore it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  isCountSheetDataRow,
  pickRowValue,
  excelImageExtension,
  prepareExcelImageEmbed,
  excelImageCellPlacement,
  EXCEL_IMAGE_DISPLAY_PX,
} = require('./inventoryCount.service').__testCountSheetHelpers;

test('isCountSheetDataRow accepts rows with Image column (visual-only)', () => {
  const row = {
    '#': 1,
    Image: '[embedded]',
    'Item Name': 'Tomato Paste',
    Barcode: 'BC001',
    'Item Code': 'SKU001',
    'Internal ItemId': '11111111-1111-4111-8111-111111111111',
    LocationId: '22222222-2222-4222-8222-222222222222',
    'Counted Qty': 5,
  };
  assert.equal(isCountSheetDataRow(row), true);
});

test('pickRowValue does not use Image column for item identity fields', () => {
  const row = {
    Image: 'should-not-be-read',
    'Item Code': 'SKU001',
    'Counted Qty': 12,
  };
  assert.equal(pickRowValue(row, ['Item Code', 'itemCode']), 'SKU001');
  assert.equal(pickRowValue(row, ['Counted Qty', 'countedQty']), 12);
  assert.equal(pickRowValue(row, ['Internal ItemId', 'itemId']), undefined);
  assert.equal(pickRowValue(row, ['Barcode', 'barcode']), undefined);
});

test('isCountSheetDataRow still works on legacy sheets without Image column', () => {
  const row = {
    '#': 2,
    'Item Name': 'Olive Oil',
    'Item Code': 'SKU002',
    'Internal ItemId': '33333333-3333-4333-8333-333333333333',
    'Counted Qty': 3,
  };
  assert.equal(isCountSheetDataRow(row), true);
});

test('excelImageExtension maps known formats including webp hint', () => {
  assert.equal(excelImageExtension('/uploads/items/a.png'), 'png');
  assert.equal(excelImageExtension('tenants/t1/items/x.jpg'), 'jpeg');
  assert.equal(excelImageExtension('tenants/t1/items/x.webp'), 'png');
});

test('excelImageCellPlacement uses fixed square ext centered in cell', () => {
  const placement = excelImageCellPlacement(1, 8);
  assert.equal(placement.ext.width, EXCEL_IMAGE_DISPLAY_PX);
  assert.equal(placement.ext.height, EXCEL_IMAGE_DISPLAY_PX);
  assert.ok(placement.tl.col > 1);
  assert.ok(placement.tl.col < 2);
  assert.ok(placement.tl.row > 6);
  assert.ok(placement.tl.row < 8);
  assert.equal(placement.editAs, 'oneCell');
  assert.equal(placement.br, undefined);
});

test('prepareExcelImageEmbed converts WebP buffer to square PNG for Excel', async () => {
  const sharp = require('sharp');
  const webp = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 40, g: 120, b: 200 } },
  })
    .webp()
    .toBuffer();

  const backendRoot = path.join(__dirname, '../..');
  const uploadsDir = path.join(backendRoot, 'uploads', 'items');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const key = `/uploads/items/test-excel-embed-${Date.now()}.webp`;
  const filePath = path.join(backendRoot, key.replace(/^\/+/, ''));
  fs.writeFileSync(filePath, webp);

  try {
    const prepared = await prepareExcelImageEmbed(key);
    assert.ok(prepared);
    assert.equal(prepared.extension, 'png');
    const meta = await sharp(prepared.buffer).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.width, EXCEL_IMAGE_DISPLAY_PX);
    assert.equal(meta.height, EXCEL_IMAGE_DISPLAY_PX);
  } finally {
    fs.unlinkSync(filePath);
  }
});
