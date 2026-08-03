'use strict';

const prisma = require('../config/database');

const SETTING_KEY = 'displayCurrency';
const DEFAULT_CURRENCY = 'SAR';

/** Supported tenant primary currencies (ISO 4217). */
const ALLOWED_CURRENCIES = Object.freeze([
    'SAR',
    'EGP',
    'USD',
    'AED',
    'QAR',
    'KWD',
    'BHD',
    'OMR',
    'EUR',
]);

/**
 * Native / local symbol + ISO fallback for UI.
 * `symbol` prefers the native glyph; `symbolIso` is the code itself.
 */
const CURRENCY_META = Object.freeze({
    SAR: { symbol: 'ر.س', symbolIso: 'SAR', precision: 2 },
    EGP: { symbol: 'ج.م', symbolIso: 'EGP', precision: 2 },
    USD: { symbol: '$', symbolIso: 'USD', precision: 2 },
    AED: { symbol: 'د.إ', symbolIso: 'AED', precision: 2 },
    QAR: { symbol: 'ر.ق', symbolIso: 'QAR', precision: 2 },
    KWD: { symbol: 'د.ك', symbolIso: 'KWD', precision: 3 },
    BHD: { symbol: 'د.ب', symbolIso: 'BHD', precision: 3 },
    OMR: { symbol: 'ر.ع', symbolIso: 'OMR', precision: 3 },
    EUR: { symbol: '€', symbolIso: 'EUR', precision: 2 },
});

const PRECISION_BY_CURRENCY = Object.freeze(
    Object.fromEntries(
        Object.entries(CURRENCY_META).map(([code, meta]) => [code, meta.precision]),
    ),
);

function normalizeCurrencyCode(currencyCode) {
    const code = String(currencyCode || DEFAULT_CURRENCY).trim().toUpperCase();
    if (!ALLOWED_CURRENCIES.includes(code)) {
        const err = Object.assign(
            new Error(
                `Unsupported currency "${currencyCode}". Allowed: ${ALLOWED_CURRENCIES.join(', ')}`,
            ),
            { statusCode: 400, status: 400, code: 'INVALID_CURRENCY' },
        );
        throw err;
    }
    return code;
}

/**
 * Resolve optional create-payload currency; omit/blank → SAR (no throw).
 * @param {unknown} currencyCode
 */
function resolveCreateCurrency(currencyCode) {
    if (currencyCode == null || currencyCode === '') return DEFAULT_CURRENCY;
    return normalizeCurrencyCode(currencyCode);
}

function getCurrencyPresentation(currencyCode = DEFAULT_CURRENCY) {
    const code = String(currencyCode || DEFAULT_CURRENCY).trim().toUpperCase();
    const meta = CURRENCY_META[code] || {
        symbol: code,
        symbolIso: code,
        precision: PRECISION_BY_CURRENCY[code] ?? 2,
    };
    return {
        currency: code,
        displayCurrency: code,
        currencyCode: code,
        symbol: meta.symbol,
        symbolIso: meta.symbolIso,
        precision: meta.precision,
    };
}

async function getDisplayCurrency(tenantId) {
    if (!tenantId) return DEFAULT_CURRENCY;

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { currency: true },
    });
    if (tenant?.currency) {
        return String(tenant.currency).trim().toUpperCase() || DEFAULT_CURRENCY;
    }

    // Legacy fallback: TenantSetting key displayCurrency
    const row = await prisma.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId, key: SETTING_KEY } },
    });
    return (row?.value || DEFAULT_CURRENCY).trim().toUpperCase();
}

async function getTenantCurrencyContext(tenantId) {
    const code = await getDisplayCurrency(tenantId);
    return getCurrencyPresentation(code);
}

async function setDisplayCurrency(tenantId, currencyCode) {
    const code = normalizeCurrencyCode(currencyCode);
    await prisma.$transaction([
        prisma.tenant.update({
            where: { id: tenantId },
            data: { currency: code },
        }),
        prisma.tenantSetting.upsert({
            where: { tenantId_key: { tenantId, key: SETTING_KEY } },
            create: { tenantId, key: SETTING_KEY, value: code },
            update: { value: code },
        }),
    ]);
    return getCurrencyPresentation(code);
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
    ALLOWED_CURRENCIES,
    CURRENCY_META,
    PRECISION_BY_CURRENCY,
    normalizeCurrencyCode,
    resolveCreateCurrency,
    getCurrencyPresentation,
    getDisplayCurrency,
    getTenantCurrencyContext,
    setDisplayCurrency,
    formatAmount,
};
