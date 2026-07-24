'use strict';

/**
 * ACC P2 — TenantMember ↔ UrUserAssignment linkage coverage (read-only analysis).
 */

const prisma = require('../config/database');
const { legacyTag, tenantMemberIdFromLegacyNotes, extractLegacyTag } = require('./acc-membership-assignment-sync.service');
const { evaluatePermissionResolution } = require('./acc-enforcement-pilot.service');
const { membershipRoleCode } = require('./rbac.service');

async function getAssignmentCoverageReport({ tenantId = null } = {}) {
    const memberWhere = { isActive: true };
    if (tenantId) memberWhere.tenantId = tenantId;

    const members = await prisma.tenantMember.findMany({
        where:  memberWhere,
        select: {
            id: true,
            userId: true,
            tenantId: true,
            roleId: true,
            isActive: true,
            role: { select: { code: true } },
            user: { select: { email: true, isActive: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    const legacyAssignments = await prisma.urUserAssignment.findMany({
        where:  { notes: { startsWith: 'legacy:' } },
        select: {
            id: true,
            userId: true,
            roleId: true,
            isActive: true,
            notes: true,
            role: { select: { code: true } },
        },
    });

    const tagToAssignment = new Map();
    for (const a of legacyAssignments) {
        const tag = extractLegacyTag(a.notes);
        if (tag) tagToAssignment.set(tag, a);
    }

    const unmigrated = [];
    const roleDrift = [];
    const inactiveDrift = [];

    for (const m of members) {
        const tag = legacyTag(m.id);
        const assignment = tagToAssignment.get(tag);
        if (!assignment) {
            unmigrated.push({
                tenantMemberId: m.id,
                userId:         m.userId,
                email:          m.user.email,
                roleCode:       m.role?.code ?? null,
                tenantId:       m.tenantId,
            });
            continue;
        }
        if (assignment.roleId !== m.roleId) {
            roleDrift.push({
                tenantMemberId: m.id,
                assignmentId:   assignment.id,
                memberRole:     m.role?.code ?? null,
                assignmentRole: assignment.role?.code ?? null,
            });
        }
        const memberEffectiveActive = m.isActive && m.user.isActive;
        if (assignment.isActive !== memberEffectiveActive) {
            inactiveDrift.push({
                tenantMemberId:  m.id,
                assignmentId:    assignment.id,
                memberActive:    memberEffectiveActive,
                assignmentActive: assignment.isActive,
            });
        }
    }

    const orphanLegacyTags = legacyAssignments
        .filter((a) => {
            const memberId = tenantMemberIdFromLegacyNotes(a.notes);
            return memberId && !members.some((m) => m.id === memberId);
        })
        .map((a) => ({ assignmentId: a.id, userId: a.userId, notes: a.notes }));

    const activeMembers = members.length;
    const linked = activeMembers - unmigrated.length;
    const coveragePct = activeMembers === 0 ? 100 : Math.round((linked / activeMembers) * 1000) / 10;

    return {
        scope: { tenantId: tenantId ?? null },
        summary: {
            activeTenantMembers:     activeMembers,
            legacyTaggedAssignments: legacyAssignments.length,
            linked,
            unmigrated:              unmigrated.length,
            coveragePercent:         coveragePct,
            roleDrift:                 roleDrift.length,
            inactiveDrift:             inactiveDrift.length,
            orphanLegacyAssignments:   orphanLegacyTags.length,
            coverageComplete:          unmigrated.length === 0,
        },
        unmigrated: unmigrated.slice(0, 50),
        roleDrift: roleDrift.slice(0, 50),
        inactiveDrift: inactiveDrift.slice(0, 50),
        orphanLegacyAssignments: orphanLegacyTags.slice(0, 50),
        knownLimitations: [
            'Coverage measures legacy-tag linkage only — ACC-native assignments without legacy: tag are excluded.',
            'Runtime session still resolves via TenantMember + acc-runtime until P3.',
        ],
    };
}

async function getSessionLinkageAnalysis(userId, tenantId) {
    const membership = await prisma.tenantMember.findFirst({
        where: { userId, tenantId, isActive: true },
        include: { role: true, tenant: { select: { id: true, slug: true } } },
    });
    if (!membership) {
        return { found: false, message: 'No active membership for session tenant.' };
    }

    const tag = legacyTag(membership.id);
    const assignment = await prisma.urUserAssignment.findFirst({
        where: { notes: tag },
        select: { id: true, roleId: true, isActive: true, role: { select: { code: true } } },
    });

    const rc = membershipRoleCode(membership);
    const permissionEval = await evaluatePermissionResolution({
        userId,
        membership,
        roleId: membership.roleId,
        roleCode: rc,
        tenantId,
        tenantSlug: membership.tenant?.slug,
    });

    return {
        found: true,
        tenantMemberId: membership.id,
        legacyTag: tag,
        assignmentLinked: !!assignment,
        assignmentId: assignment?.id ?? null,
        roleMatch: assignment ? assignment.roleId === membership.roleId : null,
        permissionResolution: permissionEval,
    };
}

module.exports = {
    getAssignmentCoverageReport,
    getSessionLinkageAnalysis,
};
