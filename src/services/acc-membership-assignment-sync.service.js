'use strict';

/**
 * ACC P2 — Dual-write: TenantMember → UrUserAssignment (migration prep only).
 * Idempotent via notes tag `legacy:<tenantMemberId>`.
 * Does NOT change runtime authorization path by itself.
 */

const prisma = require('../config/database');

function legacyTag(tenantMemberId) {
    return `legacy:${tenantMemberId}`;
}

const LEGACY_TAG_RE = /^legacy:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function isLegacyTaggedNotes(notes) {
    return typeof notes === 'string' && LEGACY_TAG_RE.test(notes);
}

/** @returns {string|null} canonical `legacy:<tenantMemberId>` */
function extractLegacyTag(notes) {
    if (!notes || typeof notes !== 'string') return null;
    const match = notes.match(LEGACY_TAG_RE);
    return match ? `legacy:${match[1]}` : null;
}

function tenantMemberIdFromLegacyNotes(notes) {
    const tag = extractLegacyTag(notes);
    return tag ? tag.slice('legacy:'.length) : null;
}

/** User-visible notes (legacy tag and optional `|` suffix stripped). */
function userNotesFromAssignmentNotes(notes) {
    if (!notes || typeof notes !== 'string') return null;
    const tag = extractLegacyTag(notes);
    if (!tag) return notes.trim() || null;
    const suffix = notes.slice(tag.length);
    if (suffix.startsWith('|')) return suffix.slice(1).trim() || null;
    return null;
}

/**
 * Preserve legacy membership linkage when saving assignment notes.
 * @param {string|null} existingNotes
 * @param {string|null} newUserNotes
 * @returns {string|null}
 */
function resolveAssignmentNotesForSave(existingNotes, newUserNotes) {
    const tag = extractLegacyTag(existingNotes);
    if (!tag) {
        return typeof newUserNotes === 'string' ? newUserNotes.trim() || null : null;
    }
    const userPart = typeof newUserNotes === 'string' ? newUserNotes.trim() : '';
    return userPart ? `${tag}|${userPart}` : tag;
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient|import('@prisma/client').PrismaClient} db
 * @param {object} member — TenantMember row with id, userId, roleId, tenantId, departmentId, isActive, canViewAllDepartments
 */
async function syncMembershipToAssignment(db, member) {
    if (!member?.id || !member.userId || !member.roleId) {
        return { action: 'skipped', reason: 'incomplete-member' };
    }

    const tag = legacyTag(member.id);
    const hasPropertyScope = member.tenantId != null;
    const hasDepartmentScope = member.departmentId != null && !member.canViewAllDepartments;

    let assignment = await db.urUserAssignment.findFirst({
        where: { notes: tag },
        select: { id: true },
    });

    if (!assignment) {
        assignment = await db.urUserAssignment.create({
            data: {
                userId:   member.userId,
                roleId:   member.roleId,
                isActive: member.isActive !== false,
                notes:    tag,
            },
            select: { id: true },
        });
    } else {
        await db.urUserAssignment.update({
            where: { id: assignment.id },
            data:  {
                roleId:   member.roleId,
                isActive: member.isActive !== false,
            },
        });
    }

    if (hasPropertyScope) {
        await db.urAssignmentProperty.upsert({
            where: {
                assignmentId_propertyId: {
                    assignmentId: assignment.id,
                    propertyId:   member.tenantId,
                },
            },
            create: { assignmentId: assignment.id, propertyId: member.tenantId },
            update: {},
        });
    } else {
        await db.urAssignmentProperty.deleteMany({ where: { assignmentId: assignment.id } });
    }

    if (hasDepartmentScope) {
        await db.urAssignmentDepartment.upsert({
            where: {
                assignmentId_departmentId: {
                    assignmentId: assignment.id,
                    departmentId: member.departmentId,
                },
            },
            create: { assignmentId: assignment.id, departmentId: member.departmentId },
            update: {},
        });
    } else {
        await db.urAssignmentDepartment.deleteMany({ where: { assignmentId: assignment.id } });
    }

    return { action: 'synced', assignmentId: assignment.id };
}

module.exports = {
    legacyTag,
    isLegacyTaggedNotes,
    extractLegacyTag,
    tenantMemberIdFromLegacyNotes,
    userNotesFromAssignmentNotes,
    resolveAssignmentNotesForSave,
    syncMembershipToAssignment,
};
