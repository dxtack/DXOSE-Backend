'use strict';

/**
 * ACC Workflow Builder routes — configuration only (Stage S10).
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAnyPermission } = require('../middleware/authorize');
const ctrl = require('../controllers/accWorkflowConfig.controller');

const canView = requireAnyPermission(
  'SETTINGS_MANAGE',
  'USERS_COMPANY_MANAGE',
  'HOTEL_USERS_MANAGE',
);

const canManage = requireAnyPermission('SETTINGS_MANAGE', 'USERS_COMPANY_MANAGE');

router.get('/modules', authenticate, canView, ctrl.getModules);
router.post('/modules', authenticate, canManage, ctrl.postModule);

router.get('/modules/:moduleId/definitions', authenticate, canView, ctrl.getDefinitions);
router.post('/modules/:moduleId/definitions', authenticate, canManage, ctrl.postDefinition);

router.patch('/definitions/:definitionId', authenticate, canManage, ctrl.patchDefinition);

router.get('/definitions/:definitionId/audit', authenticate, canView, ctrl.getDefinitionAudit);

router.get('/definitions/:definitionId/versions', authenticate, canView, ctrl.getVersions);
router.post('/definitions/:definitionId/versions', authenticate, canManage, ctrl.postVersion);

router.get('/versions/:versionId', authenticate, canView, ctrl.getVersionById);
router.patch('/versions/:versionId', authenticate, canManage, ctrl.patchVersion);
router.put('/versions/:versionId/steps', authenticate, canManage, ctrl.putVersionSteps);
router.post('/versions/:versionId/publish', authenticate, canManage, ctrl.postPublish);
router.post('/versions/:versionId/archive', authenticate, canManage, ctrl.postArchive);
router.post('/versions/:versionId/restore', authenticate, canManage, ctrl.postRestore);
router.post('/versions/:versionId/clone', authenticate, canManage, ctrl.postCloneVersion);
router.delete('/versions/:versionId', authenticate, canManage, ctrl.deleteVersion);

router.get('/runtime/enforcement', authenticate, canView, ctrl.getRuntimeEnforcement);
router.get('/runtime/modules', authenticate, canView, ctrl.getRuntimeModules);
router.get('/runtime/modules/:moduleKey', authenticate, canView, ctrl.getRuntimeModuleByKey);

module.exports = router;
