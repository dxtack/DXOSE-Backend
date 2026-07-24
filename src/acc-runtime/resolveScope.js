'use strict';

const { resolveUserScope } = require('../services/scope/scope.service');

/**
 * Resolve data scope for a user in a tenant context.
 * Delegates 100% to legacy scope.service (Path A / Path B per USE_NEW_POLICY_ENGINE).
 */
const resolveScope = async (user, tenantId, opts = {}) => resolveUserScope(user, tenantId, opts);

module.exports = { resolveScope };
