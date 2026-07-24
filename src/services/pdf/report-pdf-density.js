'use strict';

/**
 * Shared PDF density tokens — FINAL operational compactness (presentation only).
 */
const DENSITY = {
    MIN_ROW_H: 12,
    HEADER_H: 14,
    GROUP_HEADER_H: 16,
    SUBTOTAL_H: 16,
    GRAND_TOTAL_H: 34,
    GRAND_TOTAL_CLOSE_GAP: 12,
    GRAND_TOTAL_H_GOLDEN: 33,
    GRAND_TOTAL_CLOSE_GAP_GOLDEN: 10,
    SUBTOTAL_LOC_H: 14,
    SUBTOTAL_DEPT_H: 17,
    CONTINUATION_H: 8,
    BOTTOM_RESERVE: 108,
    BODY_FONT_SIZE: 7.5,
    CODE_FONT_SIZE: 6.5,
    HEADER_FONT_SIZE: 7,
    CELL_PAD_V: 2,
    CELL_PAD_H: 3,
    LINE_GAP: 0,
    GROUP_GAP: 2,
    SUBTOTAL_GAP: 2,
    GRAND_TOTAL_GAP: 3,
    /** Golden executive presence v3.1 — confidence recovery */
    GOLDEN_MIN_ROW_H: 16,
    GOLDEN_HEADER_H: 14,
    GOLDEN_BODY_FONT_SIZE: 7.5,
    GOLDEN_CELL_PAD_V: 3.5,
    GOLDEN_GROUP_HEADER_H: 18,
    GOLDEN_ZEBRA: '#f4f7fa',
    GOLDEN_LOC_SUBTOTAL_TAIL_GAP: 2,
    GOLDEN_KPI_GAP_AFTER: 9,
    GOLDEN_SIGNATURE_RESERVE: 34,
    GOLDEN_BODY_BOTTOM_RESERVE: 56,
};

module.exports = { DENSITY };
