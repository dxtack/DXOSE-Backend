'use strict';

const FORCE_CLOSE_ELIGIBLE_STATUSES = new Set(['OUT', 'PARTIALLY_RETURNED']);
const FORCE_CLOSE_REVERSIBLE_TYPES = new Set(['TEMPORARY', 'CATERING', 'OUTSIDE_CATERING']);
const INTERNAL_TRANSFER_BLOCKED_STATUSES = new Set([
    'RECEIVED_AT_DESTINATION',
    'RETURNING',
    'RETURN_RECEIVED_AT_GATE',
]);

const err = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const lineOutstandingQty = (line) => {
    const qty = Number(line?.qty || 0);
    const returned = Number(line?.qtyReturned || 0);
    return Math.max(0, qty - returned);
};

const hasOutstandingQty = (getPass) =>
    (getPass?.lines ?? []).some((line) => lineOutstandingQty(line) > 1e-9);

const isInternalTransferForceCloseBlocked = (getPass) => {
    if (!getPass?.isInternalTransfer) return false;
    if (getPass.receivedAt != null) return true;
    if (INTERNAL_TRANSFER_BLOCKED_STATUSES.has(getPass.status)) return true;
    if (getPass.destinationDeptAcceptedAt != null) return true;
    if (getPass.destinationSecurityExitAt != null) return true;
    return false;
};

/**
 * FC-01 + FC-07 — issuer simple-close / settlement eligibility (no outstanding check).
 */
const assertForceCloseEligible = (getPass, { tenantId } = {}) => {
    if (!getPass) {
        throw err('Get Pass not found', 404);
    }
    if (tenantId && getPass.tenantId !== tenantId) {
        throw err('Get Pass not found', 404);
    }
    if (!FORCE_CLOSE_REVERSIBLE_TYPES.has(getPass.transferType)) {
        throw err('Force close is only available for temporary, catering, or outside catering passes.', 400);
    }
    if (!FORCE_CLOSE_ELIGIBLE_STATUSES.has(getPass.status)) {
        throw err('Force close is only available for passes that are out or partially returned.', 400);
    }
    if (isInternalTransferForceCloseBlocked(getPass)) {
        throw err(
            'Force close is blocked while internal transfer custody or return cycle is still open.',
            400,
        );
    }
};

/**
 * FC-02 — simple close requires fully settled line quantities.
 */
const assertSimpleCloseOutstandingZero = (getPass) => {
    if (hasOutstandingQty(getPass)) {
        throw err(
            'Cannot close while outstanding quantities remain. Use force-close settlement when available.',
            400,
        );
    }
};

const SETTLEMENT_DISPOSITIONS = new Set(['GOOD', 'DAMAGED', 'LOST']);
const SETTLEMENT_ACCOUNTABILITIES = new Set(['EMPLOYEE_DEDUCTION', 'COMPANY_LOSS']);

const assertNotPendingForceCloseSettlement = (getPass) => {
    if (getPass?.status === 'PENDING_FORCE_CLOSE_SETTLEMENT') {
        throw err(
            'Get pass has a pending force-close settlement. Cancel or wait for GM decision before other actions.',
            409,
        );
    }
};

const assertSettlementSubmitEligible = (getPass, { tenantId } = {}) => {
    assertForceCloseEligible(getPass, { tenantId });
    if (!hasOutstandingQty(getPass)) {
        throw err('No outstanding quantities remain. Use simple close instead.', 400);
    }
    if (getPass.status === 'PENDING_FORCE_CLOSE_SETTLEMENT') {
        throw err('Settlement is already pending GM approval.', 409);
    }
};

/**
 * Validate Finance settlement payload — every outstanding line exactly once, full outstanding per line.
 */
const validateSettlementPayload = (getPass, payload) => {
    const closeReason = String(payload?.closeReason ?? '').trim();
    if (!closeReason) {
        throw err('closeReason is required.', 400);
    }

    const passAcct = payload?.accountability;
    if (!SETTLEMENT_ACCOUNTABILITIES.has(passAcct)) {
        throw err('accountability is required (EMPLOYEE_DEDUCTION or COMPANY_LOSS).', 400);
    }

    const lines = Array.isArray(payload?.lines) ? payload.lines : [];
    const outstandingLines = (getPass?.lines ?? []).filter((line) => lineOutstandingQty(line) > 1e-9);
    if (lines.length !== outstandingLines.length) {
        throw err('Every line with outstanding quantity must appear exactly once in settlement lines.', 400);
    }

    const lineMap = new Map(outstandingLines.map((line) => [line.id, line]));
    const seen = new Set();
    const normalized = [];

    for (const row of lines) {
        const lineId = row?.lineId;
        if (!lineId || seen.has(lineId)) {
            throw err('Duplicate or invalid lineId in settlement lines.', 400);
        }
        seen.add(lineId);

        const line = lineMap.get(lineId);
        if (!line) {
            throw err(`Line ${lineId} is not eligible for settlement.`, 400);
        }

        const disposition = String(row?.disposition ?? '').toUpperCase();
        if (!SETTLEMENT_DISPOSITIONS.has(disposition)) {
            throw err(`Invalid disposition for line ${lineId}. Use GOOD, DAMAGED, or LOST.`, 400);
        }

        let lineAcct = row?.accountability;
        if (disposition === 'DAMAGED' || disposition === 'LOST') {
            if (!SETTLEMENT_ACCOUNTABILITIES.has(lineAcct)) {
                throw err(`accountability is required for DAMAGED/LOST line ${lineId}.`, 400);
            }
        } else {
            lineAcct = lineAcct || passAcct;
        }

        normalized.push({
            lineId,
            disposition,
            accountability: lineAcct,
            outstanding: lineOutstandingQty(line),
        });
    }

    return { closeReason, accountability: passAcct, lines: normalized };
};

module.exports = {
    FORCE_CLOSE_ELIGIBLE_STATUSES,
    FORCE_CLOSE_REVERSIBLE_TYPES,
    INTERNAL_TRANSFER_BLOCKED_STATUSES,
    SETTLEMENT_DISPOSITIONS,
    SETTLEMENT_ACCOUNTABILITIES,
    lineOutstandingQty,
    hasOutstandingQty,
    isInternalTransferForceCloseBlocked,
    assertForceCloseEligible,
    assertSimpleCloseOutstandingZero,
    assertNotPendingForceCloseSettlement,
    assertSettlementSubmitEligible,
    validateSettlementPayload,
};
