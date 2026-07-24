const express = require('express');
const usersController = require('../controllers/users.controller');
const { authenticate } = require('../middleware/authenticate');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const {
    createUserValidator,
    updateUserValidator,
    updateRoleValidator,
    paginationValidator,
    searchExistingUsersValidator,
} = require('../utils/validators');

const router = express.Router();

// All users routes require authentication
router.use(authenticate);

// GET /api/users
router.get(
    '/',
    requireAnyPermission('HOTEL_USERS_MANAGE', 'USERS_COMPANY_MANAGE'),
    paginationValidator,
    usersController.listUsers,
);

// GET /api/users/search-existing
router.get('/search-existing', requirePermission('USERS_COMPANY_MANAGE'), searchExistingUsersValidator, usersController.searchExistingUsers);

// GET /api/users/:id
router.get('/:id', requireAnyPermission('HOTEL_USERS_MANAGE', 'USERS_COMPANY_MANAGE'), usersController.getUser);

// POST /api/users
router.post(
    '/',
    requireAnyPermission('HOTEL_USERS_MANAGE', 'USERS_COMPANY_MANAGE'),
    createUserValidator,
    usersController.createUser,
);

// PUT /api/users/:id — controller enforces self-edit limits where applicable
router.put(
    '/:id',
    requireAnyPermission('HOTEL_USERS_MANAGE', 'USERS_COMPANY_MANAGE'),
    updateUserValidator,
    usersController.updateUser,
);

// PUT /api/users/:id/role
router.put(
    '/:id/role',
    requireAnyPermission('HOTEL_USERS_MANAGE', 'USERS_COMPANY_MANAGE'),
    updateRoleValidator,
    usersController.updateUserRole,
);

module.exports = router;
