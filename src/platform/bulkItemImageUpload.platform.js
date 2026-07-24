'use strict';

/**
 * Bulk Item Image Upload — limits and allowed formats (Item Master).
 */

const BULK_IMAGE_ZIP_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const BULK_IMAGE_MAX_FILES = 200;
const BULK_IMAGE_ORIGINAL_MAX_BYTES = 1 * 1024 * 1024; // 1 MB per source file
const BULK_IMAGE_UNCOMPRESSED_MAX_BYTES = 100 * 1024 * 1024; // 100 MB after unzip
const BULK_IMAGE_PREVIEW_TTL_MS = (() => {
    const fromEnv = parseInt(process.env.BULK_IMAGE_PREVIEW_TTL_MS, 10);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 30 * 60 * 1000;
})();

const BULK_IMAGE_ALLOWED_EXTENSIONS = Object.freeze([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
]);

const BULK_IMAGE_OUTPUT_SIZE_PX = 800;
const BULK_IMAGE_WEBP_QUALITY = 82;

const BULK_IMAGE_MIME_BY_EXT = Object.freeze({
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
});

module.exports = {
    BULK_IMAGE_ZIP_MAX_BYTES,
    BULK_IMAGE_MAX_FILES,
    BULK_IMAGE_ORIGINAL_MAX_BYTES,
    BULK_IMAGE_UNCOMPRESSED_MAX_BYTES,
    BULK_IMAGE_PREVIEW_TTL_MS,
    BULK_IMAGE_ALLOWED_EXTENSIONS,
    BULK_IMAGE_OUTPUT_SIZE_PX,
    BULK_IMAGE_WEBP_QUALITY,
    BULK_IMAGE_MIME_BY_EXT,
};
