'use strict';

/**
 * Live UAT — Constitution GRN flows (post DB migration deploy).
 * Run: node scripts/uat-constitution-grn-live.js
 * Requires: backend on http://127.0.0.1:4000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE = '127.0.0.1';
const PORT = 4000;
const EMAIL = process.env.UAT_EMAIL || 'jonathan.miller@dxuat.com';
const PASSWORD = process.env.UAT_PASSWORD || 'Admin@123';
const TENANT = process.env.UAT_TENANT || 'dx-airport-hotel';

let token = '';
let currentRole = '';
const results = [];

async function switchAsRole(roleCode) {
    if (currentRole === roleCode && token) {
        return { email: ROLE_EMAIL[roleCode], role: roleCode, cached: true };
    }
    const authService = require('../src/services/auth.service');
    const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT } });
    const membership = await prisma.tenantMember.findFirst({
        where: {
            tenantId: tenant.id,
            isActive: true,
            role: { code: roleCode },
            user: { isActive: true },
        },
        include: { user: { select: { id: true, email: true } }, role: { select: { code: true } } },
    });
    if (!membership?.user) throw new Error(`No active ${roleCode} on tenant ${TENANT}`);
    // UAT re-auth: refresh JWT is deterministic per user+tenant; clear prior row to avoid P2002.
    await prisma.refreshToken.deleteMany({ where: { userId: membership.user.id } });
    const result = await authService.switchTenant({
        userId: membership.user.id,
        tenantSlug: TENANT,
        ipAddress: '127.0.0.1',
        userAgent: `uat-constitution-grn-live-${roleCode}-${Date.now()}-${Math.random()}`,
    });
    token = result.accessToken;
    currentRole = roleCode;
    return { email: membership.user.email, role: membership.role.code };
}

const ROLE_EMAIL = {
    STOREKEEPER: 'kevin.brooks@dxuat.com',
    COST_CONTROL: 'olivia.parker@dxuat.com',
    FINANCE_MANAGER: 'jonathan.miller@dxuat.com',
};

function record(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(ok ? `✓ ${name}` : `✗ ${name}`, detail || '');
}

function request(method, urlPath, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: BASE,
            port: PORT,
            path: urlPath,
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
        };
        const req = http.request(opts, (res) => {
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
                resolve({ status: res.statusCode, data, raw });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function auth() {
    return { Authorization: `Bearer ${token}` };
}

async function login() {
    const who = await switchAsRole('STOREKEEPER');
    record('Login (switchTenant)', true, `${who.email} [${who.role}]`);
}

async function checkHealth() {
    const res = await request('GET', '/health');
    record('Health', res.status === 200, `status=${res.status}`);
}

async function checkDisplayCurrency() {
    const res = await request('GET', '/api/constitution/display-currency', null, auth());
    const code = res.data?.data?.displayCurrency;
    record('Display currency API', res.status === 200 && !!code, code || res.data?.message);
}

async function checkLocalization() {
    const arPath = path.join(__dirname, '../../OSE-Frontend/public/i18n/ar.json');
    const enPath = path.join(__dirname, '../../OSE-Frontend/public/i18n/en.json');
    const ar = JSON.parse(fs.readFileSync(arPath, 'utf8'));
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const keys = ['SEND_BACK', 'SUPPLIER_INVOICE_NO', 'REJECTED_TERMINAL_HINT', 'RETURNED'];
    let ok = true;
    for (const k of keys) {
        if (k === 'RETURNED') {
            if (!en.GRN?.STATUS?.RETURNED || !ar.GRN?.STATUS?.RETURNED) ok = false;
            continue;
        }
        if (!ar.GRN?.DETAIL?.[k] && !ar.GRN?.CREATE?.[k]) ok = false;
        if (!en.GRN?.DETAIL?.[k] && !en.GRN?.CREATE?.[k]) ok = false;
    }
    record('Localization EN/AR parity', ok, keys.join(', '));
    record('Arabic JSON valid', !!ar.COMMON?.CONCURRENCY_CONFLICT);
}

async function getMasterData() {
    const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT } });
    if (!tenant) throw new Error(`Tenant ${TENANT} not found`);
    const supplier = await prisma.supplier.findFirst({ where: { tenantId: tenant.id, isActive: true } });
    const location = await prisma.location.findFirst({ where: { tenantId: tenant.id, isActive: true } });
    const item = await prisma.item.findFirst({
        where: { tenantId: tenant.id, isActive: true },
        include: { itemUnits: { include: { unit: true } } },
    });
    const baseUnit = item?.itemUnits?.find((u) => u.unitType === 'BASE') || item?.itemUnits?.[0];
    const uomId = baseUnit?.unitId;
    if (!supplier?.id || !location?.id || !item?.id || !uomId) {
        throw new Error('Master data missing for GRN UAT');
    }
    return { supplier, location, item, uomId };
}

function multipartCreateGrn(fields, pdfBuffer) {
    const boundary = `----uat${Date.now()}`;
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
        parts.push(
            `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
        );
    }
    parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="invoice"; filename="uat-invoice.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    );
    const tail = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([
        Buffer.from(parts.join('')),
        pdfBuffer,
        Buffer.from(tail),
    ]);
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: BASE,
                port: PORT,
                path: '/api/grn',
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': body.length,
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
                    resolve({ status: res.statusCode, data, raw: Buffer.concat(chunks).toString() });
                });
            },
        );
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function testGrnCreateWithSystemNumber() {
    const { supplier, location, item, uomId } = await getMasterData();
    const invoiceNo = `UAT-INV-${Date.now()}`;
    const lines = JSON.stringify([
        {
            itemId: item.id,
            uomId,
            orderedQty: 1,
            receivedQty: 1,
            unitPrice: 10,
        },
    ]);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const res = await multipartCreateGrn(
        {
            supplierId: supplier.id,
            locationId: location.id,
            supplierInvoiceNumber: invoiceNo,
            receivingDate: new Date().toISOString().slice(0, 10),
            lines,
        },
        pdf,
    );
    const grn = res.data?.data;
    const systemNo = grn?.grnNumber;
    const ok = (res.status === 201 || res.status === 200) && systemNo && systemNo !== invoiceNo;
    record(
        'GRN create (system number + supplier invoice)',
        ok,
        ok ? `system=${systemNo} invoice=${invoiceNo}` : `status=${res.status} msg=${res.data?.message || res.raw?.slice?.(0, 120)}`,
    );
    return grn;
}

async function testSendBack(grnId) {
    await switchAsRole('COST_CONTROL');
    const before = (await request('GET', `/api/grn/${grnId}`, null, auth())).data?.data;
    const version = before?.concurrencyVersion;
    const res = await request(
        'POST',
        `/api/grn/${grnId}/send-back`,
        { reason: 'UAT: please correct line quantities', concurrencyVersion: version },
        auth(),
    );
    const data = res.data?.data;
    const status = data?.status;
    const returned = data?.userFacingState === 'Returned';
    record('Send Back → DRAFT', res.status === 200 && status === 'DRAFT', status || res.data?.message);
    record('Send Back userFacingState Returned', returned, data?.userFacingState || 'missing');

    const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT } });
    const audit = await prisma.auditLog.findFirst({
        where: { tenantId: tenant.id, entityType: 'GRN', entityId: grnId, action: 'SEND_BACK' },
        orderBy: { changedAt: 'desc' },
    });
    record('Send Back audit row (SEND_BACK)', !!audit, audit ? audit.action : 'not found');

    const stale = await request(
        'PATCH',
        `/api/grn/${grnId}`,
        { notes: 'stale', concurrencyVersion: version },
        auth(),
    );
    record('Stale concurrency PATCH → 409', stale.status === 409, String(stale.data?.message || stale.status));

    return data;
}

async function testRejectTerminal() {
    await switchAsRole('STOREKEEPER');
    const { supplier, location, item, uomId } = await getMasterData();
    const invoiceNo = `UAT-REJ-${Date.now()}`;
    const lines = JSON.stringify([
        { itemId: item.id, uomId, orderedQty: 1, receivedQty: 1, unitPrice: 5 },
    ]);
    const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
    const createRes = await multipartCreateGrn(
        {
            supplierId: supplier.id,
            locationId: location.id,
            supplierInvoiceNumber: invoiceNo,
            receivingDate: new Date().toISOString().slice(0, 10),
            lines,
        },
        pdf,
    );
    const grnId = createRes.data?.data?.id;
    if (!grnId) {
        record('Reject terminal setup (create)', false, createRes.data?.message);
        return;
    }
    await switchAsRole('COST_CONTROL');
    const rejectRes = await request(
        'POST',
        `/api/grn/${grnId}/reject`,
        { reason: 'UAT terminal rejection' },
        auth(),
    );
    const getRejected = await request('GET', `/api/grn/${grnId}`, null, auth());
    const status = getRejected.data?.data?.status;
    record(
        'Reject → terminal REJECTED',
        status === 'REJECTED',
        status || rejectRes.data?.message || `http=${rejectRes.status}`,
    );
    if (status !== 'REJECTED') return;

    const patchRes = await request('PATCH', `/api/grn/${grnId}`, { notes: 'should fail' }, auth());
    record(
        'Rejected GRN read-only (PATCH blocked)',
        patchRes.status === 422,
        String(patchRes.data?.message || patchRes.status),
    );
}

async function testPostFlow(grnId) {
    let g = (await request('GET', `/api/grn/${grnId}`, null, auth())).data?.data;
    if (g?.status === 'DRAFT') {
        await request('POST', `/api/grn/${grnId}/validate`, {}, auth());
        g = (await request('GET', `/api/grn/${grnId}`, null, auth())).data?.data;
    }
    if (g?.status === 'VALIDATED') {
        await switchAsRole('COST_CONTROL');
        const pf = await request(
            'PATCH',
            `/api/grn/${grnId}/status`,
            { status: 'PENDING_FINANCE' },
            auth(),
        );
        if (pf.status !== 200) {
            record('Post flow (→ PENDING_FINANCE)', false, pf.data?.message || pf.status);
            return;
        }
        g = (await request('GET', `/api/grn/${grnId}`, null, auth())).data?.data;
    }
    if (g?.status === 'PENDING_FINANCE') {
        const who = await switchAsRole('FINANCE_MANAGER');
        const finToken = token;
        if (!finToken) {
            record('Post flow (finance login)', false);
            return;
        }
        const postRes = await request(
            'PATCH',
            `/api/grn/${grnId}/status`,
            { status: 'POSTED' },
            { Authorization: `Bearer ${finToken}` },
        );
        const posted = (await request('GET', `/api/grn/${grnId}`, null, { Authorization: `Bearer ${finToken}` }))
            .data?.data;
        record(
            'Finance post → POSTED',
            posted?.status === 'POSTED' && !!posted?.postingDate,
            `${who.email}: ${posted?.status}`,
        );
    } else {
        record('Post flow', false, `unexpected status ${g?.status}`);
    }
}

async function main() {
    console.log('=== Constitution GRN Live UAT ===\n');
    await checkHealth();
    await login();
    await checkDisplayCurrency();
    await checkLocalization();

    let grn;
    try {
        grn = await testGrnCreateWithSystemNumber();
    } catch (e) {
        record('GRN create', false, e.message);
    }

    if (grn?.id && grn.status === 'VALIDATED') {
        await testSendBack(grn.id);
    } else if (grn?.id) {
        record('Send Back', false, `GRN status=${grn.status}`);
    }

    await testRejectTerminal();

    try {
        await switchAsRole('STOREKEEPER');
        const grn2 = await testGrnCreateWithSystemNumber();
        if (grn2?.id) await testPostFlow(grn2.id);
    } catch (e) {
        record('Post flow setup', false, e.message);
    }

    const failed = results.filter((r) => !r.ok);
    console.log(`\n=== UAT Summary: ${results.length - failed.length}/${results.length} passed ===`);
    if (failed.length) {
        console.error('Failed:', failed);
        process.exit(1);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
