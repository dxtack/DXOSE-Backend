const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const logger = require('../utils/logger');
const { membershipRoleCode } = require('../services/rbac.service');
const accRuntime = require('../acc-runtime');
const { enforcetenantScope } = require('./tenantScope');
const { enforceSubscription } = require('./subscription');
const { resolveTenantMembership } = require('../utils/resolveTenantMembership');
const { scopeEnforcementMiddleware } = require('./scope-enforcement.middleware');

const getTenantSuspensionFromTokenContext = async (tenantId) => {
    if (!tenantId) return null;

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            slug: true,
            isActive: true,
            subStatus: true,
            adminStatus: true,
            timezone: true,
            parentId: true,
            parent: {
                select: {
                    id: true,
                    isActive: true,
                    subStatus: true,
                    adminStatus: true,
                },
            },
        },
    });

    if (!tenant) return { type: 'INVALID_TENANT', tenant: null };

    // PRIORITY: parent org status takes precedence over child tenant status.
    if (tenant.parent && (tenant.parent.adminStatus === 'SUSPENDED' || tenant.parent.isActive === false)) {
        return { type: 'ORGANIZATION_SUSPENDED', tenant };
    }

    if (tenant.adminStatus === 'SUSPENDED') return { type: 'ACCOUNT_SUSPENDED', tenant };

    return { type: null, tenant };
};

/**
 * M01 — Authentication Middleware (SaaS-enhanced)
 * 1) Verifies JWT access token and attaches user context to req.user
 * 2) Chains tenantScope validation
 * 3) Chains subscription enforcement
 */
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Please provide a valid token.',
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const userRow = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { permissionVersion: true },
        });
        if (userRow) {
            const tokenVersion = decoded.permissionVersion;
            if (tokenVersion === undefined || tokenVersion !== userRow.permissionVersion) {
                return res.status(401).json({
                    success: false,
                    message: 'Session expired. Please login again.',
                    code: 'PERMISSIONS_STALE',
                });
            }
        }

        const suspension = await getTenantSuspensionFromTokenContext(decoded.tenantId);
        if (decoded.tenantId && suspension?.tenant) {
            console.log(
                `Auth Check: User [${decoded.email || decoded.userId}] attempting access to Tenant [${suspension.tenant.slug}]. ParentId: [${suspension.tenant.parentId || 'null'}], AdminStatus: [${suspension.tenant.adminStatus}], ParentAdminStatus: [${suspension.tenant.parent?.adminStatus || 'N/A'}], SubStatus: [${suspension.tenant.subStatus}], ParentSubStatus: [${suspension.tenant.parent?.subStatus || 'N/A'}].`
            );
        }
        if (suspension?.type === 'INVALID_TENANT') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token context.',
            });
        }
        if (suspension?.type === 'ACCOUNT_SUSPENDED' || suspension?.type === 'ORGANIZATION_SUSPENDED') {
            return res.status(403).json({
                success: false,
                code: suspension.type,
                message: suspension.type === 'ORGANIZATION_SUSPENDED'
                    ? 'This organization is suspended.'
                    : 'This account is suspended.',
            });
        }

        let membership = null;
        if (decoded.tenantId) {
            const resolved = await resolveTenantMembership(prisma, decoded.userId, decoded.tenantId, {
                include: { role: true },
            });
            if (!resolved.membership) {
                if (resolved.inactiveDirect) {
                    return res.status(401).json({
                        error: 'ACCOUNT_INACTIVE',
                        message: 'Your account has been deactivated by the admin.',
                    });
                }
                return res.status(401).json({
                    success: false,
                    message: 'Invalid token context.',
                });
            }
            membership = resolved.membership;
        } else {
            membership = await prisma.tenantMember.findFirst({
                where: {
                    userId: decoded.userId,
                    tenantId: null,
                },
                select: { isActive: true, role: true, roleId: true, tenantId: true, departmentId: true },
            });
            if (membership && membership.isActive === false) {
                return res.status(401).json({
                    error: 'ACCOUNT_INACTIVE',
                    message: 'Your account has been deactivated by the admin.',
                });
            }
        }

        let scopedTenantId = decoded.tenantId;
        let scopedTenantTimezone = suspension?.tenant?.timezone || null;
        const isOrgManager = membership && membershipRoleCode(membership) === 'ORG_MANAGER';
        const requestedTenantIdHeader = typeof req.headers['x-tenant-id'] === 'string'
            ? req.headers['x-tenant-id'].trim()
            : '';

        if (isOrgManager && requestedTenantIdHeader && requestedTenantIdHeader !== decoded.tenantId) {
            const allowedTenant = await prisma.tenant.findFirst({
                where: {
                    id: requestedTenantIdHeader,
                    OR: [
                        { id: decoded.tenantId },
                        { parentId: decoded.tenantId },
                    ],
                },
                select: { id: true, timezone: true },
            });

            if (!allowedTenant) {
                return res.status(403).json({
                    success: false,
                    message: 'ORG_MANAGER can only scope requests to their organization or child hotels.',
                });
            }

            scopedTenantId = allowedTenant.id;
            scopedTenantTimezone = allowedTenant.timezone;
        }

        const session = await accRuntime.resolveSession({
            userId:    decoded.userId,
            membership,
            decoded,
            tenantId:  scopedTenantId,
        });

        req.user = {
            id: decoded.userId,
            tenantId: scopedTenantId,
            tenantTimezone: scopedTenantTimezone,
            role: session.role,
            roleId: session.roleId,
            permissions: session.permissions,
            email: decoded.email,
            departmentId: session.departmentId,
            readOnly: decoded.readOnly || false,
            impersonatedBy: decoded.impersonatedBy || null,
        };

        // ACC P2 — optional scope enforcement pilot (fail-open; default OFF).
        await new Promise((resolve) => {
            scopeEnforcementMiddleware(req, res, resolve);
        });

        // Chain: authenticate → tenantScope → subscription → next
        enforcetenantScope(req, res, (err) => {
            if (err) return next(err);
            enforceSubscription(req, res, next);
        });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired. Please login again.',
                code: 'TOKEN_EXPIRED',
            });
        }
        logger.warn(`Invalid token attempt: ${err.message}`);
        return res.status(401).json({
            success: false,
            message: 'Invalid token.',
        });
    }
};

module.exports = { authenticate };
