'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PeriodOpeningContinuityClassification } = require('@prisma/client');
const { classifyContinuityCell } = require('./periodOpeningContinuity.service');

const cell = (qty, wac, value) => ({ qty, wac, value });

test('Period Opening Continuity exposes all ten governed classifications', () => {
    assert.deepEqual(
        Object.values(PeriodOpeningContinuityClassification).sort(),
        [
            'ACTIVITY_ALREADY_STARTED',
            'IRRECONSTRUCTIBLE',
            'MATCH',
            'MISSING_OPENING_CELL',
            'MISSING_SNAPSHOT_CELL',
            'MULTIPLE_CURRENT_SNAPSHOTS',
            'MULTI_MISMATCH',
            'QTY_MISMATCH',
            'VALUE_MISMATCH',
            'WAC_MISMATCH',
        ],
    );
});

test('cell comparison classifies quantity, WAC, value, missing, and irreconstructible evidence', () => {
    const baseline = cell(100, 10, 1000);
    assert.equal(classifyContinuityCell(baseline, baseline, baseline), 'MATCH');
    assert.equal(
        classifyContinuityCell(cell(100, 0, 0), cell(101, 0, 0), cell(101, 0, 0)),
        'QTY_MISMATCH',
    );
    assert.equal(
        classifyContinuityCell(cell(0, 10, 0), cell(0, 12, 0), cell(0, 12, 0)),
        'WAC_MISMATCH',
    );
    assert.equal(
        classifyContinuityCell(baseline, cell(100, 10, 1001), cell(100, 10, 1001)),
        'VALUE_MISMATCH',
    );
    assert.equal(
        classifyContinuityCell(baseline, cell(90, 12, 1080), cell(90, 12, 1080)),
        'MULTI_MISMATCH',
    );
    assert.equal(classifyContinuityCell(null, baseline, baseline), 'MISSING_SNAPSHOT_CELL');
    assert.equal(classifyContinuityCell(baseline, baseline, null), 'MISSING_OPENING_CELL');
    assert.equal(classifyContinuityCell(baseline, null, baseline), 'IRRECONSTRUCTIBLE');
});
