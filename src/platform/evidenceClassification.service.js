'use strict';

const { mapUserFacingState } = require('./lifecyclePresentation.service');
const { isTransferPosted } = require('../services/transferWorkflow.util');

const EVIDENCE_CLASS = Object.freeze({
    PREVIEW: 'PREVIEW',
    OFFICIAL: 'OFFICIAL',
});

const PREVIEW_DISCLAIMER =
    'This document is a preview copy only. It is not official evidence and must not be used for audit, posting, or external submission.';

/**
 * @param {string} moduleKey GRN | TRANSFER | BREAKAGE | LOST
 * @param {{ internalStatus?: string, notes?: string | null, postedAt?: Date | string | null }} doc
 */
function isOfficialEvidenceEligible(moduleKey, doc) {
    const status = String(doc?.internalStatus || '').toUpperCase();
    if (['REJECTED', 'VOID', 'VOIDED', 'CANCELLED'].includes(status)) {
        return false;
    }
    const postedAt = doc?.postedAt;
    if (!postedAt) {
        return false;
    }
    const key = String(moduleKey || '').toUpperCase();
    if (key === 'GRN') {
        return status === 'POSTED';
    }
    if (key === 'TRANSFER') {
        return isTransferPosted({ status, postedAt });
    }
    if (['BREAKAGE', 'LOST'].includes(key)) {
        // Final posting writes status POSTED (ledger posted). APPROVED kept for legacy rows.
        return status === 'POSTED' || status === 'APPROVED';
    }
    return false;
}

/**
 * Auto-resolve evidence class from document state.
 * @returns {'PREVIEW' | 'OFFICIAL'}
 */
function resolveEvidenceClass(moduleKey, doc) {
    return isOfficialEvidenceEligible(moduleKey, doc)
        ? EVIDENCE_CLASS.OFFICIAL
        : EVIDENCE_CLASS.PREVIEW;
}

/**
 * Resolve requested mode; block client forcing OFFICIAL on ineligible documents.
 * @param {string | undefined | null} requestedMode query ?mode=
 * @returns {'PREVIEW' | 'OFFICIAL'}
 */
function resolveRequestedEvidenceClass(moduleKey, doc, requestedMode) {
    const auto = resolveEvidenceClass(moduleKey, doc);
    const raw = String(requestedMode || '').trim().toUpperCase();
    if (!raw) {
        return auto;
    }
    if (raw === EVIDENCE_CLASS.OFFICIAL) {
        if (!isOfficialEvidenceEligible(moduleKey, doc)) {
            throw Object.assign(
                new Error(
                    'Official evidence is not available until the document reaches its final posted state.',
                ),
                { status: 422, code: 'EVIDENCE_OFFICIAL_NOT_ELIGIBLE' },
            );
        }
        return EVIDENCE_CLASS.OFFICIAL;
    }
    if (raw === EVIDENCE_CLASS.PREVIEW) {
        return EVIDENCE_CLASS.PREVIEW;
    }
    throw Object.assign(new Error('Invalid evidence mode. Use PREVIEW or OFFICIAL.'), {
        status: 400,
        code: 'EVIDENCE_MODE_INVALID',
    });
}

function deriveDocContextFromEvidencePack(moduleKey, evidence) {
    const header = evidence?.header || {};
    return {
        moduleKey,
        internalStatus: header.status,
        notes: header.notes,
        postedAt: header.postedAt,
        documentNo: header.documentNo,
        tenantName: header.tenantName,
    };
}

/**
 * Attach Wave 6 evidence contract fields to an evidence pack (mutates + returns).
 */
function enrichEvidencePack(evidence, moduleKey, requestedMode) {
    const ctx = deriveDocContextFromEvidencePack(moduleKey, evidence);
    const evidenceClass = resolveRequestedEvidenceClass(moduleKey, ctx, requestedMode);
    const isOfficialEvidence = evidenceClass === EVIDENCE_CLASS.OFFICIAL;
    const generatedAt = evidence.generatedAt || new Date().toISOString();
    const documentStatus = mapUserFacingState(moduleKey, ctx.internalStatus, {
        notes: ctx.notes,
    });

    const enriched = {
        ...evidence,
        evidenceClass,
        isOfficialEvidence,
        documentStatus,
        generatedAt,
        disclaimer: isOfficialEvidence ? null : PREVIEW_DISCLAIMER,
    };

    if (enriched.header && typeof enriched.header === 'object') {
        enriched.header = {
            ...enriched.header,
            evidenceClass,
            isOfficialEvidence,
            documentStatus,
        };
    }

    return enriched;
}

/**
 * @param {string} prefix e.g. Breakage-Report
 * @param {string} documentNo
 * @param {'PREVIEW' | 'OFFICIAL'} evidenceClass
 */
function buildEvidenceFilename(prefix, documentNo, evidenceClass) {
    const safeNo = String(documentNo || 'DOC').replace(/[^\w.-]+/g, '-');
    const suffix = evidenceClass === EVIDENCE_CLASS.OFFICIAL ? '_OFFICIAL' : '_PREVIEW';
    return `${prefix}-${safeNo}${suffix}.pdf`;
}

module.exports = {
    EVIDENCE_CLASS,
    PREVIEW_DISCLAIMER,
    isOfficialEvidenceEligible,
    resolveEvidenceClass,
    resolveRequestedEvidenceClass,
    deriveDocContextFromEvidencePack,
    enrichEvidencePack,
    buildEvidenceFilename,
};
