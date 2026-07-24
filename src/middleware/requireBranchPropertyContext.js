/**
 * Master-data mutations must run under a branch property tenant, not an org root
 * that has child hotels. Prevents cross-property duplicate collisions when
 * ORG_MANAGER JWT still points at the organization tenant.
 */

const prisma = require('../config/database');

const PROPERTY_CONTEXT_MESSAGE = 'Select a property before editing master data.';
const PROPERTY_CONTEXT_CODE = 'PROPERTY_CONTEXT_REQUIRED';

/** In-memory cache: org-root tenant id → has active branch children */
const orgBranchCache = new Map();
const CACHE_TTL_MS = 60_000;

const tenantHasBranchChildren = async (tenantId) => {
    const cached = orgBranchCache.get(tenantId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.hasBranches;
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            parentId: true,
            hasBranches: true,
            _count: { select: { children: true } },
        },
    });

    const hasBranches =
        !!tenant &&
        tenant.parentId === null &&
        tenant.hasBranches === true &&
        tenant._count.children > 0;

    orgBranchCache.set(tenantId, { hasBranches, at: Date.now() });
    return hasBranches;
};

const invalidateOrgBranchCache = (tenantId) => orgBranchCache.delete(tenantId);

/**
 * Reject master-data writes when the active tenant is an org root with branches.
 * Reads (GET) are allowed so users can still browse after switching property.
 */
const requireBranchPropertyContext = async (req, res, next) => {
    if (!req.user?.tenantId) {
        return next();
    }

    if (req.user.role === 'SUPER_ADMIN') {
        return next();
    }

    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { id: true, parentId: true },
        });

        if (!tenant || tenant.parentId !== null) {
            return next();
        }

        const blocked = await tenantHasBranchChildren(tenant.id);
        if (!blocked) {
            return next();
        }

        return res.status(403).json({
            success: false,
            code: PROPERTY_CONTEXT_CODE,
            error: PROPERTY_CONTEXT_CODE,
            message: PROPERTY_CONTEXT_MESSAGE,
        });
    } catch (err) {
        return next(err);
    }
};

/** Apply branch-property guard only to mutating HTTP methods. */
const requireBranchPropertyForMutation = (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return next();
    }
    return requireBranchPropertyContext(req, res, next);
};

module.exports = {
    requireBranchPropertyContext,
    requireBranchPropertyForMutation,
    invalidateOrgBranchCache,
    PROPERTY_CONTEXT_CODE,
    PROPERTY_CONTEXT_MESSAGE,
};
