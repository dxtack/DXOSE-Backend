'use strict';

process.env.BULK_IMAGE_PREVIEW_TTL_MS = '50';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const AdmZip = require('adm-zip');
const sharp = require('sharp');

const servicePath = path.resolve(__dirname, './bulkItemImageUpload.service.js');
const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ITEM_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const tinyPng = async () =>
    sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } } })
        .png()
        .toBuffer();

function loadService() {
    const storage = { puts: [], buffers: new Map(), async put(key, body) { this.buffers.set(key, Buffer.from(body)); }, async getBuffer(key) { return this.buffers.get(key); }, async delete(key) { return this.buffers.delete(key); } };
    const prismaMock = {
        item: {
            findMany: async () => [{ id: ITEM_ID, tenantId: TENANT_A, code: 'ITM-0001', name: 'Soap', imageUrl: null }],
            findFirst: async ({ where }) => (where.id === ITEM_ID ? { imageUrl: null } : null),
            update: async ({ where, data }) => ({ id: where.id, imageUrl: data.imageUrl }),
        },
    };
    const originalLoad = Module._load;
    Module._load = function patched(request, parent, isMain) {
        if (request === '@prisma/client') return { PrismaClient: function PrismaClient() { return prismaMock; } };
        if (request === '../config/storage') return { getStorage: () => storage };
        if (request === '../middleware/upload.middleware') {
            return {
                putRawBuffer: async (key, buffer) => { await storage.put(key, buffer); return { key }; },
                deleteFile: async (key) => storage.delete(key),
                buildItemImageKey: (_t, _n, itemId) => `tenants/${TENANT_A}/items/${itemId}.webp`,
                buildBulkItemImageTempKey: (_t, token, safe) => `tenants/${TENANT_A}/temp/item-images/${token}/${safe}.webp`,
            };
        }
        return originalLoad(request, parent, isMain);
    };
    delete require.cache[servicePath];
    delete require.cache[path.resolve(__dirname, '../platform/bulkItemImageUpload.platform.js')];
    const service = require(servicePath);
    Module._load = originalLoad;
    service._resetPreviewSessionsForTest();
    return service;
}

test('confirm rejects expired preview token after TTL', async () => {
    const service = loadService();
    const zip = new AdmZip();
    zip.addFile('ITM-0001.png', await tinyPng());
    const preview = await service.previewBulkItemImages(zip.toBuffer(), TENANT_A);
    await new Promise((r) => setTimeout(r, 80));
    await assert.rejects(
        () => service.confirmBulkItemImages(preview.previewToken, TENANT_A, { replaceExisting: false }),
        (err) => /expired|not found/i.test(err.message),
    );
});
