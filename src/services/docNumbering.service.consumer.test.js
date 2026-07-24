'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(backendRoot, 'src/services/docNumbering.service.js');
const databasePath = path.join(backendRoot, 'src/config/database.js');

function loadDocNumberingWithMocks({ sharedPrisma, tx = null }) {
    sharedPrisma.tenant ||= { findUnique: async () => ({ timezone: 'Asia/Riyadh' }) };
    if (tx) tx.tenant ||= { findUnique: async () => ({ timezone: 'Asia/Riyadh' }) };
    const docPath = path.join(backendRoot, 'src/services/docNumbering.service.js');
    delete require.cache[docPath];
    delete require.cache[databasePath];

    require.cache[databasePath] = {
        id: databasePath,
        filename: databasePath,
        loaded: true,
        exports: sharedPrisma,
    };

    const mod = require('./docNumbering.service');
    return { mod, docPath };
}

test('docNumbering.service — imports shared database client (source contract)', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    assert.doesNotMatch(src, /new PrismaClient\(\)/);
    assert.match(src, /const db = tx \|\| prisma;/);
    assert.doesNotMatch(src, /\$disconnect/);
});

test('docNumbering.service — exports unchanged', () => {
    const docNumbering = require('./docNumbering.service');
    assert.equal(typeof docNumbering.generateDocNumber, 'function');
    assert.equal(typeof docNumbering.prefixFromMovementType, 'function');
    assert.ok(docNumbering.DocPrefix);
    assert.equal(docNumbering.DocPrefix.RECEIVE, 'GRN');
});

test('docNumbering.service — default path uses shared client', async () => {
    let sharedUsed = false;
    const sharedPrisma = {
        $queryRawUnsafe: async () => {
            sharedUsed = true;
            return [{ lastSeq: 42 }];
        },
    };
    const { mod } = loadDocNumberingWithMocks({ sharedPrisma });
    const result = await mod.generateDocNumber('00000000-0000-0000-0000-000000000001', 'GRN', new Date('2026-06-01T00:00:00Z'));
    assert.ok(sharedUsed);
    assert.equal(result, 'GRN-2026-00042');
    delete require.cache[servicePath];
    delete require.cache[databasePath];
});

test('docNumbering.service — tx override uses tx client only', async () => {
    let sharedUsed = false;
    let txUsed = false;
    const sharedPrisma = {
        $queryRawUnsafe: async () => {
            sharedUsed = true;
            return [{ lastSeq: 99 }];
        },
    };
    const tx = {
        tenant: {
            findUnique: async () => ({ timezone: 'Asia/Riyadh' }),
        },
        $queryRawUnsafe: async () => {
            txUsed = true;
            return [{ lastSeq: 7 }];
        },
    };
    const { mod } = loadDocNumberingWithMocks({ sharedPrisma });
    const result = await mod.generateDocNumber(
        '00000000-0000-0000-0000-000000000001',
        'GP',
        new Date('2026-06-01T00:00:00Z'),
        tx,
    );
    assert.ok(txUsed);
    assert.equal(sharedUsed, false);
    assert.equal(result, 'GP-2026-00007');
    delete require.cache[servicePath];
    delete require.cache[databasePath];
});

test('docNumbering.service — uses tenant-local year at UTC boundary', async () => {
    let sequenceYear;
    const sharedPrisma = {
        tenant: {
            findUnique: async () => ({ timezone: 'Pacific/Kiritimati' }),
        },
        $queryRawUnsafe: async (_sql, _tenantId, _prefix, year) => {
            sequenceYear = year;
            return [{ lastSeq: 1 }];
        },
    };
    const { mod } = loadDocNumberingWithMocks({ sharedPrisma });
    const result = await mod.generateDocNumber(
        '00000000-0000-0000-0000-000000000001',
        'GRN',
        new Date('2026-12-31T11:00:00.000Z'),
    );
    assert.equal(sequenceYear, 2027);
    assert.equal(result, 'GRN-2027-00001');
    delete require.cache[servicePath];
    delete require.cache[databasePath];
});

test('docNumbering.service — prefixFromMovementType unchanged', () => {
    const { prefixFromMovementType, DocPrefix } = require('./docNumbering.service');
    assert.equal(prefixFromMovementType('RECEIVE'), DocPrefix.RECEIVE);
    assert.equal(prefixFromMovementType('UNKNOWN'), 'DOC');
});
