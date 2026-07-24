'use strict';

/**
 * Ch.14 — Posted attachment immutability.
 */

function assertAttachmentMutable(documentStatus) {
    const status = String(documentStatus || '').toUpperCase();
    if (status === 'DRAFT') return;
    throw Object.assign(
        new Error('Posted attachments shall not be modified, replaced, or deleted.'),
        { status: 423, code: 'ATTACHMENT_IMMUTABLE' },
    );
}

module.exports = {
    assertAttachmentMutable,
};
