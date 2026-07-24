'use strict';

/**
 * User Rights Routes — Wave 6 (Access Control Center)
 * Protected by: authenticate + requireAnyPermission (same as Phase 2).
 * Write endpoints additionally check for canManage permission.
 */

const express = require('express');
const router  = express.Router();
const { authenticate }       = require('../middleware/authenticate');
const { requireAnyPermission } = require('../middleware/authorize');
const ctrl                   = require('../controllers/userRights.controller');

// View: anyone who can manage settings or manage users
const canView = requireAnyPermission(
    'SETTINGS_MANAGE',
    'USERS_COMPANY_MANAGE',
    'HOTEL_USERS_MANAGE',
);

// Manage: same set (assignment management is part of user/settings admin)
const canManage = requireAnyPermission(
    'SETTINGS_MANAGE',
    'USERS_COMPANY_MANAGE',
);

// ── Phase 2 (unchanged) ──────────────────────────────────────────────────────
router.get('/matrix',                              authenticate, canView,   ctrl.getMatrix);
router.get('/roles/:roleCode/permissions',         authenticate, canView,   ctrl.getRolePermissions);
router.get('/roles/:roleCode/permissions/drift',   authenticate, canView,   ctrl.getRolePermissionsDrift);

// ── Role Permissions — Write (Edit/Save model) ────────────────────────────
router.put('/roles/:roleCode/permissions',         authenticate, canManage, ctrl.setRolePermissions);

// ── Wave 6 — Roles ───────────────────────────────────────────────────────────
router.get('/roles',                               authenticate, canView,   ctrl.getRoles);
router.post('/roles',                              authenticate, canManage, ctrl.createRole);
router.patch('/roles/:roleCode',                   authenticate, canManage, ctrl.patchRoleMetadata);
router.post('/roles/:roleCode/clone',              authenticate, canManage, ctrl.cloneRole);
router.patch('/roles/:roleCode/retire',            authenticate, canManage, ctrl.retireRole);
router.patch('/roles/:roleCode/reactivate',        authenticate, canManage, ctrl.reactivateRole);
router.get('/roles/:roleCode/assigned-users',      authenticate, canView,   ctrl.getRoleAssignedUsers);

// ── Wave 6 — Users ───────────────────────────────────────────────────────────
router.get('/users',                               authenticate, canView,   ctrl.getUsers);
router.get('/users/:userId/assignments',           authenticate, canView,   ctrl.getUserAssignments);
router.get('/users/:userId/effective-permissions', authenticate, canView,   ctrl.getUserEffectivePermissions);
router.post('/users/:userId/assignments',          authenticate, canManage, ctrl.createUserAssignment);
router.get('/users/:userId/overrides',             authenticate, canView,   ctrl.getUserOverrides);
router.post('/users/:userId/overrides',            authenticate, canManage, ctrl.setUserOverride);
router.delete('/users/:userId/overrides/:permissionId', authenticate, canManage, ctrl.resetUserOverride);

// ── Wave 6 — Assignments ─────────────────────────────────────────────────────
router.patch('/assignments/:assignmentId',          authenticate, canManage, ctrl.updateUserAssignment);
router.patch('/assignments/:assignmentId/deactivate', authenticate, canManage, ctrl.deactivateUserAssignment);
router.patch('/assignments/:assignmentId/reactivate', authenticate, canManage, ctrl.reactivateUserAssignment);
router.delete('/assignments/:assignmentId',          authenticate, canManage, ctrl.deleteUserAssignment);

// ── Wave 6 — Property scope ──────────────────────────────────────────────────
router.get('/assignments/:assignmentId/properties',           authenticate, canView,   ctrl.getAssignmentProperties);
router.post('/assignments/:assignmentId/properties',          authenticate, canManage, ctrl.addAssignmentProperty);
router.delete('/assignments/:assignmentId/properties/:propertyId', authenticate, canManage, ctrl.removeAssignmentProperty);

// ── Wave 6 — Department scope ────────────────────────────────────────────────
router.get('/assignments/:assignmentId/departments',              authenticate, canView,   ctrl.getAssignmentDepartments);
router.post('/assignments/:assignmentId/departments',             authenticate, canManage, ctrl.addAssignmentDepartment);
router.delete('/assignments/:assignmentId/departments/:departmentId', authenticate, canManage, ctrl.removeAssignmentDepartment);

// ── Wave 6 — Audit ───────────────────────────────────────────────────────────
router.get('/audit',                               authenticate, canView,   ctrl.getAuditEvents);

// ── Wave 6 — Reference data ──────────────────────────────────────────────────
router.get('/ref/roles',                           authenticate, canView,   ctrl.getAvailableRoles);
router.get('/ref/properties',                      authenticate, canView,   ctrl.getAvailableProperties);
router.get('/ref/departments',                     authenticate, canView,   ctrl.getAvailableDepartments);

// ── Presentation — Summary stats ─────────────────────────────────────────────
router.get('/summary',                             authenticate, canView,   ctrl.getSummary);

module.exports = router;
