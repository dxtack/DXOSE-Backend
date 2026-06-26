const express = require('express');
const router = express.Router();
const movementController = require('../controllers/movement.controller');
const { authenticate: protect } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const {
    requireMovementDocumentMutationPermission,
} = require('../middleware/movementDocumentPermission.middleware');

router.use(protect);

router
    .route('/')
    .post(requirePermission('ADJUSTMENT_CREATE'), movementController.createMovement)
    .get(requirePermission('MOVEMENTS_VIEW'), movementController.getMovements);

router
    .route('/:id')
    .get(requirePermission('MOVEMENTS_VIEW'), movementController.getMovement)
    .put(requireMovementDocumentMutationPermission, movementController.updateMovement);

router
    .route('/:id/post')
    .post(requireMovementDocumentMutationPermission, movementController.postMovement);

module.exports = router;
