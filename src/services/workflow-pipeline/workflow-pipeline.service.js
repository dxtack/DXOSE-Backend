'use strict';

const {
    PIPELINE_MODULES,
    TRANSFER_OPEN_STATUSES,
    GRN_OPEN_STATUSES,
    GET_PASS_OUT_STATUSES,
} = require('./workflow-pending.definitions');
const {
    roleLabel,
    collectTransfers,
    collectGrns,
    collectInventoryCounts,
    collectBreakageAndLost,
    collectGetPasses,
    userCanActOnItem,
} = require('./workflow-pipeline.collectors');
const { permissionLabel, itemMatchesWaitingFilter } = require('../../acc-authority/workflow-step-permissions');
const { resolveScopeContext } = require('../scope/scopeContext');
const { hasActiveAssignmentForProperty } = require('../scope/assignment-mutation.guard');
const { normalizeRole } = require('../rbac.service');
const { toInclusiveUtcEndOfDay } = require('../../utils/report-date-range.util');

const PRIORITY_RANK = { critical: 0, warning: 1, info: 2 };

const parseBool = (v) => v === true || v === 'true' || v === '1';

const parseList = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
    return String(v)
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
};

async function resolvePipelineAccess(user, tenantId) {
    const role = normalizeRole(user?.role);
    if (role === 'SUPER_ADMIN') {
        return { allowed: true, scope: await resolveScopeContext(user, tenantId) };
    }
    // Security gate staff: property-wide Get Pass visibility; do not require ACC assignment
    // (assignment gaps were hiding PENDING_SECURITY from Workflow Pipeline + Get Pass list).
    if (role === 'SECURITY') {
        return { allowed: true, scope: await resolveScopeContext(user, tenantId) };
    }
    const hasAssignment = await hasActiveAssignmentForProperty(user, tenantId);
    if (!hasAssignment) {
        return { allowed: false, scope: null };
    }
    const scope = await resolveScopeContext(user, tenantId);
    return { allowed: true, scope };
}

async function loadAllItems(tenantId, scope) {
    // Isolate collector failures — a missing published workflow for GRN/GET_PASS/etc.
    // must not wipe TRANSFER (or other) pending items from the pipeline.
    const settled = await Promise.allSettled([
        collectTransfers(tenantId, scope),
        collectGrns(tenantId, scope),
        collectInventoryCounts(tenantId, scope),
        collectBreakageAndLost(tenantId, scope),
        collectGetPasses(tenantId, scope),
    ]);
    const items = [];
    for (const result of settled) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            items.push(...result.value);
        }
    }
    return items;
}

function emptyPipelinePage(query, userCtx) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 50));
    return {
        items: [],
        summary: buildSummary([], userCtx),
        meta: {
            page,
            limit,
            total: 0,
            totalPages: 1,
            generatedAt: new Date().toISOString(),
        },
    };
}

function applyFilters(items, query, userCtx) {
    let out = items;

    const modules = parseList(query.module);
    if (modules.length) {
        out = out.filter((i) => modules.includes(i.module));
    }

    const waitingFor = parseList(query.waitingFor);
    if (waitingFor.length) {
        out = out.filter((i) => waitingFor.some((w) => itemMatchesWaitingFilter(w, i)));
    }

    const priorities = parseList(query.priority).map((p) => p.toLowerCase());
    if (priorities.length) {
        out = out.filter((i) => priorities.includes(String(i.priority || '').toLowerCase()));
    }

    const statuses = parseList(query.status);
    if (statuses.length) {
        out = out.filter((i) => statuses.includes(String(i.status || '').toUpperCase()));
    }

    if (parseBool(query.overdue)) {
        out = out.filter((i) => i.overdue === true);
    }

    if (parseBool(query.mine) && userCtx) {
        out = out.filter((i) => userCanActOnItem(i, userCtx));
    }

    if (query.dateFrom || query.dateTo) {
        const from = query.dateFrom ? new Date(query.dateFrom) : null;
        const to = query.dateTo ? toInclusiveUtcEndOfDay(query.dateTo) : null;
        out = out.filter((i) => {
            const d = new Date(i.pendingSince || i.createdAt);
            if (Number.isNaN(d.getTime())) return true;
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
        });
    }

    if (query.q) {
        const q = String(query.q).toLowerCase();
        out = out.filter((i) => {
            const meta = i.meta && typeof i.meta === 'object' ? i.meta : {};
            const metaText = Object.values(meta)
                .filter((v) => v != null && typeof v !== 'object')
                .map((v) => String(v))
                .join(' ')
                .toLowerCase();
            return (
                String(i.documentNo || '').toLowerCase().includes(q) ||
                String(i.title || '').toLowerCase().includes(q) ||
                String(i.status || '').toLowerCase().includes(q) ||
                metaText.includes(q)
            );
        });
    }

    return out;
}

function sortItems(items) {
    return [...items].sort((a, b) => {
        const pa = PRIORITY_RANK[a.priority] ?? 9;
        const pb = PRIORITY_RANK[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return (b.ageHours || 0) - (a.ageHours || 0);
    });
}

function enrichDisplay(items) {
    return items.map((i) => ({
        ...i,
        waitingForLabel:
            permissionLabel(i.waitingForPermission) ||
            (Array.isArray(i.waitingForPermissionsAny) && i.waitingForPermissionsAny.length
                ? i.waitingForPermissionsAny.map(permissionLabel).filter(Boolean).join(' / ')
                : null) ||
            roleLabel(i.waitingForRole),
    }));
}

function buildSummary(items, userCtx) {
    const byModule = {};
    const byWaitingFor = {};
    const byPriority = { critical: 0, warning: 0, info: 0 };

    for (const m of PIPELINE_MODULES) {
        byModule[m] = 0;
    }

    let overdue = 0;
    let mine = 0;

    for (const i of items) {
        byModule[i.module] = (byModule[i.module] || 0) + 1;
        const w = i.waitingForRole || 'UNKNOWN';
        byWaitingFor[w] = (byWaitingFor[w] || 0) + 1;
        const p = i.priority || 'info';
        byPriority[p] = (byPriority[p] || 0) + 1;
        if (i.overdue) overdue += 1;
        if (userCtx && userCanActOnItem(i, userCtx)) mine += 1;
    }

    const getPassOverdue = items.filter(
        (i) => i.module === 'GET_PASS' && i.overdue && i.priority === 'critical',
    ).length;

    return {
        total: items.length,
        overdue,
        mine,
        critical: byPriority.critical,
        warning: byPriority.warning,
        info: byPriority.info,
        byModule,
        byWaitingFor,
        getPassOverdue,
        /** Legacy dashboard field alignment */
        operationalHealth: {
            pendingTransfersCount: byModule.TRANSFER || 0,
            pendingGrnsCount: byModule.GRN || 0,
            pendingLossCount: (byModule.BREAKAGE || 0) + (byModule.LOST || 0),
            overdueLoansCount: getPassOverdue,
            pendingStockReportsCount: 0,
            pendingInventoryCountCount: byModule.INVENTORY_COUNT || 0,
        },
    };
}

/**
 * @param {string} tenantId
 * @param {object} userCtx — { id, role, permissions? }
 * @param {object} query
 */
async function getWorkflowPipeline(tenantId, userCtx, query = {}) {
    const access = await resolvePipelineAccess(userCtx, tenantId);
    if (!access.allowed) {
        return emptyPipelinePage(query, userCtx);
    }
    const all = await loadAllItems(tenantId, access.scope);
    const filtered = sortItems(applyFilters(all, query, userCtx));
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 50));
    const start = (page - 1) * limit;
    const pageItems = enrichDisplay(filtered.slice(start, start + limit));

    return {
        items: pageItems,
        summary: buildSummary(filtered, userCtx),
        meta: {
            page,
            limit,
            total: filtered.length,
            totalPages: Math.ceil(filtered.length / limit) || 1,
            generatedAt: new Date().toISOString(),
        },
    };
}

/** Lightweight summary for dashboard + bell (full collect, no pagination). */
async function getWorkflowPipelineSummary(tenantId, userCtx) {
    const access = await resolvePipelineAccess(userCtx, tenantId);
    if (!access.allowed) {
        return { ...buildSummary([], userCtx), generatedAt: new Date().toISOString() };
    }
    const all = await loadAllItems(tenantId, access.scope);
    return {
        ...buildSummary(all, userCtx),
        generatedAt: new Date().toISOString(),
    };
}

/** Top N items for notification dropdown. */
async function getWorkflowPipelineAlerts(tenantId, userCtx, { limit = 15 } = {}) {
    const access = await resolvePipelineAccess(userCtx, tenantId);
    if (!access.allowed) {
        return [];
    }
    const all = sortItems(await loadAllItems(tenantId, access.scope));
    const actionable = userCtx ? all.filter((i) => userCanActOnItem(i, userCtx)) : all;
    const criticalFirst = actionable.filter((i) => i.priority === 'critical' || i.overdue);
    const rest = actionable.filter((i) => i.priority !== 'critical' && !i.overdue);
    const merged = [...criticalFirst, ...rest].slice(0, limit);
    return enrichDisplay(merged);
}

/** Full scoped pipeline items (no actionable filter) for dashboard detail alignment. */
async function getScopedPipelineItems(tenantId, userCtx) {
    const access = await resolvePipelineAccess(userCtx, tenantId);
    if (!access.allowed) {
        return [];
    }
    return loadAllItems(tenantId, access.scope);
}

module.exports = {
    PIPELINE_MODULES,
    TRANSFER_OPEN_STATUSES,
    GRN_OPEN_STATUSES,
    GET_PASS_OUT_STATUSES,
    getWorkflowPipeline,
    getWorkflowPipelineSummary,
    getWorkflowPipelineAlerts,
    getScopedPipelineItems,
    applyFilters,
    userCanActOnItem,
};
