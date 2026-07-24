'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('Get Pass operational list: org-wide expansion disabled for ORG_MANAGER', async () => {
    const { resolveOrgWideGetPassListContext } = require('./getPass.service');
    const result = await resolveOrgWideGetPassListContext(
        '00000000-0000-4000-8000-000000000001',
        'ORG_MANAGER',
    );
    assert.equal(result, null);
});
