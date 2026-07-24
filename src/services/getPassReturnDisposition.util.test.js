const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createGetPassReturnDispositionBatch,
    queueGetPassReturnDispositionLine,
    flushGetPassReturnDispositionBatch,
} = require('./getPassReturnDisposition.util');

const lineA = { itemId: 'item-a', locationId: 'loc-1', unitCost: 10 };
const lineB = { itemId: 'item-b', locationId: 'loc-2', unitCost: 5 };
const lineAOtherLoc = { itemId: 'item-a', locationId: 'loc-3', unitCost: 10 };

function createTxMock() {
    const createdDocs = [];
    const approvalRequests = [];
    let docSeq = 0;

    const tx = {
        movementDocument: {
            create: async ({ data }) => {
                const doc = { id: `doc-${++docSeq}`, ...data };
                createdDocs.push(doc);
                return doc;
            },
        },
    };

    const generateDocNumber = async (_tenantId, prefix) => `${prefix}-2026-${String(docSeq).padStart(5, '0')}`;
    const createMovementApprovalRequest = async (_tx, payload) => {
        approvalRequests.push(payload);
    };

    return { tx, createdDocs, approvalRequests, generateDocNumber, createMovementApprovalRequest };
}

const flushParams = (txMock, overrides = {}) => ({
    tenantId: 'tenant-1',
    getPassId: 'gp-1',
    passNo: 'GP-2026-00001',
    userId: 'user-1',
    now: new Date('2026-06-12T12:00:00.000Z'),
    firstStepComment: 'Registered via get pass return',
    generateDocNumber: txMock.generateDocNumber,
    DocPrefix: { BREAKAGE: 'BRK' },
    createMovementApprovalRequest: txMock.createMovementApprovalRequest,
    ...overrides,
});

test('queueGetPassReturnDispositionLine: dedupes duplicate itemId+locationId keys', () => {
    const batch = createGetPassReturnDispositionBatch();
    queueGetPassReturnDispositionLine(batch, { line: lineA, damagedQty: 2 });
    queueGetPassReturnDispositionLine(batch, { line: lineA, damagedQty: 5 });
    assert.equal(batch.breakageLines.length, 1);
    assert.equal(batch.breakageLines[0].qty, 2);
});

test('flushGetPassReturnDispositionBatch: one Process Return with two damaged lines → one Breakage doc', async () => {
    const txMock = createTxMock();
    const batch = createGetPassReturnDispositionBatch();
    queueGetPassReturnDispositionLine(batch, { line: lineA, damagedQty: 1 });
    queueGetPassReturnDispositionLine(batch, { line: lineB, damagedQty: 2 });

    await flushGetPassReturnDispositionBatch(txMock.tx, batch, flushParams(txMock));

    assert.equal(txMock.createdDocs.length, 1);
    assert.equal(txMock.createdDocs[0].movementType, 'BREAKAGE');
    assert.equal(txMock.createdDocs[0].sourceLocationId, 'loc-1');
    assert.equal(txMock.createdDocs[0].lines.create.length, 2);
    assert.equal(txMock.approvalRequests.length, 1);
    assert.equal(txMock.approvalRequests[0].requestType, 'BREAKAGE');
});

test('flushGetPassReturnDispositionBatch: damaged + lost → one Breakage and one Lost', async () => {
    const txMock = createTxMock();
    const batch = createGetPassReturnDispositionBatch();
    queueGetPassReturnDispositionLine(batch, {
        line: lineA,
        damagedQty: 1,
        lostQty: 0,
        accountability: 'COMPANY_LOSS',
    });
    queueGetPassReturnDispositionLine(batch, {
        line: lineB,
        damagedQty: 0,
        lostQty: 3,
        accountability: 'EMPLOYEE_DEDUCTION',
    });

    await flushGetPassReturnDispositionBatch(txMock.tx, batch, flushParams(txMock));

    assert.equal(txMock.createdDocs.length, 2);
    const types = txMock.createdDocs.map((d) => d.movementType).sort();
    assert.deepEqual(types, ['BREAKAGE', 'LOST']);
    assert.equal(txMock.approvalRequests.length, 2);
    assert.equal(txMock.approvalRequests[0].firstStepAccountabilityType, 'COMPANY_LOSS');
    assert.equal(txMock.approvalRequests[1].firstStepAccountabilityType, 'COMPANY_LOSS');
});

test('flushGetPassReturnDispositionBatch: multi-location via line.locationId', async () => {
    const txMock = createTxMock();
    const batch = createGetPassReturnDispositionBatch();
    queueGetPassReturnDispositionLine(batch, { line: lineA, damagedQty: 1 });
    queueGetPassReturnDispositionLine(batch, { line: lineAOtherLoc, damagedQty: 2 });

    await flushGetPassReturnDispositionBatch(txMock.tx, batch, flushParams(txMock));

    assert.equal(txMock.createdDocs.length, 1);
    const lines = txMock.createdDocs[0].lines.create;
    assert.equal(lines.length, 2);
    assert.deepEqual(
        lines.map((l) => l.locationId).sort(),
        ['loc-1', 'loc-3'],
    );
});

test('two separate batches flush as two Breakage documents', async () => {
    const txMock = createTxMock();

    const batch1 = createGetPassReturnDispositionBatch();
    queueGetPassReturnDispositionLine(batch1, { line: lineA, damagedQty: 1 });
    await flushGetPassReturnDispositionBatch(txMock.tx, batch1, flushParams(txMock));

    const batch2 = createGetPassReturnDispositionBatch();
    queueGetPassReturnDispositionLine(batch2, { line: lineB, damagedQty: 1 });
    await flushGetPassReturnDispositionBatch(txMock.tx, batch2, flushParams(txMock));

    assert.equal(txMock.createdDocs.length, 2);
    assert.equal(txMock.createdDocs[0].movementType, 'BREAKAGE');
    assert.equal(txMock.createdDocs[1].movementType, 'BREAKAGE');
    assert.equal(txMock.approvalRequests.length, 2);
});
