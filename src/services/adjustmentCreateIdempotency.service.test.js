'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    runIdempotentAdjustmentCreate,
    _resetAdjustmentCreateIdempotencyForTests,
} = require('./adjustmentCreateIdempotency.service');

test('runIdempotentAdjustmentCreate returns same document for duplicate key', async () => {
    _resetAdjustmentCreateIdempotencyForTests();
    let creates = 0;
    const factory = async () => {
        creates += 1;
        return { id: `doc-${creates}` };
    };

    const first = await runIdempotentAdjustmentCreate('t1', 'u1', 'key-a', factory);
    const second = await runIdempotentAdjustmentCreate('t1', 'u1', 'key-a', factory);

    assert.equal(creates, 1);
    assert.equal(first.replay, false);
    assert.equal(first.document.id, 'doc-1');
    assert.equal(second.replay, true);
    assert.equal(second.documentId, 'doc-1');
});

test('runIdempotentAdjustmentCreate coalesces concurrent requests', async () => {
    _resetAdjustmentCreateIdempotencyForTests();
    let creates = 0;
    const factory = async () => {
        creates += 1;
        await new Promise((r) => setTimeout(r, 30));
        return { id: 'doc-concurrent' };
    };

    const [a, b] = await Promise.all([
        runIdempotentAdjustmentCreate('t1', 'u1', 'key-b', factory),
        runIdempotentAdjustmentCreate('t1', 'u1', 'key-b', factory),
    ]);

    assert.equal(creates, 1);
    assert.equal(a.document.id, 'doc-concurrent');
    assert.equal(b.document.id, 'doc-concurrent');
});

test('runIdempotentAdjustmentCreate without key always runs factory', async () => {
    _resetAdjustmentCreateIdempotencyForTests();
    let creates = 0;
    const factory = async () => {
        creates += 1;
        return { id: `doc-${creates}` };
    };

    await runIdempotentAdjustmentCreate('t1', 'u1', '', factory);
    await runIdempotentAdjustmentCreate('t1', 'u1', null, factory);

    assert.equal(creates, 2);
});
