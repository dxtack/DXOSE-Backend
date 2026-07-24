'use strict';

/**
 * Production path: Breakage submit + Lost create must keep approvalRequest.currentStep
 * aligned with the first PENDING step — no fixture DB correction.
 *
 * Run: node --test scripts/movement-submit-current-step.test.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const breakageService = require('../src/services/breakage.service');
const lostItemsService = require('../src/services/lostItems.service');
const { describeApprovalStepState } = require('../src/platform/movementApprovalAction.guard');
const { FIXTURE_TAG, resolvePhase5Actors, findStockLine } = require('./lib/phase5-timeline-fixture.helpers');

const prisma = new PrismaClient();

async function tenantId() {
    const t = await prisma.tenant.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    return t?.id ?? null;
}

function assertStepInvariant(approval, label) {
    const { currentStep, pendingStep, stepStatuses } = describeApprovalStepState(approval);
    assert.ok(pendingStep, `${label}: expected a PENDING step`);
    assert.equal(
        currentStep,
        pendingStep.stepNumber,
        `${label}: currentStep must point to first PENDING (got ${currentStep}, pending ${pendingStep.stepNumber})`,
    );
    const step1 = stepStatuses.find((s) => s.stepNumber === 1);
    assert.equal(step1?.status, 'APPROVED', `${label}: step 1 must be APPROVED`);
    return { currentStep, pendingStep, stepStatuses };
}

function linePayload(stock) {
    return {
        itemId: stock.itemId,
        locationId: stock.locationId,
        qty: 1,
        unitCost: stock.unitCost || 1,
        totalValue: stock.totalValue || 1,
        notes: `${FIXTURE_TAG}_current_step`,
    };
}

test('Breakage: after create (DRAFT) approvalRequest.currentStep = first PENDING', async () => {
    const tid = await tenantId();
    assert.ok(tid);
    const actors = await resolvePhase5Actors(prisma, tid);
    assert.ok(actors);
    const stock = await findStockLine(prisma, tid, 1);
    assert.ok(stock);

    const created = await breakageService.createBreakage(
        {
            reason: `${FIXTURE_TAG} submit invariant create`,
            suggestedAction: 'HOTEL',
            lines: [linePayload(stock)],
            notes: `${FIXTURE_TAG}_submit_create`,
        },
        tid,
        actors.creator,
    );
    assert.equal(created.status, 'DRAFT');
    assertStepInvariant(created.approvalRequests, 'breakage create');
});

test('Breakage: submit sets currentStep to first PENDING (no fixture sync)', async () => {
    const tid = await tenantId();
    assert.ok(tid);
    const actors = await resolvePhase5Actors(prisma, tid);
    assert.ok(actors);
    const stock = await findStockLine(prisma, tid, 1);
    assert.ok(stock);

    const created = await breakageService.createBreakage(
        {
            reason: `${FIXTURE_TAG} submit invariant`,
            suggestedAction: 'HOTEL',
            lines: [linePayload(stock)],
            notes: `${FIXTURE_TAG}_submit`,
        },
        tid,
        actors.creator,
    );
    const submitted = await breakageService.submitBreakage(
        created.id,
        tid,
        actors.creator,
        created.concurrencyVersion,
    );
    assert.equal(submitted.status, 'DEPT_APPROVED');
    const { pendingStep } = assertStepInvariant(submitted.approvalRequests, 'breakage submit');
    assert.equal(pendingStep.stepNumber, 2, 'Cost Control should be next after DEPT auto-approve');
});

test('Breakage: Cost Control approve succeeds after submit without DB patch', async () => {
    const tid = await tenantId();
    assert.ok(tid);
    const actors = await resolvePhase5Actors(prisma, tid);
    assert.ok(actors);
    const stock = await findStockLine(prisma, tid, 1);
    assert.ok(stock);

    const created = await breakageService.createBreakage(
        {
            reason: `${FIXTURE_TAG} submit cost approve`,
            suggestedAction: 'HOTEL',
            lines: [linePayload(stock)],
            notes: `${FIXTURE_TAG}_submit_cost`,
        },
        tid,
        actors.creator,
    );
    const submitted = await breakageService.submitBreakage(
        created.id,
        tid,
        actors.creator,
        created.concurrencyVersion,
    );
    const updated = await breakageService.processApprovalStep(
        created.id,
        tid,
        actors.costUser,
        'APPROVE',
        'Production path cost OK',
        null,
        submitted.concurrencyVersion,
    );
    assert.equal(updated.status, 'COST_CONTROL_APPROVED');
    assert.equal(updated.approvalRequests?.currentStep, 3);
});

test('Breakage: completed step 1 stays APPROVED; currentStep is not 1 after submit', async () => {
    const tid = await tenantId();
    assert.ok(tid);
    const actors = await resolvePhase5Actors(prisma, tid);
    assert.ok(actors);
    const stock = await findStockLine(prisma, tid, 1);
    assert.ok(stock);

    const created = await breakageService.createBreakage(
        {
            reason: `${FIXTURE_TAG} submit step1 locked`,
            suggestedAction: 'HOTEL',
            lines: [linePayload(stock)],
            notes: `${FIXTURE_TAG}_submit_step1`,
        },
        tid,
        actors.creator,
    );
    const submitted = await breakageService.submitBreakage(
        created.id,
        tid,
        actors.creator,
        created.concurrencyVersion,
    );
    const step1 = submitted.approvalRequests?.steps?.find((s) => s.stepNumber === 1);
    assert.equal(step1?.status, 'APPROVED');
    assert.notEqual(submitted.approvalRequests?.currentStep, 1);
    const { assertMovementApprovalActionAllowed } = require('../src/platform/movementApprovalAction.guard');
    assert.throws(
        () =>
            assertMovementApprovalActionAllowed({
                moduleKey: 'BREAKAGE',
                documentStatus: submitted.status,
                approvalRequest: { ...submitted.approvalRequests, currentStep: 1 },
                action: 'APPROVE',
                currentStep: step1,
            }),
        (e) => e.code === 'APPROVAL_STEP_NOT_PENDING',
    );
});

test('Lost: create sets currentStep to first PENDING (no submit)', async () => {
    const tid = await tenantId();
    assert.ok(tid);
    const actors = await resolvePhase5Actors(prisma, tid);
    assert.ok(actors);
    const stock = await findStockLine(prisma, tid, 1);
    assert.ok(stock);

    const created = await lostItemsService.createLost(tid, actors.creator, {
        reason: `${FIXTURE_TAG} lost create invariant`,
        suggestedAction: 'HOTEL',
        lines: [linePayload(stock)],
        notes: `${FIXTURE_TAG}_lost_create`,
    });
    assert.equal(created.status, 'DEPT_APPROVED');
    const { pendingStep } = assertStepInvariant(created.approvalRequests, 'lost create');
    assert.equal(pendingStep.stepNumber, 2);
});

test('Lost: Cost Control approve succeeds on create without DB patch', async () => {
    const tid = await tenantId();
    assert.ok(tid);
    const actors = await resolvePhase5Actors(prisma, tid);
    assert.ok(actors);
    const stock = await findStockLine(prisma, tid, 1);
    assert.ok(stock);

    const created = await lostItemsService.createLost(tid, actors.creator, {
        reason: `${FIXTURE_TAG} lost cost approve`,
        suggestedAction: 'HOTEL',
        lines: [linePayload(stock)],
        notes: `${FIXTURE_TAG}_lost_cost`,
    });
    const updated = await lostItemsService.processLostApprovalStep(
        created.id,
        tid,
        actors.costUser,
        'APPROVE',
        'Production path cost OK',
        null,
    );
    assert.equal(updated.status, 'COST_CONTROL_APPROVED');
    assert.equal(updated.approvalRequests?.currentStep, 3);
});

test('Lost: reject on current step without fixture patch', async () => {
    const tid = await tenantId();
    assert.ok(tid);
    const actors = await resolvePhase5Actors(prisma, tid);
    assert.ok(actors);
    const stock = await findStockLine(prisma, tid, 1);
    assert.ok(stock);

    const created = await lostItemsService.createLost(tid, actors.creator, {
        reason: `${FIXTURE_TAG} lost reject invariant`,
        suggestedAction: 'HOTEL',
        lines: [linePayload(stock)],
        notes: `${FIXTURE_TAG}_lost_reject`,
    });
    await lostItemsService.processLostApprovalStep(
        created.id,
        tid,
        actors.costUser,
        'REJECT',
        'Production path reject',
        null,
    );
    const final = await lostItemsService.getLostById(created.id, tid, actors.costUser);
    assert.equal(final.status, 'REJECTED');
});
