const test = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');

const { parseBulkImageZip } = require('./bulkItemImageZip.util');

const MINIMAL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

test('parseBulkImageZip accepts images inside subfolders', () => {
    const zip = new AdmZip();
    zip.addFile('photos/124774876171.png', MINIMAL_PNG);
    const { entries, skipped } = parseBulkImageZip(zip.toBuffer());

    assert.equal(skipped.length, 0);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].filename, 'photos/124774876171.png');
    assert.equal(entries[0].itemCode, '124774876171');
});

test('parseBulkImageZip still accepts root-level images', () => {
    const zip = new AdmZip();
    zip.addFile('340576674162.png', MINIMAL_PNG);
    const { entries, skipped } = parseBulkImageZip(zip.toBuffer());

    assert.equal(skipped.length, 0);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].itemCode, '340576674162');
});
