'use strict';

/**
 * Ch.16.3 — platform media policy for item images.
 */

const ITEM_IMAGE_MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB per Constitution §16.3

const ITEM_IMAGE_ALLOWED_EXTENSIONS = Object.freeze([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
]);

/** Recommended display dimensions; upload does not hard-reject other sizes. */
const ITEM_IMAGE_RECOMMENDED_MAX_DIMENSION_PX = 1024;

module.exports = {
    ITEM_IMAGE_MAX_FILE_SIZE_BYTES,
    ITEM_IMAGE_ALLOWED_EXTENSIONS,
    ITEM_IMAGE_RECOMMENDED_MAX_DIMENSION_PX,
};
