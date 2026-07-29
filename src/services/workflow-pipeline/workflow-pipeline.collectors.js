'use strict';

const prisma = require('../../config/database');
const { hasPermission, resolvePermissionKey } = require('../../middleware/authorize');
const { resolveWaitingPermission } = require('../../acc-authority/workflow-step-permissions');
const { normalizeRole } = require('../rbac.service');
const {
    TRANSFER_PIPELINE_STATUSES,
    TRANSFER_APPROVAL_STATUSES,
    TRANSFER_LEGACY_OPEN_STATUSES,
    GRN_OPEN_STATUSES,
    INVENTORY_COUNT_ACTIVE_STATUSES,
    BREAKAGE_PENDING_DOC_STATUSES,
    GET_PASS_APPROVAL_STATUSES,
    GET_PASS_OUT_STATUSES,
    GET_PASS_DISPATCH_STATUSES,
    ROLE_DISPLAY,
    SLA_RULES,
} = require('./workflow-pending.definitions');
const { hoursSince, computeSla, isExpectedReturnToday, isOverdueReturn } = require('./workflow-pipeline-sla.util');
const { buildScopeWhere } = require('../scope/scope.service');
const { SCOPE_MODULE } = require('../scope/scopeContext');

function scopeWhereFor(module, scope) {
    if (!scope) return {};
    const raw = buildScopeWhere(module, scope);
    if (module === SCOPE_MODULE.GRN && raw.OR) {
        const withIn = raw.OR.find((clause) => clause.locationId?.in);
        return withIn ? { locationId: withIn.locationId } : { locationId: { in: [] } };
    }
    return raw;
}
const {
    createPresentationChainCache,
    waitingRoleFromApprovalRequest,
    waitingRoleFromAccStatus,
} = require('../acc-workflow-presentation.service');

const roleLabel = (code) => ROLE_DISPLAY[code] || code || '—';

const withStepPermissions = (module, status, waitingForRole, extra = {}) =>
    resolveWaitingPermission({
        module,
        status,
        waitingForRole,
        isInternalTransfer: extra.isInternalTransfer,
    });

const baseRow = (fields) => {
    const pendingSince = fields.pendingSince || fields.createdAt;
    const ageHours = hoursSince(pendingSince);
    const sla = computeSla({
        ageHours,
        forceCritical: fields.forceCritical,
        forceWarning: fields.forceWarning,
        rule: fields.slaRule,
    });
    const stepGate =
        fields.waitingForPermission != null || fields.waitingForPermissionsAny != null
            ? {
                  waitingForPermission: fields.waitingForPermission ?? null,
                  waitingForPermissionsAny: fields.waitingForPermissionsAny ?? null,
              }
            : withStepPermissions(fields.module, fields.status, fields.waitingForRole, fields.meta || {});
    return {
        id: fields.id,
        module: fields.module,
        documentId: fields.documentId,
        documentNo: fields.documentNo,
        title: fields.title,
        status: fields.status,
        currentStep: fields.currentStep ?? null,
        waitingForRole: fields.waitingForRole,
        waitingForPermission: stepGate.waitingForPermission,
        waitingForPermissionsAny: stepGate.waitingForPermissionsAny,
        waitingForUser: fields.waitingForUser ?? null,
        createdBy: fields.createdBy ?? null,
        createdAt: fields.createdAt instanceof Date ? fields.createdAt.toISOString() : fields.createdAt,
        pendingSince: pendingSince instanceof Date ? pendingSince.toISOString() : pendingSince,
        ageHours,
        priority: fields.priority || sla.priority,
        slaStatus: sla.slaStatus,
        overdue: fields.overdue != null ? fields.overdue : sla.overdue,
        escalationLevel: sla.escalationLevel,
        deepLink: fields.deepLink,
        meta: fields.meta || {},
    };
};

async function collectTransfers(tenantId, scope = null) {
    const chainCache = createPresentationChainCache(tenantId);
    const rows = await prisma.storeTransfer.findMany({
        where: { tenantId, status: { in: [...TRANSFER_PIPELINE_STATUSES] }, ...scopeWhereFor(SCOPE_MODULE.TRANSFER, scope) },
        include: {
            sourceLocation: { select: { name: true } },
            destLocation: { select: { name: true } },
            requestedByUser: { select: { firstName: true, lastName: true } },
            approvalRequest: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: { requiredRole: { select: { code: true } } },
                    },
                },
            },
        },
        orderBy: { updatedAt: 'desc' },
        take: 500,
    });

    const items = [];
    for (const t of rows) {
        let waitingForRole = null;
        let currentStep = t.status;
        let slaRule = SLA_RULES.DEFAULT;

        if (TRANSFER_APPROVAL_STATUSES.includes(t.status) && t.approvalRequest?.status === 'PENDING') {
            const chain = t.approvalRequest.accWorkflowVersionId
                ? await chainCache.getChain({ moduleKey: 'TRANSFER', versionId: t.approvalRequest.accWorkflowVersionId })
                : await chainCache.getChain({ moduleKey: 'TRANSFER' });
            // Prefer live ApprovalStep role (works for default-chain / unpinned versionId).
            waitingForRole = waitingRoleFromApprovalRequest(t.approvalRequest)
                || waitingRoleFromAccStatus(chain, t.status)
                || null;
            currentStep = `Approval step ${t.approvalRequest.currentStep}`;
        } else if (TRANSFER_APPROVAL_STATUSES.includes(t.status)) {
            // AR missing/non-PENDING but document still in approval status — derive from chain/status.
            const chain = await chainCache.getChain({ moduleKey: 'TRANSFER' });
            waitingForRole = waitingRoleFromAccStatus(chain, t.status) || null;
            currentStep = t.status;
        } else if (TRANSFER_LEGACY_OPEN_STATUSES.includes(t.status)) {
            waitingForRole = null;
            currentStep = 'Legacy transfer — resolve via migration';
            slaRule = SLA_RULES.TRANSFER_LEGACY;
        }

        const pendingSince = t.updatedAt || t.createdAt;
        items.push(
            baseRow({
                id: `transfer:${t.id}`,
                module: 'TRANSFER',
                documentId: t.id,
                documentNo: t.transferNo,
                title: `Transfer ${t.transferNo}`,
                status: t.status,
                currentStep,
                waitingForRole,
                createdBy: `${t.requestedByUser?.firstName || ''} ${t.requestedByUser?.lastName || ''}`.trim(),
                createdAt: t.createdAt,
                pendingSince,
                slaRule,
                deepLink: `/transfers/${t.id}`,
                meta: {
                    fromLocation: t.sourceLocation?.name,
                    toLocation: t.destLocation?.name,
                },
            }),
        );
    }
    return items;
}

async function collectGrns(tenantId, scope = null) {
    const chainCache = createPresentationChainCache(tenantId);
    const publishedChain = await chainCache.getChain({ moduleKey: 'GRN' });
    const rows = await prisma.grnImport.findMany({
        where: { tenantId, status: { in: [...GRN_OPEN_STATUSES] }, ...scopeWhereFor(SCOPE_MODULE.GRN, scope) },
        include: {
            importedByUser: { select: { firstName: true, lastName: true } },
            location: { select: { name: true } },
            _count: { select: { lines: true } },
            approvalRequest: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: { requiredRole: { select: { code: true } } },
                    },
                },
            },
        },
        orderBy: { updatedAt: 'desc' },
        take: 300,
    });

    const items = [];
    for (const g of rows) {
        const chain = g.accWorkflowVersionId
            ? await chainCache.getChain({ moduleKey: 'GRN', versionId: g.accWorkflowVersionId })
            : publishedChain;
        let waitingForRole = waitingRoleFromApprovalRequest(g.approvalRequest)
            || waitingRoleFromAccStatus(chain, g.status)
            || null;
        let currentStep = g.status;
        if (g.status === 'PENDING_FINANCE') {
            currentStep = 'Finance approval & post';
        } else if (g.status === 'PENDING_APPROVAL') {
            currentStep = 'Cost Control review';
        } else if (g.status === 'VALIDATED') {
            currentStep = 'Cost Control review';
        }

        items.push(
            baseRow({
                id: `grn:${g.id}`,
                module: 'GRN',
                documentId: g.id,
                documentNo: g.grnNumber,
                title: `GRN ${g.grnNumber}`,
                status: g.status,
                currentStep,
                waitingForRole,
                createdBy: `${g.importedByUser?.firstName || ''} ${g.importedByUser?.lastName || ''}`.trim(),
                createdAt: g.createdAt,
                pendingSince: g.updatedAt || g.createdAt,
                slaRule: SLA_RULES.GRN_PENDING,
                deepLink: `/grn/${g.id}`,
                meta: {
                    vendor: g.vendorNameSnapshot,
                    location: g.location?.name,
                    lineCount: g._count?.lines ?? null,
                },
            }),
        );
    }
    return items;
}

async function collectInventoryCounts(tenantId, scope = null) {
    const chainCache = createPresentationChainCache(tenantId);
    const rows = await prisma.stockCountSession.findMany({
        where: {
            tenantId,
            status: { in: [...INVENTORY_COUNT_ACTIVE_STATUSES] },
            ...scopeWhereFor(SCOPE_MODULE.INVENTORY_COUNT, scope),
        },
        include: {
            createdByUser: { select: { firstName: true, lastName: true } },
            location: { select: { name: true } },
            approvalRequest: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: { requiredRole: { select: { code: true } } },
                    },
                },
            },
        },
        orderBy: { updatedAt: 'desc' },
        take: 300,
    });

    const items = [];
    for (const s of rows) {
        const chain = s.approvalRequest?.accWorkflowVersionId
            ? await chainCache.getChain({ moduleKey: 'STOCK_COUNT', versionId: s.approvalRequest.accWorkflowVersionId })
            : await chainCache.getChain({ moduleKey: 'STOCK_COUNT' });
        let waitingForRole = waitingRoleFromAccStatus(chain, s.status) || null;
        let currentStep = s.status;
        let slaRule = SLA_RULES.DEFAULT;

        if (
            [
                'PENDING_COST_CONTROL',
                'PENDING_DEPT',
                'PENDING_FINANCE',
                'PENDING_GM',
                'PENDING_APPROVAL',
                'FINANCE_APPROVED',
            ].includes(s.status) &&
            s.approvalRequest?.status === 'PENDING'
        ) {
            waitingForRole = waitingRoleFromApprovalRequest(s.approvalRequest)
                || waitingRoleFromAccStatus(chain, s.status)
                || null;
            currentStep = `Count approval (step ${s.approvalRequest.currentStep})`;
            slaRule = SLA_RULES.COUNT_PENDING_APPROVAL;
        }

        items.push(
            baseRow({
                id: `count:${s.id}`,
                module: 'INVENTORY_COUNT',
                documentId: s.id,
                documentNo: s.sessionNo,
                title: `Count ${s.sessionNo}`,
                status: s.status,
                currentStep,
                waitingForRole,
                createdBy: `${s.createdByUser?.firstName || ''} ${s.createdByUser?.lastName || ''}`.trim(),
                createdAt: s.createdAt,
                pendingSince: s.updatedAt || s.createdAt,
                slaRule,
                deepLink: `/inventory-count/${s.id}`,
                meta: { location: s.location?.name },
            }),
        );
    }
    return items;
}

async function collectBreakageAndLost(tenantId, scope = null) {
    const { getApproval } = require('../breakageLostWorkflowContext.util');
    const chainCache = createPresentationChainCache(tenantId);
    const docs = await prisma.movementDocument.findMany({
        where: {
            tenantId,
            movementType: { in: ['BREAKAGE', 'LOST'] },
            status: { in: [...BREAKAGE_PENDING_DOC_STATUSES] },
            ...scopeWhereFor(SCOPE_MODULE.BREAKAGE, scope),
        },
        include: {
            createdByUser: { select: { firstName: true, lastName: true } },
            _count: { select: { lines: true } },
            approvalRequests: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: { requiredRole: { select: { code: true } } },
                    },
                },
            },
        },
        orderBy: { updatedAt: 'desc' },
        take: 300,
    });

    const items = [];
    for (const d of docs) {
        const module = d.movementType === 'LOST' ? 'LOST' : 'BREAKAGE';
        const approval = getApproval(d);
        const ar =
            approval && String(approval.status || '').toUpperCase() === 'PENDING' ? approval : null;
        const moduleKey = 'BREAKAGE';
        const chain = ar?.accWorkflowVersionId
            ? await chainCache.getChain({ moduleKey, versionId: ar.accWorkflowVersionId })
            : await chainCache.getChain({ moduleKey });
        let waitingForRole = null;
        let currentStep = d.status;

        if (ar) {
            waitingForRole = waitingRoleFromApprovalRequest(ar)
                || waitingRoleFromAccStatus(chain, d.status)
                || null;
            currentStep = `Approval step ${ar.currentStep}`;
        } else if (d.status === 'DRAFT') {
            currentStep = 'Draft / submit';
        }

        items.push(
            baseRow({
                id: `${module.toLowerCase()}:${d.id}`,
                module,
                documentId: d.id,
                documentNo: d.documentNo,
                title: `${module === 'LOST' ? 'Lost' : 'Breakage'} ${d.documentNo}`,
                status: d.status,
                currentStep,
                waitingForRole,
                createdBy: `${d.createdByUser?.firstName || ''} ${d.createdByUser?.lastName || ''}`.trim(),
                createdAt: d.createdAt,
                pendingSince: d.updatedAt || d.createdAt,
                slaRule: SLA_RULES.BREAKAGE_PENDING,
                deepLink: module === 'LOST' ? `/lost-items/${d.id}` : `/breakage/${d.id}`,
                meta: {
                    reason: d.reason || null,
                    lineCount: d._count?.lines ?? null,
                },
            }),
        );
    }
    return items;
}

const GET_PASS_PIPELINE_STATUSES = [
    ...GET_PASS_APPROVAL_STATUSES,
    'APPROVED',
    'OUT',
    'PARTIALLY_RETURNED',
    'RECEIVED_AT_DESTINATION',
    'RETURNING',
    'RETURN_RECEIVED_AT_GATE',
];

async function collectGetPasses(tenantId, scope = null) {
    const chainCache = createPresentationChainCache(tenantId);
    const rows = await prisma.getPass.findMany({
        where: {
            tenantId,
            status: { in: GET_PASS_PIPELINE_STATUSES },
            ...scopeWhereFor(SCOPE_MODULE.GET_PASS, scope),
        },
        include: {
            createdByUser: { select: { firstName: true, lastName: true } },
            department: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 400,
    });

    const items = [];
    const now = new Date();

    for (const p of rows) {
        const isOut = GET_PASS_OUT_STATUSES.includes(p.status);
        const overdue = isOut && isOverdueReturn(p.expectedReturnDate);
        const dueToday = isOut && !overdue && isExpectedReturnToday(p.expectedReturnDate);

        if (GET_PASS_APPROVAL_STATUSES.includes(p.status)) {
            const chain = p.accWorkflowVersionId
                ? await chainCache.getChain({ moduleKey: 'GET_PASS', versionId: p.accWorkflowVersionId })
                : await chainCache.getChain({ moduleKey: 'GET_PASS' });
            const waitingForRole = waitingRoleFromAccStatus(chain, p.status) || null;
            items.push(
                baseRow({
                    id: `getpass:${p.id}`,
                    module: 'GET_PASS',
                    documentId: p.id,
                    documentNo: p.passNo,
                    title: `Get Pass ${p.passNo}`,
                    status: p.status,
                    currentStep: 'Approval',
                    waitingForRole,
                    createdBy: `${p.createdByUser?.firstName || ''} ${p.createdByUser?.lastName || ''}`.trim(),
                    createdAt: p.createdAt,
                    pendingSince: p.updatedAt || p.createdAt,
                    slaRule: SLA_RULES.DEFAULT,
                    deepLink: `/get-passes/${p.id}`,
                    meta: {
                        transferType: p.transferType,
                        borrowingEntity: p.borrowingEntity,
                        expectedReturnDate: p.expectedReturnDate,
                    },
                }),
            );
            continue;
        }

        if (GET_PASS_DISPATCH_STATUSES.includes(p.status)) {
            items.push(
                baseRow({
                    id: `getpass:${p.id}`,
                    module: 'GET_PASS',
                    documentId: p.id,
                    documentNo: p.passNo,
                    title: `Get Pass ${p.passNo}`,
                    status: p.status,
                    currentStep: 'Dispatch / checkout',
                    waitingForRole: null,
                    createdBy: `${p.createdByUser?.firstName || ''} ${p.createdByUser?.lastName || ''}`.trim(),
                    createdAt: p.createdAt,
                    pendingSince: p.updatedAt || p.createdAt,
                    priority: 'warning',
                    deepLink: `/get-passes/${p.id}`,
                    meta: { transferType: p.transferType, borrowingEntity: p.borrowingEntity },
                }),
            );
            continue;
        }

        if (isOut) {
            items.push(
                baseRow({
                    id: `getpass:${p.id}`,
                    module: 'GET_PASS',
                    documentId: p.id,
                    documentNo: p.passNo,
                    title: `Get Pass ${p.passNo}`,
                    status: p.status,
                    currentStep: overdue ? 'Overdue return' : dueToday ? 'Return due today' : 'Awaiting return',
                    waitingForRole: null,
                    createdBy: `${p.createdByUser?.firstName || ''} ${p.createdByUser?.lastName || ''}`.trim(),
                    createdAt: p.createdAt,
                    pendingSince: p.checkedOutAt || p.updatedAt || p.createdAt,
                    forceCritical: overdue,
                    forceWarning: dueToday && !overdue,
                    slaRule: SLA_RULES.GET_PASS_OVERDUE,
                    deepLink: `/get-passes/${p.id}`,
                    meta: {
                        transferType: p.transferType,
                        borrowingEntity: p.borrowingEntity,
                        expectedReturnDate: p.expectedReturnDate,
                        assetsOutside: true,
                    },
                }),
            );
            continue;
        }

        if (['RECEIVED_AT_DESTINATION', 'RETURNING', 'RETURN_RECEIVED_AT_GATE', 'PARTIALLY_RETURNED'].includes(p.status)) {
            items.push(
                baseRow({
                    id: `getpass:${p.id}`,
                    module: 'GET_PASS',
                    documentId: p.id,
                    documentNo: p.passNo,
                    title: `Get Pass ${p.passNo}`,
                    status: p.status,
                    currentStep: 'Return workflow',
                    waitingForRole: null,
                    createdBy: `${p.createdByUser?.firstName || ''} ${p.createdByUser?.lastName || ''}`.trim(),
                    createdAt: p.createdAt,
                    pendingSince: p.updatedAt || p.createdAt,
                    deepLink: `/get-passes/${p.id}`,
                    meta: { transferType: p.transferType, isInternalTransfer: p.isInternalTransfer },
                }),
            );
        }
    }
    return items;
}

function userHasPipelinePermission(user, permission) {
    if (!user || !permission) return false;
    const resolved = resolvePermissionKey(permission);
    if (Array.isArray(user.permissions) && user.permissions.length > 0) {
        return (
            user.permissions.includes(resolved) ||
            user.permissions.includes(permission) ||
            user.permissions.some((p) => resolvePermissionKey(p) === resolved)
        );
    }
    return hasPermission(user, permission);
}

function normalizePipelineRole(code) {
    const r = normalizeRole(code);
    if (r === 'COST_CONTROLLER') return 'COST_CONTROL';
    return r;
}

/** Pipeline "mine" filter — permission + current-step role (Breakage/Lost share one approve perm). */
function userCanActOnItem(item, userCtx) {
    if (!item) return false;
    const user =
        typeof userCtx === 'string'
            ? { role: userCtx }
            : userCtx && typeof userCtx === 'object'
              ? userCtx
              : null;
    if (!user?.role && !(Array.isArray(user?.permissions) && user.permissions.length)) {
        return false;
    }

    const userRole = normalizePipelineRole(user.role);
    if (userRole === 'ORG_MANAGER' || userRole === 'SUPER_ADMIN') {
        return true;
    }

    let permissionOk = false;
    if (Array.isArray(item.waitingForPermissionsAny) && item.waitingForPermissionsAny.length) {
        permissionOk = item.waitingForPermissionsAny.some((p) => userHasPipelinePermission(user, p));
    } else if (item.waitingForPermission) {
        permissionOk = userHasPipelinePermission(user, item.waitingForPermission);
    }

    // Security gate exit: match SECURITY role even when UR only has EXIT (or FINAL legacy).
    if (
        !permissionOk &&
        item.module === 'GET_PASS' &&
        String(item.status || '').toUpperCase() === 'PENDING_SECURITY'
    ) {
        if (userRole === 'SECURITY') {
            permissionOk =
                userHasPipelinePermission(user, 'GET_PASS_APPROVE_EXIT') ||
                userHasPipelinePermission(user, 'GET_PASS_APPROVE_FINAL');
        }
    }

    if (!permissionOk) return false;

    // Shared approve permission across steps (BREAKAGE/LOST/TRANSFER/…) — must match waiting role.
    const waitingRole = normalizePipelineRole(item.waitingForRole);
    if (waitingRole && userRole && waitingRole !== userRole) {
        return false;
    }

    return true;
}

module.exports = {
    roleLabel,
    collectTransfers,
    collectGrns,
    collectInventoryCounts,
    collectBreakageAndLost,
    collectGetPasses,
    userCanActOnItem,
};
