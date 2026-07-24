'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('P2 #28 — acceptReturnIntoDepartment does not append manager notes onto GetPass.notes', () => {
    const source = fs.readFileSync(path.join(__dirname, 'getPass.service.js'), 'utf8');
    assert.doesNotMatch(
        source,
        /Manager Acceptance Notes: \$\{managerNotes\}/,
        'must not mutate original GetPass.notes with manager acceptance text',
    );
    assert.match(
        source,
        /MANAGER_ACCEPTANCE_NOTES/,
        'manager notes must be captured on the audit trail',
    );
    assert.match(
        source,
        /MANAGER_NOTES:\$\{managerNotes\}/,
        'manager notes remain on GetPassReturn evidence rows',
    );
});
