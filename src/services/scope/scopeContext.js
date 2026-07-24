'use strict';

const {
    resolveUserScope,
    buildScopeWhere,
    buildScopeMeta,
    assertInScope,
    assertLocationInScope,
    assertDepartmentInScope,
    clampReportFilters,
    isScopeEngineEnabled,
    isScopeTenantWide,
    SCOPE_MODULE,
} = require('./scope.service');

const resolveScopeContext = async (user, tenantId, opts = {}) =>
    resolveUserScope(user, tenantId, opts);

const scopeWhereFor = (module, scope, opts = {}) => buildScopeWhere(module, scope, opts);

const metaFor = (scope, opts = {}) => buildScopeMeta(scope, opts);

const canSeeScopeDiagnostics = (user) => {
    if (!user) return false;
    const { hasPermission } = require('../../middleware/authorize');
    return hasPermission(user, 'SETTINGS_MANAGE');
};

module.exports = {
    SCOPE_MODULE,
    resolveScopeContext,
    scopeWhereFor,
    metaFor,
    assertInScope,
    assertLocationInScope,
    assertDepartmentInScope,
    clampReportFilters,
    isScopeEngineEnabled,
    isScopeTenantWide,
    canSeeScopeDiagnostics,
};
