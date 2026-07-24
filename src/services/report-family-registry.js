'use strict';

/**
 * Phase 2 — Report family registry.
 * Maps workspace card IDs to report families, grouping specs, and UI routing hints.
 */

/** @typedef {'count-variance'|'stock-balance'|'ledger'|'breakage'|'omc'|'transfers'|'get-pass'|'governance'|'generic'} ReportFamilyId */

/**
 * @typedef {object} GroupLevelSpec
 * @property {string} field - Row property to group by
 * @property {string} levelType - Semantic level (session, location, document, ...)
 */

/**
 * @typedef {object} GroupingSpec
 * @property {GroupLevelSpec[]} levels
 * @property {string[]} subtotalKeys
 */

/**
 * @typedef {object} ReportFamilyDefinition
 * @property {ReportFamilyId} familyId
 * @property {readonly string[]} cards
 * @property {GroupingSpec|null} grouping
 * @property {boolean} dedicatedView - Phase 2 dedicated Angular view (vs generic fallback)
 * @property {'analytics'|'engine'|'summary'|'valuation'} shell
 */

const COUNT_VARIANCE_CARDS = [
    'count-variance-report',
    'variance-by-location',
    'variance-by-department',
    'variance-by-category',
    'variance-by-counter',
    'variance-value-impact',
    'top-variance-items',
];

const STOCK_BALANCE_CARDS = ['current-stock-balance', 'inventory-by-location'];

const LEDGER_CARDS = [
    'inventory-change-history',
    'posting-activity-report',
    'adjustment-history',
    'stock-adjustment-summary',
    'breakage-workflow',
    'stock-movement-analysis',
    'workflow-completion-analysis',
    'workflow-timeline-report',
];

const TRANSFER_CARDS = [
    'transfer-history',
    'open-transfers',
    'transfer-aging',
    'transfer-delays',
    'inter-location-movement',
];

const BREAKAGE_CARDS = ['breakage-loss-report', 'breakage-trend-analysis', 'loss-analysis'];

const OMC_CARDS = ['omc-report'];

const DETAIL_REPORT_GROUPING = {
    levels: [
        { field: 'departmentName', levelType: 'department' },
        { field: 'locationName', levelType: 'location' },
    ],
    subtotalKeys: [
        'openingQty', 'openingValue',
        'inwardQty', 'inwardValue',
        'breakageQty', 'breakageValue',
        'gatePassQty', 'gatePassValue',
        'theoreticalQty', 'theoreticalValue',
        'physicalQty', 'physicalValue',
        'varianceQty', 'varianceValue',
        'closingQty', 'closingValue',
    ],
};

const GET_PASS_CARDS = [
    'get-pass-activity',
    'overdue-returns',
    'open-get-passes',
    'temporary-movement-report',
    'returned-vs-outstanding-assets',
];

const GOVERNANCE_LIVE_CARDS = [
    'audit-activity-report',
    'user-operational-activity',
    'approval-activity-report',
    'workflow-violations',
];

const ENGINE_FAMILY_MAP = {
    'transfer-history': 'transfers',
    'transfer-aging': 'transfers',
    'inter-location-movement': 'transfers',
    'detail-report': 'omc',
    'inventory-by-department': 'omc',
    'inventory-by-category': 'omc',
};

/** Cards that currently proxy audit log only — hidden until Wave D governance handlers. */
const GOVERNANCE_AUDIT_LOG_PROXY_CARDS = new Set([
    'audit-activity-report',
    'user-operational-activity',
    'approval-activity-report',
    'workflow-violations',
    'unauthorized-actions-review',
    'manual-override-tracking',
    'operational-exceptions-report',
    'audit-reconstruction-report',
    'operational-accountability-report',
    'reviewer-activity-report-gov',
    'governance-exceptions',
    'workflow-exceptions',
    'workflow-bottlenecks',
]);

const FAMILIES = {
    'count-variance': {
        familyId: 'count-variance',
        cards: COUNT_VARIANCE_CARDS,
        grouping: {
            levels: [
                { field: 'sessionNo', levelType: 'session' },
                { field: 'locationName', levelType: 'location' },
            ],
            subtotalKeys: ['bookQty', 'countedQty', 'varianceQty', 'varianceValue'],
        },
        dedicatedView: true,
        shell: 'analytics',
    },
    'stock-balance': {
        familyId: 'stock-balance',
        cards: STOCK_BALANCE_CARDS,
        grouping: {
            levels: [
                { field: 'department', levelType: 'department' },
                { field: 'location', levelType: 'location' },
            ],
            subtotalKeys: ['qtyOnHand', 'value'],
        },
        dedicatedView: true,
        shell: 'analytics',
    },
    ledger: {
        familyId: 'ledger',
        cards: LEDGER_CARDS,
        grouping: {
            levels: [
                { field: 'date', levelType: 'date' },
                { field: 'documentKey', levelType: 'document' },
            ],
            subtotalKeys: ['qtyIn', 'qtyOut', 'lineValue'],
        },
        dedicatedView: true,
        shell: 'analytics',
    },
    transfers: {
        familyId: 'transfers',
        cards: TRANSFER_CARDS,
        grouping: {
            levels: [{ field: 'transferNo', levelType: 'transfer' }],
            subtotalKeys: ['qty', 'value'],
        },
        dedicatedView: true,
        shell: 'analytics',
    },
    breakage: {
        familyId: 'breakage',
        cards: BREAKAGE_CARDS,
        grouping: {
            levels: [
                { field: 'sourceLabel', levelType: 'source' },
                { field: 'documentKey', levelType: 'document' },
            ],
            subtotalKeys: ['qty', 'lineValue'],
        },
        dedicatedView: true,
        shell: 'engine',
    },
    omc: {
        familyId: 'omc',
        cards: OMC_CARDS,
        grouping: {
            levels: [
                { field: 'department', levelType: 'department' },
                { field: 'location',   levelType: 'location'   },
            ],
            subtotalKeys: [
                'openingQty',   'openingValue',
                'grnQty',       'returnQty',    'tfrInQty',     'getPassReturnQty',
                'inQty',        'inValue',
                'issueQty',     'tfrOutQty',    'breakageQty',  'lostQty',
                'getPassOutQty','loanWriteOffQty',
                'outQty',       'outValue',
                'adjQty',       'adjValue',
                'closingQty',   'closingValue',
            ],
        },
        dedicatedView: true,
        shell: 'engine',
    },
    'get-pass': {
        familyId: 'get-pass',
        cards: GET_PASS_CARDS,
        grouping: {
            levels: [{ field: 'sectionGroup', levelType: 'section' }],
            subtotalKeys: ['qtyOut', 'qtyReturned', 'qtyOutstanding', 'exposureValue'],
        },
        dedicatedView: true,
        shell: 'analytics',
    },
    governance: {
        familyId: 'governance',
        cards: [
            'period-close-validation',
            'posting-integrity-check',
            ...GOVERNANCE_LIVE_CARDS,
        ],
        grouping: {
            levels: [
                { field: 'moduleKey', levelType: 'module' },
                { field: 'documentKey', levelType: 'document' },
            ],
            subtotalKeys: [],
        },
        dedicatedView: true,
        shell: 'analytics',
    },
};

const CARD_TO_FAMILY = new Map();
for (const def of Object.values(FAMILIES)) {
    for (const cardId of def.cards) {
        CARD_TO_FAMILY.set(cardId, def);
    }
}

function resolveFamily(cardId) {
    if (CARD_TO_FAMILY.has(cardId)) {
        return CARD_TO_FAMILY.get(cardId);
    }
    const engineFamily = ENGINE_FAMILY_MAP[cardId];
    if (engineFamily) {
        return { familyId: engineFamily, cards: [cardId], grouping: null, dedicatedView: false, shell: 'engine' };
    }
    return {
        familyId: 'generic',
        cards: [cardId],
        grouping: null,
        dedicatedView: false,
        shell: 'analytics',
    };
}

function getGroupingSpec(cardId) {
    if (cardId === 'detail-report') return DETAIL_REPORT_GROUPING;
    const family = resolveFamily(cardId);
    return family?.grouping ?? null;
}

function supportsGrouping(cardId) {
    const spec = getGroupingSpec(cardId);
    return Boolean(spec?.levels?.length);
}

function isGovernanceAuditLogProxy(cardId) {
    if (GOVERNANCE_LIVE_CARDS.includes(cardId)) return false;
    return GOVERNANCE_AUDIT_LOG_PROXY_CARDS.has(cardId);
}

module.exports = {
    FAMILIES,
    COUNT_VARIANCE_CARDS,
    STOCK_BALANCE_CARDS,
    LEDGER_CARDS,
    GET_PASS_CARDS,
    GOVERNANCE_AUDIT_LOG_PROXY_CARDS,
    resolveFamily,
    getGroupingSpec,
    supportsGrouping,
    isGovernanceAuditLogProxy,
};
