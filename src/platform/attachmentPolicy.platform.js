'use strict';

/**
 * Ch.14.4 — central attachment policy (types, size, count).
 * Route-level multer configs should import limits from here.
 */

const ATTACHMENT_ALLOWED_EXTENSIONS = Object.freeze([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.pdf',
    '.docx',
    '.doc',
    '.xlsx',
    '.xls',
]);

const ATTACHMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ATTACHMENT_MAX_COUNT_PER_DOCUMENT = 20;

const GRN_INVOICE_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB PDF

module.exports = {
    ATTACHMENT_ALLOWED_EXTENSIONS,
    ATTACHMENT_MAX_FILE_SIZE_BYTES,
    ATTACHMENT_MAX_COUNT_PER_DOCUMENT,
    GRN_INVOICE_MAX_FILE_SIZE_BYTES,
};
