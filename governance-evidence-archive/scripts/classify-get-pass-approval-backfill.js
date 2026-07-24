'use strict';

/**
 * Get Pass — Read-Only ApprovalRequest Backfill Classification
 * =============================================================
 * STRICTLY READ-ONLY. Zero database writes.
 *
 * Output: Governance/send-back/GET_PASS_BACKFILL_CLASSIFICATION.json
 *
 * Usage:
 *   node Governance/scripts/classify-get-pass-approval-backfill.js
 */

const fs = require('fs');
const path = require('path');
const rawPrisma = require('../../src/config/database');
const {
    resolveWorkflowForDocument,
    resolveWorkflowByVersionId,
} = require('../../src/services/acc-workflow-runtime.service');

const OPEN_STATUSES = [
    'PENDING_DEPT',
    'PENDING_COST_CONTROL',
    'PENDING_FINANCE',
    'PENDING_GM',
    'PENDING_SECURITY',
];

const STAMP_FIELDS = {
    PENDING_DEPT: { by: 'deptApprovedBy', at: 'deptApprovedAt' },
    PENDING_COST_CONTROL: { by: 'costControlApprovedBy', at: 'costControlApprovedAt' },
    PENDING_FINANCE: { by: 'financeApprovedBy', at: 'financeApprovedAt' },
    PENDING_GM: { by: 'gmApprovedBy', at: 'gmApprovedAt' },
    PENDING_SECURITY: { by: 'securityApprovedBy', at: 'securityApprovedAt' },
};

const FORBIDDEN_MODEL_METHODS = new Set([
    'create', 'createMany', 'createManyAndReturn',
    'update', 'updateMany', 'upsert', 'delete', 'deleteMany',
]);
const FORBIDDEN_TOP = new Set(['$executeRaw', '$executeRawUnsafe', '$transaction']);

function violation(name) {
    throw new Error(`READ-ONLY VIOLATION: "${name}" — aborted.`);
}

function guardModel(name, delegate) {
    return new Proxy(delegate, {
        get(t, prop) {
            if (typeof prop === 'string' && FORBIDDEN_MODEL_METHODS.has(prop)) {
                return () => violation(`${name}.${prop}`);
            }
            const v = t[prop];
            return typeof v === 'function' ? v.bind(t) : v;
        },
    });
}

const prisma = new Proxy(rawPrisma, {
    get(t, prop) {
        if (typeof prop === 'string' && FORBIDDEN_TOP.has(prop)) {
            return () => violation(prop);
        }
        const v = t[prop];
        if (v && typeof v === 'object' && typeof prop === 'string' && !prop.startsWith('$')) {
            return guardModel(prop, v);
        }
        return typeof v === 'function' ? v.bind(t) : v;
    },
});

function maskDbUrl(url) {
    if (!url) return { present: false };
    try {
        const u = new URL(url);
        return {
            present: true,
            host: u.hostname,
            port: u.port || null,
            database: u.pathname.replace(/^\//, '') || null,
            credentialsMasked: true,
        };
    } catch {
        return { present: true, parseError: true, credentialsMasked: true };
    }
}

function assertDevDatabase() {
    const db = maskDbUrl(process.env.DATABASE_URL);
    if (!db.present) throw new Error('DATABASE_URL missing');
    const prodHosts = ['prod', 'production', 'rds.amazonaws.com'];
    if (prodHosts.some((h) => String(db.host || '').includes(h))) {
        throw new Error('Production database detected — classification aborted.');
    }
    if (db.database === 'ose_inventory_prod') {
        throw new Error('Production database name detected — aborted.');
    }
    return { ...db, environment: 'dev/test' };
}

function pendingStatusesForChain(chain) {
    const fromChain = (chain.steps || []).map((s) => String(s.statusKey || '').toUpperCase()).filter(Boolean);
    return fromChain.length ? fromChain : OPEN_STATUSES;
}

function currentStepFromStatus(chain, status) {
    const statuses = pendingStatusesForChain(chain);
    const idx = statuses.findIndex((s) => s === String(status || '').toUpperCase());
    return idx >= 0 ? idx + 1 : null;
}

function stampForStep(getPass, chain, stepNumber) {
    const statuses = pendingStatusesForChain(chain);
    const statusKey = statuses[stepNumber - 1];
    const fields = STAMP_FIELDS[statusKey];
    if (!fields) return null;
    const actedBy = getPass[fields.by] || null;
    const actedAt = getPass[fields.at] || null;
    return actedBy || actedAt ? { actedBy, actedAt, statusKey } : null;
}

async function classifyRecord(getPass) {
    const base = {
        id: getPass.id,
        passNo: getPass.passNo,
        tenantId: getPass.tenantId,
        tenantSlug: getPass.tenant?.slug || null,
        status: getPass.status,
        accWorkflowVersionId: getPass.accWorkflowVersionId,
        createdBy: getPass.createdBy,
    };

    if (getPass.approvalRequest) {
        return { ...base, classification: 'ALREADY_LINKED', approvalRequestId: getPass.approvalRequest.id };
    }
    if (!OPEN_STATUSES.includes(getPass.status)) {
        return { ...base, classification: 'NOT_OPEN', reason: 'Status is not an open approval status.' };
    }

    let chain;
    try {
        chain = getPass.accWorkflowVersionId
            ? await resolveWorkflowByVersionId(getPass.accWorkflowVersionId)
            : await resolveWorkflowForDocument({ moduleKey: 'GET_PASS', tenantId: getPass.tenantId });
    } catch (err) {
        return { ...base, classification: 'NO_WORKFLOW', reason: err.message };
    }

    const currentStep = currentStepFromStatus(chain, getPass.status);
    if (currentStep == null) {
        return {
            ...base,
            classification: 'STATUS_CHAIN_MISMATCH',
            reason: `Status ${getPass.status} not found in workflow chain.`,
            chainStatuses: pendingStatusesForChain(chain),
        };
    }

    const roleCodes = chain.roleCodes || [];
    if (!roleCodes.length || roleCodes.length !== (chain.steps || []).length) {
        return { ...base, classification: 'INVALID_CHAIN', reason: 'Workflow chain has no role codes.' };
    }
    if (currentStep > roleCodes.length) {
        return {
            ...base,
            classification: 'STEP_OVERFLOW',
            reason: `currentStep ${currentStep} exceeds chain length ${roleCodes.length}.`,
        };
    }

    for (let step = 1; step <= roleCodes.length; step += 1) {
        const stamp = stampForStep(getPass, chain, step);
        if (stamp && step >= currentStep) {
            return {
                ...base,
                classification: 'STAMP_FUTURE_MISMATCH',
                reason: `Approval stamp exists on step ${step} (status ${stamp.statusKey}) but current pending step is ${currentStep}.`,
            };
        }
    }

    const projectedSteps = roleCodes.map((roleCode, index) => {
        const stepNumber = index + 1;
        const stamp = stepNumber < currentStep ? stampForStep(getPass, chain, stepNumber) : null;
        return {
            stepNumber,
            roleCode,
            status: stamp ? 'APPROVED' : 'PENDING',
            hasStamp: Boolean(stamp),
        };
    });

    return {
        ...base,
        classification: 'DETERMINISTIC_BACKFILL',
        projectedCurrentStep: currentStep,
        projectedTotalSteps: roleCodes.length,
        projectedVersionId: chain.versionId || getPass.accWorkflowVersionId || null,
        projectedSteps,
    };
}

async function main() {
    const dbMeta = assertDevDatabase();
    const openRecords = await prisma.getPass.findMany({
        where: { status: { in: OPEN_STATUSES } },
        include: {
            tenant: { select: { slug: true, name: true, isActive: true } },
            approvalRequest: { select: { id: true, status: true, currentStep: true } },
        },
        orderBy: { passNo: 'asc' },
    });

    const results = [];
    for (const gp of openRecords) {
        results.push(await classifyRecord(gp));
    }

    const summary = {
        totalOpen: openRecords.length,
        alreadyLinked: results.filter((r) => r.classification === 'ALREADY_LINKED').length,
        deterministic: results.filter((r) => r.classification === 'DETERMINISTIC_BACKFILL').length,
        blocked: results.filter((r) => r.classification !== 'DETERMINISTIC_BACKFILL' && r.classification !== 'ALREADY_LINKED').length,
        byClassification: {},
    };
    for (const r of results) {
        summary.byClassification[r.classification] = (summary.byClassification[r.classification] || 0) + 1;
    }

    const report = {
        generatedAt: new Date().toISOString(),
        script: 'classify-get-pass-approval-backfill.js',
        readOnly: true,
        database: dbMeta,
        countsBefore: {
            openWithoutApprovalRequest: results.filter((r) => r.classification === 'DETERMINISTIC_BACKFILL').length,
            openWithApprovalRequest: summary.alreadyLinked,
            openBlocked: summary.blocked,
        },
        summary,
        records: results,
    };

    const outDir = path.join(__dirname, '..', 'send-back');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'GET_PASS_BACKFILL_CLASSIFICATION.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

    console.log(JSON.stringify({ outPath, summary }, null, 2));
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await rawPrisma.$disconnect();
    });
