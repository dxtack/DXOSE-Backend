const test = require('node:test');
const assert = require('node:assert/strict');
const {
    GET_PASS_OUTGOING_OPEN_STATUSES,
    GET_PASS_TERMINAL_STATUSES,
    buildGetPassReturnActivityPredicate,
    buildGetPassReturnsListWhere,
} = require('./get-pass-workflow-tabs.util');

test('GET_PASS_OUTGOING_OPEN_STATUSES excludes terminal statuses', () => {
    for (const terminal of GET_PASS_TERMINAL_STATUSES) {
        assert.equal(GET_PASS_OUTGOING_OPEN_STATUSES.includes(terminal), false);
    }
});

test('buildGetPassReturnActivityPredicate includes RETURNED and CLOSED with returns', () => {
    const predicate = buildGetPassReturnActivityPredicate();
    assert.ok(predicate.OR.some((clause) => clause.status?.in?.includes('RETURNED')));
    const closedBranch = predicate.OR.find((clause) => clause.status === 'CLOSED');
    assert.ok(closedBranch);
    assert.ok(closedBranch.OR.some((c) => c.closedVia === 'FORCE_SETTLEMENT'));
    assert.ok(closedBranch.OR.some((c) => c.lines?.some));
});

test('buildGetPassReturnsListWhere scopes to tenant when not org-wide', () => {
    const where = buildGetPassReturnsListWhere('tenant-a', null);
    assert.equal(where.AND.length, 2);
    const scope = where.AND[0];
    assert.deepEqual(scope.OR, [{ tenantId: 'tenant-a' }, { targetTenantId: 'tenant-a' }]);
});

test('buildGetPassReturnsListWhere scopes to organization root when org-wide', () => {
    const where = buildGetPassReturnsListWhere('tenant-a', { organizationRootId: 'org-root' });
    const scope = where.AND[0];
    assert.ok(scope.OR.some((c) => c.tenant?.parentId === 'org-root'));
});
