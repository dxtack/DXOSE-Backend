'use strict';

/**
 * Wave 7 — discover tenant + user for browser RV (modal law + zoom matrix).
 * Ensures INVENTORY_VIEW + TRANSFER_VIEW (+ detail view perms) via ur_user_overrides on test DB.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const { generateAccessToken, generateRefreshToken } = require('../../src/utils/jwt');
const { resolveAccPermissionsForMembership } = require('../../src/acc-runtime/resolvePermissions');
const { membershipRoleCode, getRoleIdByCode } = require('../../src/services/rbac.service');

const API_BASE = process.env.PILOT_API_URL || 'http://127.0.0.1:4000/api';

const W7_RV_GRANTS = [
    'INVENTORY_VIEW',
    'TRANSFER_VIEW',
    'GRN_VIEW',
    'BREAKAGE_VIEW',
    'STOCK_COUNT_VIEW',
    'VIEW_MASTER_DATA',
    'VIEW_DASHBOARD',
];

const REQUIRED = ['INVENTORY_VIEW', 'TRANSFER_VIEW'];

async function ensureOverride(prisma, { userId, assignmentId, legacyCode }) {
    const perm = await prisma.urPermission.findUnique({ where: { legacyCode } });
    if (!perm) return false;
    await prisma.urUserOverride.upsert({
        where: {
            userId_assignmentId_permissionId: {
                userId,
                assignmentId,
                permissionId: perm.id,
            },
        },
        create: {
            userId,
            assignmentId,
            permissionId: perm.id,
            isGranted: true,
            reason: 'Wave 7 browser RV (test DB only)',
        },
        update: { isGranted: true, reason: 'Wave 7 browser RV (test DB only)' },
    });
    return true;
}

async function discoverWave7Context() {
    const prisma = new PrismaClient();
    try {
        const itemGroups = await prisma.item.groupBy({ by: ['tenantId'], _count: { _all: true } });
        const tenantScores = [];
        for (const g of itemGroups) {
            if (g._count._all <= 0) continue;
            const [trf, grn, brk, ic] = await Promise.all([
                prisma.storeTransfer.count({ where: { tenantId: g.tenantId } }),
                prisma.grnImport.count({ where: { tenantId: g.tenantId } }),
                prisma.movementDocument.count({ where: { tenantId: g.tenantId, movementType: 'BREAKAGE' } }),
                prisma.stockCountSession.count({ where: { tenantId: g.tenantId } }),
            ]);
            tenantScores.push({
                tenantId: g.tenantId,
                score: g._count._all + trf + grn + brk + ic,
                items: g._count._all,
                trf,
                grn,
                brk,
                ic,
            });
        }
        tenantScores.sort((a, b) => b.score - a.score);
        const tenants = await prisma.tenant.findMany({
            where: { id: { in: tenantScores.map((s) => s.tenantId) }, isActive: true },
            select: { id: true, slug: true, name: true, parentId: true },
        });
        const tenantById = new Map(tenants.map((t) => [t.id, t]));

        let chosen = null;
        for (const scored of tenantScores) {
            const t = tenantById.get(scored.tenantId);
            if (!t) continue;
            const members = await prisma.tenantMember.findMany({
                where: { tenantId: t.id, isActive: true },
                include: { user: { select: { id: true, email: true, permissionVersion: true, isActive: true } }, role: true },
            });
            for (const m of members) {
                if (!m.user?.isActive) continue;
                const roleCode = membershipRoleCode(m) || m.role || null;
                let roleId = m.roleId || null;
                if (!roleId && roleCode) {
                    try {
                        roleId = await getRoleIdByCode(roleCode);
                    } catch {
                        /* ignore */
                    }
                }
                const assignment = await prisma.urUserAssignment.findFirst({
                    where: {
                        userId: m.userId,
                        isActive: true,
                        properties: { some: { propertyId: t.id } },
                    },
                    select: { id: true, roleId: true },
                });
                if (!assignment) continue;
                for (const code of W7_RV_GRANTS) {
                    await ensureOverride(prisma, { userId: m.userId, assignmentId: assignment.id, legacyCode: code });
                }
                const perms = await resolveAccPermissionsForMembership({
                    userId: m.userId,
                    membership: m,
                    roleId,
                    roleCode,
                });
                if (REQUIRED.every((p) => perms.includes(p))) {
                    chosen = { tenant: t, member: m, roleCode, roleId, perms, assignmentId: assignment.id, samples: scored };
                    break;
                }
            }
            if (chosen) break;
        }

        if (!chosen) throw new Error('NO_SUITABLE_USER');

        const t = chosen.tenant;
        const u = chosen.member.user;
        const tokenPayload = {
            userId: u.id,
            tenantId: t.id,
            email: u.email,
            role: chosen.roleCode,
            roleId: chosen.roleId,
            permissions: chosen.perms,
            permissionVersion: u.permissionVersion,
        };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken({ userId: u.id, tenantId: t.id });

        const trfTenantStatus = {};
        const trfGroups2 = await prisma.storeTransfer.groupBy({
            by: ['tenantId', 'status'],
            where: { tenantId: t.id },
            _count: { _all: true },
        });
        for (const g of trfGroups2) trfTenantStatus[g.status] = g._count._all;

        const statusIds = {};
        for (const s of Object.keys(trfTenantStatus)) {
            const row = await prisma.storeTransfer.findFirst({
                where: { tenantId: t.id, status: s },
                select: { id: true },
                orderBy: { createdAt: 'desc' },
            });
            if (row) statusIds[s] = row.id;
        }

        const grn = await prisma.grnImport.findFirst({ where: { tenantId: t.id }, select: { id: true }, orderBy: { createdAt: 'desc' } });
        const brk = await prisma.movementDocument.findFirst({
            where: { tenantId: t.id, movementType: 'BREAKAGE' },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
        });
        const ic = await prisma.stockCountSession.findFirst({
            where: { tenantId: t.id },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
        });
        const memberships = (
            await prisma.tenantMember.findMany({
                where: { userId: u.id, isActive: true },
                include: { tenant: { select: { id: true, slug: true, name: true, parentId: true } }, role: true },
            })
        ).map((m) => ({
            tenantId: m.tenantId,
            tenantSlug: m.tenant?.slug || null,
            tenantName: m.tenant?.name || null,
            parentId: m.tenant?.parentId || null,
            roleCode: membershipRoleCode(m) || null,
        }));

        const item = await prisma.item.findFirst({ where: { tenantId: t.id }, select: { id: true, name: true } });

        return {
            api: API_BASE,
            tenant: { id: t.id, slug: t.slug, name: t.name, parentId: t.parentId },
            user: { id: u.id, email: u.email, role: chosen.roleCode, permissionVersion: u.permissionVersion },
            permissions: chosen.perms.slice().sort(),
            permissionFlags: {
                INVENTORY_VIEW: chosen.perms.includes('INVENTORY_VIEW'),
                TRANSFER_VIEW: chosen.perms.includes('TRANSFER_VIEW'),
            },
            memberships,
            tokens: { accessToken, refreshToken },
            sample: {
                itemId: item?.id || null,
                itemName: item?.name || null,
                grnId: grn?.id || null,
                breakageId: brk?.id || null,
                inventoryCountId: ic?.id || null,
                transfersByStatus: statusIds,
            },
            transferStatusCounts: trfTenantStatus,
            wave7RvGrants: W7_RV_GRANTS,
            authProbe: { source: 'wave7-discover-context' },
        };
    } finally {
        await prisma.$disconnect();
    }
}

module.exports = { discoverWave7Context };

if (require.main === module) {
    discoverWave7Context()
        .then((ctx) => {
            console.log(JSON.stringify({ email: ctx.user.email, tenant: ctx.tenant.slug, permissions: ctx.permissions }, null, 2));
        })
        .catch((e) => {
            console.error(e);
            process.exit(1);
        });
}
