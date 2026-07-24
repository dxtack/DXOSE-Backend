'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tenantDocumentWhere, tenantApprovalRequestWhere } = require('./tenantQuery.util');

test('tenantDocumentWhere pairs id and tenantId', () => {
    assert.deepEqual(tenantDocumentWhere('doc-1', 'tenant-a'), { id: 'doc-1', tenantId: 'tenant-a' });
});

test('tenantApprovalRequestWhere pairs id and tenantId', () => {
    assert.deepEqual(tenantApprovalRequestWhere('ar-1', 'tenant-a'), { id: 'ar-1', tenantId: 'tenant-a' });
});
