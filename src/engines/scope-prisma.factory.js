'use strict';

/**
 * Scope Prisma Factory — Wave 7 (Security Layer)
 *
 * Creates a scope-aware Prisma client via Prisma 5 $extends.
 * The scoped client automatically injects WHERE filters for:
 *   - Property scope  → tenantId   (for PROPERTY_SCOPED_MODELS)
 *   - Department scope → departmentId (for DEPT_SCOPED_MODELS)
 *
 * Usage:
 *   const { createScopedPrisma } = require('./scope-prisma.factory');
 *   const scopedClient = createScopedPrisma(scopeContext);
 *   const grns = await scopedClient.movementDocument.findMany({ ... });
 *   // automatically filtered by user's properties
 *
 * This factory is ADDITIVE — the base prisma client is unchanged.
 * Existing routes still use the base prisma and are unaffected.
 */

const { PrismaClient } = require('@prisma/client');

const basePrisma = new PrismaClient();

// ─── Model allowlists ────────────────────────────────────────────────────────

/**
 * Operational models that carry a tenantId (property scope).
 * Only these models get the tenantId filter injected.
 *
 * Identified from schema: models with tenantId field that represent
 * hotel-level operational data.
 */
const PROPERTY_SCOPED_MODELS = new Set([
    'MovementDocument',
    'StoreRequisition',
    'StoreIssue',
    'StoreTransfer',
    'GetPass',
    'StockCountSession',
    'ApprovalRequest',
    'GrnImport',
    'InventoryLedger',
    'StockBalance',
    'GeneratedReport',
    'SavedStockReport',
]);

/**
 * Models where departmentId narrows visibility even further.
 * Only applied if the user has department restrictions.
 *
 * Note: departmentId is nullable in these models. We use OR to include
 * records with no department assignment (shared data).
 */
const DEPT_SCOPED_MODELS = new Set([
    'StockCountSession',
    'GetPass',
    'Item',
    'Location',
    'GeneratedReport',
]);

// ─── Filter injection helpers ────────────────────────────────────────────────

/**
 * Safely merge a new condition into an existing where clause using AND.
 * Handles: undefined, empty object, and existing AND arrays.
 */
function andMerge(existingWhere, newCondition) {
    if (!existingWhere || Object.keys(existingWhere).length === 0) {
        return newCondition;
    }
    return { AND: [existingWhere, newCondition] };
}

/**
 * Build the WHERE injection for property scope.
 * Guard: never injects if propertyIds is null (unrestricted) or empty.
 */
function injectPropertyScope(args, propertyIds) {
    if (!propertyIds || propertyIds.length === 0) return args;
    return { ...args, where: andMerge(args.where, { tenantId: { in: propertyIds } }) };
}

/**
 * Build the WHERE injection for department scope.
 * Uses OR to include records with no departmentId (cross-department shared records).
 */
function injectDeptScope(args, departmentIds) {
    if (!departmentIds || departmentIds.length === 0) return args;
    return {
        ...args,
        where: andMerge(args.where, {
            OR: [
                { departmentId: { in: departmentIds } },
                { departmentId: null },
            ],
        }),
    };
}

// ─── Intercept handler ───────────────────────────────────────────────────────

/**
 * Applies scope filters to query args based on the model name.
 * Called for each intercepted operation.
 */
function applyScope(model, args, scopeContext) {
    let scopedArgs = args;

    if (PROPERTY_SCOPED_MODELS.has(model) && scopeContext.propertyIds !== null) {
        scopedArgs = injectPropertyScope(scopedArgs, scopeContext.propertyIds);
    }

    if (DEPT_SCOPED_MODELS.has(model) && scopeContext.departmentIds !== null) {
        scopedArgs = injectDeptScope(scopedArgs, scopeContext.departmentIds);
    }

    return scopedArgs;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a scope-aware Prisma client for a specific request context.
 *
 * @param {object} scopeContext
 *   { propertyIds: string[] | null, departmentIds: string[] | null }
 * @returns {ExtendedPrismaClient}
 */
function createScopedPrisma(scopeContext) {
    if (!scopeContext) {
        throw new Error('[scope-prisma] scopeContext is required');
    }

    // Fast path: if completely unrestricted, return the base client as-is.
    // This avoids any overhead for users with all-property access.
    if (scopeContext.propertyIds === null && scopeContext.departmentIds === null) {
        return basePrisma;
    }

    return basePrisma.$extends({
        query: {
            $allModels: {
                async findMany({ model, args, query }) {
                    return query(applyScope(model, args, scopeContext));
                },
                async findFirst({ model, args, query }) {
                    return query(applyScope(model, args, scopeContext));
                },
                async findFirstOrThrow({ model, args, query }) {
                    return query(applyScope(model, args, scopeContext));
                },
                async count({ model, args, query }) {
                    return query(applyScope(model, args, scopeContext));
                },
                async aggregate({ model, args, query }) {
                    return query(applyScope(model, args, scopeContext));
                },
            },
        },
    });
}

/**
 * Preview the WHERE clause that would be injected for a model+context pair.
 * Used in validation scripts — does NOT execute a DB query.
 */
function previewScopeFilter(model, existingWhere, scopeContext) {
    let args = { where: existingWhere ?? {} };
    const scopedArgs = applyScope(model, args, scopeContext);
    return {
        model,
        original:   existingWhere ?? {},
        injected:   scopedArgs.where,
        filtered:   JSON.stringify(scopedArgs.where) !== JSON.stringify(args.where),
    };
}

module.exports = {
    createScopedPrisma,
    previewScopeFilter,
    PROPERTY_SCOPED_MODELS,
    DEPT_SCOPED_MODELS,
};
