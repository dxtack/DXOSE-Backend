'use strict';

/**
 * Get Pass — Deterministic ApprovalRequest Backfill (open records only)
 * =====================================================================
 * Requires prior read-only classification. Processes DETERMINISTIC_BACKFILL only.
 * Stops and reports on first non-deterministic or failed record. No fabricated history.
 *
 * Usage:
 *   node Governance/scripts/classify-get-pass-approval-backfill.js
 *   node Governance/scripts/execute-get-pass-approval-backfill.js
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../../src/config/database');
const { connectRole } = require('../../src/services/rbac.service');
const {
    resolveWorkflowForDocument,
    resolveWorkflowByVersionId,
} = require('../../src/services/acc-workflow-runtime.service');
const { getPassVersionPin } = require('../../src/services/acc-workflow-get-pass.runtime');

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

function assertDevDatabase() {
    const url = process.env.DATABASE_URL || '';
    if (!url) throw new Error('DATABASE_URL missing');
    if (/prod|production|rds\.amazonaws/i.test(url)) {
        throw new Error('Production database detected — backfill aborted.');
    }
}

function pendingStatusesForChain(chain) {
    const fromChain = (chain.steps || []).map((s) => String(s.statusKey || '').toUpperCase()).filter(Boolean);
    return fromChain.length ? fromChain : OPEN_STATUSES;
}

function currentStepFromStatus(chain, status) {
    const statuses = pendingStatusesForChain(chain);
    const idx = statuses.findIndex((s) => s === String(status || '').toUpperCase());
    return idx >= 0 ? idx + 1 : 1;
}

function stampForStep(getPass, chain, stepNumber) {
    const statuses = pendingStatusesForChain(chain);
    const statusKey = statuses[stepNumber - 1];
    const fields = STAMP_FIELDS[statusKey];
    if (!fields) return null;
    const actedBy = getPass[fields.by] || null;
    const actedAt = getPass[fields.at] || null;
    return actedBy || actedAt ? { actedBy, actedAt } : null;
}

async function backfillOneInTx(tx, getPass, tenantId) {
    if (getPass.approvalRequest) {
        return { outcome: 'ALREADY_LINKED', approvalRequestId: getPass.approvalRequest.id };
    }
    const chain = getPass.accWorkflowVersionId
        ? await resolveWorkflowByVersionId(getPass.accWorkflowVersionId)
        : await resolveWorkflowForDocument({ moduleKey: 'GET_PASS', tenantId });
    const roleCodes = chain.roleCodes || (chain.steps || []).map((s) => s.roleCode).filter(Boolean);
    if (!roleCodes.length) {
        throw Object.assign(new Error('ACC published workflow is required for Get Pass.'), { status: 422 });
    }
    const currentStep = OPEN_STATUSES.includes(String(getPass.status || '').toUpperCase())
        ? currentStepFromStatus(chain, getPass.status)
        : 1;

    const request = await tx.approvalRequest.create({
        data: {
            tenantId,
            requestType: 'GET_PASS',
            status: 'PENDING',
            getPassId: getPass.id,
            currentStep,
            totalSteps: roleCodes.length,
            createdBy: getPass.createdBy,
            ...(getPass.accWorkflowVersionId
                ? { accWorkflowVersionId: getPass.accWorkflowVersionId }
                : chain.versionId
                    ? { accWorkflowVersionId: chain.versionId }
                    : {}),
            steps: {
                create: roleCodes.map((roleCode, index) => {
                    const stepNumber = index + 1;
                    const stamp = stepNumber < currentStep ? stampForStep(getPass, chain, stepNumber) : null;
                    return {
                        stepNumber,
                        requiredRole: connectRole(roleCode),
                        status: stamp ? 'APPROVED' : 'PENDING',
                        ...(stamp?.actedBy ? { actedByUser: { connect: { id: stamp.actedBy } } } : {}),
                        ...(stamp?.actedAt ? { actedAt: stamp.actedAt } : {}),
                    };
                }),
            },
        },
        include: {
            steps: { orderBy: { stepNumber: 'asc' }, include: { requiredRole: { select: { code: true } } } },
        },
    });

    if (!getPass.accWorkflowVersionId && chain.versionId) {
        await tx.getPass.update({
            where: { id: getPass.id },
            data: getPassVersionPin(chain),
        });
    }

    return {
        outcome: 'BACKFILLED',
        approvalRequestId: request.id,
        accWorkflowVersionId: request.accWorkflowVersionId || chain.versionId || null,
        currentStep: request.currentStep,
        totalSteps: request.totalSteps,
    };
}

async function countOpen() {
    const open = await prisma.getPass.count({ where: { status: { in: OPEN_STATUSES } } });
    const linked = await prisma.getPass.count({
        where: { status: { in: OPEN_STATUSES }, approvalRequest: { isNot: null } },
    });
    return { open, linked, unlinked: open - linked };
}

async function main() {
    assertDevDatabase();
    const classPath = path.join(__dirname, '..', 'send-back', 'GET_PASS_BACKFILL_CLASSIFICATION.json');
    if (!fs.existsSync(classPath)) {
        throw new Error(`Classification file missing: ${classPath}. Run classify script first.`);
    }
    const classification = JSON.parse(fs.readFileSync(classPath, 'utf8'));
    const targets = (classification.records || []).filter((r) => r.classification === 'DETERMINISTIC_BACKFILL');
    const blocked = (classification.records || []).filter(
        (r) => r.classification !== 'DETERMINISTIC_BACKFILL' && r.classification !== 'ALREADY_LINKED',
    );
    if (blocked.length > 0) {
        throw Object.assign(
            new Error(`Blocked records present (${blocked.length}). Backfill stopped before writes.`),
            { blocked },
        );
    }

    const before = await countOpen();
    const results = [];

    for (const target of targets) {
        const getPass = await prisma.getPass.findFirst({
            where: { id: target.id },
            include: { approvalRequest: { select: { id: true } } },
        });
        if (!getPass) {
            throw Object.assign(new Error(`Get Pass not found: ${target.id}`), { passNo: target.passNo });
        }
        if (!OPEN_STATUSES.includes(getPass.status)) {
            throw Object.assign(
                new Error(`Get Pass ${getPass.passNo} is no longer open (${getPass.status}).`),
                { id: getPass.id },
            );
        }

        const outcome = await prisma.$transaction(async (tx) => backfillOneInTx(tx, getPass, getPass.tenantId));
        results.push({
            id: getPass.id,
            passNo: getPass.passNo,
            tenantId: getPass.tenantId,
            status: getPass.status,
            ...outcome,
        });
    }

    const after = await countOpen();
    const report = {
        generatedAt: new Date().toISOString(),
        script: 'execute-get-pass-approval-backfill.js',
        database: { environment: 'dev/test', credentialsMasked: true },
        countsBefore: before,
        countsAfter: after,
        processed: results.length,
        results,
        stoppedOnBlocked: false,
    };

    const outDir = path.join(__dirname, '..', 'send-back');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'GET_PASS_BACKFILL_EXECUTION.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ outPath, processed: results.length, before, after }, null, 2));
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
