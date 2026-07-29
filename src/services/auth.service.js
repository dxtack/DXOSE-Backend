const crypto = require('crypto');
const prisma = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/password');
const { sendPasswordResetOtpEmail } = require('../utils/mailer');
const { normalizeEmailForLookup } = require('../utils/emailNormalize');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken, getRefreshTokenExpiry } = require('../utils/jwt');
const logger = require('../utils/logger');
const {
    membershipRoleCode,
    getRoleIdByCode,
    resolveUserBestRole,
    resolveMembershipBusinessRole,
    userHasOrgManagerMembership,
    connectRole,
} = require('./rbac.service');
const accRuntime = require('../acc-runtime');
const { _findSessionAssignment } = require('../acc-runtime/resolvePermissions');
const { resolveTenantMembership } = require('../utils/resolveTenantMembership');
const { findActiveTenantBySlug } = require('../utils/tenantSlugResolve');
const { ensureTenantSwitchable } = require('../utils/tenantSwitchValidation');
const { legacyTag, tenantMemberIdFromLegacyNotes } = require('./acc-membership-assignment-sync.service');

/**
 * M01 — Auth Service
 */

/** OTP validity window (15 minutes). */
const PASSWORD_RESET_OTP_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_EXPIRES_MINUTES = 15;

const generateSixDigitOtp = () => String(crypto.randomInt(100000, 1000000));

const formatMembershipOption = (membership, businessRole) => ({
    tenantId: membership.tenantId,
    tenantSlug: membership.tenant?.slug || null,
    tenantName: membership.tenant?.name || null,
    timezone: membership.tenant?.timezone || null,
    parentId: membership.tenant?.parentId || null,
    role: businessRole ?? membershipRoleCode(membership),
    isInherited: Boolean(membership.isInherited),
    isSuperAdmin: membership.tenantId === null,
});

const formatMembershipOptionsForUser = async (memberships, userId) => {
    const hasOrgManagerMembership = await userHasOrgManagerMembership(userId);
    return (memberships || []).map((membership) =>
        formatMembershipOption(
            membership,
            resolveMembershipBusinessRole(membershipRoleCode(membership), hasOrgManagerMembership),
        ),
    );
};

/**
 * Active ACC assignments for the header role switcher.
 * When propertyId is set, only include assignments that cover that property
 * (explicit property row OR all-properties / empty junction).
 */
const listAvailableAssignmentsForUser = async (userId, { propertyId } = {}) => {
    if (!userId) return [];

    const rows = await prisma.urUserAssignment.findMany({
        where: {
            userId,
            isActive: true,
            ...(propertyId
                ? {
                      OR: [
                          { properties: { some: { propertyId } } },
                          { properties: { none: {} } },
                      ],
                  }
                : {}),
        },
        include: {
            role: { select: { code: true, name: true } },
            properties: {
                select: {
                    propertyId: true,
                    property: { select: { id: true, name: true } },
                },
            },
            departments: {
                select: { department: { select: { name: true } } },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    const out = [];
    for (const row of rows) {
        const departments = row.departments.length
            ? row.departments.map((d) => d.department?.name).filter(Boolean)
            : ['All Departments'];

        if (!row.properties.length) {
            out.push({
                id: row.id,
                roleCode: row.role.code,
                roleName: row.role.name,
                propertyId: propertyId ?? null,
                propertyName: 'All Properties',
                departments,
            });
            continue;
        }

        const targets = propertyId
            ? row.properties.filter((p) => p.propertyId === propertyId)
            : row.properties;

        for (const p of targets) {
            out.push({
                id: row.id,
                roleCode: row.role.code,
                roleName: row.role.name,
                propertyId: p.property?.id ?? p.propertyId,
                propertyName: p.property?.name ?? 'Property',
                departments,
            });
        }
    }
    return out;
};

const resolveActiveAssignmentId = async (userId, membership, roleId, preferredAssignmentId = null) => {
    const found = await _findSessionAssignment(userId, membership, roleId, preferredAssignmentId);
    return found?.id ?? null;
};

/**
 * Login-time tenant choices: org roots only for ORG_MANAGER (branch hotels are chosen on dashboard).
 * Other roles: exclude inherited branch rows from the selection count.
 */
const getLoginSelectableMemberships = (memberships) => {
    const hasRootOrgManager = memberships.some(
        (m) =>
            membershipRoleCode(m) === 'ORG_MANAGER' &&
            m.tenant &&
            m.tenant.parentId === null
    );

    if (hasRootOrgManager) {
        return memberships.filter(
            (m) =>
                m.tenant &&
                m.tenant.parentId === null &&
                membershipRoleCode(m) === 'ORG_MANAGER'
        );
    }

    return memberships.filter((m) => !m.isInherited);
};

const buildAccountInactiveError = () => Object.assign(
    new Error('Your account has been deactivated by the admin.'),
    {
        statusCode: 401,
        code: 'ACCOUNT_INACTIVE',
    }
);

/**
 * Count active ACC assignments for login access decisions.
 * Login is allowed when User.isActive and at least one active assignment exists
 * (even if TenantMember rows were incorrectly retired).
 */
const countActiveAssignmentsForUser = async (userId) => {
    if (!userId) return 0;
    return prisma.urUserAssignment.count({
        where: { userId, isActive: true },
    });
};

/**
 * Re-activate TenantMember seats for properties covered by active assignments.
 * Recovers login when assignment deactivate wrongly retired a shared membership.
 * Returns refreshed active memberships (with tenant + role), or [] if none healed.
 */
const healMembershipsFromActiveAssignments = async (userId) => {
    const assignments = await prisma.urUserAssignment.findMany({
        where: { userId, isActive: true },
        include: {
            role: { select: { id: true, code: true } },
            properties: { select: { propertyId: true } },
            departments: { select: { departmentId: true } },
        },
        orderBy: { createdAt: 'asc' },
    });
    if (assignments.length === 0) return [];

    for (const assignment of assignments) {
        let propertyId = assignment.properties[0]?.propertyId ?? null;
        if (!propertyId) {
            const memberId = tenantMemberIdFromLegacyNotes(assignment.notes);
            if (memberId) {
                const tagged = await prisma.tenantMember.findUnique({
                    where: { id: memberId },
                    select: { tenantId: true, userId: true },
                });
                if (tagged?.userId === userId) propertyId = tagged.tenantId;
            }
        }
        if (!propertyId || !assignment.role?.code) continue;

        const primaryDept = assignment.departments[0]?.departmentId ?? null;
        const departmentOnCreate = primaryDept
            ? { department: { connect: { id: primaryDept } } }
            : {};
        const departmentOnUpdate = primaryDept
            ? { department: { connect: { id: primaryDept } }, canViewAllDepartments: false }
            : { department: { disconnect: true }, canViewAllDepartments: true };

        await prisma.tenantMember.upsert({
            where: { tenantId_userId: { tenantId: propertyId, userId } },
            create: {
                tenant: { connect: { id: propertyId } },
                user: { connect: { id: userId } },
                role: connectRole(assignment.role.code),
                isActive: true,
                ...departmentOnCreate,
            },
            update: {
                role: connectRole(assignment.role.code),
                isActive: true,
                ...departmentOnUpdate,
            },
        });
    }

    return prisma.tenantMember.findMany({
        where: { userId, isActive: true },
        include: { tenant: true, role: true },
    });
};

/** Org manager with legacy inactive branch row: grant active ORG_MANAGER on that hotel. */
const healOrgManagerBranchAccess = async (userId, branchTenantId, parentOrgId) => {
    if (!userId || !branchTenantId || !parentOrgId) {
        return false;
    }

    const parentOm = await prisma.tenantMember.findFirst({
        where: {
            userId,
            tenantId: parentOrgId,
            role: { code: 'ORG_MANAGER' },
            isActive: true,
        },
        select: { id: true },
    });
    if (!parentOm) {
        return false;
    }

    await prisma.tenantMember.upsert({
        where: { tenantId_userId: { tenantId: branchTenantId, userId } },
        create: {
            tenant: { connect: { id: branchTenantId } },
            user: { connect: { id: userId } },
            role: connectRole('ORG_MANAGER'),
            isActive: true,
        },
        update: {
            role: connectRole('ORG_MANAGER'),
            isActive: true,
        },
    });

    return true;
};

const buildInheritedOrgManagerMemberships = async (activeMemberships) => {
    const orgManagerRoleId = await getRoleIdByCode('ORG_MANAGER');
    const mergedMemberships = activeMemberships.map((membership) => ({ ...membership }));
    const parentOrgMemberships = activeMemberships.filter(
        (membership) =>
            membershipRoleCode(membership) === 'ORG_MANAGER' &&
            membership.tenant?.parentId === null &&
            membership.tenantId
    );

    if (parentOrgMemberships.length === 0) return mergedMemberships;

    const parentOrgIds = [...new Set(parentOrgMemberships.map((membership) => membership.tenantId))];

    for (const orgId of parentOrgIds) {
        // CRITICAL: must be strictly scoped to the specific parent org.
        const children = await prisma.tenant.findMany({
            where: {
                parentId: orgId,
                isActive: true,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                parentId: true,
                timezone: true,
                isActive: true,
                subStatus: true,
            },
        });

        for (const child of children) {
            const existingIndex = mergedMemberships.findIndex((membership) => membership.tenantId === child.id);
            if (existingIndex >= 0) {
                mergedMemberships[existingIndex] = {
                    ...mergedMemberships[existingIndex],
                    role: orgManagerRoleId ? { id: orgManagerRoleId, code: 'ORG_MANAGER' } : { code: 'ORG_MANAGER' },
                    roleId: orgManagerRoleId || undefined,
                    tenant: { ...(mergedMemberships[existingIndex].tenant || {}), ...child },
                    isInherited: true,
                    isActive: true,
                };
                continue;
            }

            mergedMemberships.push({
                tenantId: child.id,
                role: orgManagerRoleId ? { id: orgManagerRoleId, code: 'ORG_MANAGER' } : { code: 'ORG_MANAGER' },
                roleId: orgManagerRoleId || undefined,
                tenant: child,
                isActive: true,
                isInherited: true,
            });
        }
    }

    return mergedMemberships;
};

const buildSuspensionError = (code) => {
    const messages = {
        ACCOUNT_SUSPENDED: 'This account has been suspended.',
        ORGANIZATION_SUSPENDED: 'This organization has been suspended.',
    };
    return Object.assign(new Error(messages[code] || code), { statusCode: 403, code });
};
const logAuthCheck = ({ email, tenant }) => {
    if (!tenant) return;
    const parentAdminStatus = tenant.parent?.adminStatus || 'N/A';
    const parentSubStatus = tenant.parent?.subStatus || 'N/A';
    console.log(
        `Auth Check: User [${email}] attempting access to Tenant [${tenant.slug}]. ParentId: [${tenant.parentId || 'null'}], AdminStatus: [${tenant.adminStatus}], ParentAdminStatus: [${parentAdminStatus}], SubStatus: [${tenant.subStatus}], ParentSubStatus: [${parentSubStatus}].`
    );
};

const ensureTenantNotSuspended = async (tenantId) => {
    if (!tenantId) return;

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, parentId: true, adminStatus: true, subStatus: true, isActive: true },
    });

    if (!tenant) return;

    if (tenant.adminStatus === 'SUSPENDED') {
        throw buildSuspensionError('ACCOUNT_SUSPENDED');
    }

    if (tenant.parentId) {
        const parent = await prisma.tenant.findUnique({
            where: { id: tenant.parentId },
            select: { id: true, adminStatus: true, isActive: true },
        });
        if (parent && parent.adminStatus === 'SUSPENDED') {
            throw buildSuspensionError('ORGANIZATION_SUSPENDED');
        }
    }
};

const issueSessionForMembership = async ({
    user,
    membership,
    ipAddress,
    userAgent,
    assignmentId = null,
    sessionRoleCode = null,
}) => {
    const roleCodeRaw = sessionRoleCode || membershipRoleCode(membership);
    // When an explicit assignment role is selected, do not promote away from it.
    const bestRole = sessionRoleCode
        ? sessionRoleCode
        : await resolveUserBestRole(user.id, roleCodeRaw);
    let roleId = membership.roleId ?? membership.role?.id;
    if (bestRole) {
        const bestRoleId = await getRoleIdByCode(bestRole);
        if (bestRoleId) roleId = bestRoleId;
    } else if (!roleId && roleCodeRaw) {
        roleId = await getRoleIdByCode(roleCodeRaw);
    }
    const availableAssignments = await listAvailableAssignmentsForUser(user.id, {
        propertyId: membership.tenantId ?? null,
    });
    const activeAssignmentId =
        assignmentId ||
        (await resolveActiveAssignmentId(user.id, membership, roleId, assignmentId)) ||
        availableAssignments[0]?.id ||
        null;

    // Prefer the active assignment's role for JWT/session when no explicit switch role.
    let sessionRole = bestRole;
    let sessionRoleId = roleId;
    if (!sessionRoleCode && activeAssignmentId) {
        const fromList = availableAssignments.find((a) => a.id === activeAssignmentId);
        if (fromList?.roleCode) {
            sessionRole = fromList.roleCode;
            const fromListRoleId = await getRoleIdByCode(fromList.roleCode);
            if (fromListRoleId) sessionRoleId = fromListRoleId;
        }
    }

    const permissions = await accRuntime.resolvePermissionsForMembership({
        userId: user.id,
        membership,
        roleId: sessionRoleId,
        roleCode: sessionRole,
        assignmentId: activeAssignmentId,
    });
    let permissionVersion = user.permissionVersion;
    if (permissionVersion === undefined || permissionVersion === null) {
        const versionRow = await prisma.user.findUnique({
            where: { id: user.id },
            select: { permissionVersion: true },
        });
        permissionVersion = versionRow?.permissionVersion ?? 0;
    }
    const tokenPayload = {
        userId: user.id,
        tenantId: membership.tenantId,
        role: sessionRole,
        email: user.email,
        ...(sessionRoleId ? { roleId: sessionRoleId } : {}),
        ...(activeAssignmentId ? { assignmentId: activeAssignmentId } : {}),
        permissions,
        permissionVersion,
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    await prisma.refreshToken.create({
        data: {
            userId: user.id,
            token: refreshToken,
            expiresAt: getRefreshTokenExpiry(),
            ipAddress,
            userAgent,
        },
    });

    await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });

    /** Always load from DB so refresh/inherited memberships still expose parentId for branch hotel admins. */
    const tenantSnapshot =
        membership.tenantId != null
            ? await prisma.tenant.findUnique({
                  where: { id: membership.tenantId },
                  select: { id: true, name: true, slug: true, parentId: true, timezone: true },
              })
            : null;

    return {
        accessToken,
        refreshToken,
        permissions,
        availableAssignments,
        activeAssignmentId,
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: sessionRole,
            permissions,
            department: user.department,
            departmentId: membership.departmentId ?? null,
            tenantId: membership.tenantId,
            tenantName: tenantSnapshot?.name || membership.tenant?.name || null,
            tenantTimezone: tenantSnapshot?.timezone || membership.tenant?.timezone || null,
            availableAssignments,
            activeAssignmentId,
            ...(tenantSnapshot
                ? {
                      tenant: {
                          id: tenantSnapshot.id,
                          name: tenantSnapshot.name,
                          slug: tenantSnapshot.slug,
                          parentId: tenantSnapshot.parentId,
                          timezone: tenantSnapshot.timezone,
                      },
                  }
                : {}),
        },
    };
};

/** Attach switchable tenants (org roots + branch hotels) for header switcher / org dashboard. */
const attachSessionMemberships = async (sessionResult, userId, membershipsWithInheritance) => {
    let list = membershipsWithInheritance;
    if (!Array.isArray(list) || list.length === 0) {
        const activeMemberships = await prisma.tenantMember.findMany({
            where: { userId, isActive: true },
            include: { tenant: true, role: true },
        });
        const inherited = await buildInheritedOrgManagerMemberships(activeMemberships);
        list = inherited.length > 0 ? inherited : activeMemberships;
    }
    sessionResult.user.memberships = await formatMembershipOptionsForUser(list, userId);
    return sessionResult;
};

/**
 * Login: verify credentials, then either issue session or return tenant choices
 */
const login = async ({ email, password, tenantSlug, ipAddress, userAgent }) => {
    const normalizedEmail = normalizeEmailForLookup(email);
    const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
    });

    if (!user) {
        throw Object.assign(new Error('Invalid email or password.'), {
            statusCode: 401,
            code: 'INVALID_CREDENTIALS',
        });
    }

    // Master account explicitly disabled — block with Account Deactivated (not credentials).
    if (!user.isActive) {
        throw buildAccountInactiveError();
    }

    const passwordValid = await comparePassword(password, user.passwordHash);
    if (!passwordValid) {
        throw Object.assign(new Error('Invalid email or password.'), {
            statusCode: 401,
            code: 'INVALID_CREDENTIALS',
        });
    }

    const memberships = await prisma.tenantMember.findMany({
        where: { userId: user.id },
        include: { tenant: true, role: true },
    });

    console.log('DEBUG: Found memberships count:', memberships.length);
    console.log('DEBUG: Memberships IDs:', memberships.map((m) => m.tenantId));
    console.log('DEBUG: Provided tenantSlug:', tenantSlug);

    let activeMemberships = memberships.filter((membership) => membership.isActive);

    // If all memberships are inactive but the user still has active ACC assignments,
    // heal TenantMember seats from those assignments so login can proceed.
    if (activeMemberships.length === 0) {
        const activeAssignmentCount = await countActiveAssignmentsForUser(user.id);
        if (activeAssignmentCount === 0) {
            if (memberships.length > 0) {
                throw buildAccountInactiveError();
            }
            throw Object.assign(new Error('No active tenant membership found for this user.'), {
                statusCode: 403,
                code: 'NO_ACTIVE_MEMBERSHIP',
            });
        }
        const healed = await healMembershipsFromActiveAssignments(user.id);
        if (healed.length === 0) {
            throw buildAccountInactiveError();
        }
        activeMemberships = healed;
        memberships.splice(0, memberships.length, ...healed);
    }

    // Strict Membership Guard at login-time:
    // If user is an ORG_MANAGER of any root org, they must only see that org (or orgs)
    // and its direct children — even if legacy "stray" memberships exist in DB.
    const rootOrgManagerOrgIds = [
        ...new Set(
            activeMemberships
                .filter(
                    (m) =>
                        membershipRoleCode(m) === 'ORG_MANAGER' &&
                        m.tenantId &&
                        m.tenant &&
                        m.tenant.parentId === null
                )
                .map((m) => m.tenantId)
        ),
    ];

    if (rootOrgManagerOrgIds.length > 0) {
        activeMemberships = activeMemberships.filter((m) => {
            // Keep super-admin context untouched (tenantId null), if it exists.
            if (!m.tenantId) return true;
            if (!m.tenant) return false;

            // Keep membership if it's the root org itself OR a direct child of that org.
            return (
                rootOrgManagerOrgIds.includes(m.tenantId) ||
                (m.tenant.parentId && rootOrgManagerOrgIds.includes(m.tenant.parentId))
            );
        });
    }

    const inheritedOrMergedMemberships = await buildInheritedOrgManagerMemberships(activeMemberships);
    let activeMembershipsWithInheritance = inheritedOrMergedMemberships.length > 0
        ? inheritedOrMergedMemberships
        : activeMemberships;

    // Filter out suspended tenants (self) and tenants under suspended organizations.
    const tenantIds = [
        ...new Set(activeMembershipsWithInheritance.map((m) => m.tenantId).filter(Boolean)),
    ];
    let suspensionFailureCode = null;
    if (tenantIds.length > 0) {
        const tenants = await prisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, parentId: true, adminStatus: true, subStatus: true, isActive: true },
        });
        const tenantById = new Map(tenants.map((t) => [t.id, t]));
        const parentIds = [...new Set(tenants.map((t) => t.parentId).filter(Boolean))];
        const parents = parentIds.length > 0
            ? await prisma.tenant.findMany({
                where: { id: { in: parentIds } },
                select: { id: true, adminStatus: true, isActive: true },
            })
            : [];
        const parentById = new Map(parents.map((p) => [p.id, p]));

        activeMembershipsWithInheritance = activeMembershipsWithInheritance.filter((m) => {
            if (!m.tenantId) return true;
            const t = tenantById.get(m.tenantId);
            if (!t || !t.isActive) return false;
            if (t.adminStatus === 'SUSPENDED') {
                suspensionFailureCode = suspensionFailureCode || 'ACCOUNT_SUSPENDED';
                return false;
            }
            if (t.parentId) {
                const p = parentById.get(t.parentId);
                if (p && p.adminStatus === 'SUSPENDED') {
                    suspensionFailureCode = 'ORGANIZATION_SUSPENDED';
                    return false;
                }
            }
            return true;
        });
    }

    const normalizedTenantSlug = typeof tenantSlug === 'string' ? tenantSlug.trim() : '';
    const totalMemberships = activeMembershipsWithInheritance.length;
    const loginSelectableMemberships = getLoginSelectableMemberships(activeMembershipsWithInheritance);
    const loginSelectableCount = loginSelectableMemberships.length;

    if (totalMemberships === 0 && suspensionFailureCode) {
        throw buildSuspensionError(suspensionFailureCode);
    }

    if (loginSelectableCount > 1 && !normalizedTenantSlug) {
        console.log('DEBUG: Triggering Tenant Selection Response');
        return {
            success: true,
            requiresTenantSelection: true,
            data: {
                memberships: await formatMembershipOptionsForUser(loginSelectableMemberships, user.id),
            },
        };
    }

    if (activeMembershipsWithInheritance.length === 0) {
        if (normalizedTenantSlug) {
            const attemptedTenant = await prisma.tenant.findFirst({
                where: { slug: normalizedTenantSlug },
                select: { id: true },
            });
            if (attemptedTenant?.id) {
                const resolved = await resolveTenantMembership(prisma, user.id, attemptedTenant.id, {
                    include: { tenant: true, role: true },
                    attachTenant: true,
                });
                if (resolved.membership) {
                    await ensureTenantNotSuspended(resolved.membership.tenantId);
                    const result = await issueSessionForMembership({
                        user,
                        membership: resolved.membership,
                        ipAddress,
                        userAgent,
                    });
                    logger.info(
                        `User logged in via inherited access: ${user.email} [tenant: ${normalizedTenantSlug}]`
                    );
                    return attachSessionMemberships(result, user.id, activeMembershipsWithInheritance);
                }
                if (resolved.inactiveDirect) {
                    throw buildAccountInactiveError();
                }
            }
        }
        if (memberships.length > 0) {
            throw buildAccountInactiveError();
        }
        throw Object.assign(new Error('No active tenant membership found for this user.'), {
            statusCode: 403,
            code: 'NO_ACTIVE_MEMBERSHIP',
        });
    }

    if (normalizedTenantSlug) {
        // CRITICAL SECURITY: on explicit tenant login attempt, always evaluate
        // both tenant and parent suspension status before any role checks.
        const attemptedTenant = await prisma.tenant.findFirst({
            where: { slug: normalizedTenantSlug },
            select: {
                id: true,
                slug: true,
                parentId: true,
                subStatus: true,
                adminStatus: true,
                parent: {
                    select: {
                        id: true,
                        subStatus: true,
                        adminStatus: true,
                    },
                },
            },
        });

        if (attemptedTenant) {
            logAuthCheck({ email: user.email, tenant: attemptedTenant });
            if (attemptedTenant.adminStatus === 'SUSPENDED') {
                throw buildSuspensionError('ACCOUNT_SUSPENDED');
            }
            if (attemptedTenant.parent?.adminStatus === 'SUSPENDED') {
                throw buildSuspensionError('ORGANIZATION_SUSPENDED');
            }
        }

        let selectedMembership = activeMembershipsWithInheritance
            .find((membership) => membership.tenant?.slug === normalizedTenantSlug);
        if (!selectedMembership && attemptedTenant?.id) {
            const resolved = await resolveTenantMembership(prisma, user.id, attemptedTenant.id, {
                include: { tenant: true, role: true },
                attachTenant: true,
            });
            if (resolved.membership) {
                selectedMembership = resolved.membership;
            } else if (resolved.inactiveDirect) {
                throw buildAccountInactiveError();
            }
        }
        if (!selectedMembership) {
            throw Object.assign(new Error('You are not authorized for this tenant.'), {
                statusCode: 403,
                code: 'TENANT_ACCESS_DENIED',
            });
        }
        if (!selectedMembership.isActive) {
            throw buildAccountInactiveError();
        }

        await ensureTenantNotSuspended(selectedMembership.tenantId);

        const result = await issueSessionForMembership({
            user,
            membership: selectedMembership,
            ipAddress,
            userAgent,
        });
        logger.info(`User logged in: ${user.email} [tenant: ${normalizedTenantSlug}]`);
        return attachSessionMemberships(result, user.id, activeMembershipsWithInheritance);
    }

    if (loginSelectableCount === 1) {
        const selected = loginSelectableMemberships[0];
        if (selected?.tenantId) {
            const selectedTenant = await prisma.tenant.findUnique({
                where: { id: selected.tenantId },
                select: {
                    id: true,
                    slug: true,
                    parentId: true,
                    subStatus: true,
                    adminStatus: true,
                    parent: { select: { id: true, subStatus: true, adminStatus: true } },
                },
            });
            logAuthCheck({ email: user.email, tenant: selectedTenant });
        }
        await ensureTenantNotSuspended(selected.tenantId);
        const result = await issueSessionForMembership({ user, membership: selected, ipAddress, userAgent });
        logger.info(`User logged in: ${user.email} [tenant: ${selected.tenant?.slug || 'super-admin'}]`);
        return attachSessionMemberships(result, user.id, activeMembershipsWithInheritance);
    }

    if (totalMemberships === 1) {
        const selected = activeMembershipsWithInheritance[0];
        if (selected?.tenantId) {
            const selectedTenant = await prisma.tenant.findUnique({
                where: { id: selected.tenantId },
                select: {
                    id: true,
                    slug: true,
                    parentId: true,
                    subStatus: true,
                    adminStatus: true,
                    parent: { select: { id: true, subStatus: true, adminStatus: true } },
                },
            });
            logAuthCheck({ email: user.email, tenant: selectedTenant });
        }
        await ensureTenantNotSuspended(selected.tenantId);
        const result = await issueSessionForMembership({ user, membership: selected, ipAddress, userAgent });
        logger.info(`User logged in: ${user.email} [tenant: ${selected.tenant?.slug || 'super-admin'}]`);
        return attachSessionMemberships(result, user.id, activeMembershipsWithInheritance);
    }

    if (loginSelectableCount > 1) {
        return {
            success: true,
            requiresTenantSelection: true,
            data: {
                memberships: await formatMembershipOptionsForUser(loginSelectableMemberships, user.id),
            },
        };
    }

    throw Object.assign(new Error('No active tenant membership found for this user.'), {
        statusCode: 403,
        code: 'NO_ACTIVE_MEMBERSHIP',
    });
};

/**
 * Refresh: validate stored refresh token, issue new access token
 */
const refresh = async (refreshToken) => {
    let decoded;
    try {
        decoded = verifyRefreshToken(refreshToken);
    } catch {
        throw Object.assign(new Error('Invalid or expired refresh token.'), {
            statusCode: 401,
            code: 'INVALID_REFRESH_TOKEN',
        });
    }

    // Ensure token exists in DB and is not revoked
    const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
        throw Object.assign(new Error('Refresh token is invalid or has been revoked.'), { statusCode: 401 });
    }

    const { user } = storedToken;

    let membership;
    if (decoded.tenantId) {
        const resolved = await resolveTenantMembership(prisma, user.id, decoded.tenantId, {
            include: { tenant: { select: { id: true } }, role: true },
        });
        if (resolved.membership) {
            membership = resolved.membership;
        } else if (resolved.inactiveDirect) {
            const branchTenant = await prisma.tenant.findUnique({
                where: { id: decoded.tenantId },
                select: { id: true, parentId: true },
            });
            if (
                branchTenant?.parentId &&
                (await healOrgManagerBranchAccess(user.id, branchTenant.id, branchTenant.parentId))
            ) {
                const retry = await resolveTenantMembership(prisma, user.id, decoded.tenantId, {
                    include: { tenant: { select: { id: true } }, role: true },
                });
                if (retry.membership) {
                    membership = retry.membership;
                }
            }
            if (!membership) {
                await prisma.refreshToken.updateMany({
                    where: { token: refreshToken, revokedAt: null },
                    data: { revokedAt: new Date() },
                });
                throw buildAccountInactiveError();
            }
        }
    } else {
        membership = await prisma.tenantMember.findFirst({
            where: {
                userId: user.id,
                tenantId: null,
                role: { code: 'SUPER_ADMIN' },
                isActive: true,
            },
            include: { role: true },
        });
    }

    if (!membership) {
        throw Object.assign(new Error('Refresh token context is no longer valid.'), {
            statusCode: 401,
            code: 'REFRESH_CONTEXT_INVALID',
        });
    }

    // Block refresh if tenant is suspended or parent org is suspended.
    if (membership.tenantId) {
        try {
            await ensureTenantNotSuspended(membership.tenantId);
        } catch (err) {
            // Revoke the presented refresh token to force logout.
            await prisma.refreshToken.updateMany({
                where: { token: refreshToken, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            throw err;
        }
    }

    const roleCodeRaw = membershipRoleCode(membership);
    const bestRole = await resolveUserBestRole(user.id, roleCodeRaw);
    let roleId = membership.roleId ?? membership.role?.id;
    if (bestRole) {
        const bestRoleId = await getRoleIdByCode(bestRole);
        if (bestRoleId) roleId = bestRoleId;
    } else if (!roleId && roleCodeRaw) {
        roleId = await getRoleIdByCode(roleCodeRaw);
    }
    const permissions = await accRuntime.resolvePermissionsForMembership({
        userId: user.id,
        membership,
        roleId,
        roleCode: bestRole,
    });

    const newAccessToken = generateAccessToken({
        userId: user.id,
        tenantId: membership.tenantId,
        role: bestRole,
        email: user.email,
        ...(roleId ? { roleId } : {}),
        permissions,
        permissionVersion: user.permissionVersion ?? 0,
    });

    return { accessToken: newAccessToken };
};

/**
 * Logout: revoke the stored refresh token
 */
const logout = async (refreshToken) => {
    if (!refreshToken) return;

    await prisma.refreshToken.updateMany({
        where: { token: refreshToken, revokedAt: null },
        data: { revokedAt: new Date() },
    });
};

/**
 * Me: return current user profile
 */
const getMe = async (userId, tenantId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
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
    });
    if (!user) {
        throw Object.assign(new Error('User not found.'), { statusCode: 404, code: 'USER_NOT_FOUND' });
    }

    let membership;
    if (tenantId) {
        const resolved = await resolveTenantMembership(prisma, userId, tenantId, {
            include: {
                tenant: { select: { id: true, name: true, slug: true, logoUrl: true, parentId: true, timezone: true } },
                role: { select: { id: true, code: true } },
            },
            attachTenant: true,
        });
        membership = resolved.membership;
    } else {
        membership = await prisma.tenantMember.findFirst({
            where: {
                userId,
                tenantId: null,
                isActive: true,
            },
            include: {
                tenant: { select: { id: true, name: true, slug: true, logoUrl: true, parentId: true, timezone: true } },
                role: { select: { id: true, code: true } },
            },
        });
    }
    if (!membership) {
        throw Object.assign(new Error('Membership not found for this context.'), {
            statusCode: 404,
            code: 'MEMBERSHIP_NOT_FOUND',
        });
    }

    const rc = membershipRoleCode(membership);
    const bestRole = await resolveUserBestRole(userId, rc);
    let roleIdForPerm = membership.roleId ?? membership.role?.id;
    if (bestRole) {
        const bestRoleId = await getRoleIdByCode(bestRole);
        if (bestRoleId) roleIdForPerm = bestRoleId;
    }
    const permissions = await accRuntime.resolvePermissionsForMembership({
        userId,
        membership,
        roleId: roleIdForPerm,
        roleCode: bestRole,
    });

    const availableAssignments = await listAvailableAssignmentsForUser(userId, {
        propertyId: membership.tenantId ?? null,
    });
    const activeAssignmentId = await resolveActiveAssignmentId(
        userId,
        membership,
        roleIdForPerm,
    );

    return {
        ...user,
        role: bestRole,
        permissions,
        tenant: membership.tenant || null,
        departmentId: membership.departmentId ?? null,
        availableAssignments,
        activeAssignmentId,
    };
};

/**
 * Profile: firstName, lastName, email, phone, department, role for settings UI.
 * Reuses getMe (no passwordHash is ever selected).
 */
const getProfile = async (userId, tenantId) => {
    const me = await getMe(userId, tenantId);
    return {
        id: me.id,
        firstName: me.firstName,
        lastName: me.lastName,
        email: me.email,
        phone: me.phone ?? null,
        department: me.department ?? null,
        role: me.role,
        permissions: me.permissions ?? [],
        departmentId: me.departmentId ?? null,
        tenant: me.tenant ?? null,
    };
};

/**
 * Authenticated user changes own password (current password verified with bcrypt).
 */
const changePassword = async ({ userId, currentPassword, newPassword }) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true, isActive: true },
    });
    if (!user || !user.isActive) {
        throw Object.assign(new Error('User not found.'), { statusCode: 404, code: 'USER_NOT_FOUND' });
    }
    const currentOk = await comparePassword(currentPassword, user.passwordHash);
    if (!currentOk) {
        throw Object.assign(new Error('Current password is incorrect.'), {
            statusCode: 401,
            code: 'INVALID_CURRENT_PASSWORD',
        });
    }
    const reuse = await comparePassword(newPassword, user.passwordHash);
    if (reuse) {
        throw Object.assign(new Error('New password must be different from your current password.'), {
            statusCode: 400,
            code: 'PASSWORD_UNCHANGED',
        });
    }
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
    });
};

/**
 * Switch tenant context for an authenticated user
 */
const switchTenant = async ({ userId, tenantSlug, ipAddress, userAgent }) => {
    const normalizedTenantSlug = typeof tenantSlug === 'string' ? tenantSlug.trim() : '';
    if (!normalizedTenantSlug) {
        throw Object.assign(new Error('tenantSlug is required.'), {
            statusCode: 400,
            code: 'TENANT_SLUG_REQUIRED',
        });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            department: true,
            isActive: true,
            permissionVersion: true,
        },
    });
    if (!user || !user.isActive) {
        throw Object.assign(new Error('User not found or inactive.'), {
            statusCode: 401,
            code: 'USER_INACTIVE',
        });
    }

    const targetTenant = await findActiveTenantBySlug(prisma, normalizedTenantSlug);

    if (!targetTenant) {
        throw Object.assign(new Error('You are not authorized for this tenant.'), {
            statusCode: 403,
            code: 'TENANT_ACCESS_DENIED',
        });
    }

    // Block switching to suspended / inactive / expired tenant before replacing session.
    await ensureTenantSwitchable(targetTenant.id, { buildSuspensionError });

    // Strict switch guard:
    // If user is an ORG_MANAGER of any root org, they may only switch to that org
    // or its direct children, even if legacy direct memberships exist elsewhere.
    const rootOrgManagerOrgMemberships = await prisma.tenantMember.findMany({
        where: {
            userId,
            role: { code: 'ORG_MANAGER' },
            isActive: true,
            tenantId: { not: null },
            tenant: { is: { parentId: null, isActive: true } },
        },
        select: { tenantId: true },
        distinct: ['tenantId'],
    });

    const rootOrgIds = rootOrgManagerOrgMemberships.map((m) => m.tenantId).filter(Boolean);
    if (rootOrgIds.length > 0) {
        const allowed =
            rootOrgIds.includes(targetTenant.id) ||
            (targetTenant.parentId && rootOrgIds.includes(targetTenant.parentId));

        if (!allowed) {
            throw Object.assign(new Error('You are not authorized for this tenant.'), {
                statusCode: 403,
                code: 'TENANT_ACCESS_DENIED',
            });
        }
    }

    let resolved = await resolveTenantMembership(prisma, userId, targetTenant.id, {
        include: {
            tenant: { select: { id: true, slug: true, name: true, parentId: true, timezone: true } },
            role: { select: { id: true, code: true } },
        },
        attachTenant: true,
    });

    if (!resolved.membership && resolved.inactiveDirect && targetTenant.parentId) {
        const healed = await healOrgManagerBranchAccess(userId, targetTenant.id, targetTenant.parentId);
        if (healed) {
            resolved = await resolveTenantMembership(prisma, userId, targetTenant.id, {
                include: {
                    tenant: { select: { id: true, slug: true, name: true, parentId: true, timezone: true } },
                    role: { select: { id: true, code: true } },
                },
                attachTenant: true,
            });
        }
    }

    if (!resolved.membership) {
        if (resolved.inactiveDirect) {
            throw buildAccountInactiveError();
        }
        throw Object.assign(new Error('You are not authorized for this tenant.'), {
            statusCode: 403,
            code: 'TENANT_ACCESS_DENIED',
        });
    }

    const membership = {
        ...resolved.membership,
        tenant: resolved.membership.tenant || targetTenant,
    };

    await ensureTenantSwitchable(membership.tenantId, { buildSuspensionError });

    const activeMemberships = await prisma.tenantMember.findMany({
        where: { userId, isActive: true },
        include: { tenant: true, role: true },
    });
    const membershipsWithInheritance = await buildInheritedOrgManagerMemberships(activeMemberships);

    const result = await issueSessionForMembership({
        user,
        membership,
        ipAddress,
        userAgent,
    });

    await attachSessionMemberships(result, userId, membershipsWithInheritance);

    logger.info(`User switched tenant: ${user.email} [tenant: ${normalizedTenantSlug}]`);
    return result;
};

/**
 * Switch active ACC assignment (role context) within the current property.
 * Updates TenantMember.role to match the assignment, then reissues JWT claims.
 */
const switchContext = async ({ userId, assignmentId, ipAddress, userAgent }) => {
    const normalizedId = typeof assignmentId === 'string' ? assignmentId.trim() : '';
    if (!normalizedId) {
        throw Object.assign(new Error('assignmentId is required.'), {
            statusCode: 400,
            code: 'ASSIGNMENT_ID_REQUIRED',
        });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            department: true,
            isActive: true,
            permissionVersion: true,
        },
    });
    if (!user || !user.isActive) {
        throw Object.assign(new Error('User not found or inactive.'), {
            statusCode: 401,
            code: 'USER_INACTIVE',
        });
    }

    const assignment = await prisma.urUserAssignment.findFirst({
        where: { id: normalizedId, userId, isActive: true },
        include: {
            role: { select: { id: true, code: true, name: true } },
            properties: {
                select: {
                    propertyId: true,
                    property: { select: { id: true, name: true, slug: true, parentId: true, timezone: true } },
                },
            },
            departments: {
                select: { departmentId: true },
            },
        },
    });
    if (!assignment) {
        throw Object.assign(new Error('Assignment not found or inactive.'), {
            statusCode: 404,
            code: 'ASSIGNMENT_NOT_FOUND',
        });
    }

    let propertyId = assignment.properties[0]?.propertyId ?? null;
    if (!propertyId) {
        const memberIdFromNotes = typeof assignment.notes === 'string'
            ? assignment.notes.match(/^legacy:([0-9a-f-]{36})/i)?.[1]
            : null;
        if (memberIdFromNotes) {
            const tagged = await prisma.tenantMember.findUnique({
                where: { id: memberIdFromNotes },
                select: { tenantId: true },
            });
            propertyId = tagged?.tenantId ?? null;
        }
    }
    if (!propertyId) {
        throw Object.assign(new Error('Assignment has no property context to switch into.'), {
            statusCode: 400,
            code: 'ASSIGNMENT_PROPERTY_REQUIRED',
        });
    }

    await ensureTenantSwitchable(propertyId, { buildSuspensionError });

    const roleCode = assignment.role.code;
    const primaryDeptId = assignment.departments[0]?.departmentId ?? null;
    const allDepartments = assignment.departments.length === 0;

    const membership = await prisma.$transaction(async (tx) => {
        const existing = await tx.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId: propertyId, userId } },
            select: { id: true, isActive: true },
        });
        if (!existing) {
            throw Object.assign(new Error('You are not authorized for this property.'), {
                statusCode: 403,
                code: 'TENANT_ACCESS_DENIED',
            });
        }

        await tx.tenantMember.update({
            where: { id: existing.id },
            data: {
                role: connectRole(roleCode),
                isActive: true,
                canViewAllDepartments: allDepartments,
                ...(primaryDeptId
                    ? { department: { connect: { id: primaryDeptId } } }
                    : { department: { disconnect: true } }),
            },
        });

        // Prefer this assignment for the membership via legacy tag (clear tag from siblings).
        const siblings = await tx.urUserAssignment.findMany({
            where: {
                userId,
                isActive: true,
                notes: { startsWith: `legacy:${existing.id}` },
                NOT: { id: assignment.id },
            },
            select: { id: true, notes: true },
        });
        for (const sibling of siblings) {
            const rest = typeof sibling.notes === 'string'
                ? sibling.notes.replace(new RegExp(`^legacy:${existing.id}\\|?`), '').trim()
                : '';
            await tx.urUserAssignment.update({
                where: { id: sibling.id },
                data: { notes: rest || null },
            });
        }
        const priorNotes = typeof assignment.notes === 'string' ? assignment.notes : '';
        const withoutLegacy = priorNotes.replace(/^legacy:[0-9a-f-]{36}\|?/i, '').trim();
        const nextNotes = withoutLegacy
            ? `${legacyTag(existing.id)}|${withoutLegacy}`
            : legacyTag(existing.id);
        await tx.urUserAssignment.update({
            where: { id: assignment.id },
            data: { notes: nextNotes },
        });

        const updatedUser = await tx.user.update({
            where: { id: userId },
            data: { permissionVersion: { increment: 1 } },
            select: { permissionVersion: true },
        });
        user.permissionVersion = updatedUser.permissionVersion;

        return tx.tenantMember.findUnique({
            where: { id: existing.id },
            include: {
                tenant: { select: { id: true, slug: true, name: true, parentId: true, timezone: true } },
                role: { select: { id: true, code: true } },
            },
        });
    });

    const activeMemberships = await prisma.tenantMember.findMany({
        where: { userId, isActive: true },
        include: { tenant: true, role: true },
    });
    const membershipsWithInheritance = await buildInheritedOrgManagerMemberships(activeMemberships);

    const result = await issueSessionForMembership({
        user,
        membership,
        ipAddress,
        userAgent,
        assignmentId: assignment.id,
        sessionRoleCode: roleCode,
    });

    await attachSessionMemberships(result, userId, membershipsWithInheritance);

    logger.info(
        `User switched assignment context: ${user.email} [assignment: ${assignment.id}, role: ${roleCode}]`,
    );
    return result;
};

/**
 * Request password reset: save 6-digit OTP on PasswordReset, email via mailer (active users only).
 */
const requestPasswordReset = async ({ email }) => {
    const normalizedEmail = normalizeEmailForLookup(email);
    const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
        throw Object.assign(new Error('No account found for this email.'), {
            statusCode: 404,
            code: 'USER_NOT_FOUND',
        });
    }

    await prisma.passwordReset.deleteMany({ where: { email: user.email } });

    const otp = generateSixDigitOtp();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MS);

    await prisma.passwordReset.create({
        data: {
            email: user.email,
            otp,
            expiresAt,
        },
    });

    try {
        await sendPasswordResetOtpEmail({
            to: user.email,
            otp,
            expiresMinutes: PASSWORD_RESET_EXPIRES_MINUTES,
        });
    } catch (err) {
        await prisma.passwordReset.deleteMany({ where: { email: user.email } });
        throw err;
    }

    return { email: user.email };
};

/**
 * Complete password reset: match email + OTP + expiry, hash new password, remove reset row.
 */
const resetPasswordWithOtp = async ({ email, otp, newPassword }) => {
    const normalizedEmail = normalizeEmailForLookup(email);
    const plainOtp = String(otp || '').trim();

    const row = await prisma.passwordReset.findFirst({
        where: {
            email: normalizedEmail,
            otp: plainOtp,
            expiresAt: { gt: new Date() },
        },
        orderBy: { id: 'desc' },
    });

    if (!row) {
        throw Object.assign(new Error('Invalid or expired reset code.'), {
            statusCode: 400,
            code: 'INVALID_OR_EXPIRED_OTP',
        });
    }

    const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, passwordHash: true, isActive: true },
    });
    if (!user || !user.isActive) {
        await prisma.passwordReset.delete({ where: { id: row.id } });
        throw Object.assign(new Error('No account found for this email.'), {
            statusCode: 404,
            code: 'USER_NOT_FOUND',
        });
    }

    const reuse = await comparePassword(newPassword, user.passwordHash);
    if (reuse) {
        throw Object.assign(new Error('New password must be different from your current password.'), {
            statusCode: 400,
            code: 'PASSWORD_UNCHANGED',
        });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
        prisma.user.update({
            where: { id: user.id },
            data: { passwordHash },
        }),
        prisma.passwordReset.delete({ where: { id: row.id } }),
    ]);
};

module.exports = {
    login,
    refresh,
    logout,
    getMe,
    getProfile,
    changePassword,
    switchTenant,
    switchContext,
    requestPasswordReset,
    resetPasswordWithOtp,
};
