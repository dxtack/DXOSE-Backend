'use strict';

/**
 * Inventory Count v3 — full backend runtime integration (API + DB).
 * Usage:
 *   node scripts/ensure-inventory-count-test-fixtures.js
 *   node scripts/integration-inventory-count-v3.js
 *
 * Requires API on OSE_API_URL (default http://127.0.0.1:4000/api).
 * No service-layer fallback — GM approve must succeed via HTTP.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/database');

const API_BASE = process.env.OSE_API_URL || 'http://127.0.0.1:4000/api';
const TENANT_SLUG = process.env.OSE_TENANT_SLUG || 'grand-horizon';
const PASSWORD = process.env.OSE_TEST_PASSWORD || 'Admin@123';

const USERS = {
    storekeeper: { email: 'store@grandhorizon.com' },
    receiving: { email: 'receiving@grandhorizon.com' },
    costControl: { email: 'cost@grandhorizon.com' },
    deptManager: { email: 'fb.manager@grandhorizon.com' },
    wrongDeptManager: { email: 'hk.manager@grandhorizon.com' },
    finance: { email: 'finance@grandhorizon.com' },
    gm: { email: 'gm@grandhorizon.com' },
};

const evidence = {
    status: 'INVENTORY_COUNT_BACKEND_RUNTIME',
    manualBrowserUat: 'PENDING',
    startedAt: new Date().toISOString(),
    apiBase: API_BASE,
    tenantSlug: TENANT_SLUG,
    scenarios: [],
    errors: [],
};

function record(scenario, step, detail) {
    const entry = { scenario, step, at: new Date().toISOString(), ...detail };
    const bucket = evidence.scenarios.find((s) => s.name === scenario);
    if (bucket) bucket.steps.push(entry);
    else evidence.scenarios.push({ name: scenario, steps: [entry] });
    console.log(`[${scenario}::${step}]`, JSON.stringify(detail));
}

function fail(scenario, message) {
    evidence.errors.push({ scenario, message, at: new Date().toISOString() });
    throw new Error(`[${scenario}] ${message}`);
}

async function apiLogin(email, password = PASSWORD) {
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenantSlug: TENANT_SLUG }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`Login ${email}: ${res.status} ${JSON.stringify(json)}`);
    }
    const data = json.data ?? json;
    return {
        token: data.accessToken,
        tenantId: data.currentTenant?.id || data.user?.tenantId,
        userId: data.user?.id,
        role: data.user?.role,
        permissions: data.user?.permissions || [],
        email,
    };
}

async function apiCall(auth, method, path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.token}`,
            'X-Tenant-Slug': TENANT_SLUG,
        },
        body: body != null ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    const errCode = json?.error?.code || json?.code || json?.data?.code;
    return { status: res.status, json, ok: res.ok, errCode };
}

async function resolveScope() {
    const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG }, select: { id: true, name: true } });
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_SLUG}`);

    const dept = await prisma.department.findFirst({
        where: { tenantId: tenant.id, isActive: true, name: { contains: 'Food', mode: 'insensitive' } },
        select: { id: true, name: true },
    });
    const department =
        dept ||
        (await prisma.department.findFirst({
            where: { tenantId: tenant.id, isActive: true },
            select: { id: true, name: true },
        }));
    if (!department) throw new Error('No department found');

    const location = await prisma.location.findFirst({
        where: { tenantId: tenant.id, isActive: true, departmentId: department.id },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });
    if (!location) throw new Error('No location for department');

    return {
        tenantId: tenant.id,
        departmentId: department.id,
        departmentName: department.name,
        locationIds: [location.id],
        locationId: location.id,
        locationName: location.name,
    };
}

async function seedPostingAnchor(scope, bookQty = 10) {
    let balance = await prisma.stockBalance.findFirst({
        where: {
            tenantId: scope.tenantId,
            locationId: scope.locationId,
            item: { isActive: true },
        },
        include: { item: { select: { id: true, name: true, isActive: true, departmentId: true } } },
        orderBy: { qtyOnHand: 'desc' },
    });

    if (!balance) {
        const item = await prisma.item.findFirst({
            where: { tenantId: scope.tenantId, isActive: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
        if (!item) throw new Error('No active item for posting anchor');
        balance = await prisma.stockBalance.upsert({
            where: {
                tenantId_itemId_locationId: {
                    tenantId: scope.tenantId,
                    itemId: item.id,
                    locationId: scope.locationId,
                },
            },
            update: { qtyOnHand: bookQty },
            create: {
                tenantId: scope.tenantId,
                itemId: item.id,
                locationId: scope.locationId,
                qtyOnHand: bookQty,
                wacUnitCost: 1,
            },
            include: { item: { select: { id: true, name: true, isActive: true, departmentId: true } } },
        });
    }

    if (balance.item.departmentId !== scope.departmentId) {
        await prisma.item.update({
            where: { id: balance.itemId },
            data: { departmentId: scope.departmentId },
        });
    }

    balance = await prisma.stockBalance.update({
        where: {
            tenantId_itemId_locationId: {
                tenantId: scope.tenantId,
                itemId: balance.itemId,
                locationId: scope.locationId,
            },
        },
        data: { qtyOnHand: bookQty },
        include: { item: { select: { id: true, name: true, isActive: true, departmentId: true } } },
    });

    return {
        itemId: balance.itemId,
        itemName: balance.item.name,
        locationId: scope.locationId,
        bookQty: Number(balance.qtyOnHand),
    };
}

async function getBalance(tenantId, itemId, locationId) {
    const row = await prisma.stockBalance.findUnique({
        where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
        select: { qtyOnHand: true },
    });
    return row ? Number(row.qtyOnHand) : 0;
}

async function ledgerRowsForSession(sessionId) {
    return prisma.inventoryLedger.findMany({
        where: { referenceType: 'COUNT_SESSION', referenceId: sessionId },
        select: { id: true, qtyIn: true, qtyOut: true, balanceAfter: true, movementType: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    });
}

async function auditForSession(sessionId) {
    return prisma.auditLog.findMany({
        where: { entityType: 'STOCK_COUNT', entityId: sessionId },
        orderBy: { changedAt: 'asc' },
        select: { action: true, note: true, changedBy: true, changedAt: true },
    });
}

async function sessionRow(sessionId) {
    return prisma.stockCountSession.findUnique({
        where: { id: sessionId },
        include: { approvalRequest: { select: { accWorkflowVersionId: true, status: true } } },
    });
}

async function approvalStepsFor(sessionId) {
    const row = await prisma.stockCountSession.findUnique({
        where: { id: sessionId },
        select: {
            approvalRequestId: true,
            approvalRequest: {
                select: { status: true, steps: { select: { status: true } } },
            },
        },
    });
    return row;
}

async function fetchTimeline(auth, sessionId) {
    const res = await apiCall(auth, 'GET', `/constitution/timeline/INVENTORY_COUNT/${sessionId}`);
    if (!res.ok) throw new Error(`Timeline fetch failed: ${res.status} ${JSON.stringify(res.json)}`);
    const data = res.json.data ?? res.json;
    return Array.isArray(data.timelineEntries) ? data.timelineEntries : [];
}

async function createAndStart(auth, scope, notes) {
    const createRes = await apiCall(auth, 'POST', '/inventory-count/sessions', {
        departmentId: scope.departmentId,
        locationIds: scope.locationIds,
        blindMode: false,
        notes,
    });
    if (!createRes.ok) fail('create', `Create failed: ${createRes.status} ${JSON.stringify(createRes.json)}`);
    const sessionId = createRes.json.id;
    const startRes = await apiCall(auth, 'POST', `/inventory-count/sessions/${sessionId}/start`, {});
    if (!startRes.ok) fail('create', `Start failed: ${startRes.status}`);
    return { sessionId, startStatus: startRes.json.status };
}

async function enterCounts(ccAuth, sessionId, anchor, countedQty) {
    const cells = await prisma.stockCountLocationQty.findMany({
        where: { sessionId, roundNo: 1, itemId: anchor.itemId, locationId: anchor.locationId },
    });
    if (!cells.length) {
        throw new Error(`No count cell for item ${anchor.itemId} at location ${anchor.locationId}`);
    }
    const cell = cells[0];
    const upd = await apiCall(
        ccAuth,
        'PUT',
        `/inventory-count/sessions/${sessionId}/sheets/${cell.locationId}/items/${cell.itemId}`,
        { countedQty, roundNo: 1 },
    );
    if (!upd.ok) throw new Error(`Update qty failed: ${upd.status}`);
    const variance = countedQty - Number(cell.bookQty);
    return { bookQty: Number(cell.bookQty), countedQty, varianceQty: variance, cellId: cell.id };
}

async function fillAllCounts(ccAuth, sessionId) {
    const cells = await prisma.stockCountLocationQty.findMany({
        where: { sessionId, roundNo: 1 },
        select: { itemId: true, locationId: true, bookQty: true },
    });
    for (const cell of cells) {
        const qty = Number(cell.bookQty) || 0;
        const upd = await apiCall(
            ccAuth,
            'PUT',
            `/inventory-count/sessions/${sessionId}/sheets/${cell.locationId}/items/${cell.itemId}`,
            { countedQty: qty, roundNo: 1 },
        );
        if (!upd.ok) throw new Error(`Fill count failed: ${upd.status}`);
    }
    return cells.length;
}

async function submitApprovalOnly(ccAuth, sessionId) {
    const submitApproval = await apiCall(ccAuth, 'POST', `/inventory-count/sessions/${sessionId}/submit-approval`, {});
    if (!submitApproval.ok) {
        throw new Error(`Submit approval failed: ${submitApproval.status} ${JSON.stringify(submitApproval.json)}`);
    }
    return submitApproval.json;
}

async function submitCountsAndApproval(ccAuth, sessionId) {
    const submitCounts = await apiCall(ccAuth, 'POST', `/inventory-count/sessions/${sessionId}/submit-counts`, {});
    if (!submitCounts.ok) throw new Error(`Submit counts failed: ${submitCounts.status}`);
    return submitApprovalOnly(ccAuth, sessionId);
}

async function approveChain(deptAuth, finAuth, gmAuth, sessionId) {
    const dept = await apiCall(deptAuth, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    if (!dept.ok) throw new Error(`Dept approve failed: ${dept.status}`);
    const fin = await apiCall(finAuth, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    if (!fin.ok) throw new Error(`Finance approve failed: ${fin.status}`);
    const gm = await apiCall(gmAuth, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    if (!gm.ok) throw new Error(`GM approve failed: ${gm.status} ${JSON.stringify(gm.json)}`);
    return { dept: dept.json, finance: fin.json, gm: gm.json };
}

// ── Scenario 1: GM API posting with variance proof ─────────────────────────

async function scenarioPostingGmApi(scope, auths) {
    const SC = 'posting-gm-api';
    const anchor = await seedPostingAnchor(scope, 10);
    record(SC, 'ANCHOR', anchor);

    const balanceBefore = await getBalance(scope.tenantId, anchor.itemId, anchor.locationId);
    if (balanceBefore !== 10) fail(SC, `Expected balance 10 before session, got ${balanceBefore}`);

    const skAuth = auths.storekeeper;
    const { sessionId } = await createAndStart(skAuth, scope, 'v3 posting proof — variance -2');
    record(SC, 'SESSION_CREATED', { sessionId });

    await fillAllCounts(auths.costControl, sessionId);
    const counts = await enterCounts(auths.costControl, sessionId, anchor, 8);
    record(SC, 'VARIANCE_ENTERED', counts);
    if (counts.bookQty !== 10 || counts.countedQty !== 8 || counts.varianceQty !== -2) {
        fail(SC, `Unexpected variance: book=${counts.bookQty} counted=${counts.countedQty}`);
    }

    await submitCountsAndApproval(auths.costControl, sessionId);

    const ledgerBeforeGm = await ledgerRowsForSession(sessionId);
    const balanceMid = await getBalance(scope.tenantId, anchor.itemId, anchor.locationId);
    record(SC, 'BEFORE_GM', { ledgerCount: ledgerBeforeGm.length, stockBalance: balanceMid });
    if (ledgerBeforeGm.length !== 0) fail(SC, 'Ledger rows must be empty before GM approve');
    if (balanceMid !== 10) fail(SC, `Stock balance must remain 10 before GM, got ${balanceMid}`);

    // Dept + Finance approvals (no posting yet)
    const deptRes = await apiCall(auths.deptManager, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    if (!deptRes.ok) fail(SC, `Dept approve: ${deptRes.status}`);
    const finRes = await apiCall(auths.finance, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    if (!finRes.ok) fail(SC, `Finance approve: ${finRes.status}`);

    const ledgerPreGm = await ledgerRowsForSession(sessionId);
    if (ledgerPreGm.length !== 0) fail(SC, 'No ledger before GM final approve');

    // GM via real API — prove auth/permission/assignment/tenant
    record(SC, 'GM_LOGIN', {
        email: auths.gm.email,
        role: auths.gm.role,
        tenantId: auths.gm.tenantId,
        hasApprovePerm: auths.gm.permissions.includes('APPROVE_INVENTORY_COUNT'),
        userId: auths.gm.userId,
    });
    if (!auths.gm.permissions.includes('APPROVE_INVENTORY_COUNT')) {
        fail(SC, 'GM fixture missing APPROVE_INVENTORY_COUNT permission');
    }
    if (auths.gm.tenantId !== scope.tenantId) {
        fail(SC, `GM tenant scope mismatch: login=${auths.gm.tenantId} expected=${scope.tenantId}`);
    }

    const gmRes = await apiCall(auths.gm, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    if (!gmRes.ok) fail(SC, `GM approve via API failed: ${gmRes.status} ${JSON.stringify(gmRes.json)}`);
    record(SC, 'GM_APPROVE_API', { status: gmRes.json.status, postedAt: gmRes.json.postedAt });
    if (gmRes.json.status !== 'POSTED') fail(SC, `Expected POSTED, got ${gmRes.json.status}`);

    const ledgerAfter = await ledgerRowsForSession(sessionId);
    const balanceAfter = await getBalance(scope.tenantId, anchor.itemId, anchor.locationId);
    record(SC, 'AFTER_GM', { ledgerRows: ledgerAfter, stockBalance: balanceAfter });

    if (balanceAfter !== 8) fail(SC, `Stock balance must be 8 after GM, got ${balanceAfter}`);
    if (ledgerAfter.length !== 1) fail(SC, `Expected 1 ledger row, got ${ledgerAfter.length}`);
    if (Number(ledgerAfter[0].qtyOut) !== 2) fail(SC, `Expected qtyOut=2, got ${ledgerAfter[0].qtyOut}`);
    if (ledgerAfter[0].movementType !== 'COUNT_ADJUSTMENT') fail(SC, 'Expected COUNT_ADJUSTMENT');

    const dupGm = await apiCall(auths.gm, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    record(SC, 'DUPLICATE_GM_BLOCKED', { status: dupGm.status, errCode: dupGm.errCode });
    if (dupGm.ok) fail(SC, 'Duplicate GM approve must not succeed');

    const ledgerDup = await ledgerRowsForSession(sessionId);
    const balanceDup = await getBalance(scope.tenantId, anchor.itemId, anchor.locationId);
    if (ledgerDup.length !== 1) fail(SC, 'Duplicate approve must not create extra ledger rows');
    if (balanceDup !== 8) fail(SC, 'Duplicate approve must not change stock balance again');

    // Timeline projection — POSTED must show "Auto posted by DX", never GM/human actor,
    // and must not expose any pending/future approval placeholders.
    const timeline = await fetchTimeline(auths.gm, sessionId);
    const postingEntry = timeline.find((e) => e.entryType === 'POSTING');
    const futureSteps = timeline.filter(
        (e) => e.entryType === 'APPROVAL_STEP_FUTURE' || e.entryType === 'APPROVAL_STEP_CURRENT',
    );
    const gmUser = await prisma.user.findUnique({
        where: { id: auths.gm.userId },
        select: { firstName: true, lastName: true },
    });
    const gmActorName = `${gmUser?.firstName || ''} ${gmUser?.lastName || ''}`.trim();
    record(SC, 'POSTED_TIMELINE', {
        postingActor: postingEntry?.actor?.name || null,
        gmActorName,
        futurePlaceholders: futureSteps.length,
        entryTypes: timeline.map((e) => e.entryType),
    });
    if (postingEntry?.actor?.name && postingEntry.actor.name === gmActorName) {
        fail(SC, 'POSTED actor must not be the GM user');
    }
    if (!postingEntry) fail(SC, 'POSTED timeline missing POSTING entry');
    if (postingEntry.actor?.name !== 'Auto posted by DX') {
        fail(SC, `POSTED actor must be "Auto posted by DX", got "${postingEntry.actor?.name}"`);
    }
    if (futureSteps.length !== 0) fail(SC, 'POSTED timeline must not show pending/future steps');

    record(SC, 'PASS', { sessionId, anchor });
}

// ── Scenario 2–4: Cancel matrix ───────────────────────────────────────────────

async function scenarioCancelDraft(scope, auths) {
    const SC = 'cancel-draft';
    const createRes = await apiCall(auths.storekeeper, 'POST', '/inventory-count/sessions', {
        departmentId: scope.departmentId,
        locationIds: scope.locationIds,
        blindMode: false,
        notes: 'cancel draft test',
    });
    const sessionId = createRes.json.id;

    const noReason = await apiCall(auths.storekeeper, 'POST', `/inventory-count/sessions/${sessionId}/cancel`, {});
    record(SC, 'REASON_REQUIRED', { status: noReason.status, errCode: noReason.errCode });
    if (noReason.ok) fail(SC, 'Cancel without reason must fail');

    const cancel = await apiCall(auths.storekeeper, 'POST', `/inventory-count/sessions/${sessionId}/cancel`, {
        reason: 'Wrong department selected',
    });
    if (!cancel.ok) fail(SC, `Cancel draft failed: ${cancel.status}`);
    record(SC, 'VOID', { status: cancel.json.status });
    if (cancel.json.status !== 'VOID') fail(SC, 'Expected VOID');

    const audit = await auditForSession(sessionId);
    record(SC, 'AUDIT', { actions: audit.map((a) => a.action), notes: audit.map((a) => a.note) });
    if (!audit.some((a) => a.action === 'CANCEL')) fail(SC, 'Missing CANCEL audit action');
    if (!audit.some((a) => a.note?.includes('INVENTORY_COUNT_CANCELLED'))) {
        fail(SC, 'Missing cancel audit note');
    }
}

async function scenarioCancelCounting(scope, auths) {
    const SC = 'cancel-counting';
    const { sessionId } = await createAndStart(auths.storekeeper, scope, 'cancel counting test');

    const before = await sessionRow(sessionId);
    record(SC, 'BEFORE', { status: before.status });

    const cancel = await apiCall(auths.storekeeper, 'POST', `/inventory-count/sessions/${sessionId}/cancel`, {
        reason: 'Aborted mid-count',
    });
    if (!cancel.ok) fail(SC, `Cancel counting failed: ${cancel.status}`);
    record(SC, 'VOID', { status: cancel.json.status, sessionId });
    const row = await sessionRow(sessionId);
    if (row.status !== 'VOID') fail(SC, `DB status must be VOID, got ${row.status}`);

    // Audit CANCEL persisted in DB (before/after values).
    const audit = await auditForSession(sessionId);
    const cancelAudits = audit.filter((a) => a.action === 'CANCEL');
    record(SC, 'AUDIT_ACTION', {
        beforeStatus: before.status,
        afterStatus: row.status,
        cancelAuditCount: cancelAudits.length,
        actions: audit.map((a) => a.action),
    });
    if (cancelAudits.length !== 1) fail(SC, `Expected exactly 1 CANCEL audit, got ${cancelAudits.length}`);

    // Approval closure per contract: only when an approvalRequest existed.
    const appr = await approvalStepsFor(sessionId);
    if (appr.approvalRequestId) {
        if (appr.approvalRequest?.status !== 'CANCELLED') {
            fail(SC, `ApprovalRequest must be CANCELLED, got ${appr.approvalRequest?.status}`);
        }
        const openSteps = (appr.approvalRequest.steps || []).filter((s) => s.status !== 'CANCELLED');
        if (openSteps.length !== 0) fail(SC, 'All approval steps must be CANCELLED after void');
        record(SC, 'APPROVAL_CLOSED', { requestStatus: appr.approvalRequest.status });
    } else {
        record(SC, 'APPROVAL_CLOSED', { note: 'No approvalRequest in DRAFT/COUNTING (expected by contract)' });
    }

    // VOID timeline: "Cancelled — By [Actor]", no pending/future placeholders.
    const timeline = await fetchTimeline(auths.storekeeper, sessionId);
    const cancelEntry = timeline.find((e) => e.lifecycleEventType === 'CANCEL');
    const future = timeline.filter(
        (e) => e.entryType === 'APPROVAL_STEP_FUTURE' || e.entryType === 'APPROVAL_STEP_CURRENT',
    );
    record(SC, 'VOID_TIMELINE', {
        cancelActor: cancelEntry?.actor?.name || null,
        displayTitleKey: cancelEntry?.displayTitleKey || null,
        futurePlaceholders: future.length,
        entryTypes: timeline.map((e) => e.entryType),
    });
    if (!cancelEntry) fail(SC, 'VOID timeline missing Cancelled lifecycle entry');
    if (cancelEntry.displayTitleKey !== 'TIMELINE.LIFECYCLE.CANCEL') {
        fail(SC, `Cancel entry must map to TIMELINE.LIFECYCLE.CANCEL, got ${cancelEntry.displayTitleKey}`);
    }
    if (!cancelEntry.actor?.name) fail(SC, 'Cancel entry must carry the real actor');
    if (future.length !== 0) fail(SC, 'VOID timeline must not show pending/future steps');
}

async function scenarioDoubleAndConcurrentCancel(scope, auths) {
    const SC = 'cancel-double-concurrent';

    // Sequential double cancel — second must be blocked as ALREADY_VOID.
    const seq = await createAndStart(auths.storekeeper, scope, 'sequential double cancel');
    const first = await apiCall(auths.storekeeper, 'POST', `/inventory-count/sessions/${seq.sessionId}/cancel`, {
        reason: 'First cancel wins',
    });
    if (!first.ok) fail(SC, `First cancel must succeed: ${first.status}`);
    const second = await apiCall(auths.storekeeper, 'POST', `/inventory-count/sessions/${seq.sessionId}/cancel`, {
        reason: 'Second cancel should fail',
    });
    record(SC, 'SEQUENTIAL', {
        first: first.json.status,
        secondStatus: second.status,
        secondErr: second.errCode,
    });
    if (second.ok) fail(SC, 'Second sequential cancel must be blocked');
    if (second.status !== 409) fail(SC, `Second cancel must be 409, got ${second.status}`);
    const seqAudit = (await auditForSession(seq.sessionId)).filter((a) => a.action === 'CANCEL');
    if (seqAudit.length !== 1) fail(SC, `Sequential double cancel must record exactly 1 CANCEL, got ${seqAudit.length}`);

    // Concurrent cancel — fire two simultaneous requests; exactly one wins.
    const con = await createAndStart(auths.storekeeper, scope, 'concurrent double cancel');
    const [a, b] = await Promise.all([
        apiCall(auths.storekeeper, 'POST', `/inventory-count/sessions/${con.sessionId}/cancel`, { reason: 'Racer A' }),
        apiCall(auths.storekeeper, 'POST', `/inventory-count/sessions/${con.sessionId}/cancel`, { reason: 'Racer B' }),
    ]);
    const okCount = [a, b].filter((r) => r.ok).length;
    const conflictCount = [a, b].filter((r) => !r.ok && r.status === 409).length;
    const conRow = await sessionRow(con.sessionId);
    const conAudit = (await auditForSession(con.sessionId)).filter((x) => x.action === 'CANCEL');
    record(SC, 'CONCURRENT', {
        okCount,
        conflictCount,
        finalStatus: conRow.status,
        cancelAuditCount: conAudit.length,
        statuses: [a.status, b.status],
    });
    if (okCount !== 1) fail(SC, `Exactly one concurrent cancel must succeed, got ${okCount}`);
    if (conflictCount !== 1) fail(SC, `Exactly one concurrent cancel must conflict (409), got ${conflictCount}`);
    if (conRow.status !== 'VOID') fail(SC, `Concurrent cancel final status must be VOID, got ${conRow.status}`);
    if (conAudit.length !== 1) fail(SC, `Concurrent cancel must record exactly 1 CANCEL audit, got ${conAudit.length}`);
}

async function scenarioCancelBlockedAfterSubmit(scope, auths) {
    const SC = 'cancel-blocked-after-submit';
    const { sessionId } = await createAndStart(auths.storekeeper, scope, 'cancel blocked test');
    await fillAllCounts(auths.costControl, sessionId);
    await submitCountsAndApproval(auths.costControl, sessionId);

    const blocked = await apiCall(auths.storekeeper, 'POST', `/inventory-count/sessions/${sessionId}/cancel`, {
        reason: 'Too late',
    });
    record(SC, 'BLOCKED', { status: blocked.status, errCode: blocked.errCode });
    if (blocked.ok) fail(SC, 'Cancel after submit must be blocked');

    const row = await sessionRow(sessionId);
    if (row.status === 'VOID') fail(SC, 'Session must not be void');
    record(SC, 'STATUS', { status: row.status });
}

// ── Scenario 5: Send Back chain + resubmit + version pin ─────────────────────

async function scenarioSendBackResubmit(scope, auths) {
    const SC = 'send-back-resubmit';
    const { sessionId } = await createAndStart(auths.storekeeper, scope, 'send-back chain test');
    await fillAllCounts(auths.costControl, sessionId);
    const firstSubmit = await submitCountsAndApproval(auths.costControl, sessionId);
    const pinnedVersion = (
        await prisma.stockCountSession.findUnique({
            where: { id: sessionId },
            include: { approvalRequest: { select: { accWorkflowVersionId: true } } },
        })
    )?.approvalRequest?.accWorkflowVersionId;
    record(SC, 'INITIAL_SUBMIT', { status: firstSubmit.status, pinnedVersion });

    const ledger0 = await ledgerRowsForSession(sessionId);
    if (ledger0.length !== 0) fail(SC, 'No ledger at PENDING_DEPT');

    // Dept → Cost Control (operational send back)
    const deptBackNoReason = await apiCall(auths.deptManager, 'POST', `/inventory-count/sessions/${sessionId}/send-back`, {});
    record(SC, 'DEPT_BACK_REASON_REQUIRED', { status: deptBackNoReason.status });
    if (deptBackNoReason.ok) fail(SC, 'Dept send back without reason must fail');

    const deptBack = await apiCall(auths.deptManager, 'POST', `/inventory-count/sessions/${sessionId}/send-back`, {
        reason: 'Recount variances in dry store',
    });
    if (!deptBack.ok) fail(SC, `Dept send back failed: ${deptBack.status}`);
    record(SC, 'DEPT_SEND_BACK', { status: deptBack.json.status });
    if (deptBack.json.status !== 'REVEAL_REVIEW') fail(SC, 'Dept send back must return REVEAL_REVIEW');

    const ledger1 = await ledgerRowsForSession(sessionId);
    if (ledger1.length !== 0) fail(SC, 'No ledger after dept send back');

    // Resubmit — same accWorkflowVersionId (REVEAL_REVIEW → submit-approval only)
    const resubmit = await submitApprovalOnly(auths.costControl, sessionId);
    const rowAfterResubmit = await sessionRow(sessionId);
    record(SC, 'RESUBMIT', {
        status: resubmit.status,
        accWorkflowVersionId: rowAfterResubmit?.approvalRequest?.accWorkflowVersionId,
    });
    if (resubmit.status !== 'PENDING_DEPT') fail(SC, 'Resubmit must land PENDING_DEPT');
    if (rowAfterResubmit?.approvalRequest?.accWorkflowVersionId !== pinnedVersion) {
        fail(SC, 'accWorkflowVersionId must be preserved on resubmit');
    }

    // Dept approve → PENDING_FINANCE
    const deptApprove = await apiCall(auths.deptManager, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    if (!deptApprove.ok) fail(SC, 'Dept approve after resubmit failed');
    record(SC, 'AT_PENDING_FINANCE', { status: deptApprove.json.status });

    // Finance send back → Dept (from PENDING_FINANCE)
    const finBack = await apiCall(auths.finance, 'POST', `/inventory-count/sessions/${sessionId}/send-back`, {
        reason: 'Department sign-off required again',
    });
    if (!finBack.ok) fail(SC, `Finance send back failed: ${finBack.status}`);
    record(SC, 'FINANCE_SEND_BACK', { status: finBack.json.status });
    if (finBack.json.status !== 'PENDING_DEPT') fail(SC, 'Finance send back must return PENDING_DEPT');

    const ledger2 = await ledgerRowsForSession(sessionId);
    if (ledger2.length !== 0) fail(SC, 'No ledger after finance send back');

    // Re-approve to PENDING_GM
    await apiCall(auths.deptManager, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    const finApprove = await apiCall(auths.finance, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    if (!finApprove.ok) fail(SC, 'Finance approve failed');
    record(SC, 'AT_PENDING_GM', { status: finApprove.json.status });

    // GM send back → Finance
    const gmBack = await apiCall(auths.gm, 'POST', `/inventory-count/sessions/${sessionId}/send-back`, {
        reason: 'Finance review incomplete',
    });
    if (!gmBack.ok) fail(SC, `GM send back failed: ${gmBack.status}`);
    record(SC, 'GM_SEND_BACK', { status: gmBack.json.status });
    if (gmBack.json.status !== 'PENDING_FINANCE') fail(SC, 'GM send back must return PENDING_FINANCE');

    const ledger3 = await ledgerRowsForSession(sessionId);
    if (ledger3.length !== 0) fail(SC, 'No ledger after GM send back');

    const audit = await auditForSession(sessionId);
    const actions = audit.map((a) => a.action);
    record(SC, 'AUDIT_TRAIL', { actions });
    for (const expected of ['CREATE', 'SEND_BACK']) {
        if (!actions.includes(expected)) fail(SC, `Missing audit action: ${expected}`);
    }
    if (!audit.some((a) => a.note?.includes('INVENTORY_COUNT_CANCELLED') || a.note?.includes('[Send Back]'))) {
        record(SC, 'AUDIT_NOTES_OK', { sample: audit.map((a) => a.note).filter(Boolean).slice(-3) });
    }

    const finalRow = await sessionRow(sessionId);
    record(SC, 'FINAL_STATE', { status: finalRow.status, versionPin: finalRow.approvalRequest?.accWorkflowVersionId });
    if (finalRow.status !== 'PENDING_FINANCE') fail(SC, 'Expected PENDING_FINANCE at end');
}

// ── Scenario 6: Receiving create/prepare only ─────────────────────────────────

async function scenarioReceivingRestrictions(scope, auths) {
    const SC = 'receiving-create';
    const rcv = auths.receiving;
    record(SC, 'LOGIN', { email: rcv.email, role: rcv.role, permissions: rcv.permissions });

    const createRes = await apiCall(rcv, 'POST', '/inventory-count/sessions', {
        departmentId: scope.departmentId,
        locationIds: scope.locationIds,
        blindMode: false,
        notes: 'receiving integration — prepare only',
    });
    if (!createRes.ok) fail(SC, `Receiving create failed: ${createRes.status}`);
    const sessionId = createRes.json.id;
    record(SC, 'CREATE_OK', { sessionId, status: createRes.json.status });

    const startRes = await apiCall(rcv, 'POST', `/inventory-count/sessions/${sessionId}/start`, {});
    if (!startRes.ok) fail(SC, `Receiving start failed: ${startRes.status}`);
    record(SC, 'START_OK', { status: startRes.json.status });

    const submitApproval = await apiCall(rcv, 'POST', `/inventory-count/sessions/${sessionId}/submit-approval`, {});
    record(SC, 'SUBMIT_APPROVAL_BLOCKED', { status: submitApproval.status, errCode: submitApproval.errCode });
    if (submitApproval.ok) fail(SC, 'Receiving must not submit for approval');

    const approve = await apiCall(rcv, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    record(SC, 'APPROVE_BLOCKED', { status: approve.status, errCode: approve.errCode });
    if (approve.ok) fail(SC, 'Receiving must not approve');

    // Storekeeper same restrictions on submit/approve
    const skSubmit = await apiCall(auths.storekeeper, 'POST', `/inventory-count/sessions/${sessionId}/submit-approval`, {});
    record(SC, 'STOREKEEPER_SUBMIT_BLOCKED', { status: skSubmit.status, errCode: skSubmit.errCode });
    if (skSubmit.ok) fail(SC, 'Storekeeper must not submit for approval');

    const skApprove = await apiCall(auths.storekeeper, 'POST', `/inventory-count/sessions/${sessionId}/approve`, {});
    record(SC, 'STOREKEEPER_APPROVE_BLOCKED', { status: skApprove.status, errCode: skApprove.errCode });
    if (skApprove.ok) fail(SC, 'Storekeeper must not approve');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const scope = await resolveScope();
    record('bootstrap', 'SCOPE', scope);

    const auths = {};
    for (const [key, u] of Object.entries(USERS)) {
        auths[key] = await apiLogin(u.email);
        record('bootstrap', `LOGIN_${key.toUpperCase()}`, {
            email: u.email,
            role: auths[key].role,
            userId: auths[key].userId,
            tenantId: auths[key].tenantId,
        });
    }

    await scenarioPostingGmApi(scope, auths);
    await scenarioCancelDraft(scope, auths);
    await scenarioCancelCounting(scope, auths);
    await scenarioDoubleAndConcurrentCancel(scope, auths);
    await scenarioCancelBlockedAfterSubmit(scope, auths);
    await scenarioSendBackResubmit(scope, auths);
    await scenarioReceivingRestrictions(scope, auths);

    evidence.finishedAt = new Date().toISOString();
    evidence.ok = true;
    evidence.verdict = 'Backend Runtime Complete / Manual Browser UAT Pending';
    evidence.playwright = 'NOT_REQUIRED_NOW';

    console.log('\n=== INVENTORY COUNT v3 BACKEND RUNTIME EVIDENCE ===\n');
    console.log(JSON.stringify(evidence, null, 2));

    const outPath =
        process.env.OSE_EVIDENCE_OUT ||
        path.join(__dirname, '../governance-evidence-archive/inventory-count-v3/backend-runtime-evidence.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

main()
    .catch((err) => {
        evidence.ok = false;
        evidence.verdict = 'FAILED';
        evidence.errors.push(String(err?.message || err));
        console.error(err);
        console.log(JSON.stringify(evidence, null, 2));
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
