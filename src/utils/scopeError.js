'use strict';

const createScopeError = (message, statusCode = 403, code = 'SCOPE_VIOLATION') => {
    const err = new Error(message || 'Access denied: resource outside your scope.');
    err.statusCode = statusCode;
    err.code = code;
    return err;
};

module.exports = { createScopeError };
