'use strict';

const prisma = require('../config/database');

const SETTING_KEY = 'displayCurrency';
const DEFAULT_CURRENCY = 'SAR';

const PRECISION_BY_CURRENCY = {
    SAR: 2,
    USD: 2,
    EUR: 2,
    GBP: 2,
    JPY: 0,
    KWD: 3,
};

async function getDisplayCurrency(tenantId) {
    const row = await prisma.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId, key: SETTING_KEY } },
    });
    return (row?.value || DEFAULT_CURRENCY).trim().toUpperCase();
}

async function setDisplayCurrency(tenantId, currencyCode) {
    const code = String(currencyCode || DEFAULT_CURRENCY).trim().toUpperCase();
    return prisma.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: SETTING_KEY } },
        create: { tenantId, key: SETTING_KEY, value: code },
        update: { value: code },
    });
}

function formatAmount(amount, currencyCode = DEFAULT_CURRENCY) {
    const code = (currencyCode || DEFAULT_CURRENCY).toUpperCase();
    const decimals = PRECISION_BY_CURRENCY[code] ?? 2;
    const n = Number(amount);
    if (!Number.isFinite(n)) return `${code} 0.${'0'.repeat(decimals)}`;
    return `${code} ${n.toFixed(decimals)}`;
}

module.exports = {
    SETTING_KEY,
    DEFAULT_CURRENCY,
    PRECISION_BY_CURRENCY,
    getDisplayCurrency,
    setDisplayCurrency,
    formatAmount,
};
