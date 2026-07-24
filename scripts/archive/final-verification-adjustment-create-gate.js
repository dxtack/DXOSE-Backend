'use strict';

/**
 * Final Verification Gate — New Adjustment / ADJUSTMENT_CREATE FM-only (R1–R12).
 * Run: node scripts/final-verification-adjustment-create-gate.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const jwt = require('jsonwebtoken');

const prisma = require('../src/config/database');
const authService = require('../src/services/auth.service');
const movementService = require('../src/services/movement.service');
const { generateAccessToken } = require('../src/utils/jwt');

const API = process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`;
const TENANT_SLUG = process.env.AUDIT_TENANT_SLUG || 'dx-marina-hotel';
const FIXTURE_TAG = 'ADJUSTMENT_GATE_R12';

const USERS = {
    STOREKEEPER: 'kevin.brooks@dxuat.com',
    FINANCE_MANAGER: 'jonathan.miller@dxuat.com',
};

const REPORT_DIR = path.join(__dirname, '../governance-evidence-archive/timeline-remediation/reports');
const REPORT_PATH = path.join(REPORT_DIR, 'FINAL_VERIFICATION_ADJUSTMENT_CREATE_GATE.json');
const REMEDIATION_PATH = path.join(REPORT_DIR, 'ADJUSTMENT_CREATE_FM_ONLY_REMEDIATION.json');

const scenarios = [];
const crossModule = [];

function record(id, status, evidence = {}) {
    scenarios.push({ id, status, ...evidence });
    const icon = status === 'Passed' ? '✓' : status === 'Skipped' ? '○' : '✗';
    console.log(`${icon} ${id}: ${status}`);
}

function api(method, apiPath, body, token, extraHeaders = {}) {
    const attempt = (triesLeft) => new Promise((resolve, reject) => {
        const base = API.replace(/\/$/, '');
        const full = `${base}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
        const u = new URL(full);
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request(
            {
                hostname: u.hostname,
                port: u.port || (u.protocol === 'https:' ? 443 : 80),
                path: u.pathname + u.search,
                method,
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...extraHeaders,
                    ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
                },
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    let data = null;
                    try {
                        data = JSON.parse(Buffer.concat(chunks).toString());
                    } catch {
                        data = Buffer.concat(chunks).toString();
                    }
                    resolve({ status: res.statusCode, data });
                });
            },
        );
        req.on('error', (err) => {
            if (triesLeft > 0) {
                setTimeout(() => attempt(triesLeft - 1).then(resolve, reject), 500);
                return;
            }
            reject(err);
        });
        if (payload) req.write(payload);
        req.end();
    });
    return attempt(2);
}

async function sessionFor(email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, permissionVersion: true } });
    if (!user) throw new Error(`User not found: ${email}`);
    const issued = await authService.switchTenant({
        userId: user.id,
        tenantSlug: TENANT_SLUG,
        ipAddress: '127.0.0.1',
        userAgent: 'adjustment-gate',
    });
    const decoded = jwt.decode(issued.accessToken);
    return {
        email,
        userId: user.id,
        token: issued.accessToken,
        permissions: issued.user?.permissions || decoded?.permissions || [],
        permissionVersion: decoded?.permissionVersion ?? user.permissionVersion ?? 0,
        role: issued.user?.role || decoded?.role,
    };
}

function readTemplate(relPath) {
    return fs.readFileSync(path.join(__dirname, '../../OSE-Frontend', relPath), 'utf8');
}

async function stockAt(tenantId, itemId, locationId) {
    const row = await prisma.stockBalance.findUnique({
        where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
    });
    return row ? { qtyOnHand: Number(row.qtyOnHand), wacUnitCost: Number(row.wacUnitCost) } : { qtyOnHand: 0, wacUnitCost: 0 };
}

async function findStockFixture(tenantId) {
    return prisma.stockBalance.findFirst({
        where: { tenantId, qtyOnHand: { gte: 5 } },
        orderBy: { qtyOnHand: 'desc' },
        include: { item: true, location: true },
    });
}

function runSmoke(scriptName) {
    const scriptPath = path.join(__dirname, scriptName);
    const started = Date.now();
    const r = spawnSync(process.execPath, [scriptPath], {
        cwd: path.join(__dirname, '..'),
        env: process.env,
        encoding: 'utf8',
    });
    crossModule.push({
        name: scriptName,
        status: r.status === 0 ? 'PASS' : 'FAIL',
        exitCode: r.status,
        durationMs: Date.now() - started,
        stderrTail: (r.stderr || '').slice(-400),
        stdoutTail: (r.stdout || '').slice(-400),
    });
    return r.status === 0;
}

async function main() {
    console.log('\n=== Final Verification Gate: New Adjustment (R1–R12) ===\n');

    const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } });
    if (!tenant) throw new Error(`Tenant ${TENANT_SLUG} not found`);

    const fm = await sessionFor(USERS.FINANCE_MANAGER);
    const sk = await sessionFor(USERS.STOREKEEPER);

    const listTpl = readTemplate('src/app/features/movements/movement-list/movement-list.component.html');
    const formTpl = readTemplate('src/app/features/movements/movement-form/movement-form.component.html');
    const formTs = readTemplate('src/app/features/movements/movement-form/movement-form.component.ts');
    const routesTs = readTemplate('src/app/app.routes.ts');

    // R1
    const r1Pass =
        fm.permissions.includes('ADJUSTMENT_CREATE') &&
        listTpl.includes("*appHasPermission=\"'ADJUSTMENT_CREATE'\"") &&
        listTpl.includes("'MOVEMENTS.NEW_ADJUSTMENT'");
    record('R1', r1Pass ? 'Passed' : 'Failed', {
        financeManagerEmail: fm.email,
        hasAdjustmentCreate: fm.permissions.includes('ADJUSTMENT_CREATE'),
        templateHasPermissionDirective: listTpl.includes("*appHasPermission=\"'ADJUSTMENT_CREATE'\""),
        templateLabelKey: 'MOVEMENTS.NEW_ADJUSTMENT',
    });

    // R2
    const r2Pass =
        formTpl.includes('[nzAllowClear]="false"') &&
        formTs.includes("const DIRECT_CREATE_MOVEMENT_TYPES: readonly string[] = ['ADJUSTMENT']") &&
        !formTpl.includes('[disabled]="true"') &&
        formTpl.includes('directCreateTypeOptions');
    record('R2', r2Pass ? 'Passed' : 'Failed', {
        nzAllowClearFalse: formTpl.includes('[nzAllowClear]="false"'),
        singleOptionSource: "DIRECT_CREATE_MOVEMENT_TYPES = ['ADJUSTMENT']",
        dropdownNotHardDisabled: !formTpl.match(/movementType[\s\S]{0,200}\[disabled\]="true"/),
    });

    // R3 + R4 — FM create, edit, post with ledger/stock evidence
    let r3Pass = false;
    let r4Pass = false;
    let adjustmentDocId = null;
    let adjustmentDocNo = null;
    let ledgerEvidence = null;
    let stockEvidence = null;

    const stockFixture = await findStockFixture(tenant.id);
    if (!stockFixture) {
        record('R3', 'Skipped', { reason: 'No stock fixture with qty >= 5' });
        record('R4', 'Skipped', { reason: 'R3 skipped' });
    } else {
        const adjQty = 2;
        const itemId = stockFixture.itemId;
        const locationId = stockFixture.locationId;
        const unitCost = Number(stockFixture.item?.defaultCost || stockFixture.wacUnitCost || 1);
        const stockBefore = await stockAt(tenant.id, itemId, locationId);

        const createRes = await api('POST', '/movements', {
            movementType: 'ADJUSTMENT',
            documentDate: new Date().toISOString().split('T')[0],
            sourceLocationId: locationId,
            notes: FIXTURE_TAG,
            lines: [{
                itemId,
                locationId,
                qtyRequested: adjQty,
                unitCost,
                totalValue: adjQty * unitCost,
            }],
        }, fm.token);

        r3Pass = createRes.status === 201 && createRes.data?.data?.movementType === 'ADJUSTMENT';
        adjustmentDocId = createRes.data?.data?.id;
        adjustmentDocNo = createRes.data?.data?.documentNo;
        const createVersion = createRes.data?.data?.concurrencyVersion ?? 0;

        if (r3Pass && adjustmentDocId) {
            const updateRes = await api('PUT', `/movements/${adjustmentDocId}`, {
                movementType: 'ADJUSTMENT',
                documentDate: new Date().toISOString().split('T')[0],
                sourceLocationId: locationId,
                notes: `${FIXTURE_TAG} edited`,
                concurrencyVersion: createVersion,
                lines: [{
                    itemId,
                    locationId,
                    qtyRequested: adjQty,
                    unitCost,
                    totalValue: adjQty * unitCost,
                }],
            }, fm.token);
            const postVersion = updateRes.data?.data?.concurrencyVersion ?? createVersion;
            const postRes = await api(
                'POST',
                `/movements/${adjustmentDocId}/post`,
                { concurrencyVersion: postVersion },
                fm.token,
            );
            r3Pass = updateRes.status === 200 && postRes.status === 200;

            const stockAfter = await stockAt(tenant.id, itemId, locationId);
            const ledgerRes = await api('GET', `/ledger/by-document/${adjustmentDocId}`, null, fm.token);
            const ledgerRows = ledgerRes.data?.data || [];
            const ledgerRow = ledgerRows.find((e) => e.itemId === itemId && e.locationId === locationId);

            stockEvidence = {
                itemId,
                locationId,
                before: stockBefore,
                after: stockAfter,
                expectedDelta: adjQty,
                actualDelta: stockAfter.qtyOnHand - stockBefore.qtyOnHand,
            };
            ledgerEvidence = ledgerRow
                ? {
                    id: ledgerRow.id,
                    movementType: ledgerRow.movementType,
                    qtyIn: Number(ledgerRow.qtyIn),
                    qtyOut: Number(ledgerRow.qtyOut),
                    balanceAfter: Number(ledgerRow.balanceAfter),
                    totalValue: Number(ledgerRow.totalValue),
                }
                : null;

            r4Pass =
                stockEvidence.actualDelta === adjQty &&
                ledgerEvidence?.movementType === 'ADJUSTMENT' &&
                ledgerEvidence.qtyIn === adjQty &&
                ledgerEvidence.balanceAfter === stockAfter.qtyOnHand;
        }

        record('R3', r3Pass ? 'Passed' : 'Failed', {
            documentId: adjustmentDocId,
            documentNo: adjustmentDocNo,
            createStatus: createRes.status,
            movementType: createRes.data?.data?.movementType,
        });
        record('R4', r4Pass ? 'Passed' : 'Failed', {
            documentId: adjustmentDocId,
            ledger: ledgerEvidence,
            stock: stockEvidence,
        });
    }

    // R5
    const r5Pass = !sk.permissions.includes('ADJUSTMENT_CREATE');
    record('R5', r5Pass ? 'Passed' : 'Failed', {
        storekeeperEmail: sk.email,
        hasAdjustmentCreate: sk.permissions.includes('ADJUSTMENT_CREATE'),
        hasMovementCreate: sk.permissions.includes('MOVEMENT_CREATE'),
    });

    // R6 — route guard equivalent + API create blocked
    const r6RouteBlocked = !sk.permissions.includes('ADJUSTMENT_CREATE') &&
        routesTs.includes("permission: 'ADJUSTMENT_CREATE'") &&
        routesTs.includes("path: 'new'");
    record('R6', r6RouteBlocked ? 'Passed' : 'Failed', {
        routePermission: 'ADJUSTMENT_CREATE',
        storekeeperWouldPassGuard: sk.permissions.includes('ADJUSTMENT_CREATE'),
        note: 'permissionGuard denies /movements/new when ADJUSTMENT_CREATE absent from session permissions',
    });

    // R7
    const create403 = await api('POST', '/movements', {
        movementType: 'ADJUSTMENT',
        documentDate: new Date().toISOString().split('T')[0],
        lines: [],
    }, sk.token);
    const wrongType = await api('POST', '/movements', {
        movementType: 'ISSUE',
        documentDate: new Date().toISOString().split('T')[0],
        lines: [],
    }, sk.token);
    const r7Pass = create403.status === 403 && wrongType.status === 403;
    record('R7', r7Pass ? 'Passed' : 'Failed', {
        adjustmentCreateStatus: create403.status,
        issueCreateStatus: wrongType.status,
        adjustmentMessage: create403.data?.message,
    });

    // R8 — stale JWT
    const skUser = await prisma.user.findUnique({
        where: { email: USERS.STOREKEEPER },
        select: { id: true, permissionVersion: true },
    });
    const decodedSk = jwt.decode(sk.token);
    const staleToken = generateAccessToken({
        userId: skUser.id,
        tenantId: tenant.id,
        role: decodedSk.role,
        email: USERS.STOREKEEPER,
        permissions: [...(decodedSk.permissions || []), 'ADJUSTMENT_CREATE'],
        permissionVersion: (skUser.permissionVersion ?? 0) - 1,
    });
    const staleRes = await api('POST', '/movements', {
        movementType: 'ADJUSTMENT',
        documentDate: new Date().toISOString().split('T')[0],
        lines: [],
    }, staleToken);
    const freshSk = await sessionFor(USERS.STOREKEEPER);
    const r8Pass =
        staleRes.status === 401 &&
        staleRes.data?.code === 'PERMISSIONS_STALE' &&
        !freshSk.permissions.includes('ADJUSTMENT_CREATE');
    record('R8', r8Pass ? 'Passed' : 'Failed', {
        staleTokenStatus: staleRes.status,
        staleTokenCode: staleRes.data?.code,
        dbPermissionVersion: skUser.permissionVersion,
        staleTokenPermissionVersion: (skUser.permissionVersion ?? 0) - 1,
        freshLoginHasAdjustmentCreate: freshSk.permissions.includes('ADJUSTMENT_CREATE'),
    });

    // R9 — legacy non-ADJUSTMENT draft (OPENING_BALANCE)
    let r9Pass = false;
    let obDocId = null;
    const obDraft = await prisma.movementDocument.findFirst({
        where: { tenantId: tenant.id, movementType: 'OPENING_BALANCE', status: 'DRAFT' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, documentDate: true, notes: true, concurrencyVersion: true },
    });
    let r9PutStatus = null;
    if (obDraft) {
        obDocId = obDraft.id;
        const obPut = await api('PUT', `/movements/${obDocId}`, {
            movementType: 'OPENING_BALANCE',
            documentDate: obDraft.documentDate.toISOString().split('T')[0],
            notes: obDraft.notes || FIXTURE_TAG,
            concurrencyVersion: obDraft.concurrencyVersion ?? 0,
            lines: [],
        }, sk.token);
        r9PutStatus = obPut.status;
        r9Pass = obPut.status === 200;
    } else if (stockFixture) {
        const obDoc = await movementService.createMovementDraft(
            {
                movementType: 'OPENING_BALANCE',
                documentDate: new Date().toISOString().split('T')[0],
                destLocationId: stockFixture.locationId,
                notes: FIXTURE_TAG,
                lines: [{
                    itemId: stockFixture.itemId,
                    locationId: stockFixture.locationId,
                    qtyRequested: 1,
                    unitCost: 1,
                    totalValue: 1,
                }],
            },
            tenant.id,
            sk.userId,
            prisma,
            { origin: 'INTERNAL' },
        );
        obDocId = obDoc.id;
        const obPut = await api('PUT', `/movements/${obDocId}`, {
            movementType: 'OPENING_BALANCE',
            documentDate: new Date().toISOString().split('T')[0],
            destLocationId: stockFixture.locationId,
            notes: `${FIXTURE_TAG} sk-edit`,
            concurrencyVersion: obDoc.concurrencyVersion ?? 0,
            lines: [{
                itemId: stockFixture.itemId,
                locationId: stockFixture.locationId,
                qtyRequested: 1,
                unitCost: 1,
                totalValue: 1,
            }],
        }, sk.token);
        r9PutStatus = obPut.status;
        r9Pass = obPut.status === 200;
    }
    record('R9', obDraft || stockFixture ? (r9Pass ? 'Passed' : 'Failed') : 'Skipped', {
        documentId: obDocId,
        storekeeperHasMovementCreate: sk.permissions.includes('MOVEMENT_CREATE'),
        putStatus: r9PutStatus,
    });

    // R10 — legacy ADJUSTMENT draft by non-FM
    let legacyAdjId = null;
    let r10Pass = false;
    const legacyAdj = await movementService.createMovementDraft(
        {
            movementType: 'ADJUSTMENT',
            documentDate: new Date().toISOString().split('T')[0],
            sourceLocationId: stockFixture?.locationId,
            notes: `${FIXTURE_TAG} legacy-by-sk`,
            lines: stockFixture ? [{
                itemId: stockFixture.itemId,
                locationId: stockFixture.locationId,
                qtyRequested: 1,
                unitCost: 1,
                totalValue: 1,
            }] : [],
        },
        tenant.id,
        sk.userId,
        prisma,
        { origin: 'INTERNAL' },
    );
    legacyAdjId = legacyAdj.id;
    const skLegacyPut = await api('PUT', `/movements/${legacyAdjId}`, {
        movementType: 'ADJUSTMENT',
        documentDate: new Date().toISOString().split('T')[0],
        notes: `${FIXTURE_TAG} sk-blocked`,
        concurrencyVersion: legacyAdj.concurrencyVersion ?? 0,
        lines: stockFixture ? [{
            itemId: stockFixture.itemId,
            locationId: stockFixture.locationId,
            qtyRequested: 1,
            unitCost: 1,
            totalValue: 1,
        }] : [],
    }, sk.token);
    const fmLegacyPut = await api('PUT', `/movements/${legacyAdjId}`, {
        movementType: 'ADJUSTMENT',
        documentDate: new Date().toISOString().split('T')[0],
        notes: `${FIXTURE_TAG} fm-complete`,
        concurrencyVersion: legacyAdj.concurrencyVersion ?? 0,
        lines: stockFixture ? [{
            itemId: stockFixture.itemId,
            locationId: stockFixture.locationId,
            qtyRequested: 1,
            unitCost: 1,
            totalValue: 1,
        }] : [],
    }, fm.token);
    r10Pass =
        skLegacyPut.status === 403 &&
        skLegacyPut.data?.required === 'ADJUSTMENT_CREATE' &&
        fmLegacyPut.status === 200;
    record('R10', r10Pass ? 'Passed' : 'Failed', {
        legacyAdjustmentDraftId: legacyAdjId,
        storekeeperPutStatus: skLegacyPut.status,
        storekeeperRequired: skLegacyPut.data?.required,
        financeManagerPutStatus: fmLegacyPut.status,
        createdByUserId: sk.userId,
    });

    // R11 — remediation report
    let r11Pass = false;
    let remediationReport = null;
    if (fs.existsSync(REMEDIATION_PATH)) {
        remediationReport = JSON.parse(fs.readFileSync(REMEDIATION_PATH, 'utf8'));
        const bumpTotal = (remediationReport.removedFromRoles || [])
            .reduce((sum, r) => sum + (r.usersPermissionVersionBumped || 0), 0);
        r11Pass =
            remediationReport.nonFmGrantCountAfter === 0 &&
            bumpTotal === 11 &&
            remediationReport.acceptance?.nonFmAdjustmentCreateZero === true &&
            Array.isArray(remediationReport.legacyAdjustmentDrafts);
        record('R11', r11Pass ? 'Passed' : 'Failed', {
            remediationReportPath: REMEDIATION_PATH,
            nonFmGrantCountAfter: remediationReport.nonFmGrantCountAfter,
            permissionVersionBumpsTotal: bumpTotal,
            legacyAdjustmentDraftCount: remediationReport.legacyAdjustmentDraftCount,
        });
    } else {
        record('R11', 'Failed', { remediationReportPath: REMEDIATION_PATH, error: 'Report file missing' });
    }

    // R12 — cross-module regression + movement list API unchanged
    const repoRoot = path.join(__dirname, '../..');
    const movementListRes = await api('GET', '/movements?skip=0&take=5&movementType=ADJUSTMENT', null, fm.token);
    const movementFilterRes = await api('GET', '/movements?skip=0&take=5&status=POSTED', null, fm.token);
    const listApiOk = movementListRes.status === 200 && movementFilterRes.status === 200;

    const smokeScripts = [
        { name: 'smoke-movement-register-governed.js', path: path.join(__dirname, 'smoke-movement-register-governed.js') },
        { name: 'breakage-get-by-id.test.js', path: path.join(__dirname, 'breakage-get-by-id.test.js'), args: ['--test'] },
        { name: 'movement-direct-adjustment.guard.test.js', path: path.join(__dirname, 'movement-direct-adjustment.guard.test.js'), args: ['--test'] },
        { name: 'movement-adjustment-rbac.test.js', path: path.join(__dirname, 'movement-adjustment-rbac.test.js'), args: ['--test'] },
    ];

    let r12SmokePass = true;
    for (const s of smokeScripts) {
        const started = Date.now();
        const args = s.args ? [s.args[0], s.path] : [s.path];
        const r = spawnSync(process.execPath, args, {
            cwd: path.join(__dirname, '..'),
            env: process.env,
            encoding: 'utf8',
        });
        const ok = r.status === 0;
        if (!ok) r12SmokePass = false;
        crossModule.push({
            name: s.name,
            status: ok ? 'PASS' : 'FAIL',
            exitCode: r.status,
            durationMs: Date.now() - started,
        });
    }

    // GRN list smoke via API
    const grnRes = await api('GET', '/grn?page=1&limit=3', null, fm.token);
    crossModule.push({ name: 'GET /api/grn (list)', status: grnRes.status === 200 ? 'PASS' : 'FAIL', httpStatus: grnRes.status });
    if (grnRes.status !== 200) r12SmokePass = false;

    // Inventory count sessions list
    const icRes = await api('GET', '/inventory-count/sessions?take=3', null, fm.token);
    crossModule.push({
        name: 'GET /api/inventory-count/sessions',
        status: icRes.status === 200 ? 'PASS' : 'FAIL',
        httpStatus: icRes.status,
    });
    if (icRes.status !== 200) r12SmokePass = false;

    // Breakage list
    const brkRes = await api('GET', '/breakage?skip=0&take=3', null, fm.token);
    crossModule.push({ name: 'GET /api/breakage (list)', status: brkRes.status === 200 ? 'PASS' : 'FAIL', httpStatus: brkRes.status });
    if (brkRes.status !== 200) r12SmokePass = false;

    // Lost list
    const lostRes = await api('GET', '/lost-items?skip=0&take=3', null, fm.token);
    crossModule.push({ name: 'GET /api/lost-items (list)', status: lostRes.status === 200 ? 'PASS' : 'FAIL', httpStatus: lostRes.status });
    if (lostRes.status !== 200) r12SmokePass = false;

    // Source-generated movement (BREAKAGE posted doc exists)
    const governedDoc = await prisma.movementDocument.findFirst({
        where: { tenantId: tenant.id, movementType: 'BREAKAGE', status: { not: 'DRAFT' } },
        select: { id: true, documentNo: true, movementType: true },
    });
    crossModule.push({
        name: 'source-generated BREAKAGE movement register',
        status: governedDoc ? 'PASS' : 'SKIP',
        documentId: governedDoc?.id,
        documentNo: governedDoc?.documentNo,
    });

    const listDiff = spawnSync('git', ['diff', '--name-only', '--', 'OSE-Frontend/src/app/features/movements/movement-list/'], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    const listDiffCached = spawnSync('git', ['diff', '--cached', '--name-only', '--', 'OSE-Frontend/src/app/features/movements/movement-list/'], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    const listChangedFiles = [...listDiff.stdout.trim().split('\n'), ...listDiffCached.stdout.trim().split('\n')].filter(Boolean);
    const listOnlyScopedChange = listChangedFiles.length === 0 ||
        listChangedFiles.every((f) =>
            f.endsWith('movement-list.component.html') || f.endsWith('movement-list.component.ts'));

    const r12Pass = listApiOk && r12SmokePass && listOnlyScopedChange;
    record('R12', r12Pass ? 'Passed' : 'Failed', {
        movementListApiStatus: movementListRes.status,
        movementFilterApiStatus: movementFilterRes.status,
        listComponentDiffFiles: listChangedFiles,
        crossModule,
    });

    // Frontend build (set SKIP_FRONTEND_BUILD=1 to skip)
    let frontendBuild = { status: 'SKIPPED', durationMs: 0 };
    if (process.env.SKIP_FRONTEND_BUILD !== '1') {
        const buildStarted = Date.now();
        const build = spawnSync('npm', ['run', 'build'], {
            cwd: path.join(repoRoot, 'OSE-Frontend'),
            shell: true,
            encoding: 'utf8',
        });
        frontendBuild = {
            status: build.status === 0 ? 'PASS' : 'FAIL',
            durationMs: Date.now() - buildStarted,
        };
    }

    // Modified files
    const gitDiff = spawnSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf8' });
    const gitDiffCached = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: repoRoot, encoding: 'utf8' });
    const gitUntracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'OSE-backend', 'OSE-Frontend', 'OSE-backend/Governance'], { cwd: repoRoot, encoding: 'utf8' });
    const modifiedFiles = [...new Set([
        ...gitDiff.stdout.trim().split('\n'),
        ...gitDiffCached.stdout.trim().split('\n'),
        ...gitUntracked.stdout.trim().split('\n'),
    ])].filter(Boolean).filter((f) => !f.includes('node_modules'));

    const fallbackDiff = spawnSync('git', ['diff', 'HEAD', '--', 'OSE-Frontend/src/app/core/constants/role-permission-fallback.ts'], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    const rolePermissionFallbackUntouched = !fallbackDiff.stdout.trim();

    const passed = scenarios.filter((s) => s.status === 'Passed').length;
    const failed = scenarios.filter((s) => s.status === 'Failed').length;
    const skipped = scenarios.filter((s) => s.status === 'Skipped').length;

    const report = {
        gate: 'FINAL_VERIFICATION_ADJUSTMENT_CREATE',
        executedAt: new Date().toISOString(),
        tenantSlug: TENANT_SLUG,
        summary: {
            runtime: { passed, failed, skipped, total: 12 },
            crossModuleRegression: r12SmokePass && crossModule.every((c) => c.status !== 'FAIL') ? 'PASS' : 'FAIL',
            frontendBuild: frontendBuild.status,
        },
        scenarios,
        fixtures: {
            financeManager: fm.email,
            storekeeper: sk.email,
            adjustmentPostedDocumentId: adjustmentDocId,
            adjustmentPostedDocumentNo: adjustmentDocNo,
            legacyOpeningBalanceDocumentId: obDocId,
            legacyAdjustmentDraftId: legacyAdjId,
            stockFixture: stockFixture
                ? { itemId: stockFixture.itemId, locationId: stockFixture.locationId, itemName: stockFixture.item?.name }
                : null,
        },
        ledgerEvidence,
        stockEvidence,
        staleJwt: {
            status: staleRes.status,
            code: staleRes.data?.code,
        },
        remediationReportPath: REMEDIATION_PATH,
        remediationReport: remediationReport
            ? {
                nonFmGrantCountAfter: remediationReport.nonFmGrantCountAfter,
                permissionVersionBumpsTotal: (remediationReport.removedFromRoles || [])
                    .reduce((sum, r) => sum + (r.usersPermissionVersionBumped || 0), 0),
                legacyAdjustmentDraftCount: remediationReport.legacyAdjustmentDraftCount,
            }
            : null,
        crossModule,
        frontendBuild,
        rolePermissionFallbackUntouched,
        modifiedFiles,
    };

    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log('\n--- Summary ---');
    console.log(`Runtime: ${passed} Passed · ${failed} Failed · ${skipped} Skipped`);
    console.log(`Cross-module regression: ${report.summary.crossModuleRegression}`);
    console.log(`Frontend build: ${frontendBuild.status}`);
    console.log(`Report: ${REPORT_PATH}`);
    console.log(`role-permission-fallback.ts untouched: ${rolePermissionFallbackUntouched}`);

    if (failed > 0 || frontendBuild.status !== 'PASS' || report.summary.crossModuleRegression !== 'PASS') {
        process.exit(1);
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
