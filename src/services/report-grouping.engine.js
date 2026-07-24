'use strict';

/**
 * Phase 2 — Builds hierarchical group trees + flat export rows from line data.
 */

const r2 = (n) => Number(Number(n || 0).toFixed(4));
const r2money = (n) => Number(Number(n || 0).toFixed(2));

/**
 * @param {object[]} rows
 * @param {string[]} keys
 */
function sumKeys(rows, keys) {
    const out = {};
    for (const key of keys) {
        out[key] = 0;
    }
    for (const row of rows) {
        for (const key of keys) {
            if (row[key] != null && !Number.isNaN(Number(row[key]))) {
                out[key] += Number(row[key]);
            }
        }
    }
    for (const key of keys) {
        out[key] = key.toLowerCase().includes('value') || key.includes('Cost')
            ? r2money(out[key])
            : r2(out[key]);
    }
    return out;
}

function sumChildSubtotals(children, keys) {
    const out = {};
    for (const key of keys) out[key] = 0;
    for (const child of children) {
        const st = child.subtotals || {};
        for (const key of keys) {
            out[key] += Number(st[key] || 0);
        }
    }
    for (const key of keys) {
        out[key] = key.toLowerCase().includes('value') || key.includes('Cost')
            ? r2money(out[key])
            : r2(out[key]);
    }
    return out;
}

/**
 * @param {object[]} rows
 * @param {import('./report-family-registry').GroupingSpec} spec
 */
function buildGroupTree(rows, spec) {
    const levels = spec?.levels || [];
    const subtotalKeys = spec?.subtotalKeys || [];

    if (!levels.length || !rows.length) {
        return {
            tree: [],
            grandTotals: sumKeys(rows, subtotalKeys),
            flatRows: rows.map((r) => ({ rowType: 'LINE', ...r })),
        };
    }

    /**
     * @param {object[]} items
     * @param {number} depth
     * @returns {{ nodes: object[], subtotals: object }}
     */
    function recurse(items, depth) {
        if (depth >= levels.length) {
            return {
                nodes: [],
                leaf: { rows: items, subtotals: sumKeys(items, subtotalKeys) },
            };
        }

        const { field, levelType } = levels[depth];
        const map = new Map();
        for (const row of items) {
            const label = String(row[field] ?? '—');
            if (!map.has(label)) map.set(label, []);
            map.get(label).push(row);
        }

        const nodes = [...map.entries()]
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
            .map(([label, groupItems]) => {
                const childResult = recurse(groupItems, depth + 1);
                const id = `${levelType}:${encodeURIComponent(label)}`;

                if (childResult.leaf) {
                    return {
                        level: levelType,
                        id,
                        label,
                        rows: childResult.leaf.rows,
                        subtotals: childResult.leaf.subtotals,
                        expandedDefault: depth === 0,
                    };
                }

                return {
                    level: levelType,
                    id,
                    label,
                    children: childResult.nodes,
                    subtotals: sumChildSubtotals(childResult.nodes, subtotalKeys),
                    expandedDefault: depth === 0,
                };
            });

        return { nodes, subtotals: sumChildSubtotals(nodes, subtotalKeys) };
    }

    const { nodes } = recurse(rows, 0);
    return {
        tree: nodes,
        grandTotals: sumKeys(rows, subtotalKeys),
        flatRows: flattenTree(nodes, levels, subtotalKeys),
    };
}

/**
 * Flat rows for Excel/PDF: GROUP_HEADER → lines → GROUP_SUBTOTAL (per node).
 */
function flattenTree(tree, levels, subtotalKeys) {
    const flat = [];

    function walk(node, depth) {
        flat.push({
            rowType: 'GROUP_HEADER',
            groupLevel: node.level,
            groupLabel: node.label,
            depth,
        });

        if (node.rows?.length) {
            for (const line of node.rows) {
                flat.push({ rowType: 'LINE', ...line });
            }
        } else if (node.children?.length) {
            for (const child of node.children) {
                walk(child, depth + 1);
            }
        }

        const sub = { rowType: 'GROUP_SUBTOTAL', groupLevel: node.level, groupLabel: node.label, depth };
        for (const key of subtotalKeys) {
            sub[key] = node.subtotals?.[key];
        }
        flat.push(sub);
    }

    for (const node of tree) {
        walk(node, 0);
    }
    return flat;
}

/**
 * Enrich rows before grouping (family-specific keys).
 * @param {string} familyId
 * @param {object[]} rows
 */
function enrichRowsForGrouping(familyId, rows) {
    if (familyId === 'ledger') {
        return rows.map((r) => {
            const docNo = r.docNo || r.referenceNo || (r.referenceId ? String(r.referenceId).slice(0, 8) : '—');
            const documentKey = r.documentKey || `${r.movementType || 'MOV'}-${docNo}`;
            return { ...r, docNo, documentKey };
        });
    }
    if (familyId === 'breakage') {
        return rows.map((r) => {
            const documentKey = r.documentKey || r.documentNo || '—';
            const qty = Number(r.qty ?? 0);
            const unitCost = Number(r.unitCost ?? 0);
            const lineValue = Number(
                r.lineValue != null ? r.lineValue : r.value != null ? r.value : qty * unitCost,
            );
            return {
                ...r,
                documentKey,
                lineValue: Number(lineValue.toFixed(2)),
                value: Number(lineValue.toFixed(2)),
            };
        });
    }
    if (familyId === 'governance') {
        return rows.map((r) => {
            const moduleKey = r.moduleKey || r.entityType || 'System';
            const documentKey =
                r.documentKey ||
                `${moduleKey}-${String(r.entityId || r.referenceNo || 'na').slice(0, 8)}`;
            return { ...r, moduleKey, documentKey };
        });
    }
    return rows;
}

/**
 * @param {object[]} rows
 * @param {import('./report-family-registry').GroupingSpec|null} spec
 * @param {string} [familyId]
 */
function buildGroupedReport(rows, spec, familyId = '') {
    const enriched = enrichRowsForGrouping(familyId, rows);
    if (!spec) {
        return {
            tree: [],
            grandTotals: {},
            flatRows: enriched.map((r) => ({ rowType: 'LINE', ...r })),
        };
    }
    return buildGroupTree(enriched, spec);
}

module.exports = {
    buildGroupedReport,
    buildGroupTree,
    sumKeys,
    flattenTree,
    enrichRowsForGrouping,
};
