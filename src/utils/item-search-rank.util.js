'use strict';

/**
 * Constitution Ch.23.3 — lookup search ranking:
 * exact code → exact barcode → prefix → contains.
 */
function itemSearchRank(item, term) {
    const t = String(term || '').toLowerCase();
    if (!t) return 3;
    const code = String(item.code || '').toLowerCase();
    const barcode = String(item.barcode || '').toLowerCase();
    const name = String(item.name || '').toLowerCase();
    if (code === t) return 0;
    if (barcode === t) return 1;
    if (code.startsWith(t) || barcode.startsWith(t) || name.startsWith(t)) return 2;
    return 3;
}

function sortItemsBySearchRank(items, term) {
    const normalized = String(term || '').trim();
    if (!normalized || !Array.isArray(items) || items.length === 0) return items;
    return [...items].sort((a, b) => {
        const ra = itemSearchRank(a, normalized);
        const rb = itemSearchRank(b, normalized);
        if (ra !== rb) return ra - rb;
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
}

module.exports = { itemSearchRank, sortItemsBySearchRank };
