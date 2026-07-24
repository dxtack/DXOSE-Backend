'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const AdmZip = require('adm-zip');
const sharp = require('sharp');

const servicePath = path.resolve(__dirname, './bulkItemImageUpload.service.js');
const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ITEM_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const tinyPng = async () =>
    sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
        .png()
        .toBuffer();

const buildZip = async (name = 'ITM-0001.png') => {
    const zip = new AdmZip();
    zip.addFile(name, await tinyPng());
    return zip.toBuffer();
};

function loadService({ items = [], tenantId = TENANT_A } = {}) {
    const storage = {
        puts: [],
        buffers: new Map(),
        async put(key, body) {
            this.puts.push(key);
            this.buffers.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body));
        },
        async getBuffer(key) {
            return this.buffers.get(key);
        },
        async delete() {
            return true;
        },
    };

    const updates = [];
    const prismaMock = {
        item: {
            findMany: async ({ where }) => {
                if (where.tenantId !== tenantId) return [];
                return items.filter((i) => {
                    if (i.tenantId !== where.tenantId) return false;
                    if (!where.OR) return true;
                    return where.OR.some((clause) => {
                        if (clause.code?.equals != null) {
                            return String(i.code || '').toLowerCase() === String(clause.code.equals).toLowerCase();
                        }
                        if (clause.barcode?.equals != null) {
                            return String(i.barcode || '').toLowerCase() === String(clause.barcode.equals).toLowerCase();
                        }
                        return false;
                    });
                });
            },
            findFirst: async ({ where }) => {
                const row = items.find((i) => i.id === where.id && i.tenantId === where.tenantId);
                return row || null;
            },
            update: async ({ where, data }) => {
                const idx = items.findIndex((i) => i.id === where.id);
                if (idx >= 0) {
                    const old = items[idx].imageUrl;
                    items[idx] = { ...items[idx], imageUrl: data.imageUrl };
                    updates.push({ id: where.id, imageUrl: data.imageUrl, oldImageUrl: old });
                }
                return items[idx];
            },
        },
    };

    const originalLoad = Module._load;
    Module._load = function patched(request, parent, isMain) {
        if (request === '@prisma/client') {
            return { PrismaClient: function PrismaClient() { return prismaMock; } };
        }
        if (request === '../config/storage') {
            return { getStorage: () => storage };
        }
        if (request === '../middleware/upload.middleware') {
            return {
                putRawBuffer: async (key, buffer) => {
                    await storage.put(key, buffer);
                    return { key };
                },
                deleteFile: async () => true,
                buildItemImageKey: (_tenantId, _name, itemId) => `tenants/${tenantId}/items/${itemId}.webp`,
                buildBulkItemImageTempKey: (_tenantId, token, safeName) =>
                    `tenants/${tenantId}/temp/item-images/${token}/${safeName}.webp`,
            };
        }
        return originalLoad(request, parent, isMain);
    };

    delete require.cache[servicePath];
    const service = require(servicePath);
    Module._load = originalLoad;
    service._resetPreviewSessionsForTest();
    return { service, storage, updates, items };
}

test('previewBulkItemImages — classifies matched item by code', async () => {
    const { service } = loadService({
        items: [{
            id: ITEM_ID,
            tenantId: TENANT_A,
            code: 'ITM-0001',
            barcode: '515692187140',
            name: 'Soap',
            imageUrl: null,
        }],
    });
    const preview = await service.previewBulkItemImages(await buildZip(), TENANT_A);
    assert.equal(preview.summary.matched, 1);
    assert.equal(preview.rows[0].status, 'matched');
    assert.ok(preview.previewToken);
});

test('previewBulkItemImages — classifies matched item by barcode when code differs', async () => {
    const { service } = loadService({
        items: [{
            id: ITEM_ID,
            tenantId: TENANT_A,
            code: 'ITM-OPENER',
            barcode: '515692187140',
            name: 'Bottle Opener',
            imageUrl: null,
        }],
    });
    const preview = await service.previewBulkItemImages(await buildZip('515692187140.png'), TENANT_A);
    assert.equal(preview.summary.matched, 1);
    assert.equal(preview.rows[0].status, 'matched');
    assert.equal(preview.rows[0].itemName, 'Bottle Opener');
});

test('previewBulkItemImages — prefers code match when stem matches both code and barcode fields', async () => {
    const { service } = loadService({
        items: [
            {
                id: ITEM_ID,
                tenantId: TENANT_A,
                code: 'SHARED-STEM',
                barcode: '999',
                name: 'By Code',
                imageUrl: null,
            },
            {
                id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
                tenantId: TENANT_A,
                code: 'OTHER',
                barcode: 'SHARED-STEM',
                name: 'By Barcode',
                imageUrl: null,
            },
        ],
    });
    const preview = await service.previewBulkItemImages(await buildZip('SHARED-STEM.png'), TENANT_A);
    assert.equal(preview.summary.matched, 1);
    assert.equal(preview.rows[0].itemName, 'By Code');
});

test('previewBulkItemImages — tenant isolation (unmatched on other tenant items)', async () => {
    const { service } = loadService({
        tenantId: TENANT_A,
        items: [{
            id: ITEM_ID,
            tenantId: TENANT_B,
            code: 'ITM-0001',
            name: 'Other tenant item',
            imageUrl: null,
        }],
    });
    const preview = await service.previewBulkItemImages(await buildZip(), TENANT_A);
    assert.equal(preview.summary.unmatched, 1);
});

test('confirmBulkItemImages — skip existing unless replaceExisting', async () => {
    const ctx = loadService({
        items: [{
            id: ITEM_ID,
            tenantId: TENANT_A,
            code: 'ITM-0001',
            name: 'Soap',
            imageUrl: 'tenants/old.webp',
        }],
    });
    const preview = await ctx.service.previewBulkItemImages(await buildZip(), TENANT_A);
    assert.equal(preview.summary.existingImage, 1);

    const skipped = await ctx.service.confirmBulkItemImages(preview.previewToken, TENANT_A, {
        replaceExisting: false,
    });
    assert.equal(skipped.uploaded, 0);
    assert.equal(skipped.skipped, 1);
    assert.equal(ctx.items[0].imageUrl, 'tenants/old.webp');
});

test('confirmBulkItemImages — replace existing updates DB after upload', async () => {
    const ctx = loadService({
        items: [{
            id: ITEM_ID,
            tenantId: TENANT_A,
            code: 'ITM-0001',
            name: 'Soap',
            imageUrl: 'tenants/old.webp',
        }],
    });
    const preview = await ctx.service.previewBulkItemImages(await buildZip(), TENANT_A);
    const result = await ctx.service.confirmBulkItemImages(preview.previewToken, TENANT_A, {
        replaceExisting: true,
    });
    assert.equal(result.uploaded, 1);
    assert.match(ctx.items[0].imageUrl, /items\/.*\.webp$/);
});

test('confirmBulkItemImages — token is single-use', async () => {
    const ctx = loadService({
        items: [{
            id: ITEM_ID,
            tenantId: TENANT_A,
            code: 'ITM-0001',
            name: 'Soap',
            imageUrl: null,
        }],
    });
    const preview = await ctx.service.previewBulkItemImages(await buildZip(), TENANT_A);
    await ctx.service.confirmBulkItemImages(preview.previewToken, TENANT_A, { replaceExisting: false });
    await assert.rejects(
        () => ctx.service.confirmBulkItemImages(preview.previewToken, TENANT_A, { replaceExisting: false }),
        (err) => /already used|not found|expired/i.test(err.message),
    );
});
