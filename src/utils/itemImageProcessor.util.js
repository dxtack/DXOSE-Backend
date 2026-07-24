'use strict';

const sharp = require('sharp');
const {
    BULK_IMAGE_OUTPUT_SIZE_PX,
    BULK_IMAGE_WEBP_QUALITY,
} = require('../platform/bulkItemImageUpload.platform');

/**
 * Normalize an item image: auto-rotate, WebP, 800×800 contain on white, no crop/stretch.
 * @param {Buffer} inputBuffer
 * @returns {Promise<Buffer>}
 */
const processItemImageToWebp = async (inputBuffer) => {
    const pipeline = sharp(inputBuffer, { failOn: 'error' }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) {
        throw new Error('Invalid image: could not read dimensions');
    }

    return sharp(inputBuffer, { failOn: 'error' })
        .rotate()
        .resize(BULK_IMAGE_OUTPUT_SIZE_PX, BULK_IMAGE_OUTPUT_SIZE_PX, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .webp({ quality: BULK_IMAGE_WEBP_QUALITY })
        .toBuffer();
};

module.exports = {
    processItemImageToWebp,
};
