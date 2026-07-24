'use strict';

/**
 * FY 01 P4 — Create one assignment per request (one property max; NOTE 05).
 */

const prisma = require('../config/database');
const { validateCreateAssignment, ValidationError } = require('../engines/assignment.validators');
const { validateUuid } = require('../engines/assignment.validators');
const {
    provisionMembershipForProperty,
    addDepartmentsToAssignment,
} = require('./acc-assignment-membership-provision.service');
const { assertDepartmentsBelongToProperties } = require('./acc-assignment-department-scope');
const { normalizeRole } = require('./rbac.service');
const { isAccOperationalExcludedRoleCode } = require('../constants/role-codes.constants');
const auditLogger = require('../engines/ur-audit.logger');

const ORG_MANAGER_CODE = 'ORG_MANAGER';
const PLATFORM_ROLE_NOT_ASSIGNABLE = 'PLATFORM_ROLE_NOT_ASSIGNABLE';

async function _filterPropertyIdsForRole(roleCode, propertyIds, orgRootId) {
    const rc = normalizeRole(roleCode);
    if (rc === ORG_MANAGER_CODE) {
        return propertyIds;
    }
    if (!orgRootId) return propertyIds;
    return propertyIds.filter((id) => id !== orgRootId);
}

async function _resolveOrgRootId(currentTenantId) {
    if (!currentTenantId) return null;
    const current = await prisma.tenant.findUnique({
        where: { id: currentTenantId },
        select: { parentId: true },
    });
    return current?.parentId ?? currentTenantId;
}

function _creationAuditPayload(assignment, actorRoleCode, user) {
    const prop = assignment.properties?.[0]?.property ?? null;
    const departments = assignment.departments?.length
        ? assignment.departments.map((d) => ({
            id:   d.departmentId,
            name: d.department?.name ?? d.departmentId,
        }))
        : [{ id: null, name: 'All Departments' }];
    return {
        assignmentId: assignment.id,
        userId:         assignment.userId,
        userEmail:      user?.email ?? null,
        userName:       user
            ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
            : null,
        roleId:         assignment.roleId,
        roleCode:       assignment.role?.code ?? null,
        roleName:       assignment.role?.name ?? null,
        propertyId:     prop?.id ?? null,
        propertyName:   prop?.name ?? (assignment.properties?.length === 0 ? 'All Properties' : null),
        departments,
        actorRoleCode:  actorRoleCode ?? null,
        isActive:       true,
    };
}

/**
 * Create one assignment with membership provisioning.
 *
 * @returns {Promise<{ assignment: object|null, created: boolean }>}
 */
async function createAssignmentsWithProvisioning(actorId, dto, { orgGroupIds, actorRoleCode } = {}) {
    validateUuid(actorId, 'actorId');
    const validated = validateCreateAssignment(dto);

    const role = await prisma.role.findUnique({
        where: { id: validated.roleId },
        select: { id: true, code: true, name: true },
    });
    if (!role) {
        throw Object.assign(new Error('Role not found.'), { statusCode: 404 });
    }

    const roleCode = normalizeRole(role.code);
    if (isAccOperationalExcludedRoleCode(roleCode)) {
        throw Object.assign(
            new Error('Platform roles cannot be assigned via hotel Access Control.'),
            { statusCode: 403, code: PLATFORM_ROLE_NOT_ASSIGNABLE },
        );
    }

    const targetUser = await prisma.user.findUnique({
        where: { id: validated.userId },
        select: { id: true, email: true, firstName: true, lastName: true },
    });

    const orgRootId = orgGroupIds?.size
        ? await _resolveOrgRootId([...orgGroupIds][0])
        : null;

    const departmentIds = validated.departmentIds ?? [];
    const primaryDepartmentId = departmentIds[0] ?? null;

    if (roleCode === ORG_MANAGER_CODE && validated.propertyIds.length === 0) {
        const orgRootTenantId = orgRootId;
        if (!orgRootTenantId) {
            throw new ValidationError('Cannot resolve organization root for All-Properties assignment.');
        }

        const existingAllProps = await prisma.urUserAssignment.findFirst({
            where: {
                userId: validated.userId,
                roleId: validated.roleId,
                isActive: true,
                properties: { none: {} },
            },
            include: {
                role: { select: { id: true, code: true, name: true } },
                properties: { include: { property: { select: { id: true, name: true, slug: true } } } },
                departments: { include: { department: { select: { id: true, name: true, code: true } } } },
            },
        });
        if (existingAllProps) {
            return { assignment: existingAllProps, created: false };
        }

        const assignment = await prisma.$transaction(async (tx) => {
            await provisionMembershipForProperty(tx, {
                userId: validated.userId,
                roleCode,
                propertyId: orgRootTenantId,
                departmentId: primaryDepartmentId,
                notes: validated.notes,
            });

            const row = await tx.urUserAssignment.findFirst({
                where: {
                    userId: validated.userId,
                    roleId: validated.roleId,
                    isActive: true,
                    notes: { startsWith: 'legacy:' },
                },
                orderBy: { updatedAt: 'desc' },
                include: {
                    role: { select: { id: true, code: true, name: true } },
                    properties: {
                        include: { property: { select: { id: true, name: true, slug: true } } },
                    },
                    departments: {
                        include: { department: { select: { id: true, name: true, code: true } } },
                    },
                },
            });

            if (row) {
                await tx.urAssignmentProperty.deleteMany({ where: { assignmentId: row.id } });
                await addDepartmentsToAssignment(tx, actorId, row.id, departmentIds.slice(1));
            }
            return row;
        });

        if (assignment) {
            await auditLogger.logAssignmentCreated(actorId, _creationAuditPayload(assignment, actorRoleCode, targetUser));
        }
        return { assignment, created: !!assignment };
    }

    let propertyIds = validated.propertyIds;
    if (propertyIds.length === 0) {
        throw Object.assign(
            new Error('A property is required for this role.'),
            { statusCode: 400, code: 'PROPERTY_REQUIRED' },
        );
    }

    propertyIds = await _filterPropertyIdsForRole(roleCode, propertyIds, orgRootId);
    const propertyId = [...new Set(propertyIds)][0];
    if (!propertyId) {
        throw new ValidationError(
            'No valid branch property after excluding organization root. Select a branch hotel.',
        );
    }

    if (orgGroupIds?.size && !orgGroupIds.has(propertyId)) {
        throw Object.assign(
            new Error(`Property ${propertyId} is outside the organization group.`),
            { statusCode: 403 },
        );
    }

    await assertDepartmentsBelongToProperties(departmentIds, [propertyId]);

    const existing = await prisma.urUserAssignment.findFirst({
        where: {
            userId: validated.userId,
            roleId: validated.roleId,
            isActive: true,
            properties: { some: { propertyId } },
        },
        include: {
            role: { select: { id: true, code: true, name: true } },
            properties: { include: { property: { select: { id: true, name: true, slug: true } } } },
            departments: { include: { department: { select: { id: true, name: true, code: true } } } },
        },
    });
    if (existing) {
        return { assignment: existing, created: false };
    }

    const created = await prisma.$transaction(async (tx) => {
        const row = await provisionMembershipForProperty(tx, {
            userId: validated.userId,
            roleCode,
            propertyId,
            departmentId: primaryDepartmentId,
            notes: validated.notes,
        });
        await addDepartmentsToAssignment(tx, actorId, row.id, departmentIds.slice(1));
        return tx.urUserAssignment.findUnique({
            where: { id: row.id },
            include: {
                role: { select: { id: true, code: true, name: true } },
                properties: { include: { property: { select: { id: true, name: true, slug: true } } } },
                departments: { include: { department: { select: { id: true, name: true, code: true } } } },
            },
        });
    });

    await auditLogger.logAssignmentCreated(actorId, _creationAuditPayload(created, actorRoleCode, targetUser));
    return { assignment: created, created: true };
}

module.exports = {
    createAssignmentsWithProvisioning,
    _filterPropertyIdsForRole,
};
