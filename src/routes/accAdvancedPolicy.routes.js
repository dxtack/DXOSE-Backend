'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');
const ctrl = require('../controllers/accAdvancedPolicy.controller');

router.use(authenticate, requireSuperAdmin);

router.get('/summary', ctrl.getPolicySummary);

router.get('/field-security', ctrl.getFieldSecurity);
router.post('/field-security', ctrl.postFieldSecurity);
router.patch('/field-security/:id', ctrl.patchFieldSecurity);
router.delete('/field-security/:id', ctrl.deleteFieldSecurity);

router.get('/user-exceptions', ctrl.getUserExceptions);
router.post('/user-exceptions', ctrl.postUserException);
router.patch('/user-exceptions/:id', ctrl.patchUserException);
router.delete('/user-exceptions/:id', ctrl.deleteUserException);

router.get('/scheduled-access', ctrl.getScheduledAccess);
router.post('/scheduled-access', ctrl.postScheduledAccess);
router.patch('/scheduled-access/:id', ctrl.patchScheduledAccess);
router.delete('/scheduled-access/:id', ctrl.deleteScheduledAccess);

router.post('/evaluate', ctrl.postEvaluate);

module.exports = router;
