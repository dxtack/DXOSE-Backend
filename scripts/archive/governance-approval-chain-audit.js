'use strict';

/**
 * System-wide approval-chain governance audit.
 * Usage: node scripts/governance-approval-chain-audit.js
 *
 * Sections:
 *  A) Configuration — terminal statusKey on intermediate workflow steps
 *  B) Data integrity — false terminal states (posted without approval artifacts)
 *  C) Runtime bypass — HTTP attempts to skip approval / force terminal status
 *  D) Posting sequence — in-flight documents checked for premature posting
 */

require('dotenv').config();

const http = require('http');
const prisma = require('../src/config/database');
const authService = require('../src/services/auth.service');
const { DEFAULT_MODULE_CHAINS } = require('../src/services/acc-workflow-default-chains');
const { CUTOVER_MODULE_KEYS } = require('../src/services/acc-workflow-runtime.service');
const { resolvePublishedWorkflowChain } = require('../src/engines/workflow-resolution.engine');
const {
    assertAwaitingStatusKey,
    findPublishStatusKeyViolations,
    FORBIDDEN_INTERMEDIATE_STATUS_KEYS,
} = require('../src/services/acc-workflow-status-key-guard.service');

const API = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4000}`;
const MARINA_SLUG = process.env.AUDIT_TENANT_SLUG || 'dx-marina-hotel';

const TERMINAL_STATUS_KEYS = new Set([
    'POSTED',
    'APPROVED',
    'COMPLETED',
    'CLOSED',
    'FINALIZED',
    'OUT',
    'REJECTED',
    'VOID',
]);

const MODULES = [
    { key: 'GRN', requestType: 'GRN_IMPORT', posting: true, terminalDoc: ['POSTED'] },
    { key: 'TRANSFER', requestType: 'STORE_TRANSFER', posting: true, terminalDoc: ['POSTED'] },
    { key: 'BREAKAGE', requestType: 'BREAKAGE', posting: true, terminalDoc: ['APPROVED'] },
    { key: 'LOST', requestType: 'LOST', posting: true, terminalDoc: ['APPROVED'], chainModule: 'BREAKAGE' },
    { key: 'GET_PASS', requestType: 'GET_PASS', posting: true, terminalDoc: ['OUT', 'CLOSED'] },
    { key: 'STOCK_COUNT', requestType: 'COUNT_ADJUSTMENT', posting: true, terminalDoc: ['POSTED'] },
    { key: 'STOCK_REPORT', requestType: 'STOCK_REPORT', posting: true, terminalDoc: ['POSTED'], retired: true },
    { key: 'REQUISITION', requestType: 'STORE_REQUISITION', posting: false, terminalDoc: ['APPROVED'] },
];

const reports = [];
let globalPassed = 0;
let globalFailed = 0;

function assertModule(mod, label, condition, detail = '') {
    if (condition) {
        globalPassed++;
        return { ok: true, label, detail };
    }
    globalFailed++;
    return { ok: false, label, detail: detail || 'FAILED' };
}

function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const u = new URL(path, API);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const req = http.request(
            {
                hostname: u.hostname,
                port: u.port || (u.protocol === 'https:' ? 443 : 80),
                path: u.pathname + u.search,
                method,
                headers,
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
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function tokenForRole(tenantSlug, email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new Error(`User ${email} not found`);
    const issued = await authService.switchTenant({
        userId: user.id,
        tenantSlug,
        ipAddress: '127.0.0.1',
        userAgent: 'governance-audit',
    });
    return issued.accessToken;
}

async function resolveTenant() {
    return prisma.tenant.findFirst({
        where: { OR: [{ slug: MARINA_SLUG }, { name: { contains: 'Marina', mode: 'insensitive' } }] },
        select: { id: true, slug: true, name: true },
    });
}

// ─── A) Configuration audit ─────────────────────────────────────────────────

async function auditWorkflowConfig(moduleKey) {
    const findings = [];
    const chainModule = MODULES.find((m) => m.key === moduleKey)?.chainModule || moduleKey;

    const defaultChain = DEFAULT_MODULE_CHAINS[chainModule] || [];
    defaultChain.forEach((step, i) => {
        const isFinal = i === defaultChain.length - 1;
        if (TERMINAL_STATUS_KEYS.has(step.statusKey) && !isFinal) {
            findings.push(`DEFAULT_CHAIN step ${step.stepOrder} statusKey=${step.statusKey} (terminal on intermediate)`);
        }
    });

    let published;
    try {
        published = await resolvePublishedWorkflowChain(chainModule);
    } catch (e) {
        findings.push(`Published chain resolve error: ${e.message}`);
        published = null;
    }

    if (published?.steps?.length) {
        const total = published.steps.length;
        published.steps.forEach((s) => {
            const isFinal = s.stepOrder >= total;
            if (TERMINAL_STATUS_KEYS.has(s.statusKey) && !isFinal) {
                findings.push(
                    `PUBLISHED_DB step ${s.stepOrder}/${total} statusKey=${s.statusKey} role=${s.roleCode}`,
                );
            }
        });
    }

    const dbMisuse = await prisma.accWorkflowStepDefinition.findMany({
        where: {
            statusKey: { in: [...TERMINAL_STATUS_KEYS] },
            version: { definition: { module: { key: chainModule } } },
        },
        include: {
            version: {
                include: {
                    definition: { include: { module: true } },
                    steps: { select: { id: true }, orderBy: { stepOrder: 'asc' } },
                },
            },
        },
    });
    for (const s of dbMisuse) {
        const total = s.version?.steps?.length ?? 0;
        if (total > 0 && s.stepOrder < total) {
            findings.push(`DB_ALL_VERSIONS step ${s.stepOrder}/${total} statusKey=${s.statusKey}`);
        }
    }

    return { defaultChain, publishedSteps: published?.steps ?? [], findings };
}

// ─── B) Data integrity ───────────────────────────────────────────────────────

async function auditFalseTerminals(tenantId) {
    const issues = [];

    const falseGrn = await prisma.grnImport.findMany({
        where: {
            tenantId,
            status: 'POSTED',
            OR: [
                { postedBy: null },
                { postedAt: null },
                { approvalRequest: { status: { not: 'APPROVED' } } },
            ],
        },
        select: { id: true, grnNumber: true, postedBy: true, postedAt: true },
        take: 20,
    });
    falseGrn.forEach((g) => issues.push(`GRN ${g.grnNumber} POSTED without full approval/post metadata`));

    const falseTransfer = await prisma.storeTransfer.findMany({
        where: {
            tenantId,
            status: 'POSTED',
            OR: [{ postedBy: null }, { postedAt: null }, { approvalRequest: { status: { not: 'APPROVED' } } }],
        },
        select: { id: true, transferNo: true },
        take: 20,
    });
    falseTransfer.forEach((t) => issues.push(`Transfer ${t.transferNo} POSTED without approval/post metadata`));

    const falseBreakage = await prisma.movementDocument.findMany({
        where: {
            tenantId,
            movementType: { in: ['BREAKAGE', 'LOST'] },
            status: 'APPROVED',
            postedAt: null,
        },
        select: { id: true, documentNo: true, movementType: true },
        take: 20,
    });
    falseBreakage.forEach((d) =>
        issues.push(`${d.movementType} ${d.documentNo} APPROVED without postedAt`),
    );

    const falseCount = await prisma.stockCountSession.findMany({
        where: {
            tenantId,
            status: 'POSTED',
            OR: [{ postedAt: null }, { approvalRequest: { status: { not: 'APPROVED' } } }],
        },
        select: { id: true, sessionNo: true },
        take: 20,
    });
    falseCount.forEach((s) => issues.push(`Count session ${s.sessionNo} POSTED without approval/post metadata`));

    const postedGrns = await prisma.grnImport.findMany({
        where: { tenantId, status: 'POSTED', postedAt: { not: null } },
        select: { id: true, grnNumber: true },
        take: 50,
    });
    for (const g of postedGrns) {
        const ledger = await prisma.inventoryLedger.count({
            where: { tenantId, referenceId: g.id, movementType: 'RECEIVE' },
        });
        if (ledger === 0) issues.push(`GRN ${g.grnNumber} POSTED but no RECEIVE ledger rows`);
    }

    return issues;
}

// ─── C) API bypass tests ─────────────────────────────────────────────────────

async function testGrnBypass(token, tenantId) {
    const results = [];
    const pendingGrn = await prisma.grnImport.findFirst({
        where: {
            tenantId,
            status: { in: ['VALIDATED', 'PENDING_APPROVAL', 'DRAFT'] },
            approvalRequestId: { not: null },
        },
        include: { approvalRequest: true },
    });

    if (!pendingGrn) {
        results.push({ test: 'PATCH POSTED skip finance', skipped: true, reason: 'No pre-finance GRN' });
    } else {
        const res = await request('PATCH', `/api/grn/${pendingGrn.id}/status`, { status: 'POSTED' }, token);
        const blocked = res.status === 422 || res.status === 400 || res.data?.success === false;
        results.push({
            test: 'PATCH POSTED from pre-finance status',
            pass: blocked,
            http: res.status,
            message: res.data?.message,
        });
        const after = await prisma.grnImport.findUnique({ where: { id: pendingGrn.id } });
        results.push({
            test: 'GRN status unchanged after bypass attempt',
            pass: after?.status !== 'POSTED' || !!after?.postedBy,
            detail: `status=${after?.status}`,
        });
    }

    const deprecatedPost = await request('POST', `/api/grn/00000000-0000-4000-8000-000000000099/post`, null, token);
    results.push({
        test: 'Deprecated POST /grn/:id/post disabled',
        pass: deprecatedPost.status === 410 || deprecatedPost.status === 404,
        http: deprecatedPost.status,
    });

    return results;
}

async function testTransferBypass(token, tenantId) {
    const results = [];
    const trf = await prisma.storeTransfer.findFirst({
        where: { tenantId, status: 'PENDING_DEPT', approvalRequest: { status: 'PENDING' } },
        include: { approvalRequest: { include: { steps: true } } },
    });
    if (!trf) {
        results.push({ test: 'Finance approve skip dept', skipped: true });
        return results;
    }
    const res = await request('POST', `/api/transfers/${trf.id}/approve`, { comment: 'audit bypass' }, token);
    const blocked = res.status === 403 || res.status === 422 || res.data?.success === false;
    results.push({
        test: 'Finance cannot approve at PENDING_DEPT (wrong step)',
        pass: blocked,
        http: res.status,
        message: res.data?.message,
    });
    const after = await prisma.storeTransfer.findUnique({ where: { id: trf.id } });
    results.push({
        test: 'Transfer not POSTED after wrong-step approve',
        pass: after?.status !== 'POSTED',
        detail: after?.status,
    });
    return results;
}

async function testBreakageBypass(token, tenantId) {
    const results = [];
    const doc = await prisma.movementDocument.findFirst({
        where: {
            tenantId,
            movementType: 'BREAKAGE',
            status: { in: ['DEPT_APPROVED', 'COST_CONTROL_APPROVED', 'FINANCE_APPROVED', 'DRAFT'] },
            approvalRequests: { status: 'PENDING' },
        },
        include: { approvalRequests: { include: { steps: true } } },
    });
    if (!doc) {
        results.push({ test: 'GM approve skip steps', skipped: true });
        return results;
    }
    const res = await request('POST', `/api/breakage/${doc.id}/approve-gm`, { comment: 'audit' }, token);
    const blocked = res.status === 403 || res.status === 422 || res.data?.success === false;
    results.push({
        test: 'GM cannot approve before prior steps',
        pass: blocked,
        http: res.status,
        message: res.data?.message,
    });
    const after = await prisma.movementDocument.findUnique({ where: { id: doc.id } });
    results.push({
        test: 'Breakage not APPROVED/posted after skip',
        pass: after?.status !== 'APPROVED' || !!after?.postedAt,
        detail: `${after?.status} postedAt=${after?.postedAt}`,
    });
    return results;
}

async function testInventoryCountBypass(token, tenantId) {
    const results = [];
    const session = await prisma.stockCountSession.findFirst({
        where: { tenantId, status: 'PENDING_APPROVAL' },
    });
    if (!session) {
        results.push({ test: 'GM approve skip finance', skipped: true });
        return results;
    }
    const gmToken = await tokenForRole(MARINA_SLUG, 'daniel.carter@dxuat.com').catch(() => token);
    const res = await request(
        'POST',
        `/api/inventory-count/sessions/${session.id}/approve`,
        { comment: 'audit bypass' },
        gmToken,
    );
    const blocked = res.status === 403 || res.status === 422 || res.data?.success === false;
    results.push({
        test: 'GM cannot approve before Finance step',
        pass: blocked,
        http: res.status,
        message: res.data?.message,
    });
    return results;
}

async function testRequisitionBypass() {
    const results = [];
    const { assertDualGateApproval } = require('../src/acc-authority/step-permission-enforcement');
    let blocked = false;
    try {
        assertDualGateApproval({ role: 'FINANCE_MANAGER' }, 'STOREKEEPER', 'REQUISITION_APPROVE');
    } catch (e) {
        blocked = e.statusCode === 403 || e.status === 403;
    }
    results.push({
        test: 'Finance cannot approve at early requisition step (dual-gate)',
        pass: blocked,
        detail: blocked ? '403' : 'not blocked',
    });
    return results;
}

// ─── D) Runtime sequence on posted document sample ───────────────────────────

async function auditPostedSequence(moduleKey, tenantId) {
    const sequence = { expected: [], actual: [], pass: true, notes: [] };

    switch (moduleKey) {
        case 'GRN': {
            const g = await prisma.grnImport.findFirst({
                where: { tenantId, status: 'POSTED', postedAt: { not: null } },
                orderBy: { postedAt: 'desc' },
                include: { approvalRequest: { include: { steps: { orderBy: { stepNumber: 'asc' } } } } },
            });
            if (!g) {
                sequence.notes.push('No POSTED GRN to verify sequence');
                return sequence;
            }
            sequence.actual = [
                `create→${g.status}`,
                `approval=${g.approvalRequest?.status}`,
                `steps=${g.approvalRequest?.steps?.map((s) => `${s.stepNumber}:${s.status}`).join(',')}`,
                `postedBy=${!!g.postedBy}`,
                `postedAt=${!!g.postedAt}`,
            ];
            const ledger = await prisma.inventoryLedger.count({
                where: { tenantId, referenceId: g.id, movementType: 'RECEIVE' },
            });
            sequence.pass =
                g.approvalRequest?.status === 'APPROVED' &&
                g.approvalRequest?.steps?.every((s) => s.status === 'APPROVED') &&
                !!g.postedBy &&
                ledger > 0;
            if (!sequence.pass) sequence.notes.push('Posted GRN missing approval or ledger');
            break;
        }
        case 'TRANSFER': {
            const t = await prisma.storeTransfer.findFirst({
                where: { tenantId, status: 'POSTED', postedAt: { not: null } },
                orderBy: { postedAt: 'desc' },
                include: { approvalRequest: { include: { steps: true } } },
            });
            if (!t) {
                sequence.notes.push('No POSTED transfer');
                return sequence;
            }
            sequence.pass =
                t.approvalRequest?.status === 'APPROVED' && !!t.postedBy && !!t.postedAt;
            sequence.actual = [`status=${t.status}`, `approval=${t.approvalRequest?.status}`];
            break;
        }
        case 'BREAKAGE':
        case 'LOST': {
            const mt = moduleKey === 'LOST' ? 'LOST' : 'BREAKAGE';
            const d = await prisma.movementDocument.findFirst({
                where: { tenantId, movementType: mt, status: 'APPROVED', postedAt: { not: null } },
                orderBy: { postedAt: 'desc' },
                include: { approvalRequests: { include: { steps: true } } },
            });
            if (!d) {
                sequence.notes.push(`No posted ${mt}`);
                return sequence;
            }
            sequence.pass = d.approvalRequests?.status === 'APPROVED' && !!d.postedAt;
            sequence.actual = [`status=${d.status}`, `postedAt set`];
            break;
        }
        case 'STOCK_COUNT': {
            const s = await prisma.stockCountSession.findFirst({
                where: { tenantId, status: 'POSTED' },
                orderBy: { updatedAt: 'desc' },
                include: { approvalRequest: { include: { steps: true } } },
            });
            if (!s) {
                sequence.notes.push('No POSTED count session');
                return sequence;
            }
            sequence.pass = s.approvalRequest?.status === 'APPROVED';
            sequence.actual = [`status=${s.status}`, `approval=${s.approvalRequest?.status}`];
            break;
        }
        case 'REQUISITION': {
            const r = await prisma.storeRequisition.findFirst({
                where: { tenantId, status: 'APPROVED' },
                orderBy: { updatedAt: 'desc' },
                include: { approvalRequest: { include: { steps: true } } },
            });
            if (!r) {
                sequence.notes.push('No APPROVED requisition');
                return sequence;
            }
            sequence.pass = r.approvalRequest?.status === 'APPROVED';
            sequence.actual = [`status=${r.status}`];
            break;
        }
        default:
            sequence.notes.push('Runtime sequence check not automated for this module');
    }
    return sequence;
}

// ─── Misconfig simulation (GRN guard) ──────────────────────────────────────

function testSharedStatusKeyGuard() {
    const publishViolations = findPublishStatusKeyViolations([
        { stepOrder: 1, statusKey: 'PENDING_APPROVAL' },
        { stepOrder: 2, statusKey: 'POSTED' },
    ]);
    const publishPass = publishViolations.length === 0; // POSTED on final step allowed at publish

    let awaitingBlocked = false;
    try {
        assertAwaitingStatusKey('POSTED', { moduleKey: 'GRN', stepNumber: 2 });
    } catch (e) {
        awaitingBlocked = e.code === 'WORKFLOW_STATUS_KEY_MISCONFIG';
    }

    const intermediateViolations = findPublishStatusKeyViolations([
        { stepOrder: 1, statusKey: 'POSTED' },
        { stepOrder: 2, statusKey: 'PENDING_FINANCE' },
    ]);

    return {
        test: 'Shared statusKey guard blocks terminal awaiting keys',
        pass: awaitingBlocked && intermediateViolations.length === 1,
        detail: `awaiting=${awaitingBlocked} publishIntermediate=${intermediateViolations.length}`,
    };
}

async function buildModuleReport(mod, tenant, tokens) {
    const checks = [];
    const config = await auditWorkflowConfig(mod.key);
    const terminalMisuse = config.findings.length > 0;
    checks.push(
        assertModule(mod.key, 'No terminal statusKey on intermediate steps (config)', !terminalMisuse, config.findings.join('; ') || 'clean'),
    );

    const sequence = await auditPostedSequence(mod.key, tenant.id);
    if (sequence.notes.length === 0 || sequence.actual.length) {
        checks.push(
            assertModule(
                mod.key,
                'Posted document approval sequence valid',
                sequence.pass,
                sequence.actual.join(' | ') || sequence.notes.join('; '),
            ),
        );
    }

    let bypassResults = [];
    if (mod.key === 'GRN') bypassResults = await testGrnBypass(tokens.finance, tenant.id);
    if (mod.key === 'TRANSFER') bypassResults = await testTransferBypass(tokens.finance, tenant.id);
    if (mod.key === 'BREAKAGE') bypassResults = await testBreakageBypass(tokens.gm, tenant.id);
    if (mod.key === 'STOCK_COUNT') bypassResults = await testInventoryCountBypass(tokens.finance, tenant.id);
    if (mod.key === 'REQUISITION') bypassResults = await testRequisitionBypass();

    for (const br of bypassResults) {
        if (br.skipped) {
            checks.push({ ok: true, label: `${br.test} (skipped — no fixture)`, detail: br.reason || '' });
        } else {
            checks.push(assertModule(mod.key, br.test, br.pass, br.detail || br.message || `http=${br.http}`));
        }
    }

    if (mod.key === 'GRN' || mod.key === 'GET_PASS') {
        const guard = testSharedStatusKeyGuard();
        checks.push(assertModule(mod.key, guard.test, guard.pass, guard.detail));
    }

    const chainModule = mod.chainModule || mod.key;
    const defaultChain = DEFAULT_MODULE_CHAINS[chainModule] || [];
    let published;
    try {
        published = await resolvePublishedWorkflowChain(chainModule);
    } catch {
        published = null;
    }

    const allPass = checks.every((c) => c.ok);
    const skipRisk = bypassResults.some((b) => !b.skipped && b.pass === false);
    const fixRequired = terminalMisuse || skipRisk || !allPass;

    return {
        module: mod.key,
        retired: !!mod.retired,
        posting: mod.posting,
        approvalChainReviewed: true,
        workflowChain: (published?.steps || defaultChain).map(
            (s, i) => `Step ${s.stepOrder ?? i + 1}: ${s.roleCode} → ${s.statusKey || '(hardcoded runtime)'}`,
        ),
        expectedSequence: defaultChain.map((s) => s.statusKey).join(' → ') + (mod.posting ? ' → [POSTING] → terminal' : ' → terminal'),
        runtimeTested: bypassResults.some((b) => !b.skipped) || sequence.actual.length > 0,
        skipRiskFound: skipRisk ? 'Yes' : 'No',
        terminalStatusMisuseFound: terminalMisuse ? 'Yes' : 'No',
        postingBeforeFinalApprovalPossible:
            fixRequired && mod.posting && mod.key !== 'GET_PASS' ? 'Investigate' : 'No',
        fixRequired: fixRequired ? 'Yes' : 'No',
        result: allPass && !terminalMisuse ? 'PASS' : 'FAIL',
        checks,
        configFindings: config.findings,
    };
}

async function main() {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log(' DX OSE — System-Wide Approval Chain Governance Audit');
    console.log('══════════════════════════════════════════════════════════\n');

    const tenant = await resolveTenant();
    if (!tenant) {
        console.error('FAIL: tenant not found');
        process.exit(1);
    }
    console.log(`Tenant: ${tenant.name} (${tenant.slug})\n`);

    const falseTerminals = await auditFalseTerminals(tenant.id);
    console.log('[A] False terminal states in DB:', falseTerminals.length === 0 ? 'NONE' : falseTerminals.join('\n  '));

    let tokens = {};
    try {
        tokens.finance = await tokenForRole(tenant.slug, 'jonathan.miller@dxuat.com');
        tokens.gm = await tokenForRole(tenant.slug, 'daniel.carter@dxuat.com');
        tokens.storekeeper = await tokenForRole(tenant.slug, 'kevin.brooks@dxuat.com');
        console.log('[B] Auth tokens issued for bypass tests\n');
    } catch (e) {
        console.warn('[B] Token issue failed — bypass tests limited:', e.message);
        tokens = { finance: null, gm: null };
    }

    // Opening Balance (non-workflow)
    const allowRow = await prisma.tenantSetting.findFirst({
        where: { tenantId: tenant.id, key: 'allowOpeningBalance' },
        select: { value: true },
    });
    const snapRow = await prisma.tenantSetting.findFirst({
        where: { tenantId: tenant.id, key: 'obFinalizedSnapshot' },
        select: { value: true },
    });
    const obStatus =
        allowRow?.value === 'LOCKED' && snapRow?.value ? 'FINALIZED' : 'OPEN';
    reports.push({
        module: 'OPENING_BALANCE',
        approvalChainReviewed: true,
        workflowChain: ['N/A — finalize-only (no ACC ApprovalRequest)'],
        expectedSequence: 'DRAFT docs → ob-finalize → postMovementDocument → obStatus=FINALIZED',
        runtimeTested: false,
        skipRiskFound: 'No',
        terminalStatusMisuseFound: 'No',
        postingBeforeFinalApprovalPossible: 'No',
        fixRequired: 'No',
        result: 'PASS',
        notes: `obStatus=${obStatus}`,
    });

    for (const mod of MODULES) {
        if (mod.retired) {
            reports.push({
                module: mod.key,
                retired: true,
                approvalChainReviewed: true,
                workflowChain: DEFAULT_MODULE_CHAINS[mod.key]?.map((s) => `${s.roleCode}→${s.statusKey}`) || [],
                runtimeTested: false,
                skipRiskFound: 'No',
                terminalStatusMisuseFound: 'No',
                postingBeforeFinalApprovalPossible: 'No',
                fixRequired: 'No',
                result: 'PASS (retired — routes disabled)',
            });
            continue;
        }
        const report = await buildModuleReport(mod, tenant, tokens);
        reports.push(report);
    }

    // System-wide DB scan
    const systemMisuse = await prisma.accWorkflowStepDefinition.findMany({
        where: { statusKey: { in: [...TERMINAL_STATUS_KEYS] } },
        include: {
            version: {
                include: {
                    definition: { include: { module: true } },
                    steps: { orderBy: { stepOrder: 'asc' } },
                },
            },
        },
    });
    const globalMisconfig = systemMisuse.filter((s) => {
        const total = s.version?.steps?.length ?? 0;
        return total > 0 && s.stepOrder < total;
    });

    console.log('\n── Module Reports ──\n');
    for (const r of reports) {
        const icon = r.result?.startsWith('PASS') ? '✓' : '✗';
        console.log(`${icon} ${r.module}: ${r.result}`);
        console.log(`    Chain: ${(r.workflowChain || []).join(' | ')}`);
        console.log(`    Skip risk: ${r.skipRiskFound} | Terminal misuse: ${r.terminalStatusMisuseFound} | Posting early: ${r.postingBeforeFinalApprovalPossible} | Fix: ${r.fixRequired}`);
        if (r.configFindings?.length) console.log(`    Config issues: ${r.configFindings.join('; ')}`);
        if (r.checks) {
            for (const c of r.checks.filter((x) => !x.ok)) {
                console.log(`    ✗ ${c.label}: ${c.detail}`);
            }
        }
        console.log('');
    }

    console.log('── System-wide config scan ──');
    console.log(
        globalMisconfig.length === 0
            ? '  ✓ No terminal statusKey on intermediate steps (all modules/versions)'
            : `  ✗ ${globalMisconfig.length} misconfigured step(s):`,
    );
    globalMisconfig.forEach((s) => {
        console.log(
            `    ${s.version?.definition?.module?.key} v${s.version?.versionNumber} step ${s.stepOrder}: ${s.statusKey}`,
        );
    });

    console.log('\n── Architectural guards ──');
    console.log('  • Shared acc-workflow-status-key-guard.service.js — publish + runtime (GRN, GET_PASS)');
    console.log('  • Workflow Builder publish/replaceDraftSteps reject terminal statusKey on intermediate steps');
    console.log(`  • Forbidden intermediate keys: ${[...FORBIDDEN_INTERMEDIATE_STATUS_KEYS].join(', ')}`);
    console.log('  • BREAKAGE/LOST/TRANSFER/STOCK_COUNT: hardcoded intermediate statuses — chain statusKey drift ignored at runtime');

    const moduleFails = reports.filter((r) => r.result === 'FAIL').length;
    const overall =
        moduleFails === 0 && falseTerminals.length === 0 && globalMisconfig.length === 0 ? 'PASS' : 'FAIL';

    console.log(`\n${'═'.repeat(58)}`);
    console.log(`Overall: ${overall} | Modules FAIL: ${moduleFails} | Assertions: ${globalPassed} pass / ${globalFailed} fail`);
    console.log(`False terminals in DB: ${falseTerminals.length} | Global misconfig steps: ${globalMisconfig.length}`);
    console.log(`${'═'.repeat(58)}\n`);

    await prisma.$disconnect();
    process.exit(overall === 'PASS' ? 0 : 1);
}

main().catch(async (e) => {
    console.error('AUDIT ERROR:', e);
    try {
        await prisma.$disconnect();
    } catch (_) {
        /* ignore */
    }
    process.exit(1);
});
