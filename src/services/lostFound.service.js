'use strict';

const prisma = require('../config/database');
const { getStorage } = require('../config/storage');

const toClientError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const toDateOrNull = (value, fieldName) => {
    if (value === undefined || value === null || value === '') return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        throw toClientError(`${fieldName} must be a valid date.`);
    }
    return d;
};

const attachSignedPhotoUrl = async (item) => {
    if (!item) return item;
    if (!item.photoKey) return { ...item, photoUrl: null };
    try {
        const storage = getStorage();
        const photoUrl = await storage.getSignedUrl(item.photoKey);
        return { ...item, photoUrl };
    } catch {
        return { ...item, photoUrl: null };
    }
};

const createLostFoundItem = async (tenantId, userId, payload = {}) => {
    const itemName = String(payload.itemName || '').trim();
    const locationFound = String(payload.locationFound || '').trim();
    const description = typeof payload.description === 'string' ? payload.description.trim() : null;
    const photoKey = typeof payload.photoKey === 'string' ? payload.photoKey.trim() : null;
    const storageLocation = typeof payload.storageLocation === 'string' ? payload.storageLocation.trim() : null;
    const foundDate = toDateOrNull(payload.foundDate, 'foundDate');

    if (!itemName) throw toClientError('itemName is required.');
    if (!locationFound) throw toClientError('locationFound is required.');

    return prisma.lostFoundItem.create({
        data: {
            tenantId,
            createdBy: userId,
            itemName,
            locationFound,
            description: description || null,
            photoKey: photoKey || null,
            storageLocation: storageLocation || null,
            ...(foundDate ? { foundDate } : {}),
        },
        include: {
            createdByUser: { select: { id: true, firstName: true, lastName: true } },
        },
    });
};

const listLostFoundItems = async (tenantId, query = {}) => {
    const page = Math.max(Number.parseInt(String(query.page ?? 1), 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(String(query.limit ?? 20), 10) || 20, 1), 100);
    const statusRaw = typeof query.status === 'string' ? query.status.trim().toUpperCase() : '';
    const where = { tenantId };
    if (statusRaw) {
        if (!['FOUND', 'RETURNED'].includes(statusRaw)) {
            throw toClientError('status must be FOUND or RETURNED.');
        }
        where.status = statusRaw;
    }

    const [rows, total] = await Promise.all([
        prisma.lostFoundItem.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                createdByUser: { select: { id: true, firstName: true, lastName: true } },
            },
        }),
        prisma.lostFoundItem.count({ where }),
    ]);

    const items = await Promise.all(rows.map((row) => attachSignedPhotoUrl(row)));
    return { items, total, page, limit };
};

const markLostFoundItemReturned = async (tenantId, id, payload = {}) => {
    const handedOverTo = String(payload.handedOverTo || '').trim();
    const handedOverDate = toDateOrNull(payload.handedOverDate, 'handedOverDate');
    const deliveryNotes = typeof payload.deliveryNotes === 'string' ? payload.deliveryNotes.trim() : null;

    if (!handedOverTo) throw toClientError('handedOverTo is required.');

    const existing = await prisma.lostFoundItem.findFirst({
        where: { id, tenantId },
        select: { id: true, status: true },
    });
    if (!existing) throw toClientError('Lost & Found item not found.', 404);

    return prisma.lostFoundItem.update({
        where: { id },
        data: {
            status: 'RETURNED',
            handedOverTo,
            handedOverDate: handedOverDate || new Date(),
            deliveryNotes: deliveryNotes || null,
        },
        include: {
            createdByUser: { select: { id: true, firstName: true, lastName: true } },
        },
    });
};

module.exports = {
    createLostFoundItem,
    listLostFoundItems,
    markLostFoundItemReturned,
};
