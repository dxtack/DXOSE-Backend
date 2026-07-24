'use strict';

/**
 * Ch.19 — Error code families (Implementation Guide catalog).
 */

const FAMILIES = {
    VAL: 'Validation',
    BUS: 'Business',
    SEC: 'Security',
    SYS: 'System',
    PER: 'Permission',
    STK: 'Stock',
    CC: 'Concurrency',
};

function classifyCode(code) {
    if (!code || typeof code !== 'string') return 'SYS';
    const prefix = code.split('_')[0];
    if (FAMILIES[prefix]) return prefix;
    if (code === 'CONCURRENCY_CONFLICT') return 'CC';
    if (code.startsWith('PERIOD_')) return 'BUS';
    if (code.startsWith('COUNT_')) return 'BUS';
    return 'SYS';
}

module.exports = { FAMILIES, classifyCode };
