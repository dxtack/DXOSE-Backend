'use strict';

const GET_PASS_RETURN_ACCOUNTABILITY = new Set(['EMPLOYEE_DEDUCTION', 'COMPANY_LOSS']);

const resolveGetPassReturnAccountability = (raw) => {
    const v = typeof raw === 'string' ? raw.trim() : '';
    return GET_PASS_RETURN_ACCOUNTABILITY.has(v) ? v : 'COMPANY_LOSS';
};

const lineDispositionKey = (itemId, locationId) => `${itemId}:${locationId}`;

/**
 * Accumulates damaged/lost lines for one return transaction batch.
 * Flush once per transaction to create at most one BREAKAGE and one LOST document.
 */
const createGetPassReturnDispositionBatch = () => ({
    breakageLines: [],
    lostLines: [],
    seenBreakageKeys: new Set(),
    seenLostKeys: new Set(),
    batchAccountability: null,
    batchManagerNotes: null,
});

const queueGetPassReturnDispositionLine = (
    batch,
    {
        line,
        damagedQty = 0,
        lostQty = 0,
        accountability = null,
        managerNotes = null,
        photoFiles = null,
    },
) => {
    if (!line?.itemId || !line?.locationId) return;

    const dQty = Math.max(0, Number(damagedQty) || 0);
    const lQty = Math.max(0, Number(lostQty) || 0);
    const key = lineDispositionKey(line.itemId, line.locationId);

    if (dQty > 0 && !batch.seenBreakageKeys.has(key)) {
        batch.seenBreakageKeys.add(key);
        batch.breakageLines.push({
            line,
            qty: dQty,
            photoFiles: Array.isArray(photoFiles) ? photoFiles : [],
        });
    }
    if (lQty > 0 && !batch.seenLostKeys.has(key)) {
        batch.seenLostKeys.add(key);
        batch.lostLines.push({ line, qty: lQty });
    }

    if (accountability && !batch.batchAccountability) {
        batch.batchAccountability = accountability;
    }
    if (managerNotes && !batch.batchManagerNotes) {
        batch.batchManagerNotes = managerNotes;
    }
};

/**
 * Dept accept return: skip creating BREAKAGE/LOST when gate (or an earlier step)
 * already created an active GET_PASS_RETURN doc for this getPassId.
 * Matches GET_PASS_STATE_MATRIX: "Creates (skip if exists)".
 * Rejected/void docs do not block a fresh create.
 */
const ACTIVE_DISPOSITION_STATUSES = Object.freeze([
    'DRAFT',
    'PENDING_DEPT',
    'PENDING_COST_CONTROL',
    'PENDING_FINANCE',
    'PENDING_GM',
    'DEPT_APPROVED',
    'COST_CONTROL_APPROVED',
    'FINANCE_APPROVED',
    'PENDING_APPROVAL',
    'APPROVED',
    'POSTED',
]);

const stripExistingGetPassReturnDispositionsFromBatch = async (tx, batch, { tenantId, getPassId }) => {
    if (!getPassId || (!batch.breakageLines.length && !batch.lostLines.length)) {
        return { skippedBreakage: false, skippedLost: false };
    }

    const existing = await tx.movementDocument.findMany({
        where: {
            tenantId,
            getPassId,
            sourceType: 'GET_PASS_RETURN',
            movementType: { in: ['BREAKAGE', 'LOST'] },
            status: { in: [...ACTIVE_DISPOSITION_STATUSES] },
        },
        select: { id: true, documentNo: true, movementType: true, status: true },
        orderBy: { createdAt: 'asc' },
    });

    const hasBreakage = existing.some((d) => d.movementType === 'BREAKAGE');
    const hasLost = existing.some((d) => d.movementType === 'LOST');
    let skippedBreakage = false;
    let skippedLost = false;

    if (hasBreakage && batch.breakageLines.length) {
        batch.breakageLines = [];
        batch.seenBreakageKeys.clear();
        skippedBreakage = true;
    }
    if (hasLost && batch.lostLines.length) {
        batch.lostLines = [];
        batch.seenLostKeys.clear();
        skippedLost = true;
    }

    return { skippedBreakage, skippedLost, existing };
};

/**
 * Create at most one BREAKAGE and one LOST document for the accumulated batch.
 * Uses the published BREAKAGE ACC chain with a live Dept Manager step (no auto-skip).
 * Stock for these qty remains qtyBlocked until GM posts.
 */
const flushGetPassReturnDispositionBatch = async (
    tx,
    batch,
    {
        tenantId,
        getPassId,
        passNo,
        userId,
        now,
        firstStepComment,
        generateDocNumber,
        DocPrefix,
        createMovementApprovalRequest,
        persistBreakagePhotos,
        user = null,
    },
) => {
    if (!batch.breakageLines.length && !batch.lostLines.length) return;

    const acct = resolveGetPassReturnAccountability(batch.batchAccountability);
    const managerNotes = batch.batchManagerNotes;
    const lineNotes = `ACCOUNTABILITY:${acct}`;

    if (batch.breakageLines.length > 0) {
        const headerLocationId = batch.breakageLines[0].line.locationId;
        const documentNo = await generateDocNumber(tenantId, DocPrefix.BREAKAGE, now, tx);
        const brkDoc = await tx.movementDocument.create({
            data: {
                tenantId,
                documentNo,
                movementType: 'BREAKAGE',
                sourceType: 'GET_PASS_RETURN',
                getPassId,
                status: 'PENDING_DEPT',
                sourceLocationId: headerLocationId,
                reason: `Damaged on get pass return ${passNo}`,
                notes: managerNotes || null,
                documentDate: now,
                createdBy: userId,
                lines: {
                    create: batch.breakageLines.map(({ line, qty }) => {
                        const wac = Number(line.unitCost || 0);
                        return {
                            itemId: line.itemId,
                            locationId: line.locationId,
                            qtyRequested: qty,
                            qtyInBaseUnit: qty,
                            unitCost: wac,
                            totalValue: qty * wac,
                            notes: lineNotes,
                        };
                    }),
                },
            },
            include: { lines: true },
        });

        if (typeof persistBreakagePhotos === 'function') {
            for (let i = 0; i < batch.breakageLines.length; i += 1) {
                const entry = batch.breakageLines[i];
                const photoFiles = entry.photoFiles || [];
                if (!photoFiles.length) continue;
                const match = (brkDoc.lines || []).find(
                    (ml) => ml.itemId === entry.line.itemId && ml.locationId === entry.line.locationId,
                );
                if (!match) continue;
                const { photoKey, attachmentUrl } = await persistBreakagePhotos(
                    photoFiles,
                    tenantId,
                    `${documentNo}-L${i}`,
                    user,
                );
                await tx.movementLine.update({
                    where: { id: match.id },
                    data: { photoKey, attachmentUrl },
                });
            }
        }

        await createMovementApprovalRequest(tx, {
            tenantId,
            documentId: brkDoc.id,
            createdBy: userId,
            requestType: 'BREAKAGE',
            deptApproverUserId: userId,
            firstStepComment,
            firstStepAccountabilityType: acct,
            // Live Dept step — same as internal BREAKAGE when creator is not Dept Manager.
            preApproveFirstStep: false,
        });
    }

    if (batch.lostLines.length > 0) {
        const headerLocationId = batch.lostLines[0].line.locationId;
        const documentNo = await generateDocNumber(tenantId, 'LST', now, tx);
        const lostDoc = await tx.movementDocument.create({
            data: {
                tenantId,
                documentNo,
                movementType: 'LOST',
                sourceType: 'GET_PASS_RETURN',
                getPassId,
                status: 'PENDING_DEPT',
                sourceLocationId: headerLocationId,
                reason: `Lost return — Get Pass ${passNo}`,
                notes: managerNotes?.trim() || 'Auto from get pass return',
                documentDate: now,
                createdBy: userId,
                lines: {
                    create: batch.lostLines.map(({ line, qty }) => {
                        const wac = Number(line.unitCost || 0);
                        return {
                            itemId: line.itemId,
                            locationId: line.locationId,
                            qtyRequested: qty,
                            qtyInBaseUnit: qty,
                            unitCost: wac,
                            totalValue: qty * wac,
                            notes: managerNotes?.trim() || null,
                        };
                    }),
                },
            },
        });
        await createMovementApprovalRequest(tx, {
            tenantId,
            documentId: lostDoc.id,
            createdBy: userId,
            requestType: 'LOST',
            deptApproverUserId: userId,
            firstStepComment,
            firstStepAccountabilityType: acct,
            preApproveFirstStep: false,
        });
    }
};

module.exports = {
    createGetPassReturnDispositionBatch,
    queueGetPassReturnDispositionLine,
    flushGetPassReturnDispositionBatch,
    stripExistingGetPassReturnDispositionsFromBatch,
    lineDispositionKey,
    resolveGetPassReturnAccountability,
    ACTIVE_DISPOSITION_STATUSES,
};
