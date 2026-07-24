'use strict';



/**

 * ACC Big Bang S20 — System workspace read-only APIs (SUPER_ADMIN only).

 */



const express = require('express');

const router = express.Router();

const { authenticate } = require('../middleware/authenticate');

const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');

const ctrl = require('../controllers/accSystem.controller');



router.use(authenticate, requireSuperAdmin);



router.get('/diagnostics', ctrl.getDiagnostics);

router.get('/protected-roles-policy', ctrl.getProtectedRolesPolicy);

router.get('/runtime-settings', ctrl.getRuntimeSettings);

router.patch('/runtime-settings', ctrl.patchRuntimeSettings);



module.exports = router;

