'use strict';

/**
 * ACC P2 — Route migration preparation (read-only inventory + guidance).
 * No route changes — inventory and suggested requirePermission targets only.
 */

const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'routes');

/** Known role → permission mapping hints for migration planning (not enforced). */
const ROLE_TO_PERMISSION_HINTS = {
    ORG_MANAGER:     ['SETTINGS_MANAGE', 'USERS_COMPANY_MANAGE'],
    FINANCE_MANAGER: ['REPORTS_EXPORT', 'PERIOD_CLOSE_EXECUTE'],
    STOREKEEPER:     ['GRN_CREATE', 'INVENTORY_READ'],
    DEPT_MANAGER:    ['ISSUE_APPROVE', 'TRANSFER_CREATE'],
    COST_CONTROL:    ['REPORTS_VIEW', 'BREAKAGE_APPROVE'],
    GENERAL_MANAGER: ['REPORTS_VIEW', 'TRANSFER_APPROVE_FINAL'],
    SECURITY:        ['GET_PASS_MANAGE'],
    AUDITOR:         ['AUDIT_LOG_VIEW', 'REPORTS_VIEW'],
};

function _scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const rel = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
    const authorizeCalls = [];
    const requirePermCalls = [];

    const authorizeRe = /authorize\s*\(\s*([^)]+)\)/g;
    let m;
    while ((m = authorizeRe.exec(content)) !== null) {
        const raw = m[1];
        const roles = [...raw.matchAll(/['"]([A-Z_]+)['"]/g)].map((x) => x[1]);
        if (roles.length > 0) {
            authorizeCalls.push({ roles, line: content.slice(0, m.index).split('\n').length });
        }
    }

    const permRe = /require(?:Any)?Permission\s*\(\s*([^)]+)\)/g;
    while ((m = permRe.exec(content)) !== null) {
        const perms = [...m[1].matchAll(/['"]([A-Z_0-9]+)['"]/g)].map((x) => x[1]);
        if (perms.length > 0) {
            requirePermCalls.push({ permissions: perms, line: content.slice(0, m.index).split('\n').length });
        }
    }

    if (authorizeCalls.length === 0 && requirePermCalls.length === 0) return null;

    return {
        file: rel,
        authorizeRoleCalls: authorizeCalls.length,
        authorizeRoleDetails: authorizeCalls,
        requirePermissionCalls: requirePermCalls.length,
        migrationNotes: authorizeCalls.map((c) => ({
            roles: c.roles,
            suggestedPermissions: c.roles.flatMap((r) => ROLE_TO_PERMISSION_HINTS[r] ?? []),
            status: 'pending-review',
        })),
    };
}

function getAuthorizeRoleInventory() {
    const files = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.routes.js'));
    const entries = [];
    let totalAuthorizeCalls = 0;

    for (const file of files) {
        const scanned = _scanFile(path.join(ROUTES_DIR, file));
        if (scanned) {
            entries.push(scanned);
            totalAuthorizeCalls += scanned.authorizeRoleCalls;
        }
    }

    entries.sort((a, b) => b.authorizeRoleCalls - a.authorizeRoleCalls);

    return {
        generatedAt: new Date().toISOString(),
        summary: {
            routeFilesScanned: files.length,
            filesWithAuthorizeRole: entries.length,
            totalAuthorizeRoleCalls: totalAuthorizeCalls,
            migrationStatus: 'preparation-only',
        },
        files: entries,
        knownLimitations: [
            'Suggested permissions are hints only — each route must be validated against rbac-matrix.constants.',
            'Full route cutover is P3 — do not migrate without pilot sign-off.',
        ],
    };
}

module.exports = {
    getAuthorizeRoleInventory,
    ROLE_TO_PERMISSION_HINTS,
};
