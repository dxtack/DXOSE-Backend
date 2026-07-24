'use strict';

const path = require('path');
const AdmZip = require('adm-zip');
const {
    BULK_IMAGE_MAX_FILES,
    BULK_IMAGE_ORIGINAL_MAX_BYTES,
    BULK_IMAGE_UNCOMPRESSED_MAX_BYTES,
    BULK_IMAGE_ALLOWED_EXTENSIONS,
} = require('../platform/bulkItemImageUpload.platform');

const badRequest = (msg) => {
    const e = new Error(msg);
    e.statusCode = 400;
    return e;
};

const isHiddenOrSystemEntry = (entryName) => {
    const base = path.basename(entryName);
    if (!base || base.startsWith('.')) return true;
    if (entryName.includes('__MACOSX')) return true;
    if (entryName.startsWith('__MACOSX/') || entryName.startsWith('__MACOSX\\')) return true;
    return false;
};

const normalizeZipEntryPath = (entryName) =>
    String(entryName || '').replace(/\\/g, '/').replace(/^\/+/, '');

const hasUnsafeZipPath = (entryName) => {
    const parts = normalizeZipEntryPath(entryName).split('/').filter(Boolean);
    return parts.some((part) => part === '..');
};

/**
 * Parse a ZIP buffer into image file entries (root or nested folders) with security limits.
 * Item code is always taken from the image filename stem, regardless of subfolder path.
 * @returns {{ entries: Array<{ filename: string, itemCode: string, ext: string, buffer: Buffer, uncompressedSize: number }>, skipped: Array<{ file: string, reason: string }> }}
 */
const parseBulkImageZip = (zipBuffer) => {
    if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length === 0) {
        throw badRequest('ZIP file is empty or invalid.');
    }

    let zip;
    try {
        zip = new AdmZip(zipBuffer);
    } catch {
        throw badRequest('Could not read ZIP archive.');
    }

    const rawEntries = zip.getEntries();
    let totalUncompressed = 0;
    let imageFileCount = 0;
    const parsed = [];
    const skipped = [];

    for (const entry of rawEntries) {
        if (entry.isDirectory) continue;

        const entryName = entry.entryName;
        const relativePath = normalizeZipEntryPath(entryName);
        if (isHiddenOrSystemEntry(entryName)) {
            skipped.push({ file: relativePath || path.basename(entryName) || entryName, reason: 'Hidden or system file' });
            continue;
        }

        if (hasUnsafeZipPath(entryName)) {
            skipped.push({ file: relativePath, reason: 'Invalid ZIP path' });
            continue;
        }

        const filename = path.basename(entryName);
        const ext = path.extname(filename).toLowerCase();
        const nameWithoutExt = path.basename(filename, ext).trim();

        if (!BULK_IMAGE_ALLOWED_EXTENSIONS.includes(ext)) {
            skipped.push({ file: filename, reason: 'Unsupported file type' });
            continue;
        }

        if (!nameWithoutExt) {
            skipped.push({ file: filename, reason: 'Empty item code in filename' });
            continue;
        }

        const uncompressedSize = entry.header?.size ?? 0;
        if (uncompressedSize > BULK_IMAGE_ORIGINAL_MAX_BYTES) {
            skipped.push({
                file: filename,
                reason: `Image exceeds ${BULK_IMAGE_ORIGINAL_MAX_BYTES / (1024 * 1024)} MB limit`,
            });
            continue;
        }

        totalUncompressed += uncompressedSize;
        if (totalUncompressed > BULK_IMAGE_UNCOMPRESSED_MAX_BYTES) {
            throw badRequest(
                `Uncompressed ZIP content exceeds ${BULK_IMAGE_UNCOMPRESSED_MAX_BYTES / (1024 * 1024)} MB limit.`
            );
        }

        imageFileCount += 1;
        if (imageFileCount > BULK_IMAGE_MAX_FILES) {
            throw badRequest(`ZIP contains more than ${BULK_IMAGE_MAX_FILES} images.`);
        }

        let buffer;
        try {
            buffer = entry.getData();
        } catch (err) {
            skipped.push({ file: filename, reason: err.message || 'Could not read file from ZIP' });
            continue;
        }

        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
            skipped.push({ file: filename, reason: 'Empty image file' });
            continue;
        }

        if (buffer.length > BULK_IMAGE_ORIGINAL_MAX_BYTES) {
            skipped.push({
                file: filename,
                reason: `Image exceeds ${BULK_IMAGE_ORIGINAL_MAX_BYTES / (1024 * 1024)} MB limit`,
            });
            continue;
        }

        parsed.push({
            filename: relativePath || filename,
            itemCode: nameWithoutExt,
            ext,
            buffer,
            uncompressedSize: buffer.length,
        });
    }

    if (parsed.length === 0 && skipped.length === 0) {
        throw badRequest('ZIP archive contains no image files.');
    }

    return { entries: parsed, skipped };
};

module.exports = {
    parseBulkImageZip,
    isHiddenOrSystemEntry,
    normalizeZipEntryPath,
    hasUnsafeZipPath,
};
