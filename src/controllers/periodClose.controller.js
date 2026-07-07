const periodCloseService = require('../services/periodClose.service');

const getPeriods = async (req, res, next) => {
    try {
        const data = await periodCloseService.getPeriods(req.user.tenantId);
        res.json(data);
    } catch (err) {
        next(err);
    }
};

const getPeriodById = async (req, res, next) => {
    try {
        const data = await periodCloseService.getPeriodById(req.params.id, req.user.tenantId);
        res.json(data);
    } catch (err) {
        next(err);
    }
};

const closePeriod = async (req, res, next) => {
    try {
        const { year, month, notes } = req.body;
        if (!year) return res.status(400).json({ error: 'Year is required' });
        if (!month) return res.status(422).json({ error: 'Month (1–12) is required. Annual close is prohibited.' });
        const data = await periodCloseService.closePeriod(
            req.user.tenantId,
            { year: parseInt(year, 10), month: parseInt(month, 10), notes },
            req.user.id,
        );
        res.json(data);
    } catch (err) {
        next(err);
    }
};

const startClose = async (req, res, next) => {
    try {
        const { year, month } = req.body;
        const data = await periodCloseService.startClosing(
            req.user.tenantId,
            { year: parseInt(year, 10), month: parseInt(month, 10) },
            req.user.id,
        );
        res.json(data);
    } catch (err) {
        next(err);
    }
};

const cancelClose = async (req, res, next) => {
    try {
        const { year, month } = req.body;
        const data = await periodCloseService.cancelClosing(
            req.user.tenantId,
            { year: parseInt(year, 10), month: parseInt(month, 10) },
            req.user.id,
        );
        res.json(data);
    } catch (err) {
        next(err);
    }
};

const reopenPeriod = async (req, res, next) => {
    try {
        const data = await periodCloseService.reopenPeriod(req.params.id, req.user.tenantId, req.user.id, {
            reason: req.body?.reason,
        });
        res.json(data);
    } catch (err) {
        next(err);
    }
};

const snapshotHistory = async (req, res, next) => {
    try {
        const data = await periodCloseService.getSnapshotHistory(req.params.id, req.user.tenantId);
        res.json(data);
    } catch (err) {
        next(err);
    }
};

const resolutionService = require('../services/periodCloseResolution.service');

const getResolutionWorkspace = async (req, res, next) => {
    try {
        const year = parseInt(req.query.year, 10);
        const month = parseInt(req.query.month, 10);
        const data = await resolutionService.getResolutionWorkspace(req.user.tenantId, { year, month });
        res.json(data);
    } catch (err) {
        next(err);
    }
};

const postResolutionDocument = async (req, res, next) => {
    try {
        const data = await resolutionService.postResolutionDocument(req.user.tenantId, req.user.id, req.body);
        res.json(data);
    } catch (err) {
        next(err);
    }
};

const deleteResolutionDocument = async (req, res, next) => {
    try {
        const data = await resolutionService.deleteResolutionDocument(req.user.tenantId, req.user.id, req.body);
        res.json(data);
    } catch (err) {
        next(err);
    }
};

const carryForwardGetPass = async (req, res, next) => {
    try {
        const data = await resolutionService.carryForwardGetPass(req.user.tenantId, req.user.id, req.body);
        res.json(data);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getPeriods,
    getPeriodById,
    closePeriod,
    startClose,
    cancelClose,
    reopenPeriod,
    snapshotHistory,
    getResolutionWorkspace,
    postResolutionDocument,
    deleteResolutionDocument,
    carryForwardGetPass,
};
