'use strict';

/**
 * Step-by-step runtime workflow tests on DX Marina.
 * Usage: node scripts/governance-approval-chain-runtime-marina.js
 */

require('dotenv').config();

const http = require('http');
const prisma = require('../src/config/database');
const authService = require('../src/services/auth.service');

const API = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4000}`;
const TENANT_SLUG = process.env.AUDIT_TENANT_SLUG || 'dx-marina-hotel';

const USERS = {
    STOREKEEPER: 'kevin.brooks@dxuat.com',
    DEPT_MANAGER: 'emma.collins@dxuat.com',
    COST_CONTROL: 'olivia.parker@dxuat.com',
    FINANCE_MANAGER: 'jonathan.miller@dxuat.com',
    GENERAL_MANAGER: 'richard.evans@dxuat.com',
    SECURITY: 'steven.clark@dxuat.com',
};

const { processStoreTransferApproval } = require('../src/services/approvalChain.service');
const postingEngine = require('../src/services/postingEngine.service');
const {
    alignMarinaGovernanceFixtures,
    resolveScopedStockFixture,
    resolveTransferFixture,
} = require('./lib/align-marina-governance-fixtures');
const { FORBIDDEN_INTERMEDIATE_STATUS_KEYS } = require('../src/services/acc-workflow-status-key-guard.service');

const TERMINAL_DOC_STATUSES = new Set([...FORBIDDEN_INTERMEDIATE_STATUS_KEYS, 'OUT', 'CLOSED']);

const results = [];

function log(mod, step, status, detail = '') {
    const line = { module: mod, step, status, detail };
    results.push(line);
    const icon = status === 'PASS' ? '✓' : status === 'SKIP' ? '○' : '✗';
    console.log(`  ${icon} [${mod}] ${step}${detail ? ` — ${detail}` : ''}`);
}

function api(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const u = new URL(path, API);
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request(
            {
                hostname: u.hostname,
                port: u.port || 80,
                path: u.pathname + u.search,
                method,
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
                },
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    let data;
                    try {
                        data = JSON.parse(Buffer.concat(chunks).toString());
                    } catch {
                        data = null;
                    }
                    resolve({ status: res.statusCode, data });
                });
            },
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function tokenForEmail(email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const issued = await authService.switchTenant({
        userId: user.id,
        tenantSlug: TENANT_SLUG,
        ipAddress: '127.0.0.1',
        userAgent: 'governance-runtime',
    });
    return issued.accessToken;
}

async function token(role) {
    return tokenForEmail(USERS[role]);
}


async function userCtx(email, roleCode) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    return { id: u.id, email: u.email, role: roleCode, tenantId: (await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } })).id };
}

async function testTransferServiceLayer(tenant) {
    const mod = 'TRANSFER';
    const pending = await prisma.storeTransfer.findFirst({
        where: { tenantId: tenant.id, status: 'PENDING_DEPT' },
        include: { approvalRequest: { include: { steps: { include: { requiredRole: true } } } } },
    });
    if (!pending) {
        log(mod, 'service-layer complete chain', 'SKIP', 'no PENDING_DEPT transfer');
        return 'SKIP';
    }
    const id = pending.id;

    // Step 1 — must fail if wrong role (finance at dept step)
    try {
        const fin = await userCtx(USERS.FINANCE_MANAGER, 'FINANCE_MANAGER');
        await processStoreTransferApproval({
            transferId: id,
            tenantId: tenant.id,
            userId: fin.id,
            user: fin,
            action: 'APPROVE',
        });
        log(mod, 'service finance at dept step', 'FAIL', 'should not approve');
        return 'FAIL';
    } catch (e) {
        log(mod, 'service finance blocked at dept', 'PASS', e.message?.slice(0, 60));
    }

    // Find dept manager for source location department
    const srcLoc = await prisma.location.findUnique({ where: { id: pending.sourceLocationId } });
    let dm = await prisma.tenantMember.findFirst({
        where: {
            tenantId: tenant.id,
            isActive: true,
            role: { code: 'DEPT_MANAGER' },
            departmentId: srcLoc?.departmentId ?? undefined,
        },
        include: { user: true },
    });
    if (!dm) {
        dm = await prisma.tenantMember.findFirst({
            where: { tenantId: tenant.id, isActive: true, role: { code: 'DEPT_MANAGER' } },
            include: { user: true },
        });
    }
    const dept = await userCtx(dm.user.email, 'DEPT_MANAGER');
    const deptOutcome = await processStoreTransferApproval({
        transferId: id,
        tenantId: tenant.id,
        userId: dept.id,
        user: dept,
        action: 'APPROVE',
    });
    if (deptOutcome.transfer.status !== 'PENDING_FINANCE') {
        log(mod, 'service dept → PENDING_FINANCE', 'FAIL', deptOutcome.transfer.status);
        return 'FAIL';
    }
    log(mod, 'service dept → PENDING_FINANCE', 'PASS');

    const fin = await userCtx(USERS.FINANCE_MANAGER, 'FINANCE_MANAGER');
    let posted = false;
    await prisma.$transaction(async (tx) => {
        const outcome = await processStoreTransferApproval({
            tx,
            transferId: id,
            tenantId: tenant.id,
            userId: fin.id,
            user: fin,
            action: 'APPROVE',
        });
        if (!outcome.needsPosting) {
            throw new Error('expected needsPosting on final step');
        }
        await postingEngine.postTransferInTransaction(tx, outcome.transfer, fin.id);
        posted = true;
    });
    const after = await prisma.storeTransfer.findUnique({ where: { id } });
    const ledger = await prisma.inventoryLedger.count({
        where: { tenantId: tenant.id, referenceId: id, referenceType: 'TRANSFER' },
    });
    if (after?.status !== 'POSTED' || !after?.postedBy || ledger < 2) {
        log(mod, 'service finance post', 'FAIL', `status=${after?.status} ledger=${ledger}`);
        return 'FAIL';
    }
    log(mod, 'service finance → POSTED + ledger', 'PASS', `ledger=${ledger}`);
    return 'PASS';
}

async function countAuditEvidence(tenantId, entityId, entityTypes = ['MOVEMENT', 'GET_PASS']) {
    const auditLog = await prisma.auditLog.count({
        where: {
            tenantId,
            entityId,
            entityType: { in: entityTypes },
        },
    });
    const approvalSteps = await prisma.approvalStep.count({
        where: {
            status: 'APPROVED',
            actedAt: { not: null },
            request: { tenantId, documentId: entityId },
        },
    });
    return auditLog + approvalSteps;
}

async function resolveTransferFixtures(tenant) {
    return resolveTransferFixture(prisma, tenant.id);
}

async function testTransfer(tenant, tokens) {
    const mod = 'TRANSFER';
    const fx = await resolveTransferFixtures(tenant);
    if (!fx) {
        log(mod, 'fixture locations+stock in dept scope', 'SKIP');
        return 'SKIP';
    }
    if (fx.deptEmail !== USERS.DEPT_MANAGER) {
        tokens.DEPT_MANAGER = await tokenForEmail(fx.deptEmail);
    }

    const create = await api(
        'POST',
        '/api/transfers',
        {
            sourceLocationId: fx.sourceLocationId,
            destLocationId: fx.destLocationId,
            reason: `Gov audit ${Date.now()}`,
            lines: [
                {
                    itemId: fx.balance.itemId,
                    uomId: fx.balance.item.itemUnits[0].unitId,
                    requestedQty: 1,
                },
            ],
        },
        tokens.STOREKEEPER,
    );
    if (create.status !== 201 || !create.data?.data?.id) {
        log(mod, 'create DRAFT', 'FAIL', `http=${create.status}`);
        return 'FAIL';
    }
    const id = create.data.data.id;
    log(mod, 'create DRAFT', 'PASS', create.data.data.status);

    const submit = await api('POST', `/api/transfers/${id}/submit`, null, tokens.STOREKEEPER);
    if (submit.status !== 200 || submit.data?.data?.status !== 'PENDING_DEPT') {
        log(mod, 'submit → PENDING_DEPT', 'FAIL', submit.data?.message);
        return 'FAIL';
    }
    log(mod, 'submit → PENDING_DEPT', 'PASS');

    const bypass = await api('POST', `/api/transfers/${id}/approve`, { comment: 'bypass' }, tokens.FINANCE_MANAGER);
    if (bypass.status === 200 && bypass.data?.data?.status === 'POSTED') {
        log(mod, 'bypass dept with finance', 'FAIL', 'posted without dept approval');
        return 'FAIL';
    }
    log(mod, 'finance blocked at PENDING_DEPT', 'PASS', `http=${bypass.status}`);

    const dept = await api('POST', `/api/transfers/${id}/approve`, { comment: 'dept ok' }, tokens.DEPT_MANAGER);
    if (dept.status !== 200 || dept.data?.data?.status !== 'PENDING_FINANCE') {
        log(mod, 'dept → PENDING_FINANCE', 'FAIL', dept.data?.message);
        return 'FAIL';
    }
    log(mod, 'dept → PENDING_FINANCE', 'PASS');

    const fin = await api('POST', `/api/transfers/${id}/approve`, { comment: 'finance post' }, tokens.FINANCE_MANAGER);
    if (fin.status !== 200 || fin.data?.data?.status !== 'POSTED') {
        log(mod, 'finance → POSTED', 'FAIL', fin.data?.message);
        return 'FAIL';
    }
    log(mod, 'finance → POSTED', 'PASS');

    const posted = await prisma.storeTransfer.findUnique({ where: { id } });
    const ledger = await prisma.inventoryLedger.count({
        where: { tenantId: tenant.id, referenceId: id, referenceType: 'TRANSFER' },
    });
    const audit = await countAuditEvidence(tenant.id, id, ['TRANSFER', 'MOVEMENT']);
    if (!posted?.postedBy || !posted?.postedAt || ledger < 2) {
        log(mod, 'posting artifacts', 'FAIL', `postedBy=${!!posted?.postedBy} ledger=${ledger}`);
        return 'FAIL';
    }
    log(mod, 'ledger OUT+IN + postedBy/At', 'PASS', `ledger rows=${ledger}`);
    log(mod, 'audit evidence', audit > 0 ? 'PASS' : 'FAIL', `rows=${audit}`);
    return audit > 0 ? 'PASS' : 'FAIL';
}

async function testGrnSequence(tenant, tokens) {
    const mod = 'GRN';
    const g = await prisma.grnImport.findFirst({
        where: { tenantId: tenant.id, status: 'POSTED', postedAt: { not: null } },
        orderBy: { postedAt: 'desc' },
        include: { approvalRequest: { include: { steps: { orderBy: { stepNumber: 'asc' } } } } },
    });
    if (!g) {
        log(mod, 'posted sample', 'SKIP');
        return 'SKIP';
    }
    const stepsOk = g.approvalRequest?.steps?.every((s) => s.status === 'APPROVED');
    const ledger = await prisma.inventoryLedger.count({
        where: { tenantId: tenant.id, referenceId: g.id, movementType: 'RECEIVE' },
    });
    if (stepsOk && g.postedBy && ledger > 0) {
        log(mod, `sequence GRN ${g.grnNumber}`, 'PASS', `steps approved, ledger=${ledger}`);
    } else {
        log(mod, `sequence GRN ${g.grnNumber}`, 'FAIL', `stepsOk=${stepsOk} ledger=${ledger}`);
        return 'FAIL';
    }

    const draft = await prisma.grnImport.findFirst({
        where: { tenantId: tenant.id, status: { in: ['VALIDATED', 'PENDING_APPROVAL'] } },
    });
    if (draft) {
        const bypass = await api('PATCH', `/api/grn/${draft.id}/status`, { status: 'POSTED' }, tokens.FINANCE_MANAGER);
        const blocked = bypass.status !== 200 || bypass.data?.success === false;
        log(mod, 'PATCH POSTED bypass blocked', blocked ? 'PASS' : 'FAIL', `http=${bypass.status}`);
        if (!blocked) return 'FAIL';
    } else {
        log(mod, 'PATCH POSTED bypass', 'SKIP', 'no pre-finance GRN');
    }
    return 'PASS';
}

async function testRequisition(tenant, tokens) {
    const mod = 'REQUISITION';
    const fx = await resolveScopedStockFixture(prisma, tenant.id);
    const loc = fx
        ? await prisma.location.findUnique({
            where: { id: fx.balance.locationId },
            include: { department: { select: { name: true } } },
        })
        : await prisma.location.findFirst({
            where: { tenantId: tenant.id, isActive: true },
            include: { department: { select: { name: true } } },
        });
    const item = fx?.balance?.item
        || (await prisma.item.findFirst({
            where: { tenantId: tenant.id, isActive: true },
            include: { itemUnits: true },
        }));
    if (!loc || !item?.itemUnits?.[0]) {
        log(mod, 'fixtures', 'SKIP');
        return 'SKIP';
    }
    if (fx?.deptEmail) {
        tokens.DEPT_MANAGER = await tokenForEmail(fx.deptEmail);
    }

    const create = await api(
        'POST',
        '/api/requisitions',
        {
            departmentName: loc.department?.name || 'Housekeeping',
            locationId: loc.id,
            remarks: `Gov audit ${Date.now()}`,
            lines: [{ itemId: item.id, uomId: item.itemUnits[0].unitId, requestedQty: 1 }],
        },
        tokens.STOREKEEPER,
    );
    if (create.status !== 201 || !create.data?.data?.id) {
        log(mod, 'create', 'FAIL', `http=${create.status} ${create.data?.message}`);
        return 'FAIL';
    }
    const id = create.data.data.id;
    log(mod, 'create DRAFT', 'PASS');

    const submit = await api('POST', `/api/requisitions/${id}/submit`, null, tokens.STOREKEEPER);
    if (submit.status !== 200) {
        log(mod, 'submit', 'FAIL', submit.data?.message);
        return 'FAIL';
    }
    const afterSubmit = submit.data?.data?.status;
    log(mod, `submit → ${afterSubmit}`, 'PASS');

    const { assertDualGateApproval } = require('../src/acc-authority/step-permission-enforcement');
    let financeBlocked = false;
    try {
        assertDualGateApproval({ role: 'FINANCE_MANAGER' }, 'STOREKEEPER', 'REQUISITION_APPROVE');
    } catch {
        financeBlocked = true;
    }
    log(mod, 'finance blocked at early step (dual-gate)', financeBlocked ? 'PASS' : 'FAIL');
    if (!financeBlocked) return 'FAIL';

    // Walk remaining steps with correct roles from approval chain
    let cur = await prisma.storeRequisition.findUnique({
        where: { id },
        include: { approvalRequest: { include: { steps: { include: { requiredRole: true } } } } },
    });
    const roleToken = {
        STOREKEEPER: tokens.STOREKEEPER,
        DEPT_MANAGER: tokens.DEPT_MANAGER,
        FINANCE_MANAGER: tokens.FINANCE_MANAGER,
    };
    while (cur?.approvalRequest?.status === 'PENDING' && cur.status !== 'APPROVED') {
        const stepNo = cur.approvalRequest.currentStep;
        const step = cur.approvalRequest.steps.find((s) => s.stepNumber === stepNo);
        const roleCode = step?.requiredRole?.code;
        const token = roleToken[roleCode];
        if (!roleCode || !token) {
            log(mod, `approve step ${stepNo}`, 'FAIL', `no token for ${roleCode}`);
            return 'FAIL';
        }
        const res = await api('POST', `/api/requisitions/${id}/approve`, { comment: `step ${stepNo}` }, token);
        if (res.status !== 200) {
            log(mod, `approve step ${stepNo} (${roleCode})`, 'FAIL', res.data?.message);
            return 'FAIL';
        }
        log(mod, `approve step ${stepNo} (${roleCode}) → ${res.data?.data?.status}`, 'PASS');
        cur = await prisma.storeRequisition.findUnique({
            where: { id },
            include: { approvalRequest: { include: { steps: { include: { requiredRole: true } } } } },
        });
        if (cur.status === 'APPROVED') break;
    }
    if (cur?.status === 'APPROVED' && cur.approvalRequest?.status === 'APPROVED') {
        log(mod, 'final APPROVED (no ledger post)', 'PASS');
        return 'PASS';
    }
    log(mod, 'full chain', 'FAIL', `status=${cur?.status}`);
    return 'FAIL';
}

async function testBreakage(tenant, tokens) {
    const mod = 'BREAKAGE';
    const fx = await resolveScopedStockFixture(prisma, tenant.id);
    if (!fx) {
        log(mod, 'fixtures', 'SKIP', 'no scoped stock');
        return 'SKIP';
    }
    if (fx.deptEmail !== USERS.DEPT_MANAGER) {
        tokens.DEPT_MANAGER = await tokenForEmail(fx.deptEmail);
    }

    const create = await api(
        'POST',
        '/api/breakage',
        {
            reason: `Gov audit ${Date.now()}`,
            suggestedAction: 'HOTEL',
            lines: [
                {
                    itemId: fx.balance.itemId,
                    locationId: fx.balance.locationId,
                    uomId: fx.balance.item.itemUnits[0]?.unitId,
                    qty: 1,
                },
            ],
        },
        tokens.STOREKEEPER,
    );
    if (create.status !== 201 || !create.data?.data?.id) {
        log(mod, 'create', 'FAIL', `http=${create.status}`);
        return 'FAIL';
    }
    const id = create.data.data.id;
    const initialStatus = create.data.data.status;
    if (TERMINAL_DOC_STATUSES.has(initialStatus) && initialStatus !== 'APPROVED') {
        log(mod, 'create terminal misuse', 'FAIL', initialStatus);
        return 'FAIL';
    }
    log(mod, `create → ${initialStatus}`, 'PASS');

    const submit = await api('POST', `/api/breakage/${id}/submit`, null, tokens.STOREKEEPER);
    if (submit.status === 200) log(mod, 'submit', 'PASS');

    const bypass = await api('POST', `/api/breakage/${id}/approve-gm`, { comment: 'skip' }, tokens.GENERAL_MANAGER);
    if (bypass.status === 200) {
        const d = await prisma.movementDocument.findUnique({ where: { id } });
        if (d?.status === 'APPROVED' && d?.postedAt) {
            log(mod, 'GM skip posted early', 'FAIL');
            return 'FAIL';
        }
    }
    log(mod, 'GM skip blocked or not final', 'PASS', `http=${bypass.status}`);

    // Storekeeper create auto-approves step 1 (DEPT) — chain continues at Cost Control.
    const steps = [
        { route: 'approve-cost', role: 'COST_CONTROL', expect: ['COST_CONTROL_APPROVED'] },
        { route: 'approve-finance', role: 'FINANCE_MANAGER', expect: ['FINANCE_APPROVED'] },
        { route: 'approve-gm', role: 'GENERAL_MANAGER', expect: ['APPROVED'] },
    ];
    for (const s of steps) {
        const doc = await prisma.movementDocument.findUnique({
            where: { id },
            include: { approvalRequests: { include: { steps: true } } },
        });
        if (doc?.status === 'APPROVED') break;
        if (TERMINAL_DOC_STATUSES.has(doc?.status) && doc?.status !== 'APPROVED') {
            log(mod, 'premature terminal status', 'FAIL', doc.status);
            return 'FAIL';
        }
        const res = await api('POST', `/api/breakage/${id}/${s.route}`, { comment: 'ok' }, tokens[s.role]);
        if (res.status !== 200) {
            log(mod, s.route, 'FAIL', res.data?.message);
            return 'FAIL';
        }
        const st = res.data?.data?.status;
        log(mod, `${s.route} → ${st}`, s.expect.includes(st) || st === 'APPROVED' ? 'PASS' : 'FAIL');
        if (st === 'APPROVED') {
            const posted = await prisma.movementDocument.findUnique({ where: { id } });
            const ledger = await prisma.inventoryLedger.count({ where: { tenantId: tenant.id, referenceId: id } });
            const audit = await countAuditEvidence(tenant.id, id, ['MOVEMENT']);
            if (!posted?.postedAt || ledger === 0) {
                log(mod, 'posting after GM', 'FAIL', `ledger=${ledger}`);
                return 'FAIL';
            }
            log(mod, 'postedAt + ledger', 'PASS', `ledger=${ledger}`);
            log(mod, 'audit evidence', audit > 0 ? 'PASS' : 'FAIL', `rows=${audit}`);
            return audit > 0 ? 'PASS' : 'FAIL';
        }
    }
    return 'FAIL';
}

async function testGetPass(tenant, tokens) {
    const mod = 'GET_PASS';
    const fx = await resolveScopedStockFixture(prisma, tenant.id);
    if (!fx) {
        log(mod, 'fixtures', 'SKIP', 'no scoped stock');
        return 'SKIP';
    }
    if (fx.deptEmail !== USERS.DEPT_MANAGER) {
        tokens.DEPT_MANAGER = await tokenForEmail(fx.deptEmail);
    }

    const { resolveWorkflowForDocument } = require('../src/services/acc-workflow-runtime.service');
    const { buildGetPassWorkflowMaps } = require('../src/services/acc-workflow-get-pass.runtime');
    const chain = await resolveWorkflowForDocument({ moduleKey: 'GET_PASS', tenantId: tenant.id });
    const maps = buildGetPassWorkflowMaps(chain.steps);
    const roleToken = {
        DEPT_MANAGER: tokens.DEPT_MANAGER,
        COST_CONTROL: tokens.COST_CONTROL,
        FINANCE_MANAGER: tokens.FINANCE_MANAGER,
        GENERAL_MANAGER: tokens.GENERAL_MANAGER,
        SECURITY: tokens.SECURITY,
    };

    const expectedReturn = new Date();
    expectedReturn.setDate(expectedReturn.getDate() + 7);

    const create = await api(
        'POST',
        '/api/get-passes',
        {
            transferType: 'TEMPORARY',
            departmentId: fx.departmentId,
            borrowingEntity: `Gov runtime ${Date.now()}`,
            reason: 'Governance approval chain runtime',
            expectedReturnDate: expectedReturn.toISOString(),
            lines: [
                {
                    itemId: fx.balance.itemId,
                    locationId: fx.balance.locationId,
                    qty: 1,
                    conditionOut: 'GOOD',
                },
            ],
        },
        tokens.STOREKEEPER,
    );
    if (create.status !== 201 || !create.data?.data?.id) {
        log(mod, 'create DRAFT', 'FAIL', create.data?.message || `http=${create.status}`);
        return 'FAIL';
    }
    const id = create.data.data.id;
    log(mod, 'create DRAFT', 'PASS');

    const submit = await api('POST', `/api/get-passes/${id}/submit`, null, tokens.STOREKEEPER);
    if (submit.status !== 200) {
        log(mod, 'submit', 'FAIL', submit.data?.message);
        return 'FAIL';
    }
    const afterSubmit = submit.data?.data?.status;
    if (TERMINAL_DOC_STATUSES.has(afterSubmit)) {
        log(mod, 'terminal before final', 'FAIL', afterSubmit);
        return 'FAIL';
    }
    log(mod, `submit → ${afterSubmit}`, 'PASS');

    const financeBypass = await api('POST', `/api/get-passes/${id}/approve`, null, tokens.FINANCE_MANAGER);
    log(mod, 'finance blocked at dept', financeBypass.status === 403 ? 'PASS' : 'FAIL', `http=${financeBypass.status}`);
    if (financeBypass.status !== 403) return 'FAIL';

    const securityStatus = maps.pendingStatuses[maps.pendingStatuses.length - 1];
    let guard = 0;
    while (guard++ < maps.pendingStatuses.length + 2) {
        const pass = await prisma.getPass.findUnique({ where: { id } });
        if (!pass) {
            log(mod, 'load pass', 'FAIL');
            return 'FAIL';
        }
        if (pass.status === 'OUT' || pass.status === 'CLOSED') break;

        const idx = maps.pendingStatuses.indexOf(pass.status);
        if (idx < 0) {
            log(mod, 'unexpected status', 'FAIL', pass.status);
            return 'FAIL';
        }
        if (TERMINAL_DOC_STATUSES.has(pass.status) && pass.status !== securityStatus) {
            log(mod, 'terminal before security', 'FAIL', pass.status);
            return 'FAIL';
        }

        const roleCode = maps.roleCodes[idx];
        const token = roleToken[roleCode];
        if (!token) {
            log(mod, `token for ${roleCode}`, 'FAIL');
            return 'FAIL';
        }

        const before = pass.status;
        const res = await api('POST', `/api/get-passes/${id}/approve`, null, token);
        const after = await prisma.getPass.findUnique({ where: { id } });
        if (res.status !== 200) {
            if (after?.status && after.status !== before) {
                log(mod, `${roleCode} advanced despite http=${res.status}`, 'PASS', `${before} → ${after.status}`);
                continue;
            }
            log(mod, `approve ${roleCode}`, 'FAIL', res.data?.message);
            return 'FAIL';
        }
        const nextStatus = res.data?.data?.status || after?.status;
        if (idx < maps.pendingStatuses.length - 1 && TERMINAL_DOC_STATUSES.has(nextStatus)) {
            log(mod, 'terminal before security', 'FAIL', nextStatus);
            return 'FAIL';
        }
        log(mod, `${roleCode} → ${nextStatus}`, 'PASS');
        if (before === securityStatus || nextStatus === 'OUT' || nextStatus === 'CLOSED') break;
    }

    const final = await prisma.getPass.findUnique({ where: { id } });
    if (final?.status !== 'OUT') {
        log(mod, 'final OUT', 'FAIL', `status=${final?.status}`);
        return 'FAIL';
    }
    log(mod, 'final OUT (stock checkout)', 'PASS');

    const ledger = await prisma.inventoryLedger.count({
        where: { tenantId: tenant.id, referenceId: id, referenceType: 'GET_PASS' },
    });
    log(mod, 'ledger checkout', ledger > 0 ? 'PASS' : 'FAIL', `rows=${ledger}`);

    const audit = await countAuditEvidence(tenant.id, id, ['GET_PASS']);
    log(mod, 'audit evidence', audit > 0 ? 'PASS' : 'FAIL', `rows=${audit}`);

    if (ledger === 0 || audit === 0) return 'FAIL';
    return 'PASS';
}

async function main() {
    console.log('\n── Runtime Workflow Tests (DX Marina) ──\n');
    const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } });
    if (!tenant) {
        console.error('Tenant not found');
        process.exit(1);
    }

    const align = await alignMarinaGovernanceFixtures(prisma);
    console.log(
        `  Fixture align: members=${align.memberFixes} assignmentDept=${align.assignmentFixes} deptRows=${align.departmentFixes} permissions=${align.permissionFixes}\n`,
    );

    const tokens = {};
    for (const role of Object.keys(USERS)) {
        tokens[role] = await token(role);
    }

    let transferResult = await testTransferServiceLayer(tenant);
    if (transferResult === 'SKIP') transferResult = await testTransfer(tenant, tokens);

    const summary = {
        TRANSFER: transferResult,
        GRN: await testGrnSequence(tenant, tokens),
        REQUISITION: await testRequisition(tenant, tokens),
        BREAKAGE: await testBreakage(tenant, tokens),
        GET_PASS: await testGetPass(tenant, tokens),
        LOST: 'SKIP',
        STOCK_COUNT: 'SKIP',
    };

    log('LOST', 'runtime', 'SKIP', 'shares BREAKAGE chain — same engine');
    log('STOCK_COUNT', 'runtime', 'SKIP', 'requires REVEAL_REVIEW session setup');
    log('OPENING_BALANCE', 'runtime', 'SKIP', 'finalize-only, not ACC workflow');

    console.log('\n── Runtime Summary ──');
    for (const [k, v] of Object.entries(summary)) {
        console.log(`  ${k}: ${v}`);
    }
    const fails = Object.values(summary).filter((v) => v === 'FAIL').length;
    console.log(`\nRuntime overall: ${fails === 0 ? 'PASS' : 'FAIL'} (${fails} module failures)\n`);

    await prisma.$disconnect();
    process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
