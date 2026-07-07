'use strict';

/**
 * Tenant Isolation — API Runtime Matrix (test DB only)
 *
 * Usage:
 *   node Governance/scripts/tenant-isolation-api-runtime.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { PrismaClient } = require('@prisma/client');

delete process.env.DATABASE_URL;
require('../../test/harness/preload');

const { createIntegrationApiApp } = require('../../test/harness/integration-api-app');
const {
    createTenantIsolationFixture,
    cleanupTenantIsolationFixture,
    createRunContext,
    INTEGRATION_PASSWORD,
} = require('../../test/harness/tenant-isolation-fixture');
const { issueGrnAccessToken } = require('../../test/harness/disposable-grn-fixture');

const EVIDENCE_DIR = path.join(__dirname, '../tenant-isolation');
const RANDOM_ID = '00000000-0000-4000-8000-000000009999';

function assertLocalDb() {
    const url = process.env.DATABASE_URL || '';
    if (!/127\.0\.0\.1|localhost/.test(url)) {
        throw new Error('API runtime requires local test database.');
    }
}

function httpJson({ method, url, token, body, headers = {} }) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const payload = body != null ? JSON.stringify(body) : null;
        const opts = {
            hostname: parsed.hostname,
            port: parsed.port,
            path: `${parsed.pathname}${parsed.search}`,
            method,
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(payload
                    ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
                    : {}),
                ...headers,
            },
        };
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                let json = null;
                try {
                    json = data ? JSON.parse(data) : null;
                } catch {
                    json = { raw: data };
                }
                resolve({ status: res.statusCode, body: json, raw: data });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function login(base, email, password, tenantSlug) {
    const res = await httpJson({
        method: 'POST',
        url: `${base}/auth/login`,
        body: { email, password, tenantSlug },
    });
    if (res.status !== 200 || !res.body?.data?.accessToken) {
        throw new Error(`login failed ${email}@${tenantSlug}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.data.accessToken;
}

async function switchTenant(base, token, tenantSlug) {
    return httpJson({
        method: 'POST',
        url: `${base}/auth/switch-tenant`,
        token,
        body: { tenantSlug },
    });
}

function hasForeignTenantData(body, foreignTenantId) {
    const text = JSON.stringify(body ?? {});
    return text.includes(foreignTenantId);
}

async function run() {
    assertLocalDb();
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let fixture = null;
    let server = null;
    const results = [];
    let passed = 0;
    let failed = 0;

    const record = (id, ok, detail, extra = {}) => {
        const row = { id, status: ok ? 'PASS' : 'FAIL', detail, ...extra };
        results.push(row);
        if (ok) passed += 1;
        else failed += 1;
        process.stdout.write(`${ok ? '✔' : '✖'} ${id}: ${detail}\n`);
    };

    try {
        fixture = await createTenantIsolationFixture(prisma, runContext);
        const app = createIntegrationApiApp();
        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', resolve);
        });
        const { port } = server.address();
        const base = `http://127.0.0.1:${port}/api`;

        const tokenA = await issueGrnAccessToken(fixture.grn.userAId, fixture.grn.tenantSlugA);
        const tokenB = await issueGrnAccessToken(fixture.grn.userBId, fixture.grn.tenantSlugB);

        // Foreign GRN detail → 404
        const foreignGrn = await httpJson({
            method: 'GET',
            url: `${base}/grn/${fixture.grn.grnBId}`,
            token: tokenA,
        });
        record(
            'foreign-grn-detail',
            foreignGrn.status === 404,
            `GET tenant-A token + tenant-B GRN → ${foreignGrn.status}`,
            { expected: 404 },
        );

        // Random UUID → 404
        const randomGrn = await httpJson({
            method: 'GET',
            url: `${base}/grn/${RANDOM_ID}`,
            token: tokenA,
        });
        record('random-grn-id', randomGrn.status === 404, `random GRN id → ${randomGrn.status}`);

        // Foreign update (PATCH location from tenant B)
        const foreignPatch = await httpJson({
            method: 'PATCH',
            url: `${base}/grn/${fixture.grn.grnAId}`,
            token: tokenA,
            body: { locationId: fixture.org.locBId },
        });
        record(
            'foreign-grn-relation',
            foreignPatch.status === 400 || foreignPatch.status === 403 || foreignPatch.status === 404,
            `PATCH GRN with foreign location → ${foreignPatch.status}`,
        );

        // Timeline foreign document
        const foreignTimeline = await httpJson({
            method: 'GET',
            url: `${base}/constitution/timeline/GRN/${fixture.grn.grnBId}`,
            token: tokenA,
        });
        record(
            'foreign-grn-timeline',
            foreignTimeline.status === 404 || foreignTimeline.status === 403,
            `timeline foreign GRN → ${foreignTimeline.status}`,
        );

        const foreignDelete = await httpJson({
            method: 'DELETE',
            url: `${base}/grn/${fixture.grn.grnBId}`,
            token: tokenA,
        });
        record(
            'foreign-grn-delete',
            foreignDelete.status === 404 || foreignDelete.status === 403,
            `DELETE foreign GRN → ${foreignDelete.status}`,
        );

        const foreignApprove = await httpJson({
            method: 'POST',
            url: `${base}/grn/${fixture.grn.grnBId}/approve`,
            token: tokenA,
        });
        record(
            'foreign-grn-approve',
            foreignApprove.status === 404 || foreignApprove.status === 403,
            `POST approve foreign GRN → ${foreignApprove.status}`,
        );

        const foreignReject = await httpJson({
            method: 'POST',
            url: `${base}/grn/${fixture.grn.grnBId}/reject`,
            token: tokenA,
            body: { reason: 'isolation-test' },
        });
        record(
            'foreign-grn-reject',
            foreignReject.status === 404 || foreignReject.status === 403,
            `POST reject foreign GRN → ${foreignReject.status}`,
        );

        const foreignSendBack = await httpJson({
            method: 'POST',
            url: `${base}/grn/${fixture.grn.grnBId}/send-back`,
            token: tokenA,
            body: { reason: 'isolation-test' },
        });
        record(
            'foreign-grn-send-back',
            foreignSendBack.status === 404 || foreignSendBack.status === 403,
            `POST send-back foreign GRN → ${foreignSendBack.status}`,
        );

        const foreignEvidence = await httpJson({
            method: 'GET',
            url: `${base}/grn/${fixture.grn.grnBId}/evidence`,
            token: tokenA,
        });
        record(
            'foreign-grn-attachment',
            foreignEvidence.status === 404 || foreignEvidence.status === 403,
            `GET foreign GRN evidence → ${foreignEvidence.status}`,
        );

        // ORG_MANAGER operational context on child A — list only child A get passes
        const orgTokenRoot = await login(
            base,
            fixture.orgManager.email,
            INTEGRATION_PASSWORD,
            fixture.org.orgRootSlug,
        );

        // x-tenant-id: valid child scopes ORG_MANAGER to child B
        const headerChildB = await httpJson({
            method: 'GET',
            url: `${base}/grn`,
            token: orgTokenRoot,
            headers: { 'x-tenant-id': fixture.org.childBId },
        });
        const headerBRows = headerChildB.body?.data ?? headerChildB.body?.grns ?? [];
        const headerBList = Array.isArray(headerBRows) ? headerBRows : headerBRows?.data ?? [];
        const foreignInHeaderB = headerBList.some(
            (row) => row.id === fixture.org.grnChildAId || row.tenantId === fixture.org.childAId,
        );
        record(
            'x-tenant-id-valid-child',
            headerChildB.status === 200 && !foreignInHeaderB,
            `x-tenant-id child B list → ${headerChildB.status} foreign=${foreignInHeaderB}`,
        );

        // x-tenant-id: outsider tenant → 403
        const headerOutsider = await httpJson({
            method: 'GET',
            url: `${base}/grn`,
            token: orgTokenRoot,
            headers: { 'x-tenant-id': fixture.org.outsiderId },
        });
        record(
            'x-tenant-id-outside-org',
            headerOutsider.status === 403,
            `x-tenant-id outsider → ${headerOutsider.status}`,
        );

        const switchedA = await switchTenant(base, orgTokenRoot, fixture.org.childASlug);
        const orgTokenChildA = switchedA.body?.data?.accessToken;
        if (!orgTokenChildA) {
            throw new Error('ORG_MANAGER switch to child A did not return accessToken');
        }
        const gpList = await httpJson({
            method: 'GET',
            url: `${base}/get-passes`,
            token: orgTokenChildA,
        });
        const gpRows = gpList.body?.data ?? gpList.body?.passes ?? [];
        const listArray = Array.isArray(gpRows) ? gpRows : gpRows?.data ?? [];
        const foreignPassInList = listArray.some(
            (row) => row.id === fixture.org.getPassBId || row.tenantId === fixture.org.childBId,
        );
        record(
            'org-manager-getpass-operational-list',
            gpList.status === 200 && !foreignPassInList,
            `ORG_MANAGER on child A list count=${listArray.length} foreign=${foreignPassInList}`,
        );

        // Internal transfer target: detail + timeline on child B token
        const switchedToB = await switchTenant(base, orgTokenChildA, fixture.org.childBSlug);
        const orgTokenChildB = switchedToB.body?.data?.accessToken;
        if (!orgTokenChildB) {
            throw new Error('ORG_MANAGER switch to child B did not return accessToken');
        }
        const gpDetailTarget = await httpJson({
            method: 'GET',
            url: `${base}/get-passes/${fixture.org.getPassInternalTargetId}`,
            token: orgTokenChildB,
        });
        const gpTimelineTarget = await httpJson({
            method: 'GET',
            url: `${base}/constitution/timeline/GET_PASS/${fixture.org.getPassInternalTargetId}`,
            token: orgTokenChildB,
        });
        record(
            'getpass-internal-target-detail',
            gpDetailTarget.status === 200,
            `internal transfer detail on target tenant → ${gpDetailTarget.status}`,
        );
        record(
            'getpass-internal-target-timeline',
            gpTimelineTarget.status === 200,
            `internal transfer timeline on target tenant → ${gpTimelineTarget.status}`,
        );

        // Switch to valid child (org manager child A → child B)
        record(
            'switch-valid-child',
            switchedToB.status === 200 && switchedToB.body?.success,
            `switch tenant A → child B → ${switchedToB.status}`,
        );

        // Switch outside organization → 403 (from child A context)
        const switchBackA = await switchTenant(base, orgTokenChildB, fixture.org.childASlug);
        const orgTokenChildAAgain = switchBackA.body?.data?.accessToken || orgTokenChildA;
        const switchOutside = await switchTenant(base, orgTokenChildAAgain, fixture.org.outsiderSlug);
        record(
            'switch-outside-org',
            switchOutside.status === 403,
            `switch to outsider tenant → ${switchOutside.status}`,
        );

        // Rapid parallel switches from same token — both succeed; FE seq guard picks last user intent
        const [parallelB, parallelA] = await Promise.all([
            switchTenant(base, orgTokenChildAAgain, fixture.org.childBSlug),
            switchTenant(base, orgTokenChildAAgain, fixture.org.childASlug),
        ]);
        record(
            'rapid-switch-parallel',
            parallelA.status === 200 && (parallelB.status === 200 || parallelB.status === 409),
            `parallel switch B=${parallelB.status} A=${parallelA.status} (A must win scope)`,
        );
        const finalToken = parallelA.body?.data?.accessToken;
        const finalScopeCheck = await httpJson({
            method: 'GET',
            url: `${base}/grn/${fixture.org.grnChildAId}`,
            token: finalToken,
        });
        record(
            'rapid-switch-final-token-scope',
            finalScopeCheck.status === 200,
            `token after parallel switches reads child A GRN → ${finalScopeCheck.status}`,
        );

        // Cross-tenant body leak check on foreign 404
        record(
            'no-foreign-data-in-404',
            !hasForeignTenantData(foreignGrn.body, fixture.grn.tenantBId),
            'foreign GRN 404 body does not expose tenant B id',
        );

        // No HTTP 500 in matrix
        const statuses = results
            .map((r) => r.httpStatus)
            .filter((s) => typeof s === 'number');
        const any500 =
            statuses.some((s) => s === 500) ||
            results.some((r) => /\b500\b/.test(String(r.detail)));
        record('no-http-500', !any500, 'no scenario returned HTTP 500');

        const evidence = {
            runAt: new Date().toISOString(),
            runId: fixture.runId,
            apiBase: base,
            summary: { passed, failed, total: passed + failed },
            results,
        };

        fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
        fs.writeFileSync(
            path.join(EVIDENCE_DIR, 'API_RUNTIME_EVIDENCE.json'),
            JSON.stringify(evidence, null, 2),
            'utf8',
        );

        process.stdout.write(`\nAPI Runtime: ${passed} passed, ${failed} failed\n`);
        if (failed > 0) {
            process.exitCode = 1;
        }
    } finally {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        if (fixture) {
            try {
                await cleanupTenantIsolationFixture(prisma, fixture);
            } catch (err) {
                console.error('[tenant-isolation-api] cleanup failed:', err.message);
                process.exitCode = 1;
            }
        }
        await prisma.$disconnect();
    }
}

run().catch((err) => {
    console.error('[tenant-isolation-api] fatal:', err);
    process.exit(1);
});
