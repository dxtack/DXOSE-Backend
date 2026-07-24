'use strict';

const CHARGE_TO_HOTEL = 'hotel';
const CHARGE_TO_EMPLOYEE = 'employee';

const LABEL_HOTEL_EXPENSES = 'Hotel Expenses';
const LABEL_EMPLOYEE_DEDUCTION = 'Employee Deduction';

const normalizeStepStatus = (status) => String(status || '').trim().toUpperCase();

const normalizeAccountability = (value) => String(value || '').trim().toUpperCase();

const trimText = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || null;
};

/**
 * Latest APPROVED approval step with accountabilityType (scan from last to first).
 */
const findLatestApprovedAccountabilityStep = (approvalSteps = []) => {
    const steps = Array.isArray(approvalSteps) ? approvalSteps : [];
    for (let i = steps.length - 1; i >= 0; i -= 1) {
        const step = steps[i];
        if (normalizeStepStatus(step?.status) !== 'APPROVED') continue;
        const acct = trimText(step?.accountabilityType);
        if (acct) return step;
    }
    return null;
};

const fromAccountabilityStep = (step, responsibleEmployeeName = null) => {
    const acct = normalizeAccountability(step.accountabilityType);
    if (acct === 'EMPLOYEE_DEDUCTION') {
        return {
            chargeTo: CHARGE_TO_EMPLOYEE,
            chargeToLabel: LABEL_EMPLOYEE_DEDUCTION,
            // Prefer step comment; fall back to document header (create / latest edit).
            responsibleParty: trimText(step.comment) || trimText(responsibleEmployeeName),
            accountabilityType: acct,
            source: 'approval',
        };
    }
    if (acct === 'COMPANY_LOSS' || acct === 'TARGET_HOTEL_COMPENSATION') {
        return {
            chargeTo: CHARGE_TO_HOTEL,
            chargeToLabel: LABEL_HOTEL_EXPENSES,
            responsibleParty: null,
            accountabilityType: acct,
            source: 'approval',
        };
    }
    return null;
};

const fromDocumentHeader = (suggestedAction, responsibleEmployeeName) => {
    const action = String(suggestedAction || '').trim().toUpperCase();
    if (action === 'HOTEL') {
        return {
            chargeTo: CHARGE_TO_HOTEL,
            chargeToLabel: LABEL_HOTEL_EXPENSES,
            responsibleParty: null,
            accountabilityType: null,
            source: 'document',
        };
    }
    if (action === 'EMPLOYEE') {
        return {
            chargeTo: CHARGE_TO_EMPLOYEE,
            chargeToLabel: LABEL_EMPLOYEE_DEDUCTION,
            responsibleParty: trimText(responsibleEmployeeName),
            accountabilityType: null,
            source: 'document',
        };
    }
    return {
        chargeTo: null,
        chargeToLabel: null,
        responsibleParty: null,
        accountabilityType: null,
        source: null,
    };
};

/**
 * Normalize Prisma movement document approval relation (object or legacy array).
 * @param {{ approvalRequests?: object|object[]|null }} doc
 * @returns {object[]}
 */
const getDocumentApprovalSteps = (doc) => {
    const ar = doc?.approvalRequests;
    if (!ar) return [];
    if (Array.isArray(ar)) return ar[0]?.steps || [];
    return ar.steps || [];
};

/**
 * Resolve final financial loss treatment for Breakage/Lost documents.
 * @param {{ suggestedAction?: string|null, responsibleEmployeeName?: string|null, approvalSteps?: Array }} input
 */
const resolveFinalLossTreatment = ({
    suggestedAction = null,
    responsibleEmployeeName = null,
    approvalSteps = [],
} = {}) => {
    const step = findLatestApprovedAccountabilityStep(approvalSteps);
    if (step) {
        const resolved = fromAccountabilityStep(step, responsibleEmployeeName);
        if (resolved) return resolved;
    }
    return fromDocumentHeader(suggestedAction, responsibleEmployeeName);
};

/**
 * Map approval history rows (evidence PDF) to step shape.
 */
const resolveFinalLossTreatmentFromApprovalHistory = (header = {}, approvalHistory = []) => {
    const steps = (approvalHistory || []).map((row) => ({
        status: row.status,
        accountabilityType: row.accountabilityType,
        comment: row.comment,
    }));
    return resolveFinalLossTreatment({
        suggestedAction: header.suggestedAction,
        responsibleEmployeeName: header.responsibleEmployeeName,
        approvalSteps: steps,
    });
};

/**
 * Legacy PDF shape: { chargedTo: 'HOTEL'|'EMPLOYEE'|null, employee, comment }
 */
const toLossResponsibilityShape = (treatment) => {
    if (treatment.chargeTo === CHARGE_TO_HOTEL) {
        return { chargedTo: 'HOTEL', employee: null, comment: null };
    }
    if (treatment.chargeTo === CHARGE_TO_EMPLOYEE) {
        return {
            chargedTo: 'EMPLOYEE',
            employee: treatment.responsibleParty || '—',
            comment: treatment.responsibleParty || null,
        };
    }
    return { chargedTo: null, employee: null, comment: null };
};

module.exports = {
    CHARGE_TO_HOTEL,
    CHARGE_TO_EMPLOYEE,
    LABEL_HOTEL_EXPENSES,
    LABEL_EMPLOYEE_DEDUCTION,
    resolveFinalLossTreatment,
    resolveFinalLossTreatmentFromApprovalHistory,
    toLossResponsibilityShape,
    findLatestApprovedAccountabilityStep,
    getDocumentApprovalSteps,
};
