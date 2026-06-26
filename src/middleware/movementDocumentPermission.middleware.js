'use strict';

const prisma = require('../config/database');
const { hasPermission } = require('./authorize');
const { resolveMovementMutationPermission } = require('../services/movementDirectAdjustment.guard');

/**
 * PUT / POST on /api/movements/:id — ADJUSTMENT docs need ADJUSTMENT_CREATE;
 * legacy non-ADJUSTMENT docs keep MOVEMENT_CREATE.
 */
async function requireMovementDocumentMutationPermission(req, res, next) {
    try {
        if (!req.user?.tenantId) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }

        const documentId = req.params.id;
        const doc = await prisma.movementDocument.findFirst({
            where: { id: documentId, tenantId: req.user.tenantId },
            select: { id: true, movementType: true },
        });

        if (!doc) {
            return res.status(404).json({ success: false, message: 'Movement document not found' });
        }

        const required = resolveMovementMutationPermission(doc.movementType);
        if (!hasPermission(req.user, required)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Insufficient permissions.',
                required,
            });
        }

        req.movementDocumentMutation = doc;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = {
    requireMovementDocumentMutationPermission,
};
