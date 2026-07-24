'use strict';

const { enrichEvidencePack, buildEvidenceFilename } = require('../platform/evidenceClassification.service');
const { logGovernedEvent, EntityType } = require('../services/auditGoverned.service');

const MODULE_ENTITY_TYPE = Object.freeze({
    GRN: EntityType.GRN,
    TRANSFER: EntityType.TRANSFER,
    BREAKAGE: EntityType.BREAKAGE,
    LOST: EntityType.MOVEMENT,
});

/**
 * @param {import('express').Request} req
 * @param {string} moduleKey
 * @param {object} evidence enriched pack
 * @param {'JSON' | 'PDF'} format
 */
async function logEvidenceExport(req, moduleKey, evidence, format) {
    const entityType = MODULE_ENTITY_TYPE[String(moduleKey).toUpperCase()];
    if (!entityType || !req?.user?.id) {
        return;
    }
    const entityId = req.params?.id;
    if (!entityId) {
        return;
    }
    await logGovernedEvent({
        tenantId: req.user.tenantId,
        entityType,
        entityId,
        action: 'UPDATE',
        changedBy: req.user.id,
        eventType: 'EVIDENCE_EXPORT',
        note: `${format} ${evidence.evidenceClass}`,
        afterValue: {
            evidenceClass: evidence.evidenceClass,
            isOfficialEvidence: evidence.isOfficialEvidence,
            documentStatus: evidence.documentStatus,
            generatedAt: evidence.generatedAt,
            documentNo: evidence.header?.documentNo,
        },
    });
}

/**
 * @param {import('express').Request} req
 * @param {string} moduleKey
 * @param {() => Promise<object>} fetchEvidence
 */
async function buildEnrichedEvidence(req, moduleKey, fetchEvidence) {
    const raw = await fetchEvidence();
    return enrichEvidencePack(raw, moduleKey, req.query?.mode);
}

function resolveEvidencePdfFilename(evidence, filenamePrefix) {
    return buildEvidenceFilename(
        filenamePrefix,
        evidence.header?.documentNo,
        evidence.evidenceClass,
    );
}

module.exports = {
    buildEnrichedEvidence,
    logEvidenceExport,
    resolveEvidencePdfFilename,
};
