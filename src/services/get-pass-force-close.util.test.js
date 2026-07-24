const test = require('node:test');
const assert = require('node:assert/strict');
const {
    assertForceCloseEligible,
    assertSimpleCloseOutstandingZero,
    assertNotPendingForceCloseSettlement,
    validateSettlementPayload,
    lineOutstandingQty,
    isInternalTransferForceCloseBlocked,
} = require('./get-pass-force-close.util');

const basePass = {
    id: 'gp-1',
    tenantId: 'tenant-1',
    transferType: 'TEMPORARY',
    status: 'OUT',
    isInternalTransfer: false,
    receivedAt: null,
    destinationDeptAcceptedAt: null,
    destinationSecurityExitAt: null,
    lines: [{ id: 'l1', qty: 10, qtyReturned: 10 }],
};

test('lineOutstandingQty: qty minus processed return', () => {
    assert.equal(lineOutstandingQty({ qty: 10, qtyReturned: 3 }), 7);
    assert.equal(lineOutstandingQty({ qty: 10, qtyReturned: 10 }), 0);
});

test('assertForceCloseEligible: allows reversible OUT pass', () => {
    assert.doesNotThrow(() => assertForceCloseEligible({ ...basePass }, { tenantId: 'tenant-1' }));
});

test('assertForceCloseEligible: rejects RETURNED status', () => {
    assert.throws(
        () => assertForceCloseEligible({ ...basePass, status: 'RETURNED' }, { tenantId: 'tenant-1' }),
        /only available for passes that are out or partially returned/,
    );
});

test('assertForceCloseEligible: rejects internal transfer with receivedAt', () => {
    assert.throws(
        () =>
            assertForceCloseEligible(
                { ...basePass, isInternalTransfer: true, receivedAt: new Date() },
                { tenantId: 'tenant-1' },
            ),
        /internal transfer custody/,
    );
    assert.equal(
        isInternalTransferForceCloseBlocked({
            ...basePass,
            isInternalTransfer: true,
            receivedAt: new Date(),
        }),
        true,
    );
});

test('assertSimpleCloseOutstandingZero: rejects when outstanding remains', () => {
    assert.throws(
        () =>
            assertSimpleCloseOutstandingZero({
                ...basePass,
                lines: [{ qty: 10, qtyReturned: 2 }],
            }),
        /outstanding quantities remain/,
    );
});

test('assertSimpleCloseOutstandingZero: passes when fully processed', () => {
    assert.doesNotThrow(() => assertSimpleCloseOutstandingZero({ ...basePass }));
});

test('assertNotPendingForceCloseSettlement: blocks while pending', () => {
    assert.throws(
        () => assertNotPendingForceCloseSettlement({ status: 'PENDING_FORCE_CLOSE_SETTLEMENT' }),
        /pending force-close settlement/,
    );
});

test('validateSettlementPayload: requires closeReason and accountability', () => {
    const pass = {
        ...basePass,
        lines: [{ id: 'l1', qty: 10, qtyReturned: 4 }],
    };
    assert.throws(
        () => validateSettlementPayload(pass, { accountability: 'COMPANY_LOSS', lines: [] }),
        /closeReason is required/,
    );
    assert.throws(
        () =>
            validateSettlementPayload(pass, {
                closeReason: 'Items not returned',
                lines: [{ lineId: 'l1', disposition: 'GOOD' }],
            }),
        /accountability is required/,
    );
});

test('validateSettlementPayload: every outstanding line exactly once', () => {
    const pass = {
        ...basePass,
        lines: [{ id: 'l1', qty: 10, qtyReturned: 4 }],
    };
    const result = validateSettlementPayload(pass, {
        closeReason: 'Guest kept items',
        accountability: 'COMPANY_LOSS',
        lines: [{ lineId: 'l1', disposition: 'GOOD' }],
    });
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0].disposition, 'GOOD');
    assert.equal(result.lines[0].outstanding, 6);
});
