'use strict';

const path = require('path');
const fs = require('fs');
const prisma = require('../config/database');
const logger = require('../utils/logger');

const SCHEMA_PATH = path.join(__dirname, '../../prisma/schema.prisma');

/** @type {Set<string> | null | false} null = not loaded yet, false = load failed */
let auditActionSetCache = null;

/**
 * Documented substring tokens for `AuditLog.note` (governance / searchability).
 * Call sites should prefer importing these over ad-hoc literals to reduce drift.
 * Enforcement is documentation-first in Phase B; optional stricter checks may follow.
 */
const AuditNoteTokens = Object.freeze({
    OB_IMPORT_ENABLED: 'OB_IMPORT_ENABLED',
    DOMAIN_VERB_CANCEL_DRAFT: 'domainVerb=CANCEL_DRAFT',
    LEGACY_STOCK_COUNT_POSTED: 'LEGACY_STOCK_COUNT_POSTED',
    INVENTORY_COUNT_POSTED: 'INVENTORY_COUNT_POSTED',
    STOCK_REPORT_POSTED: 'STOCK_REPORT_POSTED',
    GET_PASS_APPROVE_STEP_PREFIX: 'GET_PASS_APPROVE_STEP:',
});

function loadAuditActionSetFromSchema() {
    if (auditActionSetCache instanceof Set) return auditActionSetCache;
    if (auditActionSetCache === false) return null;
    try {
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        const m = schema.match(/enum\s+AuditAction\s*\{([^}]*)\}/s);
        if (!m) {
            logger.error('[AuditFacade] AuditAction enum block not found in schema.prisma');
            auditActionSetCache = false;
            return null;
        }
        const names = m[1]
            .split(/\n/)
            .map((line) => line.replace(/\/\/.*$/, '').trim())
            .filter(Boolean);
        auditActionSetCache = new Set(names);
        return auditActionSetCache;
    } catch (err) {
        logger.error('[AuditFacade] Failed to read schema for AuditAction validation', {
            message: err.message,
            path: SCHEMA_PATH,
        });
        auditActionSetCache = false;
        return null;
    }
}

function isAllowedAuditAction(action) {
    const set = loadAuditActionSetFromSchema();
    if (!set) return true;
    return typeof action === 'string' && set.has(action);
}

function cloneJsonSnapshot(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
}

/**
 * Single physical write path for `AuditLog` rows (Phase B facade).
 * Never throws: invalid actions and DB errors are logged; callers keep control flow.
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.entityType
 * @param {string} params.entityId
 * @param {string} params.action - Prisma `AuditAction`
 * @param {string} params.changedBy - user id
 * @param {string|null} [params.note]
 * @param {object|null} [params.beforeValue]
 * @param {object|null} [params.afterValue]
 * @param {string|null} [params.ipAddress]
 * @param {string|null} [params.userAgent]
 * @param {import('@prisma/client').Prisma.TransactionClient|null} [params.tx]
 */
async function writeAuditLog({
    tenantId,
    entityType,
    entityId,
    action,
    changedBy,
    note = null,
    beforeValue = null,
    afterValue = null,
    ipAddress = null,
    userAgent = null,
    tx = null,
}) {
    if (!isAllowedAuditAction(action)) {
        logger.error('[AuditFacade] invalid AuditAction — audit row skipped', {
            action,
            tenantId,
            entityType,
            entityId: entityId != null ? String(entityId) : entityId,
        });
        return;
    }

    const client = tx || prisma;

    const data = {
        tenantId,
        entityType,
        entityId: String(entityId),
        action,
        changedBy,
        note,
        beforeValue: cloneJsonSnapshot(beforeValue),
        afterValue: cloneJsonSnapshot(afterValue),
    };
    if (ipAddress != null && ipAddress !== '') data.ipAddress = ipAddress;
    if (userAgent != null && userAgent !== '') data.userAgent = userAgent;

    try {
        await client.auditLog.create({ data });
    } catch (err) {
        logger.error('[AuditFacade] Audit log write failed — queuing for retry', {
            message: err.message,
            code: err.code,
            tenantId,
            entityType,
            entityId: data.entityId,
            action,
        });
        try {
            const { enqueueAuditWrite } = require('./audit-write-queue.service');
            await enqueueAuditWrite({
                tenantId,
                entityType,
                entityId,
                action,
                changedBy,
                note,
                beforeValue,
                afterValue,
                ipAddress,
                userAgent,
            });
        } catch (queueErr) {
            logger.error('[AuditFacade] Failed to enqueue audit write — audit may be lost', {
                message: queueErr.message,
                tenantId,
                entityType,
                entityId: data.entityId,
                action,
            });
        }
    }
}

/**
 * Physical persist for audit_write_queue retries — throws on failure (no re-enqueue).
 * @param {object} row queue row or buildAuditLogData-compatible payload
 * @param {import('@prisma/client').Prisma.TransactionClient|null} [tx]
 */
async function writeAuditLogFromQueueRow(row, tx = null) {
    if (!isAllowedAuditAction(row.action)) {
        throw new Error(`Invalid AuditAction: ${row.action}`);
    }
    const client = tx || prisma;
    const data = {
        tenantId: row.tenantId,
        entityType: row.entityType,
        entityId: String(row.entityId),
        action: row.action,
        changedBy: row.changedBy,
        note: row.note ?? null,
        beforeValue: cloneJsonSnapshot(row.beforeValue),
        afterValue: cloneJsonSnapshot(row.afterValue),
    };
    if (row.ipAddress) data.ipAddress = row.ipAddress;
    if (row.userAgent) data.userAgent = row.userAgent;
    await client.auditLog.create({ data });
}

/**
 * Transactional audit write — throws on invalid action or DB failure (rolls back caller tx).
 *
 * @param {object} params
 * @param {import('@prisma/client').Prisma.TransactionClient} params.tx
 */
async function writeAuditLogTransactional({
    tenantId,
    entityType,
    entityId,
    action,
    changedBy,
    note = null,
    beforeValue = null,
    afterValue = null,
    ipAddress = null,
    userAgent = null,
    tx,
}) {
    if (!tx) {
        throw new Error('writeAuditLogTransactional requires a Prisma transaction client');
    }
    if (!isAllowedAuditAction(action)) {
        throw new Error(`Invalid AuditAction: ${action}`);
    }

    const data = {
        tenantId,
        entityType,
        entityId: String(entityId),
        action,
        changedBy,
        note,
        beforeValue: cloneJsonSnapshot(beforeValue),
        afterValue: cloneJsonSnapshot(afterValue),
    };
    if (ipAddress != null && ipAddress !== '') data.ipAddress = ipAddress;
    if (userAgent != null && userAgent !== '') data.userAgent = userAgent;

    await tx.auditLog.create({ data });
}

module.exports = {
    writeAuditLog,
    writeAuditLogTransactional,
    writeAuditLogFromQueueRow,
    isAllowedAuditAction,
    loadAuditActionSetFromSchema,
    AuditNoteTokens,
};
