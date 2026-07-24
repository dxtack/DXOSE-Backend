#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — HTTP smoke: GET /constitution/timeline/GRN/:id returns timelineEntries.
 * Usage: node scripts/smoke-grn-detail-timeline-api.js [grnId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');

const API = process.env.OSE_API_URL || 'http://127.0.0.1:4000/api';
const EMAIL = process.env.UAT_EMAIL || 'admin@grandhorizon.com';
const PASSWORD = process.env.UAT_PASSWORD || 'Admin@123';
const TENANT = process.env.UAT_TENANT || 'grand-horizon';

const FIXTURE_REPORT = path.join(
    __dirname,
    '../governance-evidence-archive/timeline-remediation/backfill-reports/PHASE4_GRN_FIXTURES.json',
);

async function login() {
    const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD, tenantSlug: TENANT }),
    });
    const json = await res.json();
    if (!json?.success || !json.data?.accessToken) {
        throw new Error(`Login failed: ${JSON.stringify(json)}`);
    }
    return json.data.accessToken;
}

async function getTimeline(token, grnId) {
    const res = await fetch(`${API}/constitution/timeline/GRN/${grnId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!json?.success) throw new Error(`Timeline failed: ${JSON.stringify(json)}`);
    return json.data;
}

async function main() {
    let grnId = process.argv[2];
    if (!grnId && fs.existsSync(FIXTURE_REPORT)) {
        const fixtures = JSON.parse(fs.readFileSync(FIXTURE_REPORT, 'utf8'));
        grnId = fixtures.fixtures?.find((f) => f.scenario === 'three_send_back_cycle_4_active')?.grnId;
    }
    if (!grnId) {
        console.error('Usage: node scripts/smoke-grn-detail-timeline-api.js <grnId>');
        console.error('Or run seed-grn-phase4-timeline-fixtures.js first.');
        process.exit(1);
    }

    const token = await login();
    const payload = await getTimeline(token, grnId);
    const entries = payload.timelineEntries || [];

    const checks = [
        ['timelineEntries array present', Array.isArray(payload.timelineEntries)],
        ['timelineEntries count = 15', entries.length === 15],
        ['legacy workflowSlots present', Array.isArray(payload.workflowSlots)],
        ['legacy auditEvents present', Array.isArray(payload.auditEvents)],
        ['globalOrder monotonic', entries.every((e, i) => i === 0 || e.globalOrder > entries[i - 1].globalOrder)],
        ['3 SEND_BACK', entries.filter((e) => e.lifecycleEventType === 'SEND_BACK').length === 3],
        ['3 RESUBMIT', entries.filter((e) => e.lifecycleEventType === 'RESUBMIT').length === 3],
        ['3 FINANCE completed', entries.filter((e) => e.entryType === 'APPROVAL_STEP_COMPLETED' && e.stageKey === 'FINANCE').length === 3],
        ['3 COST_CONTROL completed', entries.filter((e) => e.entryType === 'APPROVAL_STEP_COMPLETED' && e.stageKey === 'COST_CONTROL').length === 3],
        ['1 CURRENT step', entries.filter((e) => e.entryType === 'APPROVAL_STEP_CURRENT').length === 1],
        ['1 FUTURE step', entries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length === 1],
    ];

    let failed = 0;
    for (const [label, ok] of checks) {
        console.log(ok ? 'PASS' : 'FAIL', label);
        if (!ok) failed += 1;
    }

    console.log('\nSample entries:', entries.length);
    console.log(JSON.stringify(entries.slice(0, 5).map((e) => ({
        globalOrder: e.globalOrder,
        entryType: e.entryType,
        cycleNumber: e.cycleNumber,
        displayTitleKey: e.displayTitleKey,
        status: e.status,
    })), null, 2));

    process.exit(failed ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
