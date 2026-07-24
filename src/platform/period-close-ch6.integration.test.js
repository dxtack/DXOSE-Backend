'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

describe('Ch6 period close integration (static/code review evidence)', () => {
    it('close service preserves snapshots on re-close (no deleteMany)', () => {
        const src = fs.readFileSync(path.join(root, 'src/services/periodClose.service.js'), 'utf8');
        assert.ok(!src.includes('deleteMany'), 'must not delete snapshot versions');
        assert.ok(src.includes('SUPERSEDED'), 'must supersede prior snapshot versions');
        assert.ok(src.includes('assertCloseBlockersZero'), 'close requires blockers=0');
    });

    it('reopen requires reason', () => {
        const src = fs.readFileSync(path.join(root, 'src/services/periodClose.service.js'), 'utf8');
        assert.ok(src.includes('PERIOD_REOPEN_REASON_REQUIRED'), 'reopen reason gate exists');
    });

    it('resolution workspace routes are ACC-gated', () => {
        const routes = fs.readFileSync(path.join(root, 'src/routes/periodClose.routes.js'), 'utf8');
        assert.ok(routes.includes('PERIOD_CLOSE_DOCUMENT_POST'), 'post resolution permission');
        assert.ok(routes.includes('PERIOD_CLOSE_DOCUMENT_DELETE'), 'delete resolution permission');
        assert.ok(routes.includes('PERIOD_CLOSE_GET_PASS_CARRY_FORWARD'), 'carry forward permission');
        assert.ok(routes.includes('/resolution'), 'resolution endpoints registered');
    });

    it('all governed posting engines set postingDate fields', () => {
        for (const file of [
            'src/services/postingGovernedGrn.service.js',
            'src/services/postingGovernedTransfer.service.js',
            'src/services/postingGovernedMovement.service.js',
            'src/services/postingGovernedGetPass.service.js',
        ]) {
            const src = fs.readFileSync(path.join(root, file), 'utf8');
            assert.ok(src.includes('assignedPostingPeriod'), `${file} sets assignedPostingPeriod`);
            assert.ok(src.includes('postingDate'), `${file} sets postingDate`);
        }
        const posting = fs.readFileSync(path.join(root, 'src/services/posting.service.js'), 'utf8');
        assert.ok(posting.includes('withLedgerPostingFields'), 'posting.service uses ledger posting helper');
    });

    it('posting and close boundaries resolve canonical tenant timezone', () => {
        for (const file of [
            'src/services/periodGuard.service.js',
            'src/services/periodCloseGovernance.service.js',
            'src/services/periodCloseResolution.service.js',
            'src/platform/periodResolution.service.js',
            'src/platform/periodLedgerSnapshot.service.js',
            'src/services/periodOpeningContinuity.service.js',
        ]) {
            const src = fs.readFileSync(path.join(root, file), 'utf8');
            assert.ok(src.includes('getTenantTimezone'), `${file} loads Tenant.timezone`);
        }
        for (const file of [
            'src/services/postingGovernedGrn.service.js',
            'src/services/postingGovernedTransfer.service.js',
            'src/services/postingGovernedMovement.service.js',
            'src/services/postingGovernedGetPass.service.js',
        ]) {
            const src = fs.readFileSync(path.join(root, file), 'utf8');
            assert.ok(src.includes('getTenantTimezone'), `${file} loads Tenant.timezone`);
            assert.ok(src.includes(', tx'), `${file} prefers its transaction client`);
        }
    });

    it('auth and scheduler expose tenant timezone context', () => {
        const auth = fs.readFileSync(path.join(root, 'src/services/auth.service.js'), 'utf8');
        const middleware = fs.readFileSync(path.join(root, 'src/middleware/authenticate.js'), 'utf8');
        const scheduler = fs.readFileSync(path.join(root, 'src/utils/scheduler.js'), 'utf8');
        assert.ok(auth.includes('tenantTimezone'), 'login/switch session exposes tenant timezone');
        assert.ok(auth.includes('timezone: true'), 'me/switch tenant selects canonical timezone');
        assert.ok(middleware.includes('tenantTimezone'), 'request context carries tenant timezone');
        assert.ok(scheduler.includes("'*/5 * * * *'"), 'scheduler polls tenant-local due times');
    });

    it('report service wires snapshotVersionId', () => {
        const src = fs.readFileSync(path.join(root, 'src/services/report.service.js'), 'utf8');
        assert.ok(src.includes('resolveSnapshotVersionForReport'), 'snapshot resolver exists');
        assert.ok(src.includes('snapshotVersionId'), 'generated report persists snapshotVersionId');
    });

    it('auto close cron uses periodAutoClose.service', () => {
        const src = fs.readFileSync(path.join(root, 'src/utils/scheduler.js'), 'utf8');
        assert.ok(src.includes('periodAutoClose.service'), 'scheduler wires auto close service');
    });
});
