/**
 * M01 — Role-Based Authorization Middleware (DB-backed permissions via JWT)
 * Usage: authorize('COST_CONTROL')  →  only those roles can proceed
 */
const { normalizeRole } = require('../services/rbac.service');
const { PERMISSIONS } = require('../acc-authority/runtime-permission-matrix');
const { expandsStockCountPermission } = require('../acc-authority/stock-count-permissions');

// ── User Rights Shadow Mode (Wave 5) ─────────────────────────────────────────
// shadowEvaluate is fire-and-forget. It NEVER changes the legacy decision.
// Controlled by ENABLE_UR_SHADOW_MODE env flag (default: false = no-op).
const { shadowEvaluate } = require('../engines/shadow-mode.service');
const { logAccRoleFallbackHit } = require('../services/acc-role-fallback-telemetry.service');

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }

        const normalizedRoles = roles.map((r) => normalizeRole(r));
        const userRole = normalizeRole(req.user.role);

        if (!normalizedRoles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}`,
            });
        }

        next();
    };
};

/**
 * Permission aliases → canonical matrix keys (JWT + route checks).
 */
const PERMISSION_ALIASES = {
    MANAGE_MASTER_DATA: 'BASIC_DATA_EDIT',
    VIEW_MASTER_DATA: 'BASIC_DATA_VIEW',
    MANAGE_INVENTORY: 'MOVEMENT_CREATE',
    VIEW_INVENTORY: 'INVENTORY_VIEW',
    CREATE_MOVEMENT: 'MOVEMENT_CREATE',
    VIEW_MOVEMENTS: 'MOVEMENTS_VIEW',
    CREATE_BREAKAGE: 'BREAKAGE_CREATE',
    /** Same matrix row as BREAKAGE_CREATE; lost manual create opens the same 4-step workflow from DEPT_APPROVED. */
    CREATE_LOST: 'BREAKAGE_CREATE',
    CREATE_ADJUSTMENT: 'ADJUSTMENT_CREATE',
    /** Legacy Excel/matrix keys → canonical JWT codes (Prisma `permissions.code`). */
    BREAKAGE_APPROVE_REJECT: 'APPROVE_BREAKAGE',
    LOST_APPROVE_REJECT: 'APPROVE_LOST',
    MANAGE_COUNT: 'STOCK_COUNT_MANAGE',
    VIEW_COUNT: 'STOCK_COUNT_VIEW',
    VIEW_REPORTS: 'REPORTS_VIEW',
    EXPORT_REPORTS: 'REPORTS_EXPORT',
    MANAGE_USERS: 'USERS_COMPANY_MANAGE',
    MANAGE_SETTINGS: 'SETTINGS_MANAGE',
    VIEW_AUDIT_LOG: 'AUDIT_LOG_VIEW',
    MANAGE_IMPORTS: 'IMPORT_EXCEL',
    STOCK_MANAGE: 'MOVEMENT_CREATE',
    ITEM_MANAGE: 'BASIC_DATA_EDIT',
    BREAKAGE_APPROVE: 'APPROVE_BREAKAGE',
    LOST_CREATE: 'BREAKAGE_CREATE',
    USER_MANAGE: 'HOTEL_USERS_MANAGE',
    TENANT_MANAGE: 'SETTINGS_MANAGE',
    CREATE_GET_PASS: 'GET_PASS_CREATE',
    VIEW_GET_PASS: 'GET_PASS_VIEW',
    REGISTER_GET_PASS_RETURN: 'GET_PASS_APPROVE_RETURN',
    /** JWT may store friendly codes; resolve to canonical matrix keys for route checks. */
    READ_BREAKAGE: 'INVENTORY_VIEW',
    READ_LOST: 'INVENTORY_VIEW',
};

const resolvePermissionKey = (permission) => PERMISSION_ALIASES[permission] || permission;

/**
 * Legacy sync helper: compute permission list from role code using static matrix.
 * Prefer JWT `permissions` at runtime; used when building responses without DB.
 */
const getPermissionsForRole = (role) => {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) return [];
    const permissions = Object.entries(PERMISSIONS)
        .filter(([, roles]) => roles.includes(normalizedRole))
        .map(([permission]) => permission);
    if (permissions.length > 0) return permissions;

    return [];
};

/**
 * Whether static constitution matrix would have allowed (telemetry only — not used for auth).
 */
const _wouldStaticMatrixAllow = (user, permission) => {
    const resolvedPermission = resolvePermissionKey(permission);
    const normalizedRole = normalizeRole(user?.role);
    const allowedRoles = PERMISSIONS[resolvedPermission] || [];
    return Boolean(normalizedRole && allowedRoles.includes(normalizedRole));
};

/**
 * ACC-only permission check. Empty or missing permissions[] → deny (fail closed).
 */
const hasPermission = (userOrRole, permission, options = {}) => {
    const user = typeof userOrRole === 'string' ? { role: userOrRole } : userOrRole;
    const resolvedPermission = resolvePermissionKey(permission);
    if (!user || !Array.isArray(user.permissions) || user.permissions.length === 0) {
        if (user && _wouldStaticMatrixAllow(user, permission)) {
            logAccRoleFallbackHit({
                req: options.req,
                user,
                requestedPermission: permission,
                fallbackKind: 'static_matrix',
                accPermissionCount: 0,
                resolutionSource: 'authorize.hasPermission',
            });
        }
        return false;
    }
    if (user.permissions.includes(resolvedPermission)) return true;
    if (user.permissions.includes(permission)) return true;
    if (user.permissions.some((p) => resolvePermissionKey(p) === resolvedPermission)) return true;
    // P1 #24 — STOCK_COUNT_MANAGE ↔ granular CREATE/EXECUTE/CANCEL/RECOUNT/SUBMIT
    if (expandsStockCountPermission(user.permissions, resolvedPermission)) return true;
    if (permission !== resolvedPermission && expandsStockCountPermission(user.permissions, permission)) {
        return true;
    }
    return false;
};

const requirePermission = (permission) => {
    return (req, res, next) => {
        const resolved = [resolvePermissionKey(permission)];
        const allowed = req.user && hasPermission(req.user, permission, { req });

        // Shadow: fire-and-forget, never blocks or throws
        setImmediate(() => shadowEvaluate(req, resolved, !!allowed).catch(() => {}));

        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Insufficient permissions.`,
                required: permission,
            });
        }
        next();
    };
};

const requireAnyPermission = (...permissions) => {
    return (req, res, next) => {
        if (!req.user) {
            // No user — unauthenticated. Shadow mode does not apply.
            return res.status(403).json({
                success: false,
                message: `Access denied. Insufficient permissions.`,
                required: permissions,
            });
        }
        const resolved = permissions.map(resolvePermissionKey);
        const ok = permissions.some((p) => hasPermission(req.user, p, { req }));

        // Shadow: fire-and-forget, never blocks or throws
        setImmediate(() => shadowEvaluate(req, resolved, ok).catch(() => {}));

        if (!ok) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Insufficient permissions.`,
                required: permissions,
            });
        }
        next();
    };
};

module.exports = {
    authorize,
    hasPermission,
    requirePermission,
    requireAnyPermission,
    PERMISSIONS,
    getPermissionsForRole,
    resolvePermissionKey,
    _wouldStaticMatrixAllow,
};
