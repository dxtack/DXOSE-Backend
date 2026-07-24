'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const sharp = require('sharp');
const { parseBulkImageZip } = require('../utils/bulkItemImageZip.util');
const { processItemImageToWebp } = require('../utils/itemImageProcessor.util');
const { BULK_IMAGE_ORIGINAL_MAX_BYTES } = require('../platform/bulkItemImageUpload.platform');

const tinyPngBuffer = async () =>
    sharp({
        create: {
            width: 120,
            height: 80,
            channels: 3,
            background: { r: 200, g: 100, b: 50 },
        },
    })
        .png()
        .toBuffer();

const buildZipBuffer = async (files) => {
    const zip = new AdmZip();
    for (const [name, buffer] of files) {
        zip.addFile(name, buffer);
    }
    return zip.toBuffer();
};

test('parseBulkImageZip — accepts flat image files and extracts item codes', async () => {
    const png = await tinyPngBuffer();
    const zipBuffer = await buildZipBuffer([
        ['ITM-0001.png', png],
        ['ITM-0002.jpg', png],
    ]);
    const { entries } = parseBulkImageZip(zipBuffer);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].itemCode, 'ITM-0001');
    assert.equal(entries[1].itemCode, 'ITM-0002');
});

test('parseBulkImageZip — rejects subfolders', async () => {
    const png = await tinyPngBuffer();
    const zipBuffer = await buildZipBuffer([['folder/ITM-0001.png', png]]);
    const { entries, skipped } = parseBulkImageZip(zipBuffer);
    assert.equal(entries.length, 0);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /Subfolders/i);
});

test('parseBulkImageZip — rejects oversize original image', async () => {
    const big = Buffer.alloc(BULK_IMAGE_ORIGINAL_MAX_BYTES + 1, 1);
    const zip = new AdmZip();
    zip.addFile('ITM-0001.png', big);
    const { skipped } = parseBulkImageZip(zip.toBuffer());
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /exceeds/i);
});

test('processItemImageToWebp — outputs 800x800 WebP', async () => {
    const png = await tinyPngBuffer();
    const out = await processItemImageToWebp(png);
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 800);
    assert.equal(meta.height, 800);
});
