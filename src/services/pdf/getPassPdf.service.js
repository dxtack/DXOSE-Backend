const getPassService = require('../getPass.service');
const prisma = require('../../config/database');
const { renderGetPassControlledDocument } = require('./get-pass-pdf.renderer');

const PROCESS_RETURN_AUDIT_NOTE = 'GET_PASS_PROCESS_RETURN';

/**
 * Stamp for the terminal Return Status workflow slot: when the pass actually
 * reached RETURNED / PARTIALLY_RETURNED / CLOSED (from process-return audit).
 */
async function resolveReturnStatusStamp(pass) {
    const status = String(pass?.status || '').toUpperCase();
    if (!['RETURNED', 'PARTIALLY_RETURNED', 'CLOSED'].includes(status)) {
        return {};
    }

    const audits = await prisma.auditLog.findMany({
        where: {
            tenantId: pass.tenantId,
            entityType: 'GET_PASS',
            entityId: pass.id,
            note: PROCESS_RETURN_AUDIT_NOTE,
        },
        orderBy: { changedAt: 'asc' },
        include: {
            changedByUser: {
                select: { id: true, firstName: true, lastName: true, email: true },
            },
        },
    });

    let stampAudit = null;
    if (status === 'RETURNED' || status === 'CLOSED') {
        stampAudit =
            [...audits].reverse().find((a) => {
                const after = String(a?.afterValue?.status || '').toUpperCase();
                return after === 'RETURNED' || !after;
            }) || audits[audits.length - 1] || null;
    } else {
        stampAudit = audits[audits.length - 1] || null;
    }

    return {
        returnStatusAt: pass.closedAt || stampAudit?.changedAt || pass.updatedAt || null,
        returnStatusActor: stampAudit?.changedByUser || pass.closingUser || null,
    };
}

class GetPassPdfService {
    async generatePdf(passId, tenantId) {
        let getPass;
        try {
            getPass = await getPassService.getGetPassById(passId, tenantId);
        } catch {
            throw Object.assign(new Error('Get Pass not found'), { status: 404 });
        }

        const returnStamp = await resolveReturnStatusStamp(getPass);
        return renderGetPassControlledDocument({ ...getPass, ...returnStamp });
    }
}

module.exports = new GetPassPdfService();
