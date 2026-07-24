'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertPostingLineQuantities } = require('./postingQuantityGuard.service');

test('posting quantity policy keeps count no-ops while rejecting invalid document lines', () => {
    assert.throws(
        () => assertPostingLineQuantities({
            documentType: 'BREAKAGE',
            lines: [{ qtyInBaseUnit: 0 }],
            quantityField: 'qtyInBaseUnit',
        }),
        { code: 'INVALID_POSTING_LINE_QUANTITY' },
    );

    for (const quantity of [-5, 5]) {
        assert.doesNotThrow(() => assertPostingLineQuantities({
            documentType: 'ADJUSTMENT',
            lines: [{ qtyInBaseUnit: quantity }],
            quantityField: 'qtyInBaseUnit',
        }));
    }
    assert.throws(
        () => assertPostingLineQuantities({
            documentType: 'COUNT_ADJUSTMENT',
            lines: [{ qtyInBaseUnit: 0 }],
            quantityField: 'qtyInBaseUnit',
        }),
        { code: 'INVALID_POSTING_LINE_QUANTITY' },
    );

    assert.doesNotThrow(() => assertPostingLineQuantities({
        documentType: 'LEGACY_STOCK_COUNT',
        lines: [{ countedQty: null }, { countedQty: 0 }],
        quantityField: 'countedQty',
        allowNull: true,
    }));
    assert.throws(
        () => assertPostingLineQuantities({
            documentType: 'CANONICAL_INVENTORY_COUNT',
            lines: [{ countedQty: -1 }],
            quantityField: 'countedQty',
        }),
        { code: 'INVALID_POSTING_LINE_QUANTITY' },
    );

    assert.doesNotThrow(() => assertPostingLineQuantities({
        documentType: 'SAVED_STOCK_REPORT',
        lines: [{ varianceQty: 0 }, { varianceQty: -5 }, { varianceQty: 5 }],
        quantityField: 'varianceQty',
    }));
});
