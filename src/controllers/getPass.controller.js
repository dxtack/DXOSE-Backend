const getPassService = require('../services/getPass.service');
const getPassPdfService = require('../services/pdf/getPassPdf.service');
const periodGuard = require('../services/periodGuard.service');
const { parseVersionFromRequest } = require('../platform/concurrency.service');

/** Same line-photo field convention as Breakage create (`linePhotos_N`). */
const ALLOWED_RETURN_DAMAGE_PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_RETURN_LINE_PHOTOS = 10;

const flattenUploadedFiles = (req) => {
    if (!req.files) return [];
    if (Array.isArray(req.files)) return req.files;
    if (typeof req.files === 'object') {
        return Object.values(req.files).flat();
    }
    return [];
};

const collectReturnLinePhotoFiles = (req, lineCount) => {
    const byIndex = Array.from({ length: Math.max(0, lineCount) }, () => []);
    for (const file of flattenUploadedFiles(req)) {
        const match = /^linePhotos_(\d+)$/.exec(file.fieldname || '');
        if (!match) continue;
        const idx = Number.parseInt(match[1], 10);
        if (!Number.isFinite(idx) || idx < 0 || idx >= byIndex.length) continue;
        if (!ALLOWED_RETURN_DAMAGE_PHOTO_MIMES.has(file.mimetype)) continue;
        if (byIndex[idx].length >= MAX_RETURN_LINE_PHOTOS) continue;
        byIndex[idx].push(file);
    }
    return byIndex;
};

const createGetPass = async (req, res) => {
    const { user } = req;
    await periodGuard.assertOperationalTransactionsAllowed(user.tenantId);
    const result = await getPassService.createGetPass(user.tenantId, req.body, user);
    res.status(201).json({ success: true, data: result });
};

const getGetPasses = async (req, res) => {
    const result = await getPassService.getGetPasses(req.user.tenantId, req.query, req.user);
    res.json({ success: true, ...result });
};

const getIncomingGetPasses = async (req, res) => {
    const result = await getPassService.getIncomingGetPasses(req.user.tenantId, req.query, req.user);
    res.json({ success: true, ...result });
};

const getReturningGetPasses = async (req, res) => {
    const result = await getPassService.getReturningGetPasses(req.user.tenantId, req.query, req.user);
    res.json({ success: true, ...result });
};

const getDiscrepancyClaims = async (req, res) => {
    const result = await getPassService.getDiscrepancyClaims(req.user.tenantId, req.user);
    res.json({ success: true, data: result });
};

const checkOverdueGetPasses = async (req, res) => {
    const notifyCostControl = String(req.query.notify ?? 'false').toLowerCase() === 'true';
    const result = await getPassService.checkAndNotifyOverduePasses({ notifyCostControl });
    res.json({ success: true, data: result });
};

const getGetPassById = async (req, res) => {
    const result = await getPassService.getGetPassById(req.params.id, req.user.tenantId, req.user);
    res.json({ success: true, data: result });
};

const updateGetPass = async (req, res) => {
    const { user } = req;
    const result = await getPassService.updateGetPass(req.params.id, user.tenantId, req.body, user, parseVersionFromRequest(req));
    res.json({ success: true, data: result });
};

const deleteGetPass = async (req, res) => {
    const { user } = req;
    await getPassService.deleteGetPass(
        req.params.id,
        user.tenantId,
        user.id,
        parseVersionFromRequest(req),
    );
    res.json({ success: true, message: 'Get Pass deleted successfully' });
};

// Workflow
const submitGetPass = async (req, res) => {
    const { user } = req;
    const result = await getPassService.submitGetPass(req.params.id, user.tenantId, user, parseVersionFromRequest(req));
    res.json({ success: true, data: result });
};

const approveGetPass = async (req, res) => {
    const { user } = req;
    const result = await getPassService.approveGetPass(req.params.id, user.tenantId, user, parseVersionFromRequest(req));
    res.json({ success: true, data: result });
};

const rejectGetPass = async (req, res) => {
    const { user } = req;
    const { rejectionReason } = req.body;
    const result = await getPassService.rejectGetPass(
        req.params.id,
        user.tenantId,
        user,
        rejectionReason,
        parseVersionFromRequest(req),
    );
    res.json({ success: true, data: result });
};

const sendBackGetPass = async (req, res) => {
    const { user } = req;
    const { reason, targetStepNumber } = req.body;
    if (!reason || !String(reason).trim()) {
        return res.status(400).json({ success: false, message: 'Send Back reason is required.' });
    }
    const result = await getPassService.sendBackGetPass(
        req.params.id,
        user.tenantId,
        user,
        reason,
        parseVersionFromRequest(req),
        targetStepNumber == null || targetStepNumber === '' ? null : Number(targetStepNumber),
    );
    res.json({ success: true, data: result });
};

const confirmDestinationReceipt = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    const result = await getPassService.confirmDestinationReceipt(id, user.tenantId, user, req.body);
    res.json({ success: true, data: result });
};

const acceptDestinationDepartment = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    const result = await getPassService.acceptDestinationDepartment(id, user.tenantId, user, req.body);
    res.json({ success: true, data: result });
};

const shipBackGetPass = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    const result = await getPassService.shipBackGetPass(id, user.tenantId, user);
    res.json({ success: true, data: result });
};

const confirmReturnExit = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    const result = await getPassService.confirmReturnExit(id, user.tenantId, user);
    res.json({ success: true, data: result });
};

const confirmReturnArrival = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    const result = await getPassService.confirmReturnArrival(id, user.tenantId, user, req.body);
    res.json({ success: true, data: result });
};

const acceptReturnIntoDepartment = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    const result = await getPassService.acceptReturnIntoDepartment(id, user.tenantId, user, req.body);
    res.json({ success: true, data: result });
};

const returnGetPass = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    let lines = req.body.lines;
    if (typeof lines === 'string') {
        try {
            lines = JSON.parse(lines);
        } catch {
            return res.status(400).json({ success: false, message: 'Invalid lines payload.' });
        }
    }
    if (!Array.isArray(lines)) {
        return res.status(400).json({ success: false, message: 'lines must be an array.' });
    }
    const notes = req.body.notes;
    const linePhotosByIndex = collectReturnLinePhotoFiles(req, lines.length);
    const result = await getPassService.processReturns(id, user.tenantId, user.id, lines, notes, {
        linePhotosByIndex,
        user,
    });
    res.json({ success: true, data: result });
};

const closeGetPass = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    const result = await getPassService.closeGetPass(id, user.tenantId, user.id);
    res.json({ success: true, data: result });
};

const submitForceCloseSettlement = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    const result = await getPassService.submitForceCloseSettlement(id, user.tenantId, user.id, req.body);
    res.json({ success: true, data: result });
};

const approveForceCloseSettlement = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    const result = await getPassService.approveForceCloseSettlement(id, user.tenantId, user.id);
    res.json({ success: true, data: result });
};

const rejectForceCloseSettlement = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    const { settlementRejectionReason, rejectionReason } = req.body;
    const reason = settlementRejectionReason ?? rejectionReason;
    const result = await getPassService.rejectForceCloseSettlement(id, user.tenantId, user.id, reason);
    res.json({ success: true, data: result });
};

const cancelForceCloseSettlement = async (req, res) => {
    const { user } = req;
    const { id } = req.params;
    const result = await getPassService.cancelForceCloseSettlement(id, user.tenantId, user.id);
    res.json({ success: true, data: result });
};

const exportPdf = async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    const result = await getPassService.getGetPassById(id, tenantId);
    const pdfBuffer = await getPassPdfService.generatePdf(id, tenantId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Get-Pass-Report-${result.passNo}.pdf"`);
    res.send(pdfBuffer);
};

module.exports = {
    createGetPass,
    getGetPasses,
    getIncomingGetPasses,
    getReturningGetPasses,
    getDiscrepancyClaims,
    checkOverdueGetPasses,
    getGetPassById,
    updateGetPass,
    deleteGetPass,
    submitGetPass,
    approveGetPass,
    rejectGetPass,
    sendBackGetPass,
    confirmDestinationReceipt,
    acceptDestinationDepartment,
    shipBackGetPass,
    confirmReturnExit,
    confirmReturnArrival,
    acceptReturnIntoDepartment,
    returnGetPass,
    closeGetPass,
    submitForceCloseSettlement,
    approveForceCloseSettlement,
    rejectForceCloseSettlement,
    cancelForceCloseSettlement,
    exportPdf
};
