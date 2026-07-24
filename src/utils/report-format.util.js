'use strict';

/** Enterprise financial formatting — parity with OSE-Frontend report-format.util.ts */

const fmtQty = (value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDisplayAmount = (value, currency = 'SAR') => {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    const code = String(currency || 'SAR').toUpperCase();
    const abs = Math.abs(n).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n < 0) return `(${code} ${abs})`;
    return `${code} ${abs}`;
};

const fmtSar = (value, currency = 'SAR') => fmtDisplayAmount(value, currency);

const formatReportCell = (value, format = 'text', options = {}) => {
    if (value === null || value === undefined || value === '') return '—';
    if (format === 'qty') return fmtQty(value);
    if (format === 'sar') return fmtSar(value, options.currency);
    if (format === 'date') {
        const d = value instanceof Date ? value : new Date(String(value));
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString('en-GB');
    }
    if (typeof value === 'number') {
        const fractionDigits = Number.isInteger(value) && !options.forceDecimals ? 0 : 2;
        return value.toLocaleString('en-SA', {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: 2,
        });
    }
    if (value instanceof Date) return value.toLocaleString('en-GB');
    return String(value);
};

const buildReportReference = (reportType = 'RPT', generatedAt = new Date()) => {
    const d = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
    const slug = String(reportType || 'RPT')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 8)
        .toUpperCase() || 'RPT';
    const seq = String(d.getTime()).slice(-5);
    return `DX-REP-${slug}-${ymd}-${seq}`;
};

const isTotalsFooterRow = (row, columns) => {
    if (!row || !columns?.length) return false;
    const firstKey = columns[0]?.key;
    const v = row[firstKey];
    return v === 'TOTAL' || v === 'Totals' || row._isTotalsRow === true;
};

module.exports = {
    fmtQty,
    fmtSar,
    formatReportCell,
    buildReportReference,
    isTotalsFooterRow,
};
