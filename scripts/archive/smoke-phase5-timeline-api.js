#!/usr/bin/env node
'use strict';

/**
 * Phase 5 — API smoke for Transfer/Breakage/Lost timelineEntries.
 * Run: node scripts/smoke-phase5-timeline-api.js
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
    '../governance-evidence-archive/timeline-remediation/backfill-reports/PHASE5_TIMELINE_FIXTURES.json',
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

async function getTimeline(token, moduleKey, documentId) {
    const res = await fetch(`${API}/constitution/timeline/${moduleKey}/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!json?.success) throw new Error(`Timeline failed ${moduleKey}: ${JSON.stringify(json)}`);
    return json.data;
}

function checkFixture(label, payload) {
    const entries = payload.timelineEntries || [];
    const failed = [];
    const pass = (name, ok) => {
        console.log(ok ? 'PASS' : 'FAIL', `[${label}]`, name);
        if (!ok) failed.push(name);
    };

    pass('timelineEntries array', Array.isArray(entries));
    pass('timelineEntries count > 0', entries.length > 0);
    pass('legacy workflowSlots present', Array.isArray(payload.workflowSlots));
    pass('legacy auditEvents present', Array.isArray(payload.auditEvents));
    pass('globalOrder monotonic', entries.every((e, i) => i === 0 || e.globalOrder > entries[i - 1].globalOrder));
    pass('completed past-tense keys', entries.filter((e) => e.entryType === 'APPROVAL_STEP_COMPLETED').every((e) => e.displayTitleKey.endsWith('_COMPLETED')));
    pass('current action keys', entries.filter((e) => e.entryType === 'APPROVAL_STEP_CURRENT').every((e) => e.displayTitleKey.endsWith('_APPROVAL')));
    pass('single REJECT max', entries.filter((e) => e.lifecycleEventType === 'REJECT').length <= 1);

    if (label.includes('rejected')) {
        pass('has REJECT lifecycle', entries.some((e) => e.lifecycleEventType === 'REJECT'));
        pass('no future after reject', entries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length === 0);
        pass('no pending after reject', entries.filter((e) => e.status === 'PENDING').length === 0);
    }

    return failed;
}

async function main() {
    if (!fs.existsSync(FIXTURE_REPORT)) {
        console.error('Run seed-phase5-timeline-fixtures.js first');
        process.exit(1);
    }
    const report = JSON.parse(fs.readFileSync(FIXTURE_REPORT, 'utf8'));
    const token = await login();
    let totalFailed = 0;

    for (const fixture of report.fixtures || []) {
        const payload = await getTimeline(token, fixture.moduleKey, fixture.documentId);
        const failed = checkFixture(fixture.scenario, payload);
        totalFailed += failed.length;
    }

    process.exit(totalFailed ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
