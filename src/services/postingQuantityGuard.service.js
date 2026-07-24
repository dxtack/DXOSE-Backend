'use strict';

const QUANTITY_POLICY = Object.freeze({
    POSITIVE: 'POSITIVE',
    SIGNED_NON_ZERO: 'SIGNED_NON_ZERO',
    COUNTED_NON_NEGATIVE: 'COUNTED_NON_NEGATIVE',
    DERIVED_VARIANCE: 'DERIVED_VARIANCE',
});

const POSITIVE_DOCUMENT_TYPES = new Set([
    'OPENING_BALANCE',
    'RECEIVE',
    'TEMP_RECEIVE',
    'ISSUE',
    'TEMP_RELEASE',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'RETURN',
    'BREAKAGE',
    'LOST',
    'TRANSFER',
    'LOAN_WRITE_OFF',
    'GET_PASS_OUT',
    'GET_PASS_RETURN',
]);

const POLICY_BY_DOCUMENT_TYPE = Object.freeze({
    ADJUSTMENT: QUANTITY_POLICY.SIGNED_NON_ZERO,
    COUNT_ADJUSTMENT: QUANTITY_POLICY.SIGNED_NON_ZERO,
    LEGACY_STOCK_COUNT: QUANTITY_POLICY.COUNTED_NON_NEGATIVE,
    CANONICAL_INVENTORY_COUNT: QUANTITY_POLICY.COUNTED_NON_NEGATIVE,
    SAVED_STOCK_REPORT: QUANTITY_POLICY.DERIVED_VARIANCE,
});

function policyForDocumentType(documentType) {
    if (POSITIVE_DOCUMENT_TYPES.has(documentType)) return QUANTITY_POLICY.POSITIVE;
    const policy = POLICY_BY_DOCUMENT_TYPE[documentType];
    if (policy) return policy;
    throw Object.assign(
        new Error(`No posting quantity policy is defined for ${documentType}.`),
        {
            statusCode: 422,
            code: 'POSTING_QUANTITY_POLICY_MISSING',
            details: { documentType },
        },
    );
}

function isValidQuantity(value, policy) {
    if (!Number.isFinite(value)) return false;
    if (policy === QUANTITY_POLICY.POSITIVE) return value > 0;
    if (policy === QUANTITY_POLICY.SIGNED_NON_ZERO) return value !== 0;
    if (policy === QUANTITY_POLICY.COUNTED_NON_NEGATIVE) return value >= 0;
    if (policy === QUANTITY_POLICY.DERIVED_VARIANCE) return true;
    return false;
}

function policyRequirement(policy) {
    if (policy === QUANTITY_POLICY.POSITIVE) return 'greater than zero';
    if (policy === QUANTITY_POLICY.SIGNED_NON_ZERO) return 'non-zero';
    if (policy === QUANTITY_POLICY.COUNTED_NON_NEGATIVE) return 'zero or greater';
    return 'a finite number';
}

function assertPostingLineQuantities({
    documentType,
    lines,
    quantityField,
    allowNull = false,
    describeLine = (line, index) => ({
        index,
        itemId: line.itemId || null,
        locationId: line.locationId || null,
    }),
}) {
    const policy = policyForDocumentType(documentType);
    const invalidLines = [];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const rawQuantity = line[quantityField];
        if (allowNull && rawQuantity == null) continue;
        const quantity = Number(rawQuantity);
        if (!isValidQuantity(quantity, policy)) {
            invalidLines.push({
                ...describeLine(line, index),
                quantity: Number.isFinite(quantity) ? quantity : String(rawQuantity),
            });
        }
    }

    if (invalidLines.length > 0) {
        throw Object.assign(
            new Error(
                `Cannot post ${documentType}: every ${quantityField} must be ` +
                `${policyRequirement(policy)}. Correct all invalid lines and retry.`,
            ),
            {
                statusCode: 422,
                code: 'INVALID_POSTING_LINE_QUANTITY',
                details: {
                    documentType,
                    quantityField,
                    policy,
                    invalidLines,
                },
            },
        );
    }
}

module.exports = {
    QUANTITY_POLICY,
    assertPostingLineQuantities,
};
