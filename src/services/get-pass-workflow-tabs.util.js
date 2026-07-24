'use strict';

/** Terminal pass statuses — excluded from Outgoing (open workflow). */
const GET_PASS_TERMINAL_STATUSES = Object.freeze(['RETURNED', 'CLOSED', 'REJECTED']);

/** Open issuer workflow — shown on Outgoing tab when no explicit status filter is passed. */
const GET_PASS_OUTGOING_OPEN_STATUSES = Object.freeze([
    'DRAFT',
    'PENDING_DEPT',
    'PENDING_COST_CONTROL',
    'PENDING_FINANCE',
    'PENDING_GM',
    'PENDING_SECURITY',
    'APPROVED',
    'OUT',
    'RECEIVED_AT_DESTINATION',
    'RETURNING',
    'RETURN_RECEIVED_AT_GATE',
    'PARTIALLY_RETURNED',
    'PENDING_FORCE_CLOSE_SETTLEMENT',
]);

/** Active internal transfers awaiting action at the destination hotel. */
const GET_PASS_INCOMING_OPERATIONAL_STATUSES = Object.freeze(['OUT', 'RECEIVED_AT_DESTINATION']);

/** Return lifecycle statuses (pass-level). */
const GET_PASS_RETURN_STATUS_LIST = Object.freeze([
    'RETURNING',
    'RETURN_RECEIVED_AT_GATE',
    'PARTIALLY_RETURNED',
    'RETURNED',
]);

/**
 * Prisma `where` fragment: pass has recorded return activity (any return type / internal or standard).
 */
const buildGetPassReturnActivityPredicate = () => ({
    OR: [
        { status: { in: [...GET_PASS_RETURN_STATUS_LIST] } },
        {
            status: 'CLOSED',
            OR: [
                { closedVia: 'FORCE_SETTLEMENT' },
                {
                    lines: {
                        some: {
                            OR: [
                                { qtyReturned: { gt: 0 } },
                                { returnedGoodQty: { gt: 0 } },
                                { returnedDamagedQty: { gt: 0 } },
                                { returnedLostQty: { gt: 0 } },
                            ],
                        },
                    },
                },
            ],
        },
    ],
});

/**
 * Full `where` for GET /get-passes/returns — issuer or involved hotel, any transfer type.
 */
const buildGetPassReturnsListWhere = (tenantId, listContext) => {
    const tenantScope = listContext?.organizationRootId
        ? {
              OR: [
                  { tenant: { parentId: listContext.organizationRootId } },
                  { targetTenant: { parentId: listContext.organizationRootId } },
              ],
          }
        : {
              OR: [{ tenantId }, { targetTenantId: tenantId }],
          };

    return {
        AND: [tenantScope, buildGetPassReturnActivityPredicate()],
    };
};

module.exports = {
    GET_PASS_TERMINAL_STATUSES,
    GET_PASS_OUTGOING_OPEN_STATUSES,
    GET_PASS_INCOMING_OPERATIONAL_STATUSES,
    GET_PASS_RETURN_STATUS_LIST,
    buildGetPassReturnActivityPredicate,
    buildGetPassReturnsListWhere,
};
