'use strict';

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const { expireStaleDrafts } = require('../platform/draftGovernance.service');
const { getStorage, isLocalDriver } = require('../config/storage');
const { UPLOADS_ROOT } = require('./storage/local.provider');

const prisma = new PrismaClient();

const DEFAULT_TEMP_RETENTION_HOURS = (() => {
    const raw = parseInt(process.env.TEMP_ATTACHMENT_RETENTION_HOURS, 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 48;
})();

async function runDraftExpirationForAllTenants() {
    const tenants = await prisma.tenant.findMany({
        where: { isActive: true, adminStatus: 'ACTIVE' },
        select: { id: true, name: true },
    });
    const summary = { tenants: tenants.length, expired: 0, errors: 0 };
    for (const tenant of tenants) {
        try {
            const result = await expireStaleDrafts(tenant.id);
            const count = Object.values(result.summary || {}).reduce((sum, n) => sum + (n || 0), 0);
            summary.expired += count;
            if (count > 0) {
                logger.info('[ContinuityCron] expired stale drafts', {
                    tenantId: tenant.id,
                    tenantName: tenant.name,
                    summary: result.summary,
                });
            }
        } catch (error) {
            summary.errors += 1;
            logger.error('[ContinuityCron] draft expiration failed', {
                tenantId: tenant.id,
                message: error.message,
            });
        }
    }
    return summary;
}

async function collectReferencedDraftAttachmentKeys() {
    const rows = await prisma.grnImport.findMany({
        where: { status: 'DRAFT', pdfAttachmentUrl: { not: '' } },
        select: { pdfAttachmentUrl: true },
    });
    return new Set(rows.map((r) => r.pdfAttachmentUrl).filter(Boolean));
}

async function sweepDirectoryFiles(dirPath, cutoffMs, referencedKeys) {
    let deleted = 0;
    let scanned = 0;
    if (!fs.existsSync(dirPath)) {
        return { deleted, scanned };
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            const nested = await sweepDirectoryFiles(fullPath, cutoffMs, referencedKeys);
            deleted += nested.deleted;
            scanned += nested.scanned;
            continue;
        }
        scanned += 1;
        const stat = await fs.promises.stat(fullPath);
        if (stat.mtimeMs >= cutoffMs) continue;

        const relFromUploads = fullPath.replace(UPLOADS_ROOT, '').replace(/\\/g, '/');
        const legacyKey = relFromUploads.startsWith('/') ? `/uploads${relFromUploads}` : `/uploads/${relFromUploads}`;
        if (referencedKeys.has(legacyKey)) continue;

        try {
            await fs.promises.unlink(fullPath);
            deleted += 1;
        } catch (error) {
            logger.warn('[ContinuityCron] temp file delete failed', {
                path: fullPath,
                message: error.message,
            });
        }
    }
    return { deleted, scanned };
}

async function runTempAttachmentCleanup() {
    const cutoffMs = Date.now() - DEFAULT_TEMP_RETENTION_HOURS * 60 * 60 * 1000;
    const referencedKeys = await collectReferencedDraftAttachmentKeys();
    const storage = getStorage();

    if (!isLocalDriver()) {
        return {
            driver: storage.driver,
            retentionHours: DEFAULT_TEMP_RETENTION_HOURS,
            skipped: true,
            reason: 'object-store sweep not implemented — local driver only',
        };
    }

    const tempDirs = [
        path.join(UPLOADS_ROOT, 'temp-zip'),
        path.join(UPLOADS_ROOT, 'temp', 'item-images'),
        path.join(UPLOADS_ROOT, 'attachments'),
    ];

    let deleted = 0;
    let scanned = 0;
    for (const dir of tempDirs) {
        const result = await sweepDirectoryFiles(dir, cutoffMs, referencedKeys);
        deleted += result.deleted;
        scanned += result.scanned;
    }

    return {
        driver: 'local',
        retentionHours: DEFAULT_TEMP_RETENTION_HOURS,
        deleted,
        scanned,
        referencedDraftAttachments: referencedKeys.size,
    };
}

async function runContinuityMaintenanceJobs() {
    const draftResult = await runDraftExpirationForAllTenants();
    const tempResult = await runTempAttachmentCleanup();
    return { drafts: draftResult, tempAttachments: tempResult };
}

module.exports = {
    DEFAULT_TEMP_RETENTION_HOURS,
    runContinuityMaintenanceJobs,
    runDraftExpirationForAllTenants,
    runTempAttachmentCleanup,
};
