'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createDisposableTenant, createDisposableDepartment } = require('../../harness/disposable-tenant');
const { cleanupDisposableFixture } = require('../../harness/cleanup-tenant');

test('disposable tenant and department — create, read, cleanup', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    let tenantId;
    let departmentId;

    try {
        const tenant = await createDisposableTenant(prisma, runContext);
        tenantId = tenant.id;
        assert.ok(tenantId, 'tenant id required');
        assert.equal(tenant.slug, runContext.tenantSlug);

        const initialCount = await prisma.department.count({ where: { tenantId } });
        assert.equal(initialCount, 0, 'expected no departments before department creation');

        const department = await createDisposableDepartment(prisma, tenantId, runContext);
        departmentId = department.id;
        assert.ok(departmentId, 'department id required');
        assert.equal(department.tenantId, tenantId);

        const loaded = await prisma.department.findFirst({
            where: { id: departmentId, tenantId },
        });
        assert.ok(loaded, 'department must be readable by id + tenantId');
        assert.equal(loaded.name, department.name);

        const countAfterCreate = await prisma.department.count({ where: { tenantId } });
        assert.equal(countAfterCreate, 1, 'department count should be 0 → 1');
    } finally {
        try {
            if (tenantId) {
                await cleanupDisposableFixture(prisma, { tenantId, departmentId, runId: runContext.runId });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});
