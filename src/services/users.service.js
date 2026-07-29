const prisma = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/password');
const { assertOrgManagerAssignmentWithinOrgHierarchy } = require('../utils/membershipGuard');
const {
    countActiveSeats,
    assertSingletonRoleAvailable,
} = require('../utils/tenantMemberActive');
const { membershipRoleCode, connectRole, loadOrgManagerUserIdSet, resolveMembershipBusinessRole, userHasOrgManagerMembership, normalizeRole } = require('./rbac.service');
const { assertAssignableRole } = require('./rbac.constants');
const { syncMembershipToAssignment } = require('./acc-membership-assignment-sync.service');
const { createAssignmentsWithProvisioning } = require('./acc-assignment-fanout.service');
const {
    ACC_OPERATIONAL_EXCLUDED_ROLE_CODES,
    isAccOperationalExcludedRoleCode,
} = require('../constants/role-codes.constants');

/** ACC P2 — Settings is identity-only; access changes belong in ACC. */
function throwAccessManagedInAcc() {
    throw Object.assign(
        new Error('Role and access changes are managed in Access Control Center. Settings manages identity only.'),
        { statusCode: 403, code: 'ACCESS_MANAGED_IN_ACC' },
    );
}

async function resolveOrgGroupIds(currentTenantId) {
    if (!currentTenantId) return new Set();
    const currentTenant = await prisma.tenant.findUnique({
        where: { id: currentTenantId },
        select: { parentId: true },
    });
    const orgRootId = currentTenant?.parentId ?? currentTenantId;
    const rows = await prisma.tenant.findMany({
        where: { isActive: true, OR: [{ id: orgRootId }, { parentId: orgRootId }] },
        select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
}

/**
 * Create or resolve User identity only (no TenantMember / assignment).
 * Used by unified ACC create before fanout provisioning.
 */
const ensureUserIdentity = async (tx, data, requestingUserId) => {
    const hierarchyTenantIds = await resolveOrgHierarchyTenantIds(tx, requestingUserId);

    let targetUser = null;
    let createdNew = false;

    if (data.existingUserId) {
        targetUser = await tx.user.findUnique({ where: { id: data.existingUserId } });
        if (!targetUser) {
            throw Object.assign(new Error('Existing user not found.'), { statusCode: 404 });
        }
        const normalizedEmail = (data.email || targetUser.email || '').trim().toLowerCase();
        if (normalizedEmail && targetUser.email.toLowerCase() !== normalizedEmail) {
            throw Object.assign(
                new Error('Email does not match the selected existing user.'),
                { statusCode: 400 },
            );
        }
    } else {
        const email = (data.email || '').trim().toLowerCase();
        if (!email) {
            throw Object.assign(new Error('Valid email required.'), { statusCode: 400 });
        }
        targetUser = await tx.user.findUnique({ where: { email } });
        if (!targetUser) {
            if (!data.password) {
                throw Object.assign(new Error('Password is required for creating a new user.'), { statusCode: 400 });
            }
            if (!data.firstName || !data.lastName) {
                throw Object.assign(new Error('firstName and lastName are required for creating a new user.'), {
                    statusCode: 400,
                });
            }
            const passwordHash = await hashPassword(data.password);
            targetUser = await tx.user.create({
                data: {
                    email,
                    passwordHash,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    phone: data.phone || null,
                },
            });
            createdNew = true;
        } else if (data.firstName || data.lastName || data.phone !== undefined) {
            targetUser = await tx.user.update({
                where: { id: targetUser.id },
                data: {
                    ...(data.firstName ? { firstName: data.firstName } : {}),
                    ...(data.lastName ? { lastName: data.lastName } : {}),
                    ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
                },
            });
        }
    }

    if (!createdNew) {
        if (hierarchyTenantIds.length === 0) {
            throw Object.assign(new Error('You are not authorized to import existing users.'), { statusCode: 403 });
        }
        const inHierarchy = await assertUserInOrgHierarchy(tx, {
            userId: targetUser.id,
            hierarchyTenantIds,
        });
        if (!inHierarchy) {
            throw Object.assign(
                new Error('You can only import users that belong to your managed tenants.'),
                { statusCode: 403 },
            );
        }
    }

    return { user: targetUser, createdNew };
};

/**
 * M01 — User Management Service (Admin operations)
 */

const mapMembershipScopeFields = (membership, user) => ({
    canViewAllDepartments: Boolean(membership?.canViewAllDepartments),
    canViewAllLocations: Boolean(membership?.canViewAllLocations),
    allowedLocations: (user?.locationUsers || []).map((lu) => ({
        id: lu.location.id,
        name: lu.location.name,
        type: lu.location.type,
    })),
});

const resolveMembershipDisplayRole = (membership, orgManagerUserIds) => {
    const rawRole = membershipRoleCode(membership);
    return resolveMembershipBusinessRole(rawRole, orgManagerUserIds.has(membership.userId));
};

const syncUserLocationAssignments = async (tx, tenantId, userId, locationIds) => {
    if (!Array.isArray(locationIds)) return;
    const ids = [...new Set(locationIds.map((id) => String(id)).filter(Boolean))];
    if (ids.length > 0) {
        const valid = await tx.location.count({
            where: { tenantId, id: { in: ids }, isActive: true },
        });
        if (valid !== ids.length) {
            throw Object.assign(new Error('Invalid location for this tenant.'), { statusCode: 400 });
        }
    }
    const existing = await tx.locationUser.findMany({
        where: { userId, location: { tenantId } },
        select: { locationId: true },
    });
    const existingIds = new Set(existing.map((row) => row.locationId));
    const toAdd = ids.filter((id) => !existingIds.has(id));
    const toRemove = [...existingIds].filter((id) => !ids.includes(id));
    if (toRemove.length > 0) {
        await tx.locationUser.deleteMany({
            where: { userId, locationId: { in: toRemove } },
        });
    }
    for (const locationId of toAdd) {
        await tx.locationUser.create({ data: { userId, locationId } });
    }
};

const listUsers = async (tenantId, { page = 1, limit = 20, role, isActive, search } = {}) => {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where = {
        tenantId,
        ...(role
            ? isAccOperationalExcludedRoleCode(role)
                ? { role: { code: { in: [] } } }
                : { role: { code: role } }
            : { role: { code: { notIn: [...ACC_OPERATIONAL_EXCLUDED_ROLE_CODES] } } }),
        ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
        ...(search ? {
            user: {
                OR: [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                ],
            },
        } : {}),
    };

    const [total, memberships, activeMembersCount, tenant] = await Promise.all([
        prisma.tenantMember.count({ where }),
        prisma.tenantMember.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        department: true,
                        phone: true,
                        isActive: true,
                        lastLoginAt: true,
                        createdAt: true,
                    },
                },
                department: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                role: true,
            },
            orderBy: [{ role: { code: 'asc' } }, { user: { firstName: 'asc' } }],
            skip,
            take: limitNum,
        }),
        countActiveSeats(prisma, tenantId),
        prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { maxUsers: true },
        }),
    ]);

    const orgManagerUserIds = await loadOrgManagerUserIdSet(memberships.map((membership) => membership.userId));

    const users = memberships.map((membership) => ({
        ...membership.user,
        role: resolveMembershipDisplayRole(membership, orgManagerUserIds),
        departmentId: membership.department?.id || null,
        department: membership.department?.name || membership.user.department || null,
        isActive: membership.isActive && membership.user.isActive,
        ...mapMembershipScopeFields(membership, membership.user),
    }));

    return {
        users,
        total,
        page: pageNum,
        limit: limitNum,
        maxUsers: tenant?.maxUsers ?? 0,
        totalActiveUsers: activeMembersCount,
    };
};

/** Tenants where requester is ORG_MANAGER (legacy — org-root memberships only). */
const getOrgManagerTenantIds = async (db, userId) => {
    const memberships = await db.tenantMember.findMany({
        where: {
            userId,
            role: { code: 'ORG_MANAGER' },
            isActive: true,
            tenantId: { not: null },
        },
        select: { tenantId: true },
        distinct: ['tenantId'],
    });

    return memberships.map((membership) => membership.tenantId).filter(Boolean);
};

/**
 * All tenant IDs an ORG_MANAGER may search/import users from (org root + branch hotels).
 * - Org roots where user is ORG_MANAGER
 * - Active branch hotels under those roots
 * - Direct branch memberships where user is ORG_MANAGER
 */
const resolveOrgHierarchyTenantIds = async (db, userId) => {
    const directTenantIds = await getOrgManagerTenantIds(db, userId);
    if (directTenantIds.length === 0) return [];

    const directTenants = await db.tenant.findMany({
        where: { id: { in: directTenantIds }, isActive: true },
        select: { id: true, parentId: true },
    });

    const orgRootIds = new Set();
    for (const tenant of directTenants) {
        if (tenant.parentId == null) {
            orgRootIds.add(tenant.id);
        } else {
            orgRootIds.add(tenant.parentId);
        }
    }

    if (orgRootIds.size === 0) {
        return [...new Set(directTenantIds)];
    }

    const hierarchyTenants = await db.tenant.findMany({
        where: {
            isActive: true,
            OR: [
                { id: { in: [...orgRootIds] } },
                { parentId: { in: [...orgRootIds] } },
            ],
        },
        select: { id: true },
    });

    return [...new Set([...hierarchyTenants.map((t) => t.id), ...directTenantIds])];
};

const assertUserInOrgHierarchy = async (db, { userId, hierarchyTenantIds }) => {
    if (!userId || hierarchyTenantIds.length === 0) return false;
    const membership = await db.tenantMember.findFirst({
        where: {
            userId,
            tenantId: { in: hierarchyTenantIds },
            isActive: true,
        },
        select: { tenantId: true },
    });
    return Boolean(membership);
};

const searchExistingUsers = async (requestingUserId, email) => {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) return [];

    const hierarchyTenantIds = await resolveOrgHierarchyTenantIds(prisma, requestingUserId);
    if (hierarchyTenantIds.length === 0) return [];

    const users = await prisma.user.findMany({
        where: {
            email: { contains: normalizedEmail, mode: 'insensitive' },
            memberships: {
                some: {
                    tenantId: { in: hierarchyTenantIds },
                    isActive: true,
                },
            },
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
        },
        take: 20,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    });

    return users;
};

const createUser = async (tenantId, data, requestingUserId, actorContext = {}) => {
    const initialAssignment = data.initialAssignment && data.initialAssignment.roleId
        ? data.initialAssignment
        : null;

    // ── Unified ACC path: identity + assignment via fanout (membership SSOT) ──
    if (initialAssignment) {
        const propertyIds = Array.isArray(initialAssignment.propertyIds)
            ? initialAssignment.propertyIds
            : [];
        const departmentIds = Array.isArray(initialAssignment.departmentIds)
            ? initialAssignment.departmentIds
            : [];

        if (propertyIds.length === 0 && actorContext.actorRoleCode !== 'ORG_MANAGER') {
            throw Object.assign(
                new Error('Only Organization Managers may create All-Properties assignments.'),
                { statusCode: 403 },
            );
        }

        const orgGroupIds =
            actorContext.orgGroupIds instanceof Set
                ? actorContext.orgGroupIds
                : await resolveOrgGroupIds(tenantId);

        if (propertyIds.length > 0) {
            const outOfScope = propertyIds.filter((pid) => !orgGroupIds.has(pid));
            if (outOfScope.length > 0) {
                throw Object.assign(
                    new Error(
                        `Cannot assign to properties outside the organization group: ${outOfScope.join(', ')}`,
                    ),
                    { statusCode: 403 },
                );
            }
        }

        const { user: identity, createdNew } = await prisma.$transaction(async (tx) =>
            ensureUserIdentity(tx, data, requestingUserId),
        );

        try {
            const result = await createAssignmentsWithProvisioning(
                requestingUserId,
                {
                    userId: identity.id,
                    roleId: initialAssignment.roleId,
                    propertyIds,
                    departmentIds,
                    notes: initialAssignment.notes ?? null,
                },
                {
                    orgGroupIds,
                    actorRoleCode: actorContext.actorRoleCode ?? null,
                },
            );

            if (!result.assignment) {
                throw Object.assign(new Error('Failed to create assignment.'), { statusCode: 500 });
            }

            const assignment = result.assignment;
            return {
                id: identity.id,
                email: identity.email,
                firstName: identity.firstName,
                lastName: identity.lastName,
                phone: identity.phone,
                isActive: identity.isActive,
                createdAt: identity.createdAt,
                role: assignment.role?.code ?? null,
                departmentId: assignment.departments?.[0]?.departmentId ?? null,
                department: assignment.departments?.[0]?.department?.name ?? null,
                assignment: {
                    id: assignment.id,
                    roleId: assignment.roleId,
                    roleCode: assignment.role?.code ?? null,
                    roleName: assignment.role?.name ?? null,
                    isActive: assignment.isActive,
                    properties: (assignment.properties ?? []).map((p) => ({
                        id: p.propertyId,
                        name: p.property?.name,
                    })),
                    departments: (assignment.departments ?? []).map((d) => ({
                        id: d.departmentId,
                        name: d.department?.name,
                    })),
                    allProperties: (assignment.properties ?? []).length === 0,
                    allDepartments: (assignment.departments ?? []).length === 0,
                },
            };
        } catch (err) {
            // All-or-nothing: remove orphan identity if we just created it and it has no memberships.
            if (createdNew) {
                const membershipCount = await prisma.tenantMember.count({
                    where: { userId: identity.id },
                });
                if (membershipCount === 0) {
                    await prisma.user.delete({ where: { id: identity.id } }).catch(() => {});
                }
            }
            throw err;
        }
    }

    // ── Legacy Settings path: role code + membership sync ──
    assertAssignableRole(data.role);

    const user = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, maxUsers: true },
        });
        if (!tenant) {
            throw Object.assign(new Error('Tenant not found.'), { statusCode: 404 });
        }

        let departmentRecord = null;
        if (data.departmentId) {
            departmentRecord = await tx.department.findFirst({
                where: {
                    id: data.departmentId,
                    tenantId,
                    isActive: true,
                },
                select: { id: true, name: true },
            });
            if (!departmentRecord) {
                throw Object.assign(new Error('Invalid department for this tenant.'), { statusCode: 400 });
            }
        }

        const { user: targetUser } = await ensureUserIdentity(tx, data, requestingUserId);

        // Import path still needs org-manager hierarchy guard when reusing identity.
        if (data.existingUserId || (await tx.user.findUnique({ where: { id: targetUser.id } }))) {
            await assertOrgManagerAssignmentWithinOrgHierarchy(tx, {
                userId: targetUser.id,
                targetTenantId: tenantId,
            });
        }

        const existingMembership = await tx.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId, userId: targetUser.id } },
            select: { isActive: true },
        });
        const willConsumeNewSeat = !existingMembership || !existingMembership.isActive;

        if (willConsumeNewSeat) {
            const activeMembersCount = await countActiveSeats(tx, tenantId);
            if (activeMembersCount >= tenant.maxUsers) {
                throw Object.assign(new Error('Maximum user limit reached for this hotel.'), { statusCode: 400 });
            }
        }

        await assertSingletonRoleAvailable(tx, {
            tenantId,
            role: data.role,
            excludeUserId: targetUser.id,
        });

        const departmentOnCreate = departmentRecord?.id
            ? { department: { connect: { id: departmentRecord.id } } }
            : {};
        const departmentOnUpdate = departmentRecord?.id
            ? { department: { connect: { id: departmentRecord.id } } }
            : { department: { disconnect: true } };

        await tx.tenantMember.upsert({
            where: { tenantId_userId: { tenantId, userId: targetUser.id } },
            create: {
                tenant: { connect: { id: tenantId } },
                user: { connect: { id: targetUser.id } },
                role: connectRole(data.role),
                isActive: true,
                ...departmentOnCreate,
            },
            update: {
                role: connectRole(data.role),
                isActive: true,
                ...departmentOnUpdate,
            },
        });

        const membership = await tx.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId, userId: targetUser.id } },
            include: {
                user: true,
                department: {
                    select: { id: true, name: true },
                },
                role: true,
            },
        });

        await syncMembershipToAssignment(tx, membership);

        await tx.user.update({
            where: { id: targetUser.id },
            data: { permissionVersion: { increment: 1 } },
        });

        const hasOrgManagerMembership = await userHasOrgManagerMembership(targetUser.id, tx);

        return {
            id: membership.user.id,
            email: membership.user.email,
            firstName: membership.user.firstName,
            lastName: membership.user.lastName,
            role: resolveMembershipBusinessRole(membershipRoleCode(membership), hasOrgManagerMembership),
            departmentId: membership.department?.id || null,
            department: membership.department?.name || null,
            phone: membership.user.phone,
            isActive: membership.isActive && membership.user.isActive,
            createdAt: membership.user.createdAt,
        };
    });

    return user;
};

const updateUser = async (tenantId, userId, data, requestingUserId) => {
    const membership = await prisma.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        include: { user: true, role: true },
    });
    if (!membership) {
        throw Object.assign(new Error('User not found.'), { statusCode: 404 });
    }

    const updateData = {};
    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.department !== undefined) updateData.department = data.department;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.password) {
        const isSelfPasswordChange = requestingUserId && String(requestingUserId) === String(userId);
        if (isSelfPasswordChange) {
            const current = data.currentPassword;
            if (current === undefined || current === null || String(current).trim() === '') {
                throw Object.assign(new Error('Current password is required.'), {
                    statusCode: 400,
                    code: 'CURRENT_PASSWORD_REQUIRED',
                });
            }
            const ok = await comparePassword(String(current), membership.user.passwordHash);
            if (!ok) {
                throw Object.assign(new Error('Current password is incorrect.'), {
                    statusCode: 401,
                    code: 'CURRENT_PASSWORD_INCORRECT',
                });
            }
            const reuse = await comparePassword(data.password, membership.user.passwordHash);
            if (reuse) {
                throw Object.assign(
                    new Error('New password must be different from your current password.'),
                    { statusCode: 400, code: 'PASSWORD_UNCHANGED' },
                );
            }
        }
        updateData.passwordHash = await hashPassword(data.password);
    }

    const updated = await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
            where: { id: userId },
            data: updateData,
        });

        let updatedMembership = membership;
        const membershipUpdate = {};
        if (data.isActive !== undefined) membershipUpdate.isActive = data.isActive;
        if (data.canViewAllDepartments !== undefined) {
            membershipUpdate.canViewAllDepartments = Boolean(data.canViewAllDepartments);
        }
        if (data.canViewAllLocations !== undefined) {
            membershipUpdate.canViewAllLocations = Boolean(data.canViewAllLocations);
        }
        // Mirror createUser: apply membership department via departmentId (connect / disconnect).
        if (data.departmentId !== undefined) {
            if (data.departmentId) {
                const departmentRecord = await tx.department.findFirst({
                    where: {
                        id: data.departmentId,
                        tenantId,
                        isActive: true,
                    },
                    select: { id: true, name: true },
                });
                if (!departmentRecord) {
                    throw Object.assign(new Error('Invalid department for this tenant.'), {
                        statusCode: 400,
                    });
                }
                membershipUpdate.department = { connect: { id: departmentRecord.id } };
            } else {
                membershipUpdate.department = { disconnect: true };
            }
        }
        if (data.role !== undefined) {
            const currentCode = normalizeRole(membershipRoleCode(membership));
            const requestedCode = normalizeRole(data.role);
            if (requestedCode !== currentCode) {
                throwAccessManagedInAcc();
            }
        }
        const nextMembershipActive =
            data.isActive !== undefined ? Boolean(data.isActive) : membership.isActive;
        const willBeEffectivelyActive = nextMembershipActive && membership.user.isActive;
        if (data.role !== undefined && willBeEffectivelyActive) {
            await assertSingletonRoleAvailable(tx, {
                tenantId,
                role: membershipRoleCode(membership),
                excludeUserId: userId,
            });
        }
        if (Object.keys(membershipUpdate).length > 0) {
            updatedMembership = await tx.tenantMember.update({
                where: { tenantId_userId: { tenantId, userId } },
                data: membershipUpdate,
                include: { user: true, role: true, department: { select: { id: true, name: true } } },
            });
        }

        if (data.locationIds !== undefined) {
            await syncUserLocationAssignments(tx, tenantId, userId, data.locationIds);
        }

        if (Object.keys(membershipUpdate).length > 0 || data.locationIds !== undefined) {
            await tx.user.update({
                where: { id: userId },
                data: { permissionVersion: { increment: 1 } },
            });
        }

        const membershipWithScope = await tx.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId, userId } },
            include: {
                role: true,
                department: { select: { id: true, name: true } },
                user: {
                    include: {
                        locationUsers: {
                            include: { location: { select: { id: true, name: true, type: true } } },
                        },
                    },
                },
            },
        });

        const scopeMembership = membershipWithScope || updatedMembership;
        const hasOrgManagerMembership = await userHasOrgManagerMembership(userId, tx);

        if (scopeMembership) {
            await syncMembershipToAssignment(tx, scopeMembership);
        }

        const resolvedDepartment =
            membershipWithScope?.department ||
            updatedMembership?.department ||
            null;

        return {
            id: updatedUser.id,
            email: updatedUser.email,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            role: resolveMembershipBusinessRole(membershipRoleCode(scopeMembership), hasOrgManagerMembership),
            departmentId: resolvedDepartment?.id || membershipWithScope?.departmentId || null,
            department: resolvedDepartment?.name || updatedUser.department || null,
            phone: updatedUser.phone,
            isActive: (membershipWithScope || updatedMembership).isActive && updatedUser.isActive,
            updatedAt: updatedUser.updatedAt,
            ...mapMembershipScopeFields(membershipWithScope || updatedMembership, membershipWithScope?.user),
        };
    });

    return updated;
};

const updateUserRole = async (tenantId, userId, role, requestingUserId) => {
    throwAccessManagedInAcc();
};

const getUserById = async (tenantId, userId) => {
    const membership = await prisma.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        include: {
            department: { select: { id: true, name: true } },
            role: true,
            user: {
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    department: true,
                    phone: true,
                    isActive: true,
                    lastLoginAt: true,
                    createdAt: true,
                    locationUsers: {
                        include: { location: { select: { id: true, name: true, type: true } } },
                    },
                },
            },
        },
    });

    if (!membership) {
        throw Object.assign(new Error('User not found.'), { statusCode: 404 });
    }

    const orgManagerUserIds = await loadOrgManagerUserIdSet([membership.userId]);

    return {
        ...membership.user,
        role: resolveMembershipDisplayRole(membership, orgManagerUserIds),
        departmentId: membership.department?.id || null,
        department: membership.department?.name || membership.user.department || null,
        isActive: membership.isActive && membership.user.isActive,
        ...mapMembershipScopeFields(membership, membership.user),
    };
};

module.exports = {
    listUsers,
    searchExistingUsers,
    createUser,
    updateUser,
    updateUserRole,
    getUserById,
    getOrgManagerTenantIds,
    resolveOrgHierarchyTenantIds,
    assertUserInOrgHierarchy,
};
