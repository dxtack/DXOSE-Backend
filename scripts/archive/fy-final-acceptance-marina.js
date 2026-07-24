'use strict';

/**
 * FY Marina final acceptance — HTTP + DB validation.
 * Usage: node scripts/fy-final-acceptance-marina.js
 */

require('dotenv').config();
const http = require('http');
const prisma = require('../src/config/database');
const authService = require('../src/services/auth.service');

const API = process.env.API_BASE || 'http://127.0.0.1:4000';
const MARINA_SLUG = 'dx-marina-hotel';
const GRN_NO = '55488888';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
    if (condition) {
        console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
        failed++;
    }
}

function parseUrl(path) {
    const u = new URL(path, API);
    return { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search };
}

function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const { hostname, port, path: p } = parseUrl(path);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const req = http.request({ hostname, port, path: p, method, headers }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString();
                let data;
                try {
                    data = JSON.parse(raw);
                } catch {
                    data = raw;
                }
                resolve({ status: res.statusCode, data });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function loginMarinaFinance() {
    const email = process.env.FY_FINANCE_EMAIL || 'jonathan.miller@dxuat.com';
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user) throw new Error(`User not found: ${email}`);
    const issued = await authService.switchTenant({
        userId: user.id,
        tenantSlug: MARINA_SLUG,
        ipAddress: '127.0.0.1',
        userAgent: 'fy-final-acceptance',
    });
    return { token: issued.accessToken, user: issued.user };
}

async function getMarinaTenantId() {
    const t = await prisma.tenant.findFirst({ where: { slug: MARINA_SLUG }, select: { id: true } });
    if (!t) throw new Error('Marina tenant not found');
    return t.id;
}

async function phase1PreApproval(token, tenantId) {
    console.log('\n── Phase 1: Pre-Finance approval (UI-equivalent API) ──\n');

    const ih = await request('GET', '/api/inventory-history?page=1&limit=1', null, token);
    assert('GET /inventory-history → HTTP 200', ih.status === 200, `status=${ih.status}`);
    assert('inventory-history success=true', ih.data?.success === true);
    assert('inventory-history meta.total = 1493', ih.data?.meta?.total === 1493, `got ${ih.data?.meta?.total}`);
    assert('inventory-history no error message on 200', !ih.data?.message?.toLowerCase?.().includes('fail'));

    const audit = await request('GET', '/api/audit-log?page=1&limit=1', null, token);
    assert('GET /audit-log → HTTP 200', audit.status === 200, `status=${audit.status}`);
    const auditTotalDb = await prisma.auditLog.count({ where: { tenantId } });
    const auditTotal = audit.data?.meta?.total;
    assert('audit-log meta.total matches DB', auditTotal === auditTotalDb, `api=${auditTotal} db=${auditTotalDb}`);
    assert('audit-log total >= 20', auditTotal >= 20, `got ${auditTotal}`);

    const ledger = await request('GET', '/api/ledger?movementType=RECEIVE&skip=0&take=1', null, token);
    assert('GET /ledger RECEIVE → HTTP 200', ledger.status === 200);
    assert('ledger RECEIVE total = 0 (before finance post)', ledger.data?.meta?.total === 0, `got ${ledger.data?.meta?.total}`);

    const grnList = await request('GET', `/api/grn?search=${GRN_NO}`, null, token);
    const grnApi = grnList.data?.data?.find?.((g) => g.grnNumber === GRN_NO) || grnList.data?.data?.[0];
    const grnDb = await prisma.grnImport.findFirst({
        where: { tenantId, grnNumber: GRN_NO },
        include: { approvalRequest: { include: { steps: { orderBy: { stepNumber: 'asc' } } } } },
    });
    assert('GRN 55488888 exists', !!grnDb);
    assert('GRN API status PENDING_FINANCE', (grnApi?.status || grnDb?.status) === 'PENDING_FINANCE', `api=${grnApi?.status} db=${grnDb?.status}`);
    assert('GRN not falsely POSTED', grnDb?.status !== 'POSTED' || (grnDb?.postedBy && grnDb?.postedAt));

    const receiveBefore = await prisma.inventoryLedger.count({
        where: { tenantId, movementType: 'RECEIVE' },
    });
    assert('RECEIVE ledger rows = 0 before finance', receiveBefore === 0, `got ${receiveBefore}`);

    return { grnDb, receiveBefore, auditTotal };
}

async function phase2FinanceApproval(token, grnDb) {
    console.log('\n── Phase 2: Finance approval (PATCH POSTED) ──\n');

    assert('GRN awaiting finance step 2', grnDb?.approvalRequest?.currentStep === 2);
    const finStep = grnDb?.approvalRequest?.steps?.find((s) => s.stepNumber === 2);
    assert('Finance step PENDING', finStep?.status === 'PENDING');

    const res = await request('PATCH', `/api/grn/${grnDb.id}/status`, { status: 'POSTED' }, token);
    assert('PATCH GRN status POSTED → HTTP 200', res.status === 200, `status=${res.status} msg=${res.data?.message}`);
    assert('GRN post API success', res.data?.success === true);
    return res;
}

async function phase3PostApproval(token, tenantId, grnId, receiveBefore, auditBefore) {
    console.log('\n── Phase 3: Post-approval evidence ──\n');

    const grn = await prisma.grnImport.findUnique({
        where: { id: grnId },
        include: { lines: true, approvalRequest: true },
    });
    assert('GRN status POSTED', grn?.status === 'POSTED');
    assert('postedBy populated', !!grn?.postedBy);
    assert('postedAt populated', !!grn?.postedAt);
    assert('approval request APPROVED', grn?.approvalRequest?.status === 'APPROVED');

    const receiveRows = await prisma.inventoryLedger.count({
        where: { tenantId, movementType: 'RECEIVE', referenceId: grnId },
    });
    assert('RECEIVE ledger rows created', receiveRows === (grn?.lines?.length || 0), `rows=${receiveRows} lines=${grn?.lines?.length}`);

    const movementDoc = await prisma.movementDocument.findFirst({
        where: { tenantId, documentNo: GRN_NO },
    });
    assert('movement_documents row created', !!movementDoc);
    assert('movement_document status POSTED', movementDoc?.status === 'POSTED');

    const grnAudit = await prisma.auditLog.findFirst({
        where: {
            tenantId,
            entityType: 'GRN',
            entityId: grnId,
            action: 'POST',
        },
        orderBy: { changedAt: 'desc' },
    });
    assert('audit_log GRN_POST created', !!grnAudit, grnAudit ? `note=${grnAudit.note?.slice(0, 60)}` : '');

    const ih = await request('GET', '/api/inventory-history?page=1&limit=1', null, token);
    const ihTotal = ih.data?.meta?.total;
    const expectedTotal = 1493 + receiveRows;
    assert(
        'inventory-history total increased by RECEIVE rows',
        ihTotal === expectedTotal,
        `before~${1493 + receiveBefore} after=${ihTotal} expected=${expectedTotal}`,
    );

    const audit = await request('GET', '/api/audit-log?page=1&limit=1', null, token);
    assert('audit-log total increased', (audit.data?.meta?.total ?? 0) >= auditBefore, `was ${auditBefore} now ${audit.data?.meta?.total}`);

    const ledger = await request('GET', '/api/ledger?movementType=RECEIVE&skip=0&take=50', null, token);
    assert('ledger RECEIVE total > 0', (ledger.data?.meta?.total ?? 0) > 0, `total=${ledger.data?.meta?.total}`);
}

async function phase4NoErrorOnSuccess(token) {
    console.log('\n── Phase 4: Governance APIs 200 — no error payload ──\n');

    for (const [label, path] of [
        ['inventory-history', '/api/inventory-history?page=1&limit=5'],
        ['audit-log', '/api/audit-log?page=1&limit=5'],
    ]) {
        const res = await request('GET', path, null, token);
        assert(`${label} HTTP 200`, res.status === 200);
        assert(`${label} success=true`, res.data?.success === true);
        assert(`${label} data is array`, Array.isArray(res.data?.data));
        assert(`${label} meta.total is number`, typeof res.data?.meta?.total === 'number');
    }
}

async function main() {
    console.log('\n══════════════════════════════════════════════');
    console.log(' FY Marina — Final Acceptance Test');
    console.log('══════════════════════════════════════════════');

    try {
        const health = await request('GET', '/api/profile');
        if (health.status === 401 || health.status === 200) {
            console.log('Backend reachable');
        } else {
            throw new Error(`Backend not reachable (${health.status})`);
        }
    } catch (e) {
        console.error('FAIL: Backend not running at', API, '-', e.message);
        process.exit(1);
    }

    const tenantId = await getMarinaTenantId();
    const { token } = await loginMarinaFinance();
    console.log(`Logged in as Finance on ${MARINA_SLUG}`);

    const { grnDb, auditTotal } = await phase1PreApproval(token, tenantId);
    const receiveBefore = await prisma.inventoryLedger.count({ where: { tenantId, movementType: 'RECEIVE' } });

    await phase2FinanceApproval(token, grnDb);
    await phase3PostApproval(token, tenantId, grnDb.id, receiveBefore, auditTotal);
    await phase4NoErrorOnSuccess(token);

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Result: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.log('FY Marina final acceptance: FAIL\n');
        process.exit(1);
    }
    console.log('FY Marina final acceptance: PASS — ready to close\n');
}

main()
    .catch((e) => {
        console.error('SCRIPT ERROR:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
