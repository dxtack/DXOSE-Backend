'use strict';

const { pvCodes } = require('./disposable-pv-fixture');

async function cleanupPvFixture(prisma, { runContext, fixture, runtimeSettingIdsBefore = new Set() }) {
    const errors = [];
    const runId = runContext.runId;
    const codes = pvCodes(runId);
    const userId = fixture.userId;

    if (userId) {
        try {
            await prisma.refreshToken.deleteMany({ where: { userId } });
        } catch (err) {
            errors.push(`refresh_tokens delete failed: ${err.message}`);
        }
    }

    if (fixture.tenantId) {
        try {
            await prisma.tenantMember.deleteMany({ where: { tenantId: fixture.tenantId } });
        } catch (err) {
            errors.push(`tenant_members delete failed: ${err.message}`);
        }
    }

    if (userId) {
        try {
            await prisma.user.delete({ where: { id: userId } });
        } catch (err) {
            errors.push(`user delete failed: ${err.message}`);
        }
    }

    if (fixture.roleId) {
        try {
            await prisma.role.delete({ where: { id: fixture.roleId } });
        } catch (err) {
            errors.push(`role delete failed: ${err.message}`);
        }
    }

    if (fixture.tenantId) {
        try {
            await prisma.tenant.delete({ where: { id: fixture.tenantId } });
        } catch (err) {
            errors.push(`tenant delete failed: ${err.message}`);
        }
    }

    const afterSettings = await prisma.accRuntimeSetting.findMany({ select: { id: true } });
    const newSettingIds = afterSettings.map((row) => row.id).filter((id) => !runtimeSettingIdsBefore.has(id));
    if (newSettingIds.length) {
        try {
            await prisma.accRuntimeSetting.deleteMany({ where: { id: { in: newSettingIds } } });
        } catch (err) {
            errors.push(`acc_runtime_settings side-effect cleanup failed: ${err.message}`);
        }
    }

    const refreshRemaining = userId
        ? await prisma.refreshToken.count({ where: { userId } })
        : 0;
    if (refreshRemaining !== 0) {
        errors.push(`expected 0 refresh tokens, found ${refreshRemaining}`);
    }

    const userRemaining = await prisma.user.count({ where: { email: fixture.userEmail } });
    if (userRemaining !== 0) {
        errors.push(`expected 0 test users, found ${userRemaining}`);
    }

    const membershipRemaining = fixture.tenantId
        ? await prisma.tenantMember.count({ where: { tenantId: fixture.tenantId } })
        : 0;
    if (membershipRemaining !== 0) {
        errors.push(`expected 0 memberships, found ${membershipRemaining}`);
    }

    const roleRemaining = await prisma.role.count({ where: { code: codes.roleCode } });
    if (roleRemaining !== 0) {
        errors.push(`expected 0 test roles, found ${roleRemaining}`);
    }

    const tenantRemaining = await prisma.tenant.count({ where: { slug: codes.tenantSlug } });
    if (tenantRemaining !== 0) {
        errors.push(`expected 0 test tenants, found ${tenantRemaining}`);
    }

    if (errors.length) {
        throw new Error(`[test-harness:pv-cleanup] runId=${runId} — ${errors.join('; ')}`);
    }
}

module.exports = {
    cleanupPvFixture,
};
