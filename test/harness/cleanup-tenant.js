'use strict';

/**
 * Wave 1B cleanup — department + tenant only (no ledger/workflow scope).
 */

async function cleanupDisposableFixture(prisma, { tenantId, departmentId, runId }) {
    const errors = [];

    if (departmentId) {
        try {
            await prisma.department.delete({ where: { id: departmentId } });
        } catch (err) {
            errors.push(`department delete failed: ${err.message}`);
        }
    }

    try {
        await prisma.tenant.delete({ where: { id: tenantId } });
    } catch (err) {
        errors.push(`tenant delete failed: ${err.message}`);
    }

    const remainingDepartments = await prisma.department.count({ where: { tenantId } });
    if (remainingDepartments !== 0) {
        errors.push(`expected 0 departments for tenant, found ${remainingDepartments}`);
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant) {
        errors.push('tenant record still exists after cleanup');
    }

    if (errors.length) {
        const message = `[test-harness:cleanup] runId=${runId} — ${errors.join('; ')}`;
        throw new Error(message);
    }
}

module.exports = { cleanupDisposableFixture };
