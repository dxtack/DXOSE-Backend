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
    const block = extractDownloadTemplateBlock(fs.readFileSync(controllerPath, 'utf8'));
    assert.match(block, /addWorksheet\('Items'/);
    assert.match(block, /addWorksheet\('Reference'/);
    assert.match(block, /Item_Import_Template\.xlsx/);
    assert.match(block, /dataValidation/);
    assert.match(block, /autoFilter/);
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
