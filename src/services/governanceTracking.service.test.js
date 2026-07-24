const test = require('node:test');
const assert = require('node:assert/strict');

const prisma = require('../config/database');
const settingService = require('./setting.service');
const { getGovernanceTrackingContext } = require('./governanceTracking.service');

const originalGetObStatus = settingService.getObStatus;
const originalPeriodCloseCount = prisma.periodClose.count;
const originalLedgerCount = prisma.inventoryLedger.count;
const originalMovementCount = prisma.movementDocument.count;

test('getGovernanceTrackingContext: inactive for INITIAL_LOCK with no activity', async () => {
    settingService.getObStatus = async () => 'INITIAL_LOCK';
    prisma.periodClose.count = async () => 0;
    prisma.inventoryLedger.count = async () => 0;
    prisma.movementDocument.count = async () => 0;

    const ctx = await getGovernanceTrackingContext('tenant-1');
    assert.equal(ctx.governanceTrackingActive, false);
    assert.equal(ctx.obStatus, 'INITIAL_LOCK');
});

test('getGovernanceTrackingContext: active when OB finalized', async () => {
    settingService.getObStatus = async () => 'FINALIZED';
    prisma.periodClose.count = async () => 0;
    prisma.inventoryLedger.count = async () => 0;
    prisma.movementDocument.count = async () => 0;

    const ctx = await getGovernanceTrackingContext('tenant-1');
    assert.equal(ctx.governanceTrackingActive, true);
    assert.equal(ctx.signals.obFinalized, true);
});

test('getGovernanceTrackingContext: active when posted ledger exists', async () => {
    settingService.getObStatus = async () => 'INITIAL_LOCK';
    prisma.periodClose.count = async () => 0;
    prisma.inventoryLedger.count = async () => 3;
    prisma.movementDocument.count = async () => 0;

    const ctx = await getGovernanceTrackingContext('tenant-1');
    assert.equal(ctx.governanceTrackingActive, true);
    assert.equal(ctx.signals.hasPostedActivity, true);
});

test.after(() => {
    settingService.getObStatus = originalGetObStatus;
    prisma.periodClose.count = originalPeriodCloseCount;
    prisma.inventoryLedger.count = originalLedgerCount;
    prisma.movementDocument.count = originalMovementCount;
});
