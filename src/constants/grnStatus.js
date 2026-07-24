const { GrnStatus } = require('@prisma/client');

/** GRN rows still in workflow (not POSTED / REJECTED). */
const OPEN_GRN_STATUS_CANDIDATES = [
    'DRAFT',
    'VALIDATED',
    'PENDING_APPROVAL',
    'PENDING_FINANCE',
    'APPROVED', // legacy queue before PENDING_FINANCE existed in DB enum
];

const validGrnStatuses = () => new Set(Object.values(GrnStatus || {}));

/** Status list safe for Prisma `in` filters (skips enum values missing from generated client). */
function openGrnStatusesForQuery() {
    const valid = validGrnStatuses();
    return OPEN_GRN_STATUS_CANDIDATES.filter((s) => valid.has(s));
}

module.exports = { openGrnStatusesForQuery, OPEN_GRN_STATUS_CANDIDATES };
