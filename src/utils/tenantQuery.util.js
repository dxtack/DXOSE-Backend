'use strict';

/**
 * Prisma where helpers — always pair document id with authenticated tenantId.
 * Defense-in-depth for mutations after tenant-scoped reads.
 */

function tenantDocumentWhere(id, tenantId) {
    return { id, tenantId };
}

function tenantApprovalRequestWhere(id, tenantId) {
    return { id, tenantId };
}

module.exports = {
    tenantDocumentWhere,
    tenantApprovalRequestWhere,
};
