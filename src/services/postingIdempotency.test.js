'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    assertNoDuplicateGetPassCheckout,
    assertNoDuplicateGetPassLedgerEffect,
} = require('./postingGovernedGetPass.service');
const { assertNoDuplicateCountSessionPost } = require('./posting.service');

function txWithLedgerFind(existing) {
    return {
        inventoryLedger: {
            findFirst: async () => existing,
        },
    };
}

test('assertNoDuplicateCountSessionPost throws 409 when COUNT_SESSION ledger exists', async () => {
    await assert.rejects(
        () =>
            assertNoDuplicateCountSessionPost(txWithLedgerFind({ id: 'led-1' }), 'tenant-1', 'session-1'),
        (err) => err.statusCode === 409 && err.code === 'COUNT_SESSION_ALREADY_POSTED',
    );
});

test('assertNoDuplicateCountSessionPost allows first post', async () => {
    await assert.doesNotReject(() =>
        assertNoDuplicateCountSessionPost(txWithLedgerFind(null), 'tenant-1', 'session-1'),
    );
});

test('assertNoDuplicateGetPassCheckout throws 409 when checkout ledger exists', async () => {
    await assert.rejects(
        () => assertNoDuplicateGetPassCheckout(txWithLedgerFind({ id: 'led-1' }), 'tenant-1', 'gp-1'),
        (err) => err.statusCode === 409,
    );
});

test('assertNoDuplicateGetPassLedgerEffect throws 409 for duplicate secondary effect', async () => {
    await assert.rejects(
        () =>
            assertNoDuplicateGetPassLedgerEffect(txWithLedgerFind({ id: 'led-2' }), {
                tenantId: 'tenant-1',
                referenceType: 'GET_PASS_RETURN',
                referenceId: 'ret-1',
                movementType: 'RETURN',
                itemId: 'item-1',
                locationId: 'loc-1',
            }),
        (err) => err.statusCode === 409,
    );
});

test('assertNoDuplicateGetPassLedgerEffect allows first secondary effect', async () => {
    await assert.doesNotReject(() =>
        assertNoDuplicateGetPassLedgerEffect(txWithLedgerFind(null), {
            tenantId: 'tenant-1',
            referenceType: 'GET_PASS',
            referenceId: 'gp-1',
            movementType: 'RECEIVE',
            itemId: 'item-1',
            locationId: 'loc-1',
        }),
    );
});
