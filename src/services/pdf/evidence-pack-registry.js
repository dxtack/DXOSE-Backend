'use strict';

/**
 * Presentation-only labels and refs per operational report type.
 * Same layout/components; terminology differs by pack.
 */
const BREAKAGE_PACK_CONFIG = {
    packType: 'breakage',
    themeVariant: 'breakage',
    reportRefPrefix: 'BRK-REPORT',
    labels: {
        packTitle: 'BREAKAGE EVIDENCE REPORT',
        packTitleShort: 'Breakage Evidence Report',
        itemsSectionTitle: 'Broken Items',
        totalLossLabel: 'Total Loss',
        primaryPhotoCaption: 'Primary breakage photo',
        exportFilenamePrefix: 'Breakage-Report',
    },
};

const TRANSFER_PACK_CONFIG = {
    packType: 'transfer',
    themeVariant: 'transfer',
    reportRefPrefix: 'TRF-REPORT',
    labels: {
        packTitle: 'TRANSFER REPORT',
        packTitleShort: 'Transfer Report',
        itemsSectionTitle: 'Transfer Items',
        totalLossLabel: 'Total Value',
        primaryPhotoCaption: 'Transfer photo evidence',
        exportFilenamePrefix: 'Transfer-Report',
    },
};

const GRN_PACK_CONFIG = {
    packType: 'grn',
    themeVariant: 'grn',
    reportRefPrefix: 'GRN-REPORT',
    labels: {
        packTitle: 'GRN REPORT',
        packTitleShort: 'GRN Report',
        itemsSectionTitle: 'Imported Items',
        totalLossLabel: 'Total GRN Value',
        primaryPhotoCaption: 'Supplier invoice attachment',
        exportFilenamePrefix: 'GRN-Report',
    },
};

const LOST_PACK_CONFIG = {
    packType: 'lost',
    themeVariant: 'lost',
    reportRefPrefix: 'LST-REPORT',
    labels: {
        packTitle: 'LOST ITEMS REPORT',
        packTitleShort: 'Lost Items Report',
        itemsSectionTitle: 'Lost Items',
        totalLossLabel: 'Total Loss',
        primaryPhotoCaption: 'Primary lost item photo',
        exportFilenamePrefix: 'Lost-Items-Report',
    },
};

/** Inventory Count Evidence PDF — audit shell v2.1 (Wave 5). */
const COUNT_PACK_CONFIG = {
    packType: 'inventory_count',
    themeVariant: 'count',
    evidencePackStatus: 'CLOSED',
    reportRefPrefix: 'CNT-REPORT',
    labels: {
        packTitle: 'INVENTORY COUNT EVIDENCE REPORT',
        packTitleShort: 'Inventory Count',
        itemsSectionTitle: 'Count Lines',
        totalLossLabel: 'Total Variance Value',
        exportFilenamePrefix: 'Inventory-Count-Report',
    },
};

/** Get Pass Evidence PDF — CLOSED (audit shell v2.1). */
const GET_PASS_PACK_CONFIG = {
    packType: 'gate_pass',
    themeVariant: 'gate_pass',
    evidencePackStatus: 'CLOSED',
    reportRefPrefix: 'GP-REPORT',
    labels: {
        packTitle: 'GET PASS REPORT',
        packTitleShort: 'Get Pass Report',
        itemsSectionTitle: 'Items',
        totalLossLabel: 'Total Value',
        primaryPhotoCaption: 'Get pass attachment',
        exportFilenamePrefix: 'Get-Pass-Report',
    },
};

/** @deprecated Use COUNT_PACK_CONFIG — alias for inventory_count pack type lookups. */
const INVENTORY_COUNT_PACK_CONFIG = COUNT_PACK_CONFIG;

function resolveEvidenceLabels(packMeta = {}, packConfig) {
    const labels = packConfig?.labels || {};
    return {
        ...packMeta,
        packTitle: labels.packTitle || packMeta.packTitle,
        packTitleShort: labels.packTitleShort || packMeta.packTitle,
        itemsSectionTitle: labels.itemsSectionTitle || packMeta.itemsSectionTitle,
        totalLossLabel: labels.totalLossLabel || packMeta.totalLossLabel || 'Total Loss',
        primaryPhotoCaption: labels.primaryPhotoCaption || packMeta.primaryPhotoCaption,
        exportFilenamePrefix: labels.exportFilenamePrefix || packMeta.exportFilenamePrefix,
    };
}

function resolveOperationalReportFilename(packConfig, documentNo) {
    const prefix = packConfig?.labels?.exportFilenamePrefix || 'Operational-Report';
    const safeNo = String(documentNo || 'DOC').replace(/[^\w.-]+/g, '-');
    return `${prefix}-${safeNo}.pdf`;
}

module.exports = {
    BREAKAGE_PACK_CONFIG,
    LOST_PACK_CONFIG,
    TRANSFER_PACK_CONFIG,
    GRN_PACK_CONFIG,
    GET_PASS_PACK_CONFIG,
    COUNT_PACK_CONFIG,
    INVENTORY_COUNT_PACK_CONFIG,
    resolveEvidenceLabels,
    resolveOperationalReportFilename,
};
