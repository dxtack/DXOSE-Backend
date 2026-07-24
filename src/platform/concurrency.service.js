'use strict';

/**
 * Ch.8 — Optimistic concurrency for governed documents.
 */

const { logAction } = require('../services/auditTrail.service');

const CONFLICT_CODE = 'CONCURRENCY_CONFLICT';

function concurrencyConflictError() {
    return Object.assign(new Error('Document was modified by another user. Reload and try again.'), {
        status: 409,
        code: CONFLICT_CODE,
    });
}

function versionRequiredError() {
    return Object.assign(new Error('Concurrency version is required for this operation. Reload the document and retry.'), {
        status: 409,
        code: 'CONCURRENCY_VERSION_REQUIRED',
    });
}

/**
 * @param {number|null|undefined} expectedVersion from client (If-Match / body)
 * @param {number} currentVersion from database row
 * @param {{ required?: boolean, audit?: { tenantId: string, entityType: string, entityId: string, changedBy: string } }} [options]
 */
function assertConcurrencyVersion(expectedVersion, currentVersion, options = {}) {
    const { required = false, audit = null } = options;
    if (expectedVersion == null || expectedVersion === '') {
        if (required) throw versionRequiredError();
        return;
    }
    const expected = Number(expectedVersion);
    const current = Number(currentVersion ?? 0);
    if (!Number.isFinite(expected) || expected !== current) {
        if (audit?.tenantId && audit?.entityId && audit?.changedBy) {
            logAction({
                tenantId: audit.tenantId,
                entityType: audit.entityType,
                entityId: audit.entityId,
                action: 'UPDATE',
                changedBy: audit.changedBy,
                note: `CONCURRENCY_CONFLICT expected=${expected} current=${current}`,
            }).catch(() => {});
        }
        throw concurrencyConflictError();
    }
}

/**
 * Build Prisma update data bumping concurrency version.
 */
function bumpConcurrencyUpdate(extra = {}) {
    return { ...extra, concurrencyVersion: { increment: 1 } };
}

function parseVersionFromRequest(req) {
    const header = req.headers['if-match'];
    if (header != null && header !== '') return Number(header);
    if (req.body?.concurrencyVersion != null) return Number(req.body.concurrencyVersion);
    if (req.query?.concurrencyVersion != null) return Number(req.query.concurrencyVersion);
    return null;
}

module.exports = {
    CONFLICT_CODE,
    concurrencyConflictError,
    versionRequiredError,
    assertConcurrencyVersion,
    bumpConcurrencyUpdate,
    parseVersionFromRequest,
};
