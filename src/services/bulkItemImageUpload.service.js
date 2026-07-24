'use strict';

const { randomUUID } = require('crypto');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getStorage } = require('../config/storage');
const {
    putRawBuffer,
    deleteFile,
    buildItemImageKey,
    buildBulkItemImageTempKey,
} = require('../middleware/upload.middleware');
const { parseBulkImageZip } = require('../utils/bulkItemImageZip.util');
const { processItemImageToWebp } = require('../utils/itemImageProcessor.util');
const {
    BULK_IMAGE_PREVIEW_TTL_MS,
} = require('../platform/bulkItemImageUpload.platform');

const previewSessions = new Map();

const badRequest = (msg) => {
    const e = new Error(msg);
    e.statusCode = 400;
    return e;
};

const notFound = (msg = 'Preview session not found or expired') => {
    const e = new Error(msg);
    e.statusCode = 404;
    return e;
};

const purgeExpiredSessions = () => {
    const now = Date.now();
    for (const [token, session] of previewSessions.entries()) {
        if (now - session.createdAt > BULK_IMAGE_PREVIEW_TTL_MS) {
            previewSessions.delete(token);
            cleanupSessionTempFiles(session).catch(() => { /* ignore */ });
        }
    }
};

const cleanupSessionTempFiles = async (session) => {
    if (!session?.entries) return;
    for (const entry of session.entries) {
        if (entry.tempKey) {
            await deleteFile(entry.tempKey);
        }
    }
};

const safeTempSlug = (filename) =>
    String(filename || 'file')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 120);

const validateImageContent = async (buffer, ext) => {
    const sharp = require('sharp');
    const meta = await sharp(buffer, { failOn: 'error' }).metadata();
    const format = (meta.format || '').toLowerCase();
    const expected = {
        '.jpg': 'jpeg',
        '.jpeg': 'jpeg',
        '.png': 'png',
        '.webp': 'webp',
    }[ext];
    if (expected && format && format !== expected) {
        throw new Error(`File content does not match extension (expected ${expected}, got ${format})`);
    }
    if (!meta.width || !meta.height) {
        throw new Error('Invalid image content');
    }
};

const classifyZipEntries = async (zipEntries, tenantId) => {
    const codeCounts = new Map();
    const filenameCounts = new Map();
    const rows = [];

    for (const entry of zipEntries) {
        const codeKey = entry.itemCode.toLowerCase();
        const fileKey = entry.filename.toLowerCase();
        codeCounts.set(codeKey, (codeCounts.get(codeKey) || 0) + 1);
        filenameCounts.set(fileKey, (filenameCounts.get(fileKey) || 0) + 1);
    }

    const uniqueKeys = [...new Set(zipEntries.map((e) => e.itemCode))];
    const items = uniqueKeys.length
        ? await prisma.item.findMany({
            where: {
                tenantId,
                OR: [
                    ...uniqueKeys.map((key) => ({ code: { equals: key, mode: 'insensitive' } })),
                    ...uniqueKeys.map((key) => ({ barcode: { equals: key, mode: 'insensitive' } })),
                ],
            },
            select: { id: true, code: true, barcode: true, name: true, imageUrl: true },
        })
        : [];

    const itemByCode = new Map();
    const itemByBarcode = new Map();
    for (const item of items) {
        if (item.code) itemByCode.set(item.code.toLowerCase(), item);
        if (item.barcode) itemByBarcode.set(String(item.barcode).toLowerCase(), item);
    }

    const resolveItemByFilenameStem = (stem) => {
        const key = stem.toLowerCase();
        return itemByCode.get(key) || itemByBarcode.get(key) || null;
    };

    for (const entry of zipEntries) {
        const codeKey = entry.itemCode.toLowerCase();
        const fileKey = entry.filename.toLowerCase();
        let status = 'matched';
        let reason = null;
        let item = null;

        if ((codeCounts.get(codeKey) || 0) > 1 || (filenameCounts.get(fileKey) || 0) > 1) {
            status = 'duplicate';
            reason = 'Duplicate item code or filename in ZIP';
        } else {
            try {
                await validateImageContent(entry.buffer, entry.ext);
            } catch (err) {
                status = 'invalid';
                reason = err.message;
            }
        }

        if (status === 'matched') {
            item = resolveItemByFilenameStem(entry.itemCode);
            if (!item) {
                status = 'unmatched';
                reason = `No item with code or barcode "${entry.itemCode}"`;
            }
        }

        const hasExistingImage = Boolean(item?.imageUrl);
        if (status === 'matched' && hasExistingImage) {
            status = 'existingImage';
        }

        rows.push({
            filename: entry.filename,
            itemCode: entry.itemCode,
            itemId: item?.id || null,
            itemName: item?.name || null,
            status,
            reason,
            hasExistingImage,
            ext: entry.ext,
            sourceBuffer: entry.buffer,
        });
    }

    return rows;
};

const buildSummary = (rows) => ({
    matched: rows.filter((r) => r.status === 'matched').length,
    unmatched: rows.filter((r) => r.status === 'unmatched').length,
    invalid: rows.filter((r) => r.status === 'invalid').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    existingImage: rows.filter((r) => r.status === 'existingImage').length,
});

const previewBulkItemImages = async (zipBuffer, tenantId) => {
    purgeExpiredSessions();

    const { entries: zipEntries, skipped } = parseBulkImageZip(zipBuffer);
    const classified = await classifyZipEntries(zipEntries, tenantId);

    const token = randomUUID();
    const sessionEntries = [];

    for (const row of classified) {
        const sessionRow = {
            filename: row.filename,
            itemCode: row.itemCode,
            itemId: row.itemId,
            itemName: row.itemName,
            status: row.status,
            reason: row.reason,
            hasExistingImage: row.hasExistingImage,
            tempKey: null,
        };

        if (row.status === 'matched' || row.status === 'existingImage') {
            try {
                const webpBuffer = await processItemImageToWebp(row.sourceBuffer);
                const tempKey = buildBulkItemImageTempKey(
                    tenantId,
                    token,
                    safeTempSlug(path.basename(row.filename, row.ext))
                );
                await putRawBuffer(tempKey, webpBuffer, {
                    contentType: 'image/webp',
                    originalName: `${row.itemCode}.webp`,
                });
                sessionRow.tempKey = tempKey;
            } catch (err) {
                sessionRow.status = 'invalid';
                sessionRow.reason = err.message || 'Image processing failed';
            }
        }

        delete row.sourceBuffer;
        sessionEntries.push(sessionRow);
    }

    for (const skip of skipped) {
        sessionEntries.push({
            filename: skip.file,
            itemCode: path.basename(skip.file, path.extname(skip.file)),
            itemId: null,
            itemName: null,
            status: 'invalid',
            reason: skip.reason,
            hasExistingImage: false,
            tempKey: null,
        });
    }

    const createdAt = Date.now();
    previewSessions.set(token, {
        tenantId,
        createdAt,
        used: false,
        entries: sessionEntries,
    });

    const summary = buildSummary(sessionEntries);
    const expiresAt = new Date(createdAt + BULK_IMAGE_PREVIEW_TTL_MS).toISOString();

    return {
        previewToken: token,
        expiresAt,
        summary,
        rows: sessionEntries.map((r) => ({
            filename: r.filename,
            itemCode: r.itemCode,
            itemId: r.itemId,
            itemName: r.itemName,
            status: r.status,
            reason: r.reason,
            hasExistingImage: r.hasExistingImage,
        })),
    };
};

const resolvePreviewSession = (previewToken, tenantId) => {
    purgeExpiredSessions();
    const session = previewSessions.get(previewToken);
    if (!session) throw notFound();
    if (session.used) throw badRequest('Preview session was already used.');
    if (session.tenantId !== tenantId) throw notFound();
    if (Date.now() - session.createdAt > BULK_IMAGE_PREVIEW_TTL_MS) {
        previewSessions.delete(previewToken);
        cleanupSessionTempFiles(session).catch(() => { /* ignore */ });
        throw notFound();
    }
    return session;
};

const confirmBulkItemImages = async (previewToken, tenantId, { replaceExisting = false } = {}) => {
    const session = resolvePreviewSession(previewToken, tenantId);
    session.used = true;

    const results = {
        uploaded: 0,
        skipped: 0,
        failed: 0,
        details: [],
    };

    for (const entry of session.entries) {
        const baseDetail = {
            filename: entry.filename,
            itemCode: entry.itemCode,
            itemId: entry.itemId,
            itemName: entry.itemName,
        };

        if (entry.status === 'unmatched' || entry.status === 'invalid' || entry.status === 'duplicate') {
            results.skipped += 1;
            results.details.push({ ...baseDetail, status: 'skipped', reason: entry.reason || entry.status });
            if (entry.tempKey) {
                await deleteFile(entry.tempKey);
                entry.tempKey = null;
            }
            continue;
        }

        if (entry.status === 'existingImage' && !replaceExisting) {
            results.skipped += 1;
            results.details.push({
                ...baseDetail,
                status: 'skipped',
                reason: 'Existing image skipped',
            });
            if (entry.tempKey) {
                await deleteFile(entry.tempKey);
                entry.tempKey = null;
            }
            continue;
        }

        if ((entry.status !== 'matched' && entry.status !== 'existingImage') || !entry.tempKey || !entry.itemId) {
            results.skipped += 1;
            results.details.push({
                ...baseDetail,
                status: 'skipped',
                reason: entry.reason || 'Not eligible for upload',
            });
            if (entry.tempKey) {
                await deleteFile(entry.tempKey);
                entry.tempKey = null;
            }
            continue;
        }

        let oldImageUrl = null;
        try {
            const current = await prisma.item.findFirst({
                where: { id: entry.itemId, tenantId },
                select: { imageUrl: true },
            });
            if (!current) {
                results.failed += 1;
                results.details.push({ ...baseDetail, status: 'failed', reason: 'Item not found' });
                continue;
            }
            oldImageUrl = current.imageUrl || null;

            const storage = getStorage();
            const tempBuffer = await storage.getBuffer(entry.tempKey);
            const finalKey = buildItemImageKey(tenantId, `${entry.itemCode}.webp`, entry.itemId);
            await putRawBuffer(finalKey, tempBuffer, {
                contentType: 'image/webp',
                originalName: `${entry.itemCode}.webp`,
            });

            await prisma.item.update({
                where: { id: entry.itemId },
                data: { imageUrl: finalKey },
            });

            if (oldImageUrl && oldImageUrl !== finalKey) {
                deleteFile(oldImageUrl).catch(() => { /* ignore */ });
            }

            results.uploaded += 1;
            results.details.push({ ...baseDetail, status: 'uploaded' });
        } catch (err) {
            results.failed += 1;
            results.details.push({
                ...baseDetail,
                status: 'failed',
                reason: err.message || 'Upload failed',
            });
        } finally {
            if (entry.tempKey) {
                deleteFile(entry.tempKey).catch(() => { /* ignore */ });
                entry.tempKey = null;
            }
        }
    }

    previewSessions.delete(previewToken);
    await cleanupSessionTempFiles(session);
    return results;
};

/**
 * Legacy direct ZIP upload — secured limits, Item.code matching, no preview token.
 * @deprecated Use preview/confirm flow from the Item Master UI.
 */
const bulkUploadImagesLegacy = async (zipBuffer, tenantId) => {
    const { entries: zipEntries, skipped } = parseBulkImageZip(zipBuffer);
    const classified = await classifyZipEntries(zipEntries, tenantId);

    const results = { matched: 0, skipped: skipped.length, errors: [], details: [] };

    for (const skip of skipped) {
        results.details.push({ file: skip.file, status: 'skipped', reason: skip.reason });
    }

    for (const row of classified) {
        if (row.status !== 'matched') {
            results.skipped += 1;
            results.details.push({
                file: row.filename,
                status: 'skipped',
                reason: row.reason || row.status,
            });
            continue;
        }

        let oldImageUrl = null;
        try {
            const item = await prisma.item.findFirst({
                where: { id: row.itemId, tenantId },
                select: { imageUrl: true },
            });
            if (!item) {
                results.skipped += 1;
                results.details.push({
                    file: row.filename,
                    status: 'skipped',
                    reason: 'Item not found',
                });
                continue;
            }
            oldImageUrl = item.imageUrl || null;

            const webpBuffer = await processItemImageToWebp(row.sourceBuffer);
            const key = buildItemImageKey(tenantId, `${row.itemCode}.webp`, row.itemId);
            await putRawBuffer(key, webpBuffer, {
                contentType: 'image/webp',
                originalName: `${row.itemCode}.webp`,
            });

            await prisma.item.update({
                where: { id: row.itemId },
                data: { imageUrl: key },
            });

            if (oldImageUrl && oldImageUrl !== key) {
                deleteFile(oldImageUrl).catch(() => { /* ignore */ });
            }

            results.matched += 1;
            results.details.push({
                file: row.filename,
                status: 'matched',
                itemName: row.itemName,
                itemCode: row.itemCode,
            });
        } catch (err) {
            results.errors.push({ file: row.filename, error: err.message });
            results.details.push({ file: row.filename, status: 'error', reason: err.message });
        }
    }

    return results;
};

/** Test-only helpers */
const _resetPreviewSessionsForTest = () => {
    previewSessions.clear();
};

module.exports = {
    previewBulkItemImages,
    confirmBulkItemImages,
    bulkUploadImagesLegacy,
    _resetPreviewSessionsForTest,
    buildSummary,
};
