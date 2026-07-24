'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { deleteGrnCascade } = require('./grn-id-cleanup');

const backendRoot = path.join(__dirname, '..', '..');
const wrapperPaths = [
    path.join(__dirname, 'cleanup-grn-fixture.js'),
    path.join(__dirname, 'e2e-permission-cleanup.js'),
    path.join(__dirname, 'purge-phase-1-stale-residuals.js'),
];

function createMockPrisma() {
    const calls = [];
    const prisma = {
        grnImport: {
            findMany: async (args) => {
                calls.push(['grnImport.findMany', args]);
                return [{ approvalRequestId: 'apr-1' }];
            },
            deleteMany: async (args) => {
                calls.push(['grnImport.deleteMany', args]);
                return { count: 1 };
            },
        },
        approvalRequest: {
            findMany: async (args) => {
                calls.push(['approvalRequest.findMany', args]);
                return [{ id: 'apr-2' }];
            },
            deleteMany: async (args) => {
                calls.push(['approvalRequest.deleteMany', args]);
                return { count: 1 };
            },
        },
        approvalStep: {
            deleteMany: async (args) => {
                calls.push(['approvalStep.deleteMany', args]);
                return { count: 1 };
            },
        },
        auditLog: {
            deleteMany: async (args) => {
                calls.push(['auditLog.deleteMany', args]);
                return { count: 1 };
            },
        },
        grnLine: {
            deleteMany: async (args) => {
                calls.push(['grnLine.deleteMany', args]);
                return { count: 1 };
            },
        },
    };
    return { prisma, calls };
}

test('deleteGrnCascade — empty and falsy IDs produce no DB calls', async () => {
    const { prisma, calls } = createMockPrisma();
    await deleteGrnCascade(prisma, []);
    await deleteGrnCascade(prisma, [null, '', undefined]);
    assert.equal(calls.length, 0);
});

test('deleteGrnCascade — FK deletion order and merged approval IDs', async () => {
    const { prisma, calls } = createMockPrisma();
    await deleteGrnCascade(prisma, ['grn-1', 'grn-2']);

    assert.deepEqual(
        calls.map(([name]) => name),
        [
            'grnImport.findMany',
            'approvalRequest.findMany',
            'approvalStep.deleteMany',
            'approvalRequest.deleteMany',
            'auditLog.deleteMany',
            'grnLine.deleteMany',
            'grnImport.deleteMany',
        ],
    );

    const stepDelete = calls.find(([name]) => name === 'approvalStep.deleteMany')[1];
    const requestDelete = calls.find(([name]) => name === 'approvalRequest.deleteMany')[1];
    assert.deepEqual(stepDelete.where.requestId.in.sort(), ['apr-1', 'apr-2']);
    assert.deepEqual(requestDelete.where.id.in.sort(), ['apr-1', 'apr-2']);
});

test('deleteGrnCascade — skips approval deletes when no approval IDs resolved', async () => {
    const calls = [];
    const prisma = {
        grnImport: {
            findMany: async () => {
                calls.push(['grnImport.findMany']);
                return [{ approvalRequestId: null }];
            },
            deleteMany: async (args) => {
                calls.push(['grnImport.deleteMany', args]);
            },
        },
        approvalRequest: {
            findMany: async () => {
                calls.push(['approvalRequest.findMany']);
                return [];
            },
            deleteMany: async () => {
                throw new Error('should not delete approval requests');
            },
        },
        approvalStep: {
            deleteMany: async () => {
                throw new Error('should not delete approval steps');
            },
        },
        auditLog: {
            deleteMany: async () => {
                calls.push(['auditLog.deleteMany']);
            },
        },
        grnLine: {
            deleteMany: async () => {
                calls.push(['grnLine.deleteMany']);
            },
        },
    };

    await deleteGrnCascade(prisma, ['grn-only']);
    assert.deepEqual(
        calls.map(([name]) => name),
        ['grnImport.findMany', 'approvalRequest.findMany', 'auditLog.deleteMany', 'grnLine.deleteMany', 'grnImport.deleteMany'],
    );
});

test('GRN cleanup wrappers — import shared primitive only', () => {
    for (const filePath of wrapperPaths) {
        const src = fs.readFileSync(filePath, 'utf8');
        assert.match(src, /require\('\.\/grn-id-cleanup'\)/, `${path.basename(filePath)} must import grn-id-cleanup`);
        assert.doesNotMatch(src, /async function deleteGrnCascade/, `${path.basename(filePath)} must not define local deleteGrnCascade`);
    }
});

test('purge wrapper — remains marker-based broad purge', () => {
    const src = fs.readFileSync(path.join(__dirname, 'purge-phase-1-stale-residuals.js'), 'utf8');
    assert.match(src, /TEST_GRN_PREFIXES/);
    assert.match(src, /TEST_TENANT_SLUG_PREFIXES/);
    assert.match(src, /Manual recovery only/);
});
