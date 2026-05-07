const lostFoundService = require('../services/lostFound.service');
const { success } = require('../utils/response');

const createLostFoundItem = async (req, res, next) => {
    try {
        const item = await lostFoundService.createLostFoundItem(req.user.tenantId, req.user.id, req.body);
        return success(res, item, 'Lost & Found item created.', 201);
    } catch (err) {
        next(err);
    }
};

const listLostFoundItems = async (req, res, next) => {
    try {
        const { items, total, page, limit } = await lostFoundService.listLostFoundItems(req.user.tenantId, req.query);
        return success(res, items, 'Lost & Found items fetched.', 200, { total, page, limit });
    } catch (err) {
        next(err);
    }
};

const markLostFoundItemReturned = async (req, res, next) => {
    try {
        const item = await lostFoundService.markLostFoundItemReturned(req.user.tenantId, req.params.id, req.body);
        return success(res, item, 'Lost & Found item marked as returned.');
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createLostFoundItem,
    listLostFoundItems,
    markLostFoundItemReturned,
};
