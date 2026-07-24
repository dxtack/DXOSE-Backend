'use strict';

const { PrismaClient } = require('@prisma/client');
const { DOC_LABELS } = require('./report-pdf-labels');

const prisma = new PrismaClient();

const ROLE_LABELS = {
    DEPT_MANAGER: 'Head of Department',
    COST_CONTROL: 'Cost Control',
    FINANCE_MANAGER: 'Finance Manager',
    GENERAL_MANAGER: 'General Manager',
    ADMIN: 'Administrator',
};

/**
 * PDF classification: INTERNAL USE vs AUDIT COPY (query override or auditor role).
 */
function resolvePdfClassification(user = {}, queryValue) {
    const q = String(queryValue || '').trim().toUpperCase();
    if (q === 'AUDIT' || q === 'AUDIT_COPY' || q === 'AUDIT COPY') return 'AUDIT COPY';
    const role = String(user.role || '').toUpperCase();
    const roles = Array.isArray(user.roles) ? user.roles.map((r) => String(r).toUpperCase()) : [];
    if (role === 'AUDITOR' || roles.includes('AUDITOR')) return 'AUDIT COPY';
    return 'INTERNAL USE';
}

/**
 * Build workflow signature slots from breakage documents referenced in export rows.
 */
async function buildBreakageSignatureSlots(tenantId, rows = [], fallback = {}) {
    const docNos = [...new Set((rows || []).map((r) => r.documentNo || r.documentKey).filter(Boolean))];
    const slots = [
        {
            labelEn: DOC_LABELS.preparedBy.en,
            labelAr: DOC_LABELS.preparedBy.ar,
            name: fallback.generatedBy || 'System',
            role: 'Preparer',
            date: fallback.generatedAt || new Date().toISOString(),
            status: 'PREPARED',
        },
    ];

    if (!docNos.length) return slots;

    const doc = await prisma.movementDocument.findFirst({
        where: { tenantId, documentNo: docNos[0], movementType: 'BREAKAGE' },
        include: {
            createdByUser: { select: { firstName: true, lastName: true, email: true } },
            approvalRequests: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: {
                            actedByUser: { select: { firstName: true, lastName: true } },
                            requiredRole: { select: { code: true, name: true } },
                        },
                    },
                },
            },
        },
    });

    if (!doc) return slots;

    const creator = doc.createdByUser
        ? `${doc.createdByUser.firstName || ''} ${doc.createdByUser.lastName || ''}`.trim()
        : fallback.generatedBy || 'System';
    slots[0].name = creator;
    slots[0].date = doc.createdAt?.toISOString?.() || slots[0].date;

    const steps = doc.approvalRequests?.steps || [];
    for (const step of steps) {
        const roleCode = step.requiredRole?.code || 'APPROVER';
        const name = step.actedByUser
            ? `${step.actedByUser.firstName || ''} ${step.actedByUser.lastName || ''}`.trim()
            : '';
        slots.push({
            labelEn: ROLE_LABELS[roleCode] || step.requiredRole?.name || roleCode,
            labelAr: ROLE_LABELS[roleCode] || roleCode,
            name,
            role: roleCode,
            date: step.actedAt,
            status: step.status || 'PENDING',
        });
    }

    return slots.slice(0, 4);
}

module.exports = {
    resolvePdfClassification,
    buildBreakageSignatureSlots,
};
